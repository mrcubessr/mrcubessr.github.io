/* train-matrix.js — 单式训练页「双视图」共用框架引擎
 *
 * 页面形式固定为两块：
 *   ① 矩阵总览（默认）：行 = 首字母，列 = 次字母，格内直显完整公式，一屏铺满
 *   ② 练习总览：横版彩色卡片扁平铺满一屏，卡片带公式
 * 顶部为紧凑仪表盘（KPI + 连续色带 + TOP10 折叠），两视图各一份、内容同源。
 *
 * 本模块只管「形式 + 布局」，不管统计口径（指标/基准/三连均等由各页自行实现），
 * 也不管计时与练习浮层。页面通过 cfg 回调把数据接进来。
 *
 * 用法：
 *   var TM = TrainMatrix.mount({
 *     rowOrder: ORDER, colOrder: ORDER,
 *     algOf: algOf, isSwapped: isSwapped, gclass: gclass,
 *     cellInfo: function (code, row, col) { ... return {...} },  // 见下
 *     boardHTML: function () { return html; },
 *     dash: function (A, prefix) { ... },                        // 渲染仪表盘
 *     computeAll: function () { return A; },
 *     halfLenOf / minCell / ...
 *   });
 */
(function (global) {
  'use strict';

  /* ================= 布局常量（与 440 页历史调参一致，别随手改） ================= */
  var GAP = 5;            // 卡片间距
  var MIN_CELL = 34;      // 桌面最小可读格宽（卡片带三行信息，再小公式成噪点）
  var MAX_CELL = 116;     // 桌面最大格宽（安全阀）
  var MAX_ASPECT = 1.34;  // 格子最大长宽比，超出视为「细长条」弃用
  var MX_GAP = 2;         // 矩阵格间距
  var MX_HH = 18;         // 矩阵表头行高
  var MX_MIN_W = 40;      // 矩阵最小格宽，触底转横向滚动
  var MX_MIN_H = 15;      // 矩阵最小格高，触底转纵向滚动

  /* ================= 工具 ================= */
  function divisors(n) {
    var out = [];
    for (var i = 1; i * i <= n; i++) {
      if (n % i === 0) { out.push(i); if (i !== n / i) { out.push(n / i); } }
    }
    return out.sort(function (a, b) { return a - b; });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** commutator 两段切分：在方括号内深度=1 的逗号处断开，各占一行（不从 token 中间断） */
  function splitHalves(alg) {
    var a = String(alg || ''), d = 0, cut = -1, i, ch;
    for (i = 0; i < a.length; i++) {
      ch = a.charAt(i);
      if (ch === '[') { d++; }
      else if (ch === ']') { d--; }
      else if (ch === ',' && d === 1) { cut = i; break; }
    }
    if (cut < 0) { return null; }
    return [a.slice(0, cut + 1), a.slice(cut + 1)];
  }

  /**
   * 全表统一字号：按「切段后较长段长度的 p90」反推字号。
   * 公式全 ASCII，等宽字体约 0.55em/字符，再扣 0.3px 负字距。
   */
  function halfLenOf(codes, algOf) {
    var lens = [];
    codes.forEach(function (c) {
      var a = algOf(c) || '';
      var halves = splitHalves(a);
      lens.push(halves ? Math.max(halves[0].length, halves[1].length) : a.length);
    });
    if (!lens.length) { return 12; }
    lens.sort(function (x, y) { return x - y; });
    return lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.9))];
  }

  /** 矩阵/看板共用的公式着色块（每段一个块级 .mx-ln ⟹ 一行一段） */
  function fmtAlgCell(alg, fmtAlg) {
    if (!alg) { return ''; }
    var halves = splitHalves(alg);
    if (!halves) { return '<span class="mx-ln">' + fmtAlg(alg) + '</span>'; }
    return '<span class="mx-ln">' + fmtAlg(halves[0]) + '</span>' +
           '<span class="mx-ln">' + fmtAlg(halves[1]) + '</span>';
  }

  /** 纵向滚动锁：一屏装得下才锁，装不下必须放开，否则下方内容永远看不到 */
  function lockScroll(on) {
    var de = document.documentElement;
    de.style.overflowY = on ? 'hidden' : '';
    document.body.style.overflowY = on ? 'hidden' : '';
  }

  /* ================= 看板铺满 ================= */
  /* 宽高双轴择优：cell = min(cellW,cellH) 取最大 → 面积利用率最高，天然收敛到
     「纵向也填满」的那组列数（宽屏不会排出 44+ 列的细长条）。再卡长宽比与末行
     拉伸比；一轮都选不出（窗口偏矮）就退化为「宽度铺满 + 竖向滚动」。 */
  function fitBoard(board, o) {
    o = o || {};
    if (!board) { return null; }
    var cells = board.children, n = cells.length;
    if (!n) { return null; }

    var cs = getComputedStyle(board);
    var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var availW = board.clientWidth ? (board.clientWidth - padX - 2)
                                   : (document.documentElement.clientWidth - 240 - 32);
    availW = Math.max(240, availW);

    /* 可用高度 = 视口高 - 板顶偏移 - 板下尾距（逐项相加，不能用 scrollHeight 反推：
       body 有 min-height:100vh，内容不足一屏时反推会把页面空白也算进尾距）。
       ⚠️ 漏算任一项都会让板超出视口 4~8px，锁滚动后底部直接被裁。 */
    var rect = board.getBoundingClientRect();
    var topSpace = Math.max(0, rect.top);
    var tailH = 0;
    (o.tailEls || []).forEach(function (sel) {
      var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!el) { return; }
      var s = getComputedStyle(el);
      tailH += (parseFloat(s.marginBottom) || 0);
      if (sel) { tailH += (parseFloat(s.paddingBottom) || 0) + (parseFloat(s.borderBottomWidth) || 0); }
    });
    tailH += parseFloat(cs.marginBottom) || 0;
    tailH += parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    if (o.includeFooter) {
      var foot = document.querySelector('footer.site-footer');
      if (foot) {
        tailH += Math.ceil(foot.getBoundingClientRect().height);
        tailH += parseFloat(getComputedStyle(foot).marginTop) || 0;
      }
    }
    var availH = Math.max(200, window.innerHeight - topSpace - Math.ceil(tailH) - 2);

    var gap = o.gap || GAP;
    var isNarrow = window.innerWidth < 640;
    var minCell = isNarrow ? (o.minCellNarrow || 30) : (o.minCell || MIN_CELL);
    var maxCell = isNarrow ? (o.maxCellNarrow || 96) : (o.maxCell || MAX_CELL);
    var maxAspect = o.maxAspect || MAX_ASPECT;
    var maxColsByW = Math.min(n, Math.max(1, Math.floor((availW + gap) / (minCell + gap))));

    function planFor(cols) {
      var rows = Math.ceil(n / cols);
      var rem = n - cols * (rows - 1);
      var cellW = (availW - (cols - 1) * gap) / cols;
      var cellH = (availH - (rows - 1) * gap) / rows;
      var lo = Math.min(cellW, cellH), hi = Math.max(cellW, cellH);
      var tailRatio = rem === 0 ? 1 : ((availW - (rem - 1) * gap) / rem) / cellW;
      return { cols: cols, rows: rows, rem: rem, cellW: cellW, cellH: cellH,
               cell: lo, aspect: hi / lo, tailRatio: tailRatio, fitsH: true };
    }
    function widthPlanFor(cols) {
      var rows = Math.ceil(n / cols);
      var rem = n - cols * (rows - 1);
      var cellW = (availW - (cols - 1) * gap) / cols;
      return { cols: cols, rows: rows, rem: rem, cellW: cellW, cellH: cellW,
               cell: cellW, aspect: 1, tailRatio: rem === 0 ? 1 : cols / rem, fitsH: false };
    }
    function legal(p) {
      return p.cell >= minCell && p.cell <= maxCell && p.aspect <= maxAspect && p.tailRatio <= 3;
    }

    var best = null, c, p, i, w;
    for (c = 1; c <= maxColsByW; c++) {
      p = planFor(c);
      if (!legal(p)) { continue; }
      if (!best || p.cell > best.cell * 1.02) { best = p; continue; }
      if (p.cell >= best.cell * 0.98) {
        var better;
        if ((p.rem === 0) !== (best.rem === 0)) { better = (p.rem === 0); }
        else if (Math.abs(p.tailRatio - best.tailRatio) > 0.03) { better = p.tailRatio < best.tailRatio; }
        else if (Math.abs(p.aspect - best.aspect) > 0.02) { better = p.aspect < best.aspect; }
        else { better = p.cell > best.cell; }
        if (better) { best = p; }
      }
    }
    if (!best) {   // 一屏物理装不下 → 宽度铺满
      // 桌面优先整除列（末行满格、不用拉伸）；窄屏直接取列数最多 —— 整除列在手机上
      // 只有 5~6 列，会白白多出近一倍滚动高度。
      if (isNarrow) {
        for (c = maxColsByW; c >= 1; c--) {
          w = widthPlanFor(c);
          if (w.cell < minCell || w.cell > maxCell) { continue; }
          best = w; break;
        }
      } else {
        var divs = divisors(n);
        for (i = 0; i < divs.length; i++) {
          if (divs[i] > maxColsByW) { break; }
          w = widthPlanFor(divs[i]);
          if (w.cell < minCell || w.cell > maxCell) { continue; }
          if (!best || w.cols > best.cols) { best = w; }
        }
      }
    }
    if (!best) {   // 任意列数里取「合法范围内列数最多」
      for (c = maxColsByW; c >= 1; c--) {
        w = widthPlanFor(c);
        if (w.cell < minCell || w.cell > maxCell) { continue; }
        best = w; break;
      }
    }
    if (!best) {   // 兜底：最大列数 + 最小格宽
      w = widthPlanFor(maxColsByW);
      var cc = Math.max(minCell, Math.min(w.cellW, maxCell));
      best = { cols: w.cols, rows: w.rows, rem: w.rem, cellW: cc, cellH: cc,
               cell: cc, aspect: 1, tailRatio: 1, fitsH: false };
    }

    // 末行拉伸：宽度不超过常规格 3 倍才铺，否则保持原宽居中
    var tailW = 0;
    if (best.rem > 0 && best.rem < best.cols) {
      var t = (availW - (best.rem - 1) * gap) / best.rem;
      if (t <= best.cellW * 3) { tailW = t; }
    }

    var vw = o.vars || {};
    var kW = vw.cellW || '--c4-cell-w', kH = vw.cellH || '--c4-cell-h';
    var kC = vw.cell || '--c4-cell', kT = vw.tail || '--c4-tail', kF = vw.fs || '--c4-fs';
    board.style.setProperty(kW, best.cellW.toFixed(2) + 'px');
    board.style.setProperty(kH, best.cellH.toFixed(2) + 'px');
    board.style.setProperty(kC, best.cell.toFixed(2) + 'px');
    if (tailW > 0) { board.style.setProperty(kT, tailW.toFixed(2) + 'px'); }
    else { board.style.removeProperty(kT); }
    for (var k = 0; k < n; k++) {
      var el = cells[k];
      if (!el || !el.classList) { continue; }
      if (tailW > 0 && k >= n - best.rem) { el.classList.add('is-tail'); }
      else { el.classList.remove('is-tail'); }
    }

    // 卡片三行文字字号：由格宽反推公式字号，再被格高夹住
    if (kF) {
      var half = o.halfLen || 12;
      var algFs = (best.cellW - 4) / (half * 0.55);
      board.style.setProperty(kF, Math.max(4.5, Math.min(algFs, best.cellH * 0.30)).toFixed(2) + 'px');
    }
    return { plan: best, fitsH: best.fitsH };
  }

  /* ================= 矩阵铺满 ================= */
  function fitMatrix(wrap, o) {
    o = o || {};
    var grid = wrap && wrap.querySelector('.mx-grid');
    if (!grid || wrap.hidden || !wrap.clientWidth) { return null; }

    var cs = getComputedStyle(wrap);
    var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    var padBottom = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    var availW = wrap.clientWidth - padX - 4;
    var availH = window.innerHeight - wrap.getBoundingClientRect().top - padY - 2 - padBottom - 6;
    if (availW < 240 || availH < 160) { return null; }

    var cols = o.cols, rows = o.rows;          // 数据列数 / 数据行数（不含标签列与表头行）
    var gap = o.gap || MX_GAP, hh = o.hh || MX_HH;
    var lab = Math.max(16, Math.min(30, Math.round(availW * (o.labRatio || 0.018))));
    var cellW = (availW - lab - (cols - 1) * gap) / cols;
    var cellH = (availH - hh - (rows - 1) * gap) / rows;

    var scroll = false;
    if (cellW < (o.minW || MX_MIN_W)) { cellW = o.minW || MX_MIN_W; scroll = true; }
    if (cellH < (o.minH || MX_MIN_H)) { cellH = o.minH || MX_MIN_H; scroll = true; }

    /* 字号从大到小试，两条约束都要满足：
       ① 宽度：典型较长段（p90）必须一行放得下；② 高度：两行文字要装进格子。
       0.55em/字符 = 等宽字宽，-0.3px = 负字距；1.24 = 行高留余量。 */
    var half = o.halfLen || 12, fs = 0;
    for (var f = 16; f >= 5; f -= 0.25) {
      if (half * (0.55 * f - 0.3) > cellW - 2) { continue; }
      if (2 * f * 1.24 > cellH - 2) { continue; }
      fs = f; break;
    }
    if (!fs) { fs = 5; }

    grid.style.setProperty('--mx-cols', String(cols));
    grid.style.setProperty('--mx-rows', String(rows));
    grid.style.setProperty('--mx-h', cellH.toFixed(2) + 'px');
    grid.style.setProperty('--mx-gap', gap + 'px');
    grid.style.setProperty('--mx-lab', lab + 'px');
    grid.style.setProperty('--mx-hh', hh + 'px');
    grid.style.setProperty('--mx-cw', (scroll ? cellW : 0) + 'px');
    grid.style.setProperty('--mx-fs', fs.toFixed(2) + 'px');
    grid.style.setProperty('--mx-lfs', Math.max(8, Math.min(13, Math.round(cellH * 0.55))) + 'px');
    wrap.classList.toggle('is-scroll', scroll);
    return { cellW: cellW, cellH: cellH, fs: fs, scroll: scroll };
  }

  /* ================= 挂载 ================= */
  /**
   * cfg = {
   *   rowOrder, colOrder,              // 行/列标签顺序
   *   algOf(code), isSwapped(code), gclass(label)
   *   fmtAlg(alg),                     // 公式着色（页面提供）
   *   codes,                           // 全部有效编码（算 halfLen 用）
   *   boardHTML(),                     // 返回练习总览 .c4-board 的 innerHTML
   *   cellInfo(code,row,col) -> {     // 矩阵单格
   *     kind: 'alg'|'self'|'intent'|'none', tip, style, disabled, hit
   *   }
   *   dash(A,prefix), computeAll(),    // 仪表盘（可选）
   *   matchSet(A)                      // 搜索/筛选命中集合（可选，矩阵高亮用）
   *   defaultView, onCellClick(code)
   *   codeOf(row, col)                   // 默认 row+col；翼棱等三字母码页面须覆盖
   *   minCell/maxCell/minW/minH/labRatio/includeFooter/tailEls
   * }
   */
  function mount(cfg) {
    var rowOrder = cfg.rowOrder, colOrder = cfg.colOrder;
    var halfLen = cfg.halfLen || halfLenOf(cfg.codes || [], cfg.algOf);
    /* halfLenFn：数据异步加载的页面（公式训练器 ft）在挂载时还没有 codes，
       字号基准要等数据到了再算 → 每次布局时现算（≤506 个 code，开销可忽略）。
       不传则沿用挂载时算好的 halfLen，旧页行为不变。 */
    function curHalfLen() {
      if (cfg.halfLen) { return cfg.halfLen; }
      if (cfg.halfLenFn) { return cfg.halfLenFn(); }
      return halfLen;
    }

    var el = {
      wrap: document.querySelector(cfg.wrapSel || '.c4-wrap'),
      view: document.querySelector(cfg.viewSel || '#c4-view'),
      dashBoard: document.querySelector(cfg.dashBoardSel || '#c4-dash'),
      dashMatrix: document.querySelector(cfg.dashMatrixSel || '#c4-mx-dash'),
      boardWrap: document.querySelector(cfg.boardWrapSel || '#c4-board'),
      board: document.querySelector(cfg.boardSel || '.c4-board'),
      matrix: document.querySelector(cfg.matrixSel || '#c4-matrix')
    };

    var boardRaf = 0, mxRaf = 0;
    /* 尾距元素 = 页面自定义 tailEls + 框架自己的 boardWrap。
       ⚠️ boardWrap 的 padding-bottom 必须在算availH 时扣掉，否则板底溢出 2~8px 被裁。
       页面无需（也难以）自行枚举，故由框架统一注入。 */
    var tailEls = [];
    (cfg.tailEls || []).concat([el.boardWrap]).forEach(function (sel) {
      if (!sel) { return; }
      var node = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (node && tailEls.indexOf(node) < 0) { tailEls.push(node); }
    });
    function scheduleBoard() {
      if (boardRaf) cancelAnimationFrame(boardRaf);
      boardRaf = requestAnimationFrame(function () {
        boardRaf = 0;
        if (el.boardWrap && el.boardWrap.hidden) { return; }
        var r = fitBoard(el.board, {
          halfLen: curHalfLen(),
          gap: cfg.gap, minCell: cfg.minCell, maxCell: cfg.maxCell,
          minCellNarrow: cfg.minCellNarrow, maxCellNarrow: cfg.maxCellNarrow,
          maxAspect: cfg.maxAspect, includeFooter: cfg.includeFooter,
          tailEls: tailEls, vars: cfg.boardVars
        });
        if (el.boardWrap) { lockScroll(!!(r && r.fitsH)); }
      });
    }
    function scheduleMatrix() {
      if (mxRaf) cancelAnimationFrame(mxRaf);
      mxRaf = requestAnimationFrame(function () {
        mxRaf = 0;
        if (!el.matrix || el.matrix.hidden) { return; }
        var r = fitMatrix(el.matrix, {
          cols: colOrder.length, rows: rowOrder.length,
          halfLen: curHalfLen(), gap: cfg.mxGap, hh: cfg.mxHH,
          minW: cfg.mxMinW, minH: cfg.mxMinH, labRatio: cfg.labRatio
        });
        if (r) { lockScroll(!r.scroll); }
      });
    }
    function fitAll() { scheduleBoard(); scheduleMatrix(); }

    /* ---- 练习总览 ---- */
    function renderBoard() {
      if (cfg.dash && cfg.computeAll && el.dashBoard) { cfg.dash(cfg.computeAll(), cfg.dashBoardPrefix || 'c4-'); }
      if (!el.board) { return; }
      var html = cfg.boardHTML ? cfg.boardHTML() : '';
      el.board.innerHTML = html || '<div class="c4-empty">没有符合筛选条件的公式。</div>';
      scheduleBoard();
    }

    /* ---- 矩阵总览 ---- */
    function renderMatrix() {
      var A = null;
      if (cfg.dash && cfg.computeAll && el.dashMatrix) {
        A = cfg.computeAll();
        cfg.dash(A, cfg.dashMatrixPrefix || 'c4-mx-');
      }
      var mset = cfg.matchSet ? cfg.matchSet(A || (cfg.computeAll ? cfg.computeAll() : null)) : null;
      var h = '<div class="mx-grid">';
      h += '<div class="mx-corner" title="行 = 首字母 · 列 = 次字母">\\</div>';
      colOrder.forEach(function (c) {
        h += '<div class="mx-ch ' + (cfg.gclass ? cfg.gclass(c) : '') + '">' + c + '</div>';
      });
      rowOrder.forEach(function (row) {
        h += '<div class="mx-rh ' + (cfg.gclass ? cfg.gclass(row) : '') + '">' + row + '</div>';
        colOrder.forEach(function (col) {
          /* ⚠️ code 拼法：默认两字母（中心块 XY / UF440 CE），翼棱是三字母 A+XY（缓冲 A）→ 用 cfg.codeOf 覆盖 */
          var code = cfg.codeOf ? cfg.codeOf(row, col) : (row + col);
          var info = cfg.cellInfo ? cfg.cellInfo(code, row, col) : null;
          var kind = (info && info.kind) || 'none';
          var alg = (info && info.alg != null) ? info.alg : cfg.algOf(code);
          var cls = 'mx ' + (cfg.gclass ? cfg.gclass(col) : '') + (info && info.cls ? ' ' + info.cls : '');
          var style = (info && info.style) || '', tip = (info && info.tip) || code;
          /* kind='alg' 时页面通过 cls/style 自行区分已练（spd+tier+渐变底）与未练（on），
             框架不再叠加，避免和页面的着色类打架 */
          if (kind === 'self') {
            cls += ' self';
          } else if (kind === 'intent') {
            cls += ' intent';
          } else if (kind === 'none') {
            cls += ' grp';
          }
          /* info.manual：无公式但允许「点格子手动补全」的空格（公式训练器 ft 页用：
             原表刻意留空的格，如四阶中心块缓冲 D 的 5 格）。仍带 data-code 可点击，
             样式由页面 CSS 给 .mx.manual（虚线 + ✎ 提示）。默认不开启，旧页行为不变。 */
          if (info && info.manual) { cls += ' manual'; }
          if (mset) { cls += mset[code] ? ' hit' : ' dim'; }
          if (cfg.isSwapped && cfg.isSwapped(code)) { cls += ' is-swapped'; }
          /* info.html：页面要完全接管格子内容时用它（v2.0.26 公式训练器矩阵格改成
             「大字字母组合 + 时间 + 星标」就是走这条路）。没给就退回画公式。 */
          var inner = (info && info.html != null) ? info.html
                    : ((kind === 'alg' && alg) ? fmtAlgCell(alg, cfg.fmtAlg) : '');
          var attr = (kind === 'alg' && alg && !(info && info.disabled)) ? ' data-code="' + code + '"'
                   : ((info && info.manual) ? ' data-code="' + code + '"' : ' disabled');
          h += '<button type="button" class="' + cls + '" title="' + esc(tip) + '"' + attr +
               (style ? ' style="' + style + '"' : '') + '>' + inner + '</button>';
        });
      });
      h += '</div>';
      if (el.matrix) {
        el.matrix.innerHTML = h;
        scheduleMatrix();
      }
      return h;
    }

    /* ---- 视图切换 ---- */
    var view = cfg.defaultView || 'matrix';
    function setView(v) {
      view = v;
      if (el.view) {
        Array.prototype.forEach.call(el.view.querySelectorAll('button[data-view]'), function (b) {
          b.classList.toggle('is-active', b.getAttribute('data-view') === v);
        });
      }
      var board = (v === 'board');
      if (el.dashBoard) { el.dashBoard.hidden = !board; }
      if (el.dashMatrix) { el.dashMatrix.hidden = board; }
      if (el.boardWrap) { el.boardWrap.hidden = !board; }
      if (el.matrix) { el.matrix.hidden = board; }
      if (el.wrap) { el.wrap.classList.toggle('is-mx', !board); el.wrap.classList.toggle('is-board', board); }
      document.body.classList.toggle('is-mx', !board);
      document.body.classList.toggle('is-board', board);
      /* 切视图必须重渲染：搜索/筛选/指标的改动发生在另一个视图时，这边还是旧列表 */
      if (board) { renderBoard(); lockScroll(false); scheduleBoard(); }
      else { renderMatrix(); scheduleMatrix(); }
    }

    if (el.view) {
      el.view.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button[data-view]');
        if (b) { setView(b.getAttribute('data-view')); }
      });
    }

    /* ---- 矩阵 / 看板格点击 → 打开练习浮层 ---- */
    if (cfg.onCellClick) {
      document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('.mx[data-code], .c4-bcell[data-code], .c4-top__item[data-code]');
        if (t && t.getAttribute('data-code')) { cfg.onCellClick(t.getAttribute('data-code')); }
      });
    }

    /* ---- 左侧导航隐藏 ----
       v2.0.28 已整体移除：页面内的「隐藏侧栏」按钮全部删除，收起入口改到
       侧栏自身右上角（site-nav.js 注入 #navCollapse + 左缘 #navExpandTab），
       状态类 body.nav-hidden 与样式收在 site-nav.js / site-shell.css ⑪，
       与本框架无关。 */

    /* ---- 自适应：resize + 字体加载 + ResizeObserver（骨架异步注入不触发 resize） ---- */
    function watch() {
      window.addEventListener('resize', fitAll);
      window.addEventListener('orientationchange', fitAll);
      if (document.fonts && document.fonts.ready) { document.fonts.ready.then(fitAll); }
      if (typeof ResizeObserver !== 'undefined') {
        var t = 0;
        var ro = new ResizeObserver(function () { clearTimeout(t); t = setTimeout(fitAll, 60); });
        ro.observe(document.documentElement);
        [el.boardWrap, el.matrix, el.dashMatrix, el.dashBoard].forEach(function (n) { if (n) ro.observe(n); });
      }
      setTimeout(fitAll, 0);
    }

    return {
      el: el,
      fitAll: fitAll,
      scheduleBoard: scheduleBoard,
      scheduleMatrix: scheduleMatrix,
      renderBoard: renderBoard,
      renderMatrix: renderMatrix,
      setView: setView,
      getView: function () { return view; },
      lockScroll: lockScroll,
      halfLen: halfLen,
      watch: watch,
      fmtAlgCell: function (alg) { return fmtAlgCell(alg, cfg.fmtAlg); }
    };
  }

  global.TrainMatrix = {
    mount: mount,
    fitBoard: fitBoard,
    fitMatrix: fitMatrix,
    fmtAlgCell: fmtAlgCell,
    splitHalves: splitHalves,
    halfLenOf: halfLenOf,
    lockScroll: lockScroll,
    esc: esc,
    CONST: { GAP: GAP, MIN_CELL: MIN_CELL, MAX_CELL: MAX_CELL, MAX_ASPECT: MAX_ASPECT,
             MX_GAP: MX_GAP, MX_HH: MX_HH, MX_MIN_W: MX_MIN_W, MX_MIN_H: MX_MIN_H }
  };
})(window);
