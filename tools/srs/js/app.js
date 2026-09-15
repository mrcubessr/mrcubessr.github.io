/* =============================================================
 * SRS · 应用层共享逻辑
 * -------------------------------------------------------------
 * 依赖：sm2.js(SM2) / db.js(SRSDB) / data/assoc-words.js(SRS_ASSOC)
 * ============================================================= */
(function (root) {
  'use strict';
  var SM2 = root.SM2, DB = root.SRSDB;
  var DAY = 86400000;

  var PRESET_DECK = {
    id: 'assoc-3bld',
    name: '三盲联想词',
    type: 'assoc',
    desc: '代码 ⇄ 联想词双向记忆（优尔 0901 版，含拼音提示）'
  };

  var DEFAULT_DECK_CFG = {
    dirMode: 'mix',      // c2w | w2c | mix
    heads: [],           // 空 = 全部字头
    dailyNew: 20,
    dailyReview: 200,
    showHint: true
  };

  function deckCfg(d) {
    var c = {}, k;
    for (k in DEFAULT_DECK_CFG) c[k] = DEFAULT_DECK_CFG[k];
    if (d && d.config) for (k in d.config) if (d.config[k] !== undefined) c[k] = d.config[k];
    return c;
  }

  function uid(p) {
    return (p || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function todayStart(cutoffHour) {
    return SM2.dayStart(Date.now(), cutoffHour === undefined ? 4 : cutoffHour);
  }

  /* ---------------- 预置牌组初始化 ---------------- */
  function buildAssocCards(now) {
    var words = root.SRS_ASSOC || [];
    var out = [];
    words.forEach(function (w) {
      var base = { deckId: PRESET_DECK.id, head: w.h, created: now };
      var s = SM2.newCard('', PRESET_DECK.id, now);
      out.push(Object.assign({
        id: PRESET_DECK.id + ':c2w:' + w.c,
        front: w.c, back: w.w, hint: w.p, dir: 'c2w'
      }, base, s, { id: PRESET_DECK.id + ':c2w:' + w.c }));
      var s2 = SM2.newCard('', PRESET_DECK.id, now);
      out.push(Object.assign({
        id: PRESET_DECK.id + ':w2c:' + w.c,
        front: w.w, back: w.c, hint: w.p, dir: 'w2c'
      }, base, s2, { id: PRESET_DECK.id + ':w2c:' + w.c }));
    });
    return out;
  }

  /** 保证预置牌组存在；已存在则不覆盖用户进度（仅补齐新增词） */
  function ensurePresets() {
    var now = Date.now();
    return DB.getDeck(PRESET_DECK.id).then(function (d) {
      if (!d) {
        d = {
          id: PRESET_DECK.id, name: PRESET_DECK.name, type: PRESET_DECK.type,
          desc: PRESET_DECK.desc, config: deckCfg(), created: now
        };
        return DB.putDeck(d).then(function () {
          return DB.putCards(buildAssocCards(now)).then(function () { return d; });
        });
      }
      // 补齐：若词表更新过，追加缺失卡
      return DB.getCards(PRESET_DECK.id).then(function (cards) {
        var have = {};
        cards.forEach(function (c) { have[c.id] = 1; });
        var add = buildAssocCards(now).filter(function (c) { return !have[c.id]; });
        if (!add.length) return d;
        return DB.putCards(add).then(function () { return d; });
      });
    });
  }

  /** 重置预置牌组（清空卡片但保留复习日志？—— 一并清空该牌组日志） */
  function resetPreset() {
    return DB.clearCards(PRESET_DECK.id);
  }

  /* ---------------- 队列 ---------------- */
  function matchDir(card, mode) {
    if (!mode || mode === 'mix') return true;
    if (!card.dir) return true;
    return card.dir === mode;
  }
  function matchHead(card, heads) {
    if (!heads || !heads.length) return true;
    return heads.indexOf(card.head) >= 0;
  }

  /**
   * 构建今日学习队列
   * @returns {Promise<{cards:Array, newCount:number, reviewCount:number, learnCount:number}>}
   */
  function buildQueue(deck, allCards, now) {
    now = now || Date.now();
    var cfg = deckCfg(deck);
    var pool = allCards.filter(function (c) {
      return matchDir(c, cfg.dirMode) && matchHead(c, cfg.heads);
    });
    var due = pool.filter(function (c) { return SM2.isDue(c, now); });
    due.sort(function (a, b) { return (a.due || 0) - (b.due || 0); });

    var learn = due.filter(function (c) { return c.state === 'learning' || c.state === 'relearning'; });
    var rev = due.filter(function (c) { return c.state === 'review'; });
    var fresh = due.filter(function (c) { return c.state === 'new'; });

    return todayNewCount(deck.id, now).then(function (used) {
      var remain = Math.max(0, (cfg.dailyNew || 20) - used);
      var newTake = fresh.slice(0, remain);
      rev = rev.slice(0, cfg.dailyReview || 200);

      // 交替：每 3 张复习插 1 张新卡
      var q = learn.slice(), i = 0, j = 0, n = 0;
      while (i < rev.length || j < newTake.length) {
        for (var t = 0; t < 3 && i < rev.length; t++) q.push(rev[i++]);
        if (j < newTake.length) q.push(newTake[j++]);
        if (++n > 100000) break;
      }
      return {
        cards: q, newCount: newTake.length, reviewCount: rev.length, learnCount: learn.length
      };
    });
  }

  /** 今日已学新卡数（按复习日志中 isNew 标记统计） */
  function todayNewCount(deckId, now) {
    var from = todayStart();
    return DB.getReviewsByDeck(deckId).then(function (rs) {
      return rs.filter(function (r) { return r.ts >= from && r.isNew; }).length;
    });
  }

  /** 今日已复习次数 */
  function todayReviewCount(deckId, now) {
    var from = todayStart();
    return DB.getReviewsByDeck(deckId).then(function (rs) {
      return rs.filter(function (r) { return r.ts >= from; }).length;
    });
  }

  /* ---------------- 答题 ---------------- */
  function answer(card, grade, elapsedMs, globalCfg) {
    var now = Date.now();
    var wasNew = card.state === 'new';
    var r = SM2.schedule(card, grade, globalCfg, now);
    card.state = r.state; card.interval = r.interval; card.ease = r.ease;
    card.step = r.step; card.reps = r.reps; card.lapses = r.lapses;
    card.due = r.due; card.lastReviewed = now;
    card.totalTimeMs = (card.totalTimeMs || 0) + (elapsedMs || 0);
    return DB.putCard(card).then(function () {
      return DB.addReview({
        cardId: card.id, deckId: card.deckId, ts: now, grade: grade,
        isNew: wasNew, prevInterval: card.interval, nextInterval: r.interval,
        elapsedMs: elapsedMs || 0
      });
    }).then(function () { return r; });
  }

  /* ---------------- 统计 ---------------- */
  function deckStats(deck, cards, reviews, now) {
    now = now || Date.now();
    var cfg = deckCfg(deck);
    var pool = cards.filter(function (c) {
      return matchDir(c, cfg.dirMode) && matchHead(c, cfg.heads);
    });
    var s = { total: pool.length, new: 0, learn: 0, review: 0, due: 0, mature: 0, young: 0 };
    pool.forEach(function (c) {
      if (c.state === 'new') s.new++;
      else if (c.state === 'learning' || c.state === 'relearning') s.learn++;
      else s.review++;
      if (SM2.isDue(c, now)) s.due++;
      if (c.state === 'review') (c.interval >= 21 ? s.mature++ : s.young++);
    });
    return s;
  }

  /** 近 N 天每日复习量（用于热力图/柱状图） */
  function dailyCounts(reviews, days, now) {
    now = now || Date.now();
    var out = [], i, d, key;
    var map = {};
    reviews.forEach(function (r) {
      var ds = SM2.dayStart(r.ts, 4);
      map[ds] = (map[ds] || 0) + 1;
    });
    var today = SM2.dayStart(now, 4);
    for (i = days - 1; i >= 0; i--) {
      d = today - i * DAY;
      out.push({ day: d, count: map[d] || 0 });
    }
    return out;
  }

  /** 未来到期预测 */
  function forecast(cards, days, now) {
    now = now || Date.now();
    var out = [], i, lo, hi;
    var today = SM2.dayStart(now, 4);
    for (i = 0; i < days; i++) {
      lo = today + i * DAY; hi = lo + DAY;
      out.push({
        day: lo,
        n: cards.filter(function (c) {
          return c.state !== 'new' && c.due >= lo && c.due < hi;
        }).length
      });
    }
    return out;
  }

  /** 正确率（非"重来"占比） */
  function accuracy(reviews) {
    if (!reviews.length) return 0;
    var good = reviews.filter(function (r) { return r.grade > 0; }).length;
    return Math.round(good / reviews.length * 100);
  }

  /* ---------------- blddb 范围生成 ---------------- */
  var _idx = null;
  function loadBlddbIndex() {
    if (_idx) return Promise.resolve(_idx);
    return fetch('data/blddb-index.json').then(function (r) { return r.json(); })
      .then(function (j) { _idx = j; return j; });
  }

  /** 取某类型下、符合首字母条件的编码列表 */
  function codesInRange(idx, type, heads, limit) {
    var t = idx[type];
    if (!t) return [];
    var codes = t.codes;
    if (heads && heads.length) {
      var set = {};
      heads.forEach(function (h) { set[h] = 1; });
      codes = codes.filter(function (c) { return set[c[0]]; });
    }
    if (limit && limit > 0) codes = codes.slice(0, limit);
    return codes;
  }

  /** 从 blddb 拉取某类型的公式表（按需，文件较大） */
  function loadAlgs(type, onProgress) {
    return loadBlddbIndex().then(function (idx) {
      var t = idx[type];
      if (!t) return Promise.reject(new Error('未知类型 ' + type));
      var url = '/tools/3bld/blddb/assets/json/' + t.file;
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('加载失败 ' + r.status);
        return r.json();
      });
    });
  }

  /* ---------------- 导入导出 ---------------- */
  function exportJSON() {
    return DB.dump().then(function (d) {
      return JSON.stringify(d, null, 2);
    });
  }
  function importJSON(text, mode) {
    var data = JSON.parse(text);
    if (!data || !data.decks) throw new Error('不是有效的备份文件');
    return DB.restore(data, mode);
  }

  root.SRS = {
    PRESET_DECK: PRESET_DECK, DEFAULT_DECK_CFG: DEFAULT_DECK_CFG,
    deckCfg: deckCfg, uid: uid, todayStart: todayStart,
    ensurePresets: ensurePresets, resetPreset: resetPreset,
    buildQueue: buildQueue, answer: answer,
    todayNewCount: todayNewCount, todayReviewCount: todayReviewCount,
    deckStats: deckStats, dailyCounts: dailyCounts, forecast: forecast, accuracy: accuracy,
    loadBlddbIndex: loadBlddbIndex, codesInRange: codesInRange, loadAlgs: loadAlgs,
    exportJSON: exportJSON, importJSON: importJSON
  };
})(window);
