/** uf-stats.js - UF 总览页成绩看板
 * 数据源：uf-timer.js 写入的 localStorage['uf_times'] = {"C":[毫秒,...], ...}
 * 与 UR 看板同一套算法：每式均速 + 四档配色 + 重点关注。直角风格由 uf-stats.css 控制。
 *
 * 说明：UF 每组公式数量一致（均为 20 式），故「每式均速」与「组平均总时长」比值相同，
 * 此处沿用与 UR 完全一致的口径，保证两站行为统一、可对比。若后续某组公式数变化，
 * 本逻辑同样自动按每式均速公平比较（不会因组大小而偏色）。
 *   - 每式均速 perF = 该组当前成绩(总均时长) ÷ 该组公式数量
 *   - 浮动标准 std  = 所有已练组的 perF 均值（组间等权）
 *   - 偏离率 ratio  = perF ÷ std  →  ≤0.85 深绿 · ≤1.00 浅绿 · ≤1.15 黄 · >1.15 红
 */
(function () {
  'use strict';

  var TIMES_KEY = 'uf_times';
  var SET_KEY = 'uf_stats_settings';
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
      // 进步趋势：成绩序列对半分，后半段均值 vs 前半段均值（负=变快/进步，正=变慢）
      var trend = NaN;
      if (n >= 4) {
        var half = Math.floor(n / 2);
        var early = mean(arr.slice(0, half));
        var late = mean(arr.slice(n - half));
        if (isFinite(early) && early > 0) trend = (late - early) / early;
      }
      rows.push({
        letter: letter,
        el: cards[i],
        n: n,
        count: count,
        best: n ? Math.min.apply(null, arr) : NaN,
        cur: cur,
        perF: perF,
        trend: trend,
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

  /** 趋势行：负=变快(进步·绿) 正=变慢(红)；|t|<2% 视为持平；数据不足(n<4)显示待累积 */
  var TREND_FLAT = 2; // 百分比阈值
  function trendHtml(t) {
    if (!isFinite(t)) return '<div class="uf-trend uf-trend--na">趋势 待累积</div>';
    var p = Math.abs(t) * 100;
    if (p < TREND_FLAT) return '<div class="uf-trend uf-trend--flat">趋势 → 持平 ' + p.toFixed(1) + '%</div>';
    if (t < 0) return '<div class="uf-trend uf-trend--down">趋势 ↓ 进步 ' + p.toFixed(1) + '%</div>';
    return '<div class="uf-trend uf-trend--up">趋势 ↑ 变慢 ' + p.toFixed(1) + '%</div>';
  }

  // ---------- 渲染 ----------
  function statHtml(r) {
    if (!r.n) {
      return '<div class="uf-stat">' +
        '<div class="uf-stat__row"><span class="uf-stat__avg">--</span>' +
        '<span class="uf-stat__delta">未练习</span></div>' +
        '<div class="uf-stat__per">每式 --</div>' +
        '<div class="uf-bar"><span class="uf-bar__zero"></span></div>' +
        '<div class="uf-stat__meta"><span>最快 --</span><span>0 次</span></div>' +
        trendHtml(NaN) +
        '</div>';
    }
    // 偏离条：中线为标准，ratio<1 向左（更快），ratio>1 向右（更慢）
    var off = clamp((r.ratio - 1) / BAR_SPAN, -1, 1) * 50;
    var left, width;
    if (off < 0) { left = 50 + off; width = -off; } else { left = 50; width = off; }
    if (width < 1.5) width = 1.5; // 保证极接近标准时仍可见
    return '<div class="uf-stat">' +
      '<div class="uf-stat__row">' +
        '<span class="uf-stat__avg">' + fmt(r.cur) + '</span>' +
        '<span class="uf-stat__delta">' + pct(r.ratio) + '</span>' +
      '</div>' +
      '<div class="uf-stat__per">每式 ' + fmt(r.perF) + '</div>' +
      '<div class="uf-bar">' +
        '<span class="uf-bar__fill" style="left:' + left.toFixed(2) + '%;width:' + width.toFixed(2) + '%"></span>' +
        '<span class="uf-bar__zero"></span>' +
      '</div>' +
      '<div class="uf-stat__meta">' +
        '<span>最快 ' + fmt(r.best) + '</span>' +
        '<span>' + r.n + ' 次</span>' +
      '</div>' +
      trendHtml(r.trend) +
      '</div>';
  }

  function renderCards(data) {
    data.rows.forEach(function (r) {
      var el = r.el;
      el.setAttribute('data-tier', r.tier);
      el.setAttribute('title', r.n
        ? (r.letter + '组：总均 ' + fmt(r.cur) + '（每式 ' + fmt(r.perF) + '），标准 ' + fmt(data.std) + '（' + pct(r.ratio) + '）· ' + TIER_LABEL[r.tier] + (isFinite(r.trend) ? '，趋势 ' + pct(r.trend) : ''))
        : (r.letter + '组：尚未练习'));
      var old = el.querySelector('.uf-stat');
      if (old) old.parentNode.removeChild(old);
      var badge = el.querySelector('.uf-badge');
      if (badge) badge.parentNode.removeChild(badge);
      el.insertAdjacentHTML('beforeend', statHtml(r));
      var nameEl = el.querySelector('.card-name');
      if (nameEl) {
        nameEl.insertAdjacentHTML('afterbegin',
          '<span class="uf-badge">' + TIER_LABEL[r.tier] + '</span>');
      }
    });
  }

  function renderKpis(data) {
    var box = document.getElementById('uf-kpis');
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
      { v: worst ? (worst.letter + ' 组') : '--', k: '最需加强', cls: worst && worst.tier === 'bad' ? 'uf-kpi--alert' : '' },
      { v: best ? (best.letter + ' 组') : '--', k: '目前最强', cls: best && best.tier === 'great' ? 'uf-kpi--ok' : '' },
      { v: String(badCount), k: '不合格组数', cls: badCount ? 'uf-kpi--alert' : '' }
    ];
    box.innerHTML = items.map(function (it) {
      return '<div class="uf-kpi ' + it.cls + '"><b>' + it.v + '</b><span>' + it.k + '</span></div>';
    }).join('');

    var stdEl = document.getElementById('uf-std-value');
    if (stdEl) {
      stdEl.textContent = isFinite(data.std)
        ? ('每式 ' + fmt(data.std) + '（' + data.practiced.length + ' 组平均）')
        : '暂无（先去任意组练一次）';
    }
  }

  function renderFocus(data) {
    var box = document.getElementById('uf-focus');
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
    var html = '<div class="uf-focus__title">重点关注 · 建议优先加练</div>';
    if (bad.length) {
      html += '<div>以下 <b>' + bad.length + '</b> 组「每式均速」<b>不合格</b>（超过浮动标准 ' +
        Math.round((WARN - 1) * 100) + '% 以上）：</div>';
      html += '<div class="uf-focus__list">' + bad.map(function (r) {
        return '<a class="uf-focus__chip" href="group-' + r.letter + '.html">' +
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
    var box = document.getElementById('uf-empty');
    if (!box) return;
    box.hidden = data.practiced.length > 0;
  }

  /** 平均成绩明细块：独立成块，按慢 → 快（未练习排最后） */
  function renderDetail(data) {
    var box = document.getElementById('uf-detail');
    if (!box) return;
    var body = document.getElementById('uf-detail-rows');
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
        html += '<div class="uf-detail__row" data-tier="none">' +
          '<span class="d-group">' + r.letter + ' 组</span>' +
          '<span class="d-avg">--</span>' +
          '<span class="d-per">--</span>' +
          '<span class="d-delta">未练习</span>' +
          '<span class="d-n">0</span>' +
          '<span class="d-tier">未练习</span>' +
          '</div>';
        return;
      }
      html += '<div class="uf-detail__row" data-tier="' + r.tier + '">' +
        '<span class="d-group">' + r.letter + ' 组</span>' +
        '<span class="d-avg">' + fmt(r.cur) + '</span>' +
        '<span class="d-per">' + fmt(r.perF) + '</span>' +
        '<span class="d-delta">' + pct(r.ratio) + '</span>' +
        '<span class="d-n">' + r.n + '</span>' +
        '<span class="d-tier">' + TIER_LABEL[r.tier] + '</span>' +
        '</div>';
    });
    body.innerHTML = html;
    var hint = document.getElementById('uf-detail-hint');
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

    var winSel = document.getElementById('uf-window');
    if (winSel) winSel.value = set.window;
    var colSel = document.getElementById('uf-cols');
    if (colSel) colSel.value = set.cols;
    var btns = document.querySelectorAll('[data-sort]');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-sort') === set.sort);
    });
  }

  function init() {
    var winSel = document.getElementById('uf-window');
    if (winSel) {
      winSel.addEventListener('change', function () {
        var s = loadSettings();
        s.window = winSel.value;
        saveSettings(s);
        render();
      });
    }
    var colSel = document.getElementById('uf-cols');
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
