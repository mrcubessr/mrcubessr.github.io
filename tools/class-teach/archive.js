/* =============================================================
 * archive.js — 课次存档日历（tools/class-teach 专用小模块）
 * -------------------------------------------------------------
 * 依赖页面内已定义：DB / students() / sidCmp / getTally() / scoreOf() /
 *   sameId() / curClassId() / curClass / esc() / toast() / today()
 * 数据来源：DB.sessions(settled) + DB.tallies，只读展示，不写库。
 *
 * 页面侧约定：
 *   · <script src="archive.js"></script> 放在主脚本之后
 *   · 容器： #view-archive / #arcMeta / #arcPrev / #arcNext / #arcToday /
 *            #arcMonth / #arcCalendar / #arcDetailCard / #arcDetailTitle /
 *            #arcDetailBody / #arcDetailClose
 *   · setView('archive') 时调用 ClassArchive.render()
 * ============================================================= */
(function (global) {
  'use strict';

  /* ---------- 自包含样式（删模块即删样式，不污染全局） ---------- */
  var CSS = ''
    + '.arc-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:10px}'
    + '.arc-dow{text-align:center;font-size:12px;color:var(--text-3);padding:2px 0;font-weight:600}'
    + '.arc-cell{min-height:64px;border:1px solid var(--line);background:var(--surface);padding:4px 6px;font-size:12px;color:var(--text-2);position:relative;line-height:1.4}'
    + '.arc-cell.out{opacity:.35}'
    + '.arc-cell .d{font-weight:700;font-size:13px}'
    + '.arc-cell.has{background:var(--brand-soft);border-color:var(--brand);cursor:pointer}'
    + '.arc-cell.has:hover{border-color:var(--primary)}'
    + '.arc-cell.sel{outline:2px solid var(--primary);outline-offset:-2px}'
    + '.arc-cell .badge{position:absolute;right:4px;bottom:4px;background:var(--brand);color:var(--on-brand);font-size:11px;font-weight:700;padding:0 6px;line-height:17px;white-space:nowrap}'
    + '.arc-cell .tip{position:absolute;left:6px;bottom:5px;font-size:10px;color:var(--text-3)}'
    + '.arc-sess{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}'
    + '.arc-sess button{font-size:13px}'
    + '.arc-empty{text-align:center;color:var(--text-3);padding:18px 0;font-size:13px}'
    + '@media (max-width:640px){.arc-cell{min-height:52px;padding:3px 4px}.arc-cell .d{font-size:12px}.arc-cell .badge{font-size:10px;padding:0 4px;line-height:15px}.arc-cell .tip{display:none}}';
  function injectCss() {
    if (document.getElementById('arc-style')) return;
    var st = document.createElement('style');
    st.id = 'arc-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- 工具 ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function dateStr(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function settledSessions() {
    return DB.sessions.filter(function (s) { return sameId(s.classId, curClassId()) && s.settled; });
  }
  function daySessions(y, m, d) {
    var ds = dateStr(y, m, d);
    return settledSessions().filter(function (s) { return s.date === ds; });
  }
  /* 当课合计：总练习人次 / 总得分 / 参与人数 */
  function sessionStat(se) {
    var ts = DB.tallies.filter(function (t) { return sameId(t.sessionId, se.id); });
    var cnt = 0, score = 0;
    ts.forEach(function (t) { cnt += (t.count || 0); score += scoreOf(t); });
    return { cnt: cnt, score: score, people: ts.length };
  }
  function monthSessions(y, m) {
    var pre = y + '-' + pad(m + 1) + '-';
    return settledSessions().filter(function (s) { return String(s.date || '').indexOf(pre) === 0; });
  }
  function $(id) { return document.getElementById(id); }

  /* ---------- 状态 ---------- */
  var state = { y: 0, m: 0, selDate: null, selSession: null };

  function gotoMonth(y, m) {
    state.y = y; state.m = m;
    state.selDate = null; state.selSession = null;
    render();
  }

  /* ---------- 渲染 ---------- */
  function render() {
    injectCss();
    var now = new Date();
    if (!state.y) { state.y = now.getFullYear(); state.m = now.getMonth(); }
    var y = state.y, m = state.m;

    /* 顶部：月份导航 + 本月汇总 */
    var mss = monthSessions(y, m);
    var mCnt = 0;
    mss.forEach(function (se) { mCnt += sessionStat(se).cnt; });
    $('arcMonth').textContent = y + ' 年 ' + (m + 1) + ' 月';
    $('arcMeta').textContent = curClass.name + ' · 本月 ' + mss.length + ' 节课 · 课堂练习共 ' + mCnt + ' 次';

    /* 日历网格：周日开头 */
    var first = new Date(y, m, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var prevDays = new Date(y, m, 0).getDate();
    var dows = ['日', '一', '二', '三', '四', '五', '六'];
    var html = dows.map(function (d) { return '<div class="arc-dow">' + d + '</div>'; }).join('');
    var cells = [];
    for (var i = 0; i < startDow; i++) cells.push({ d: prevDays - startDow + 1 + i, out: true });
    for (var d = 1; d <= daysInMonth; d++) cells.push({ d: d, out: false });
    while (cells.length % 7 !== 0) cells.push({ d: cells.length - startDow - daysInMonth + 1, out: true });
    var tdy = today();
    cells.forEach(function (c) {
      var cls = 'arc-cell' + (c.out ? ' out' : '');
      var inner = '<div class="d">' + c.d + '</div>';
      if (!c.out) {
        var ds = dateStr(y, m, c.d);
        if (ds === tdy) cls += ' has-today';
        var list = daySessions(y, m, c.d);
        if (list.length) {
          var st = sessionStat(list[0]);
          var extra = list.length > 1 ? ('×' + list.length + '节') : '';
          cls += ' has' + (state.selDate === ds ? ' sel' : '');
          inner += '<div class="badge">' + st.cnt + '次' + (extra ? ' ' + extra : '') + '</div>';
          inner += '<div class="tip">' + st.score + '分</div>';
        } else if (ds === tdy) {
          inner += '<div class="tip" style="color:var(--primary)">今天</div>';
        }
      }
      html += '<div class="' + cls + '"' + (c.out ? '' : ' data-arc-date="' + dateStr(y, m, c.d) + '"') + '>' + inner + '</div>';
    });
    var cal = $('arcCalendar');
    cal.innerHTML = '<div class="arc-grid">' + html + '</div>';
    cal.querySelectorAll('[data-arc-date]').forEach(function (el) {
      el.onclick = function () { selectDate(el.dataset.arcDate); };
    });

    renderDetail();
  }

  function selectDate(ds) {
    state.selDate = (state.selDate === ds ? null : ds);
    state.selSession = null;
    render();
  }

  function renderDetail() {
    var card = $('arcDetailCard');
    if (!state.selDate) { card.style.display = 'none'; return; }
    var list = settledSessions().filter(function (s) { return s.date === state.selDate; });
    $('arcDetailTitle').textContent = state.selDate + ' 的课次';
    var body = $('arcDetailBody');
    if (!list.length) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    if (!state.selSession) {
      /* 当天可能有多节课（如补课），先列出节次 */
      body.innerHTML = list.map(function (se, i) {
        var st = sessionStat(se);
        return '<div class="rrow" style="cursor:pointer" data-arc-sess="' + se.id + '">'
          + '<div class="rk">' + (i + 1) + '</div>'
          + '<div class="rname">第 ' + (i + 1) + ' 节课<span class="n">' + (se.settledAt ? String(se.settledAt).slice(11, 16) : '') + ' 归档</span></div>'
          + '<div class="rcnt">' + st.cnt + ' 次</div><div class="rsc">' + st.score + ' 分 · ' + st.people + ' 人</div>'
          + '</div>';
      }).join('');
      body.querySelectorAll('[data-arc-sess]').forEach(function (el) {
        el.onclick = function () { state.selSession = parseInt(el.dataset.arcSess, 10); renderDetail(); };
      });
      return;
    }
    /* 单节课明细：名次 / 学生 / 次数 / 得分 / 对比全班平均 */
    var se = DB.sessions.find(function (s) { return s.id === state.selSession; });
    if (!se) { state.selSession = null; renderDetail(); return; }
    var ss = students(curClassId());
    var rows = ss.map(function (s) {
      var t = getTally(se.id, s.id);
      return { s: s, cnt: t ? (t.count || 0) : 0, sc: scoreOf(t) };
    }).sort(function (a, b) { return (b.cnt - a.cnt) || sidCmp(a.s, b.s); });
    var total = rows.reduce(function (a, r) { return a + r.cnt; }, 0);
    var avg = rows.length ? Math.round((total / rows.length) * 10) / 10 : 0;
    var html = '<div class="row" style="margin-bottom:10px"><button class="btn btn--ghost btn--sm" id="arcBackList">← 返回节次列表</button>'
      + '<span class="muted">' + curClass.name + ' · ' + se.date + ' · 全班 ' + rows.length + ' 人 · 共 ' + total + ' 次</span></div>';
    if (!total) {
      html += '<div class="arc-empty">本节课没有任何计数记录。</div>';
    } else {
      html += '<div style="overflow-x:auto"><table class="table"><thead><tr><th>名次</th><th>学生</th><th>学号</th><th>练习次数</th><th>得分</th><th>对比平均</th></tr></thead><tbody>';
      rows.forEach(function (r, i) {
        var diff = r.cnt - avg;
        html += '<tr><td><b>' + (i + 1) + '</b></td>'
          + '<td>' + esc(r.s.name) + (r.s.nick ? '<span class="muted"> ' + esc(r.s.nick) + '</span>' : '') + '</td>'
          + '<td>' + esc(r.s.sid || '—') + '</td>'
          + '<td><b>' + r.cnt + '</b> 次</td>'
          + '<td>' + r.sc + '</td>'
          + '<td style="color:' + (diff >= 0 ? '#16a34a' : '#dc2626') + '">' + (diff >= 0 ? '+' : '') + (Math.round(diff * 10) / 10) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    body.innerHTML = html;
    var back = $('arcBackList');
    if (back) back.onclick = function () { state.selSession = null; renderDetail(); };
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $('arcPrev').onclick = function () {
      var m = state.m - 1, y = state.y;
      if (m < 0) { m = 11; y--; }
      gotoMonth(y, m);
    };
    $('arcNext').onclick = function () {
      var m = state.m + 1, y = state.y;
      if (m > 11) { m = 0; y++; }
      gotoMonth(y, m);
    };
    $('arcToday').onclick = function () {
      var n = new Date();
      gotoMonth(n.getFullYear(), n.getMonth());
    };
    $('arcDetailClose').onclick = function () {
      state.selDate = null; state.selSession = null;
      render();
    };
  }

  global.ClassArchive = {
    render: function () { injectCss(); if (!state.y) { var n = new Date(); state.y = n.getFullYear(); state.m = n.getMonth(); } render(); },
    bind: bind
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(window);
