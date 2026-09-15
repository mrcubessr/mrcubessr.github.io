/** ur-stats.js - UR 总览页成绩看板
 * 数据源：ur-timer.js 写入的 localStorage['ur_times'] = {"C":[毫秒,...], ...}
 * 与 UF 看板同一套算法：每式均速 + 四档配色 + 重点关注。直角风格由 ur-stats.css 控制。
 *
 * ★ 关键设计（公平偏离）：UR 每组「一次连拧」= 把该组全部公式顺序做完，
 *   公式多的组（如 C=18 式）单次时长天然远多于公式少的组（如 X=2 式）。
 *   若直接用「组平均总时长」比快慢，会被公式数量带偏（大组恒显慢、小组恒显快），
 *   无法反映真实水平。因此本看板改用「每式均速」衡量：
 *     - 每式均速 perF = 该组当前成绩(总均时长) ÷ 该组公式数量
 *     - 浮动标准 std  = 所有已练组的 perF 均值（组间等权）
 *     - 偏离率 ratio  = perF ÷ std  →  ≤0.85 深绿 · ≤1.00 浅绿 · ≤1.15 黄 · >1.15 红
 *   卡片仍展示「总均时长」(直觉) 与其下的「每式均速」(公平基准)，颜色与偏离条按 ratio。
 *   公式数量从卡片 .card-tags 文本（空格分隔的公式码）解析，无需额外数据。
 */
(function () {
  'use strict';

  var TIMES_KEY = 'ur_times';
  var SET_KEY = 'ur_stats_settings';
  var GREAT = 0.85;          // ≤ 0.85×标准 → 深绿
  var WARN = 1.15;           // > 1.15×标准 → 红（不合格）
  var BAR_SPAN = 0.4;        // 偏离条满格对应的相对偏离（±40%）
  var WINDOWS = ['5', '12', '100', 'all'];
  var COLS = ['auto', '4', '6', '8', '10', '12'];

  // ---------- 存储 ----------
  function loadTimes() {
    try { return JSON.parse(localStorage.getItem(TIMES_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function loadSettings() {
    var d = { window: '5', cols: 'auto', sort: 'order' };
    try {
      var s = JSON.parse(localStorage.getItem(SET_KEY));
      if (s && typeof s === 'object') {
        if (WINDOWS.indexOf(s.window) >= 0) d.window = s.window;
        if (COLS.indexOf(s.cols) >= 0) d.cols = s.cols;
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

  /** 从卡片 .card-tags 解析该组公式数量（空格分隔的公式码个数） */
  function formulaCount(el) {
    var t = el.querySelector('.card-tags');
    if (!t) return 1;
    var codes = t.textContent.trim().split(/\s+/).filter(Boolean);
    return codes.length || 1;
  }

  // ---------- 统计 ----------
  /** 计算每组成绩 + 全局浮动标准（每式均速口径） */
  function compute(cards, times, win) {
    var rows = [];
    for (var i = 0; i < cards.length; i++) {
      var letter = cards[i].getAttribute('data-group') || '';
      var arr = (times[letter] || []).filter(function (v) { return isFinite(v) && v > 0; });
      var n = arr.length;
      // 成绩窗口：最近 N 次平均（all = 全部平均）
      var pool = arr;
      if (win !== 'all' && n > 0) {
        var N = parseInt(win, 10);
        if (n > N) pool = arr.slice(-N);
      }
      var cur = mean(pool);                 // 当前成绩：该窗口内总均时长
      var count = formulaCount(cards[i]);  // 该组公式数量
      var perF = (n > 0 && isFinite(cur) && count > 0) ? cur / count : NaN; // 每式均速
      rows.push({
        letter: letter,
        el: cards[i],
        n: n,
        count: count,
        best: n ? Math.min.apply(null, arr) : NaN,
        cur: cur,
        perF: perF,
        total: n ? arr.reduce(function (a, b) { return a + b; }, 0) : 0
      });
    }
    // 浮动标准 = 已练组「每式均速」均值（组间等权，不受组大小影响）
    var practiced = rows.filter(function (r) { return r.n > 0 && isFinite(r.perF); });
    var std = mean(practiced.map(function (r) { return r.perF; }));
    rows.forEach(function (r) {
      r.ratio = (r.n > 0 && isFinite(r.perF) && isFinite(std) && std > 0) ? r.perF / std : NaN;
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
        '<div class="ur-stat__per">每式 --</div>' +
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
      '<div class="ur-stat__per">每式 ' + fmt(r.perF) + '</div>' +
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
        ? (r.letter + '组：总均 ' + fmt(r.cur) + '（每式 ' + fmt(r.perF) + '），标准 ' + fmt(data.std) + '（' + pct(r.ratio) + '）· ' + TIER_LABEL[r.tier])
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
      { v: isFinite(data.std) ? fmt(data.std) : '--', k: '每式均速标准', cls: '' },
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
        ? ('每式 ' + fmt(data.std) + '（' + data.practiced.length + ' 组平均）')
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
      html += '<div>以下 <b>' + bad.length + '</b> 组「每式均速」<b>不合格</b>（超过浮动标准 ' +
        Math.round((WARN - 1) * 100) + '% 以上）：</div>';
      html += '<div class="ur-focus__list">' + bad.map(function (r) {
        return '<a class="ur-focus__chip" href="group-' + r.letter + '.html">' +
          r.letter + ' 组 <b>' + fmt(r.perF) + '</b> <span>' + pct(r.ratio) + '</span></a>';
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
          '<span class="d-per">--</span>' +
          '<span class="d-delta">未练习</span>' +
          '<span class="d-n">0</span>' +
          '<span class="d-tier">未练习</span>' +
          '</div>';
        return;
      }
      html += '<div class="ur-detail__row" data-tier="' + r.tier + '">' +
        '<span class="d-group">' + r.letter + ' 组</span>' +
        '<span class="d-avg">' + fmt(r.cur) + '</span>' +
        '<span class="d-per">' + fmt(r.perF) + '</span>' +
        '<span class="d-delta">' + pct(r.ratio) + '</span>' +
        '<span class="d-n">' + r.n + '</span>' +
        '<span class="d-tier">' + TIER_LABEL[r.tier] + '</span>' +
        '</div>';
    });
    body.innerHTML = html;
    var hint = document.getElementById('ur-detail-hint');
    if (hint) {
      hint.textContent = isFinite(data.std)
        ? ('每式均速标准 ' + fmt(data.std) + ' · 共 ' + data.rows.length + ' 组')
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

  // 列数控制：auto = 随窗口自适应；数字 = 固定 N 列
  function applyCols(cols) {
    var grid = document.querySelector('.group-grid');
    if (!grid) return;
    if (cols === 'auto' || COLS.indexOf(cols) < 0) {
      grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))';
    } else {
      var n = parseInt(cols, 10);
      grid.style.gridTemplateColumns = 'repeat(' + n + ', minmax(0, 1fr))';
    }
  }

  // ---------- 主流程 ----------
  function render() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.group-card[data-group]'));
    if (!cards.length) return;
    var set = loadSettings();
    var data = compute(cards, loadTimes(), set.window);
    renderCards(data);
    renderKpis(data);
    renderFocus(data);
    renderEmpty(data);
    renderDetail(data);
    applySort(data, set.sort);
    applyCols(set.cols);

    var winSel = document.getElementById('ur-window');
    if (winSel) winSel.value = set.window;
    var colSel = document.getElementById('ur-cols');
    if (colSel) colSel.value = set.cols;
    var btns = document.querySelectorAll('[data-sort]');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-sort') === set.sort);
    });
  }

  function init() {
    var winSel = document.getElementById('ur-window');
    if (winSel) {
      winSel.addEventListener('change', function () {
        var s = loadSettings();
        s.window = winSel.value;
        saveSettings(s);
        render();
      });
    }
    var colSel = document.getElementById('ur-cols');
    if (colSel) {
      colSel.addEventListener('change', function () {
        var s = loadSettings();
        s.cols = colSel.value;
        saveSettings(s);
        applyCols(s.cols);
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
