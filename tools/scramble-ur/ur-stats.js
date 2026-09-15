/** ur-stats.js - UR 总览页成绩看板
 * 数据源：ur-timer.js 写入的 localStorage['ur_times'] = {"C":[毫秒,...], ...}
 * 与 UF 看板同一套算法：浮动标准 + 四档配色 + 重点关注。直角风格由 ur-stats.css 控制。
 *
 * 设计要点：
 *  - 组当前成绩 cur：默认取该组「最近 N 次」平均（反映当下水平），可切「全部平均」
 *  - 浮动标准 std：所有已练组 cur 的平均值（组间等权），随练习实时浮动
 *  - 四档配色：深绿 great / 浅绿 good / 黄 warn / 红 bad，未练习为灰 none
 *    ratio = cur / std  →  ≤0.85 深绿 · ≤1.00 浅绿 · ≤1.15 黄 · >1.15 红（不合格）
 *  - 偏离条：中线 = 浮动标准，向左更快（绿）向右更慢（红），越长偏离越大
 */
(function () {
  'use strict';

  var TIMES_KEY = 'ur_times';
  var SET_KEY = 'ur_stats_settings';
  var RECENT_N = 5;          // 「最近 N 次」口径默认窗口
  var GREAT = 0.85;          // ≤ 0.85×标准 → 深绿
  var WARN = 1.15;           // > 1.15×标准 → 红（不合格）
  var BAR_SPAN = 0.4;        // 偏离条满格对应的相对偏离（±40%）

  // ---------- 存储 ----------
  function loadTimes() {
    try { return JSON.parse(localStorage.getItem(TIMES_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function loadSettings() {
    var d = { scope: 'recent', sort: 'order' };
    try {
      var s = JSON.parse(localStorage.getItem(SET_KEY));
      if (s && typeof s === 'object') {
        if (s.scope === 'recent' || s.scope === 'all') d.scope = s.scope;
        if (s.sort === 'order' || s.sort === 'weak') d.sort = s.sort;
      }
    } catch (e) {}
    return d;
  }
  function saveSettings(s) {
    try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) {}
  }

  // ---------- 工具 ----------
  function mean(arr) {
    if (!arr || !arr.length) return NaN;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }
  /** 毫秒 → "32.45" 或 "1:05.23" */
  function fmt(ms) {
    if (!isFinite(ms) || ms < 0) return '--';
    var t = Math.round(ms);
    var m = Math.floor(t / 60000);
    var s = (t % 60000) / 1000;
    if (m > 0) return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
    return s.toFixed(2);
  }
  function pct(ratio) {
    if (!isFinite(ratio)) return '--';
    var d = (ratio - 1) * 100;
    return (d >= 0 ? '+' : '') + d.toFixed(0) + '%';
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // ---------- 统计 ----------
  /** 计算每组成绩 + 全局浮动标准 */
  function compute(cards, times, scope) {
    var rows = [];
    for (var i = 0; i < cards.length; i++) {
      var letter = cards[i].getAttribute('data-group') || '';
      var arr = (times[letter] || []).filter(function (v) { return isFinite(v) && v > 0; });
      var n = arr.length;
      var pool = arr;
      if (scope === 'recent' && n > RECENT_N) pool = arr.slice(-RECENT_N);
      rows.push({
        letter: letter,
        el: cards[i],
        n: n,
        best: n ? Math.min.apply(null, arr) : NaN,
        cur: mean(pool),
        total: n ? arr.reduce(function (a, b) { return a + b; }, 0) : 0
      });
    }
    var practiced = rows.filter(function (r) { return r.n > 0; });
    var std = mean(practiced.map(function (r) { return r.cur; }));
    rows.forEach(function (r) {
      r.ratio = (r.n > 0 && isFinite(std) && std > 0) ? r.cur / std : NaN;
      r.tier = !r.n ? 'none'
        : r.ratio <= GREAT ? 'great'
        : r.ratio <= 1.0 ? 'good'
        : r.ratio <= WARN ? 'warn'
        : 'bad';
    });
    return { rows: rows, std: std, practiced: practiced };
  }

  var TIER_LABEL = { great: '优秀', good: '良好', warn: '需关注', bad: '不合格', none: '未练习' };

  // ---------- 渲染 ----------
  function statHtml(r) {
    if (!r.n) {
      return '<div class="ur-stat">' +
        '<div class="ur-stat__row"><span class="ur-stat__avg">--</span>' +
        '<span class="ur-stat__delta">未练习</span></div>' +
        '<div class="ur-bar"><span class="ur-bar__zero"></span></div>' +
        '<div class="ur-stat__meta"><span>最快 --</span><span>0 次</span></div>' +
        '</div>';
    }
    // 偏离条：中线为标准，ratio<1 向左（更快），ratio>1 向右（更慢）
    var off = clamp((r.ratio - 1) / BAR_SPAN, -1, 1) * 50;
    var left, width;
    if (off < 0) { left = 50 + off; width = -off; } else { left = 50; width = off; }
    if (width < 1.5) width = 1.5; // 保证极接近标准时仍可见
    return '<div class="ur-stat">' +
      '<div class="ur-stat__row">' +
        '<span class="ur-stat__avg">' + fmt(r.cur) + '</span>' +
        '<span class="ur-stat__delta">' + pct(r.ratio) + '</span>' +
      '</div>' +
      '<div class="ur-bar">' +
        '<span class="ur-bar__fill" style="left:' + left.toFixed(2) + '%;width:' + width.toFixed(2) + '%"></span>' +
        '<span class="ur-bar__zero"></span>' +
      '</div>' +
      '<div class="ur-stat__meta">' +
        '<span>最快 ' + fmt(r.best) + '</span>' +
        '<span>' + r.n + ' 次</span>' +
      '</div>' +
      '</div>';
  }

  function renderCards(data) {
    data.rows.forEach(function (r) {
      var el = r.el;
      el.setAttribute('data-tier', r.tier);
      el.setAttribute('title', r.n
        ? (r.letter + '组：平均 ' + fmt(r.cur) + '，标准 ' + fmt(data.std) + '（' + pct(r.ratio) + '）· ' + TIER_LABEL[r.tier])
        : (r.letter + '组：尚未练习'));
      var old = el.querySelector('.ur-stat');
      if (old) old.parentNode.removeChild(old);
      var badge = el.querySelector('.ur-badge');
      if (badge) badge.parentNode.removeChild(badge);
      el.insertAdjacentHTML('beforeend', statHtml(r));
      var nameEl = el.querySelector('.card-name');
      if (nameEl) {
        nameEl.insertAdjacentHTML('afterbegin',
          '<span class="ur-badge">' + TIER_LABEL[r.tier] + '</span>');
      }
    });
  }

  function renderKpis(data) {
    var box = document.getElementById('ur-kpis');
    if (!box) return;
    var totalRuns = 0, totalMs = 0;
    data.rows.forEach(function (r) { totalRuns += r.n; totalMs += r.total; });
    var sorted = data.practiced.slice().sort(function (a, b) { return b.ratio - a.ratio; });
    var worst = sorted[0];
    var best = sorted[sorted.length - 1];
    var badCount = data.rows.filter(function (r) { return r.tier === 'bad'; }).length;

    var items = [
      { v: data.practiced.length + ' / ' + data.rows.length, k: '已练组数', cls: '' },
      { v: String(totalRuns), k: '总连拧次数', cls: '' },
      { v: isFinite(data.std) ? fmt(data.std) : '--', k: '浮动标准', cls: '' },
      { v: worst ? (worst.letter + ' 组') : '--', k: '最需加强', cls: worst && worst.tier === 'bad' ? 'ur-kpi--alert' : '' },
      { v: best ? (best.letter + ' 组') : '--', k: '目前最强', cls: best && best.tier === 'great' ? 'ur-kpi--ok' : '' },
      { v: String(badCount), k: '不合格组数', cls: badCount ? 'ur-kpi--alert' : '' }
    ];
    box.innerHTML = items.map(function (it) {
      return '<div class="ur-kpi ' + it.cls + '"><b>' + it.v + '</b><span>' + it.k + '</span></div>';
    }).join('');

    var stdEl = document.getElementById('ur-std-value');
    if (stdEl) {
      stdEl.textContent = isFinite(data.std)
        ? fmt(data.std) + '（' + data.practiced.length + ' 组平均）'
        : '暂无（先去任意组练一次）';
    }
  }

  function renderFocus(data) {
    var box = document.getElementById('ur-focus');
    if (!box) return;
    var bad = data.rows.filter(function (r) { return r.tier === 'bad'; })
      .sort(function (a, b) { return b.ratio - a.ratio; });
    var warn = data.rows.filter(function (r) { return r.tier === 'warn'; })
      .sort(function (a, b) { return b.ratio - a.ratio; });

    if (!bad.length && !warn.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    var html = '<div class="ur-focus__title">重点关注 · 建议优先加练</div>';
    if (bad.length) {
      html += '<div>以下 <b>' + bad.length + '</b> 组连拧成绩<b>不合格</b>（超过浮动标准 ' +
        Math.round((WARN - 1) * 100) + '% 以上）：</div>';
      html += '<div class="ur-focus__list">' + bad.map(function (r) {
        return '<a class="ur-focus__chip" href="group-' + r.letter + '.html">' +
          r.letter + ' 组 <b>' + fmt(r.cur) + '</b> <span>' + pct(r.ratio) + '</span></a>';
      }).join('') + '</div>';
    }
    if (warn.length) {
      html += '<div style="margin-top:8px">接近标准、需关注 ' + warn.length + ' 组：' +
        warn.map(function (r) { return r.letter; }).join('、') + '</div>';
    }
    box.innerHTML = html;
  }

  function renderEmpty(data) {
    var box = document.getElementById('ur-empty');
    if (!box) return;
    box.hidden = data.practiced.length > 0;
  }

  /** 平均成绩明细块：独立成块，按慢 → 快（未练习排最后） */
  function renderDetail(data) {
    var box = document.getElementById('ur-detail');
    if (!box) return;
    var body = document.getElementById('ur-detail-rows');
    if (!body) return;
    var rows = data.rows.slice().sort(function (a, b) {
      if (a.n === 0 && b.n === 0) return 0;
      if (a.n === 0) return 1;
      if (b.n === 0) return -1;
      return b.ratio - a.ratio;
    });
    var html = '';
    rows.forEach(function (r) {
      if (!r.n) {
        html += '<div class="ur-detail__row" data-tier="none">' +
          '<span class="d-group">' + r.letter + ' 组</span>' +
          '<span class="d-avg">--</span>' +
          '<span class="d-delta">未练习</span>' +
          '<span class="d-n">0</span>' +
          '<span class="d-tier">未练习</span>' +
          '</div>';
        return;
      }
      html += '<div class="ur-detail__row" data-tier="' + r.tier + '">' +
        '<span class="d-group">' + r.letter + ' 组</span>' +
        '<span class="d-avg">' + fmt(r.cur) + '</span>' +
        '<span class="d-delta">' + pct(r.ratio) + '</span>' +
        '<span class="d-n">' + r.n + '</span>' +
        '<span class="d-tier">' + TIER_LABEL[r.tier] + '</span>' +
        '</div>';
    });
    body.innerHTML = html;
    var hint = document.getElementById('ur-detail-hint');
    if (hint) {
      hint.textContent = isFinite(data.std)
        ? ('浮动标准 ' + fmt(data.std) + ' · 共 ' + data.rows.length + ' 组')
        : '暂无标准';
    }
  }

  function applySort(data, sort) {
    var grid = document.querySelector('.group-grid');
    if (!grid) return;
    var rows = data.rows.slice();
    if (sort === 'weak') {
      rows.sort(function (a, b) {
        // 未练习排最后；其余按 ratio 降序（越慢越靠前）
        if (a.n === 0 && b.n === 0) return 0;
        if (a.n === 0) return 1;
        if (b.n === 0) return -1;
        return b.ratio - a.ratio;
      });
    }
    rows.forEach(function (r) { grid.appendChild(r.el); });
  }

  // ---------- 主流程 ----------
  function render() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.group-card[data-group]'));
    if (!cards.length) return;
    var set = loadSettings();
    var data = compute(cards, loadTimes(), set.scope);
    renderCards(data);
    renderKpis(data);
    renderFocus(data);
    renderEmpty(data);
    renderDetail(data);
    applySort(data, set.sort);

    var scopeSel = document.getElementById('ur-scope');
    if (scopeSel) scopeSel.value = set.scope;
    var btns = document.querySelectorAll('[data-sort]');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-sort') === set.sort);
    });
  }

  function init() {
    var scopeSel = document.getElementById('ur-scope');
    if (scopeSel) {
      scopeSel.addEventListener('change', function () {
        var s = loadSettings();
        s.scope = scopeSel.value;
        saveSettings(s);
        render();
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-sort]'), function (b) {
      b.addEventListener('click', function () {
        var s = loadSettings();
        s.sort = b.getAttribute('data-sort');
        saveSettings(s);
        render();
      });
    });
    // 其它标签页练习完，总览页同步刷新
    window.addEventListener('storage', function (e) {
      if (e.key === TIMES_KEY) render();
    });
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
