/* =============================================================
 * SRS · 应用层共享逻辑
 * -------------------------------------------------------------
 * 依赖：sm2.js(SM2) / db.js(SRSDB) / data/assoc-words.js(SRS_ASSOC)
 * ============================================================= */
(function (root) {
  'use strict';
  var SM2 = root.SM2, DB = root.SRSDB;
  var DAY = 86400000;

  var PRESET_PREFIX = 'assoc-3bld';          // 旧版单一牌组 id，迁移时删除
  var PRESET_OLD_ID = 'assoc-3bld';
  var PRESET_NAME = '三盲联想词';

  var DEFAULT_DECK_CFG = {
    dirMode: 'mix',      // c2w | w2c | mix（自定义公式牌组默认双向；联想词子牌组强制 c2w）
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

  /* ---------------- 预置牌组：三盲联想词，按字头拆成独立子牌组 ---------------- */
  /** 返回词表里出现过的字头（字母）列表，升序 */
  function assocLetters() {
    var set = {};
    (root.SRS_ASSOC || []).forEach(function (w) { if (w.h) set[w.h] = 1; });
    return Object.keys(set).sort();
  }
  function assocDeckId(L) { return PRESET_PREFIX + '-' + L; }

  /** 单个字头牌组定义：单向（码→词） */
  function buildAssocDeck(L, now) {
    var c = deckCfg();
    c.dirMode = 'c2w';     // 单向：只看代码 → 回忆联想词
    c.heads = [L];
    c.showHint = true;
    return {
      id: assocDeckId(L),
      name: '联想词 ' + L + ' 组',
      type: 'assoc',
      desc: '代码 → 联想词（' + L + ' 字头，单向记忆）',
      config: c,
      created: now,
      _letter: L
    };
  }

  /** 单个字头的卡片（仅 c2w 单向，front=代码 back=联想词） */
  function buildAssocCards(L, now) {
    var out = [];
    (root.SRS_ASSOC || []).forEach(function (w) {
      if (w.h !== L) return;
      var s = SM2.newCard(assocDeckId(L) + ':c2w:' + w.c, assocDeckId(L), now);
      out.push(Object.assign(s, {
        front: w.c, back: w.w, hint: w.p, dir: 'c2w', head: w.h, created: now
      }));
    });
    return out;
  }

  /** 保证每个字头子牌组存在；已存在则不覆盖进度（仅补齐词表新增的卡）。迁移：删旧单一牌组。 */
  function ensurePresets() {
    var now = Date.now();
    var letters = assocLetters();
    // 1) 迁移：删除旧版单一牌组（含其卡片与复习记录）
    return DB.getDeck(PRESET_OLD_ID).then(function (old) {
      if (!old) return;
      return DB.delDeck(PRESET_OLD_ID);
    }).then(function () {
      // 2) 逐字头确保牌组 + 补齐缺失卡
      return Promise.all(letters.map(function (L) {
        return DB.getDeck(assocDeckId(L)).then(function (d) {
          if (d) {
            return DB.getCards(assocDeckId(L)).then(function (cards) {
              var have = {};
              cards.forEach(function (c) { have[c.id] = 1; });
              var add = buildAssocCards(L, now).filter(function (c) { return !have[c.id]; });
              return add.length ? DB.putCards(add) : null;
            });
          }
          return DB.putDeck(buildAssocDeck(L, now))
            .then(function () { return DB.putCards(buildAssocCards(L, now)); });
        });
      }));
    });
  }

  /** 重置全部联想词子牌组（含卡片与复习记录） */
  function resetPreset() {
    return Promise.all(assocLetters().map(function (L) {
      return DB.getDeck(assocDeckId(L)).then(function (d) {
        return d ? DB.delDeck(assocDeckId(L)) : null;
      });
    }));
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
    PRESET_PREFIX: PRESET_PREFIX, assocLetters: assocLetters, assocDeckId: assocDeckId,
    DEFAULT_DECK_CFG: DEFAULT_DECK_CFG,
    deckCfg: deckCfg, uid: uid, todayStart: todayStart,
    ensurePresets: ensurePresets, resetPreset: resetPreset,
    buildQueue: buildQueue, answer: answer,
    todayNewCount: todayNewCount, todayReviewCount: todayReviewCount,
    deckStats: deckStats, dailyCounts: dailyCounts, forecast: forecast, accuracy: accuracy,
    loadBlddbIndex: loadBlddbIndex, codesInRange: codesInRange, loadAlgs: loadAlgs,
    exportJSON: exportJSON, importJSON: importJSON
  };
})(window);
