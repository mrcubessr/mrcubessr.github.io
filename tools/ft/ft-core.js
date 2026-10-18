/* ft-core.js — 公式训练器（tools/ft）共用内核
 *
 * 覆盖页面：index.html（统一入口）、corner/edge/center/wing/tcenter/midge.html
 *           （六个体系训练页）、special.html（特殊情形查阅）。
 * 本文件只管「数据与体系」，不管页面形式（矩阵/看板/计时器在 ft-page.js + TrainMatrix）。
 *
 * 职责：
 *   ① 体系注册表（三盲角块 / 三盲棱块 / 高阶角心 / 高阶翼棱 / 高阶棱心 / 高阶中棱）
 *   ② 按缓冲懒加载 data/<sys>-<BUF>.json（内存缓存 + 进行中去重，切缓冲不重复请求）
 *   ③ 缓冲选择记忆（localStorage ft_buf_<sys>，每页记住上次用的缓冲）
 *   ④ 路线 C 手动补全 / 参考公式切换（localStorage ft_swaps_<sys>）
 *      —— 与 4bld 旧页同一套交互：点备选即切换、✎ 手动输入、恢复默认
 *   ⑤ 派生展示名（组名 / 来源标签 / 合法格判定）
 *   ⑥ 入口页分组字段 section：'3bld'（三阶）/ 'big'（高阶）；二阶盲拧为预留，暂无数据
 *
 * 数据格式（gen-data.py 生成，见该文件头注释）：
 *   { sys, buf, bufPos, order[23], pos{24}, groups, names?, blank[],
 *     cells: { 三字母码: [主公式, 来源数, [[备选,来源数]...], origin] },
 *     meta: { valid, filled, blank } }
 *   origin ∈ 'blddb'（直接抓取）| 'rot'（整魔方旋转共轭派生）| 'excel'（你的公式表）
 */
window.FT = (function () {
  'use strict';

  /* 三盲字母表：A–Z 去 U,V（24 个）。与全站角/棱编码同一套体系，
     色组字母与 blddb 逐字母同一体系（piece 锚定），无需任何转换。 */
  var LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P',
                 'Q','R','S','T','W','X','Y','Z'];

  /* ============ 体系注册表 ============ */
  /* cellsPerBuffer 等数字与 data/manifest.json 一致（改数据后同步改这里或跑 gen-data.py 对账）
     section：入口页分组用 —— '3bld' 三阶 / 'big' 高阶（二阶盲拧预留，暂无注册项） */
  var SYSTEMS = {
    corner: {
      id: 'corner', name: '三盲 · 角块', short: '角块',
      page: 'corner.html',
      section: '3bld',
      defBuf: 'J',                 // UFR 角（最常用缓冲）
      cellsPerBuffer: 378, groups: 8, lettersPerGroup: 3,
      kind: 'same-piece',          // 三字母须分属三块才合法（角/棱）
      letterDesc: '24 字母色组体系',
      pieceDesc: '每角 3 个字母',
      srcDesc: 'blddb 噩梦风格',
      hasComm: false,             // 三阶噩梦风格源无括号格式数据
      desc: '三阶盲拧角块 3-style：默认缓冲 UFR，其余两角的所有排列组合直接进矩阵，点格即练。'
    },
    edge: {
      id: 'edge', name: '三盲 · 棱块', short: '棱块',
      page: 'edge.html',
      section: '3bld',
      defBuf: 'A',
      cellsPerBuffer: 440, groups: 12, lettersPerGroup: 2,
      kind: 'same-piece',
      letterDesc: '24 字母标准配对',
      pieceDesc: '每棱 2 个字母',
      srcDesc: 'blddb 噩梦风格',
      hasComm: false,             // 三阶噩梦风格源无括号格式数据
      desc: '三阶盲拧棱块 3-style：与角块同构，24 个缓冲任选，440 种情况一屏铺开。'
    },
    center: {
      id: 'center', name: '高阶 · 角心', short: '角心',
      page: 'center.html',
      section: 'big',
      defBuf: 'D',                 // 你的 Excel 公式表缓冲 Ubl
      cellsPerBuffer: 506, groups: 6, lettersPerGroup: 3,
      kind: 'self-only',           // 每个字母自成一块，仅同格非法（中心/翼棱）
      letterDesc: '24 个中心块',
      pieceDesc: '每中心块 1 个字母',
      srcDesc: 'blddb 人造风格 + 你的 Excel 公式表',
      hasComm: true,              // blddb comm 字段（已逐条验证展开一致）
      desc: '四阶/五阶盲拧角心（X-Center）：缓冲 D 用你的公式表，其余 23 个缓冲由 blddb 抓取 + 旋转派生补全。'
    },
    wing: {
      id: 'wing', name: '高阶 · 翼棱', short: '翼棱',
      page: 'wing.html',
      section: 'big',
      defBuf: 'A',
      cellsPerBuffer: 506, groups: 12, lettersPerGroup: 2,
      kind: 'self-only',
      letterDesc: '24 个翼块',
      pieceDesc: '每翼块 1 个字母',
      srcDesc: 'blddb 人造风格（旋转派生补全非 A 缓冲）',
      hasComm: true,
      desc: '高阶盲拧翼棱：含 G/H（UR 棱）情况，非 A 缓冲由整魔方旋转共轭派生，覆盖率 100%。'
    },
    tcenter: {
      id: 'tcenter', name: '高阶 · 棱心', short: '棱心',
      page: 'tcenter.html',
      section: 'big',
      defBuf: 'A',
      cellsPerBuffer: 506, groups: 6, lettersPerGroup: 4,
      kind: 'self-only',
      letterDesc: '24 个棱心（T 中心）',
      pieceDesc: '每棱心 1 个字母',
      srcDesc: 'blddb 人造风格（旋转派生补全非 A 缓冲）',
      hasComm: true,
      desc: '高阶盲拧棱心（T 中心）：每条棱正中的那片，与翼棱同构；按面分 6 组，24 个缓冲任选。'
    },
    midge: {
      id: 'midge', name: '高阶 · 中棱', short: '中棱',
      page: 'midge.html',
      section: 'big',
      defBuf: 'A',
      cellsPerBuffer: 440, groups: 12, lettersPerGroup: 2,
      kind: 'same-piece',
      letterDesc: '24 个中棱位',
      pieceDesc: '每棱 2 个字母（同槽不同向）',
      srcDesc: 'blddb 人造风格（旋转派生补全非 A 缓冲）',
      hasComm: true,
      desc: '高阶盲拧中棱：每条棱正中间那片，UF/FU 同槽不同向，与三阶棱块同构，440 种情况。'
    }
  };

  function sysOf(id) { return SYSTEMS[id] || null; }

  /* ============ 按缓冲懒加载 ============ */
  var _cache = {};   // 'corner-A' -> data 对象
  var _pend = {};    // 'corner-A' -> Promise（进行中去重，重复调用不重复发请求）

  function load(sys, buf) {
    var key = sys + '-' + buf;
    if (_cache[key]) { return Promise.resolve(_cache[key]); }
    if (_pend[key]) { return _pend[key]; }
    _pend[key] = fetch('data/' + key + '.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.json();
      })
      .then(function (d) {
        _cache[key] = d;
        delete _pend[key];
        return d;
      })
      .catch(function (e) {
        delete _pend[key];
        throw e;
      });
    return _pend[key];
  }
  function cached(sys, buf) { return _cache[sys + '-' + buf] || null; }

  /* ============ 缓冲选择记忆 ============ */
  function bufKey(sys) { return 'ft_buf_' + sys; }
  function getBuf(sys) {
    var s = SYSTEMS[sys];
    var dflt = s ? s.defBuf : 'A';
    try {
      var v = localStorage.getItem(bufKey(sys));
      if (v && LETTERS.indexOf(v) >= 0) { return v; }
    } catch (e) {}
    return dflt;
  }
  function setBuf(sys, buf) {
    try { localStorage.setItem(bufKey(sys), buf); } catch (e) {}
  }

  /* ============ 路线 C 手动补全 / 参考公式切换 ============ */
  /* 与 4bld 旧页同一套语义：swaps[code] = 用户当前公式；
     点备选 / 手动输入都写这里；「恢复默认」删除条目回到数据主公式。 */
  function swapsKey(sys) { return 'ft_swaps_' + sys; }
  function getSwaps(sys) {
    try { return JSON.parse(localStorage.getItem(swapsKey(sys))) || {}; } catch (e) { return {}; }
  }
  function saveSwaps(sys, swaps) {
    try { localStorage.setItem(swapsKey(sys), JSON.stringify(swaps)); } catch (e) {}
  }
  /* 设 / 清一个 code 的公式；alg 为空或等于默认主公式时删除条目（恢复默认） */
  function setSwap(sys, code, alg, baseAlg) {
    var swaps = getSwaps(sys);
    if (!alg || alg === baseAlg) { delete swaps[code]; }
    else { swaps[code] = alg; }
    saveSwaps(sys, swaps);
    return swaps;
  }

  /* ============ 数据读取助手 ============ */
  function cellOf(data, code) { return (data && data.cells && data.cells[code]) || null; }
  function baseAlgOf(data, code) {
    var v = cellOf(data, code);
    return v ? (v[0] || '') : '';
  }
  /* 有序参考公式列表 [[公式, 来源数, comm]...]，index 0 = 默认主公式。
     comm = 括号格式（[A:B] 共轭 / [A,B] 交换子），数据无则为 null。 */
  function refListOf(data, code) {
    var v = cellOf(data, code);
    if (!v) { return []; }
    var out = [[v[0], v[1] || 0, v[4] || null]];
    (v[2] || []).forEach(function (x) {
      var trip = (x && typeof x.length === 'number' && typeof x !== 'string')
        ? [x[0], x[1] || 0, x[2] || null] : [x, 0, null];
      if (!trip[0]) { return; }
      for (var i = 0; i < out.length; i++) { if (out[i][0] === trip[0]) { return; } }
      out.push(trip);
    });
    return out;
  }
  /* 主公式的括号格式（cell 第 5 位） */
  function commOf(data, code) {
    var v = cellOf(data, code);
    return (v && v[4]) || null;
  }
  /* 按公式文本反查括号格式：默认主公式 → cell[4]；备选 → alts 对应项；
     手动输入 / Excel 公式表 / 旋转派生失败 → null（调用方回退展开式）。 */
  function commOfAlg(data, code, alg) {
    if (!alg) { return null; }
    var v = cellOf(data, code);
    if (!v) { return null; }
    if (alg === v[0]) { return v[4] || null; }
    var alts = v[2] || [];
    for (var i = 0; i < alts.length; i++) {
      if (alts[i] && alts[i][0] === alg) { return alts[i][2] || null; }
    }
    return null;
  }
  function originOf(data, code) {
    var v = cellOf(data, code);
    return v && v[3] ? v[3] : '';
  }
  var ORIGIN_LABEL = {
    blddb: 'blddb 公式库',
    rot: '旋转派生',
    excel: '你的公式表'
  };
  function originLabel(o) { return ORIGIN_LABEL[o] || o || '—'; }

  /* ============ 括号格式显示开关 ============ */
  /* localStorage 'ft_comm' = '1' 开 / '0' 关；六页共用一个键（偏好全局一致）。
     开启后公式以 blddb 括号格式显示：A:[B,C] = 共轭套交换子，[A,B] = 交换子；
     该条无括号数据（或你手动输入过公式）时自动回退为展开式。 */
  var COMM_KEY = 'ft_comm';
  function commOn() {
    try { return localStorage.getItem(COMM_KEY) === '1'; } catch (e) { return false; }
  }
  function setComm(on) {
    try { localStorage.setItem(COMM_KEY, on ? '1' : '0'); } catch (e) {}
  }

  /* ============ 公式显示方式（v2.0.26）============
     ft_algview = 'expand'（展开式）| 'comm'（括号/转换机格式）| 'both'（两者都显示）
     取代旧的布尔键 ft_comm —— 旧值 '1' 首次读取时自动迁移为 'comm'，用户无感。 */
  var ALGVIEW_KEY = 'ft_algview';
  function algView() {
    try {
      var v = localStorage.getItem(ALGVIEW_KEY);
      if (v === 'expand' || v === 'comm' || v === 'both') { return v; }
      if (v === null && localStorage.getItem(COMM_KEY) === '1') { return 'comm'; }
    } catch (e) {}
    return 'expand';
  }
  function setAlgView(v) {
    try { localStorage.setItem(ALGVIEW_KEY, v); } catch (e) {}
  }

  /* ============ 星标标记（v2.0.26）============
     ft_stars_<sys> = { 三字母码: { c: 颜色键, n: '备注文字' } }
     用途：把「母公式」这类特殊公式单独标出来 —— 母公式是基础转换机，
     其他公式是它的变化形式，练的时候标出来一眼就能认出结构来源。
     每档一个颜色，矩阵卡片、练习浮层、详情浮窗三处同步。
     ⚠️ 读取走页面缓存（state.stars）：矩阵一次要画 506 格，
        每格 parse 一次 localStorage 会明显卡顿。 */
  var STAR_COLORS = [
    { k: 'gold',   name: '母公式', tip: '基础转换机 · 其他公式由它变化而来' },
    { k: 'red',    name: '重点练', tip: '容易卡壳 · 需要反复练' },
    { k: 'blue',   name: '易错',   tip: '方向容易做反或记混' },
    { k: 'green',  name: '已掌握', tip: '已稳定 · 可以少练' },
    { k: 'purple', name: '自定义', tip: '自己定义的一类（备注里写清楚）' }
  ];
  function starsKey(sys) { return 'ft_stars_' + sys; }
  function getStars(sys) {
    try {
      var v = JSON.parse(localStorage.getItem(starsKey(sys)));
      return (v && typeof v === 'object') ? v : {};
    } catch (e) { return {}; }
  }
  function saveStars(sys, s) {
    try { localStorage.setItem(starsKey(sys), JSON.stringify(s || {})); } catch (e) {}
  }
  function starColorName(k) {
    for (var i = 0; i < STAR_COLORS.length; i++) {
      if (STAR_COLORS[i].k === k) { return STAR_COLORS[i].name; }
    }
    return '已标记';
  }

  /* ============ 练习模式（v2.0.26）============
     ft_repmode = 'single'（单次计时）| 'avg3'（连做三次取平均）
     三阶角/棱常用「同一公式连做三次取平均」看稳定性，高阶（角心/翼棱）常做单次。
     两种模式并存，由用户在工具条/练习浮层里切换，记在全局键里。 */
  var REPMODE_KEY = 'ft_repmode';
  function repMode() {
    try {
      var v = localStorage.getItem(REPMODE_KEY);
      if (v === 'single' || v === 'avg3') { return v; }
    } catch (e) {}
    return 'single';
  }
  function setRepMode(v) {
    try { localStorage.setItem(REPMODE_KEY, v); } catch (e) {}
  }

  /* ============ 组名 / 位置名 ============ */
  /* 角块有中文色组名（names）；棱/翼棱/中棱取位置名前两字符（UF 棱）；
     中心块/棱心取面字母（U 面）——棱心按面分 6 组，位置名前缀即面字母。 */
  function groupLabel(sys, data, gi) {
    var g = (data && data.groups && data.groups[gi]) || [];
    if (!g.length) { return '第 ' + (gi + 1) + ' 组'; }
    var tag = '';
    if (sys === 'corner' && data.names && data.names[gi]) {
      tag = data.names[gi];
    } else if (sys === 'wing' || sys === 'edge' || sys === 'midge') {
      tag = (data.pos[g[0]] || '').slice(0, 2) + ' 棱';
    } else if (sys === 'center' || sys === 'tcenter') {
      tag = (data.pos[g[0]] || '').slice(0, 1) + ' 面';
    }
    return '第 ' + (gi + 1) + ' 组' + (tag ? ' · ' + tag : '') + '（' + g.join(' ') + '）';
  }
  /* 三字母码的位置读法：A → D → M */
  function posStr(data, code) {
    if (!data || !data.pos) { return code; }
    var p = data.pos;
    return (p[code.charAt(0)] || '?') + ' → ' + (p[code.charAt(1)] || '?') + ' → ' + (p[code.charAt(2)] || '?');
  }

  /* ============ 合法格判定 ============ */
  /* 返回 fn(code) -> true 表示「无此情况」（矩阵置灰、不可手动补全）。
     - same-piece（角/棱）：三字母必须分属三块 —— 两个次字母同组、或任一次字母与缓冲同组都非法
       （角块 378 = 2 方向 × 9 字母组合 × C(7,2) 块对；棱块 440 同构）
     - self-only（中心/翼棱）：每字母自成一块，仅「行=列」非法（506 = 23×23 − 23） */
  function illegalFn(sys, data) {
    var s = SYSTEMS[sys];
    if (!s) { return function () { return false; }; }
    if (s.kind === 'same-piece') {
      var gidx = {};
      (data.groups || []).forEach(function (g, i) { g.forEach(function (c) { gidx[c] = i; }); });
      var bg = gidx[data.buf];
      return function (code) {
        var gx = gidx[code.charAt(1)], gy = gidx[code.charAt(2)];
        return gx === undefined || gy === undefined ||
               gx === gy || gx === bg || gy === bg;
      };
    }
    return function (code) { return code.charAt(1) === code.charAt(2); };
  }
  /* data.blank = 原表刻意留空的格（如中心块缓冲 D 的 5 格）：可手动补全 */
  function isBlank(data, code) {
    return !!(data && data.blank && data.blank.indexOf(code) >= 0);
  }

  /* ============ 迁移来的脏 swaps 清理 ============ */
  /* 旧页「选默认第 1 条参考公式」也会写 selections，迁过来等于默认主公式的条目
     应删掉（ft 语义：swaps 里有该 code = 换过公式，金边标记）。数据加载后调用。 */
  function normalizeSwaps(sys, data) {
    var swaps = getSwaps(sys);
    var changed = false;
    Object.keys(swaps).forEach(function (code) {
      if (!baseAlgOf(data, code) || swaps[code] === baseAlgOf(data, code)) {
        delete swaps[code];
        changed = true;
      }
    });
    if (changed) { saveSwaps(sys, swaps); }
    return swaps;
  }

  /* ============ 旧页练习数据自动迁移（v2.0.24 一次性） ============ */
  /* 旧页暂留但入口已移除；首次打开任意 ft 页时把成绩/公式选择搬进新键：
     - tools/scramble-uf440/（UF440 公式训练）：alg440_times / alg440_sessions / uf_ref_selections
       旧码两字母（'CE'）→ 新 edge 码 'A'+两字母（'ACE'，edge 默认缓冲 A = UF，与旧页同一套公式）
     - tools/4bld/（四阶中心块）：c4_center_times / c4_center_sessions / c4_center_swaps
       旧码两字母（'XY'）→ 新 center 码 'D'+两字母（'DXY'，center 默认缓冲 D = Ubl）
     - tools/4bld/wing.html（高阶翼棱）：c4_wing_times / c4_wing_sessions / c4_wing_swaps
       旧码本就是三字母（'AXY'），原样搬
     旧键一律保留不动（不删不改）；ft_migrated_v1 防重入；任何异常静默跳过不影响页面使用。 */
  var MIGRATE_KEY = 'ft_migrated_v1';
  function migrateLegacy() {
    try {
      if (localStorage.getItem(MIGRATE_KEY)) { return; }
      var jobs = [
        { from: 'alg440_times',      to: 'ft_times_edge',     prefix: 'A', kind: 'list' },
        { from: 'alg440_sessions',   to: 'ft_sessions_edge',  prefix: 'A', kind: 'list' },
        { from: 'uf_ref_selections', to: 'ft_swaps_edge',     prefix: 'A', kind: 'alg'  },
        { from: 'c4_center_times',    to: 'ft_times_center',    prefix: 'D', kind: 'list' },
        { from: 'c4_center_sessions', to: 'ft_sessions_center', prefix: 'D', kind: 'list' },
        { from: 'c4_center_swaps',    to: 'ft_swaps_center',    prefix: 'D', kind: 'alg'  },
        { from: 'c4_wing_times',    to: 'ft_times_wing',    prefix: '', kind: 'list' },
        { from: 'c4_wing_sessions', to: 'ft_sessions_wing', prefix: '', kind: 'list' },
        { from: 'c4_wing_swaps',    to: 'ft_swaps_wing',    prefix: '', kind: 'alg'  }
      ];
      jobs.forEach(function (j) {
        var old;
        try { old = JSON.parse(localStorage.getItem(j.from)); } catch (e) { return; }
        if (!old || typeof old !== 'object') { return; }
        var dst;
        try { dst = JSON.parse(localStorage.getItem(j.to)) || {}; } catch (e) { dst = {}; }
        var moved = 0;
        Object.keys(old).forEach(function (code) {
          /* 码校验：加前缀后必须是 3 个合法字母、非自格（第二三位相同）；
             同组非法码（same-piece 体系）不在此层拦——旧页数据本身不会产生，
             偶发脏码也只是永不被 ALL 收录的死数据，normalizeSwaps 会兜底清理 swaps。
             目标键已有该码则不覆盖 */
          if (typeof code !== 'string') { return; }
          var body = j.prefix ? code.slice(0, 2) : code;
          if (body.length !== (j.prefix ? 2 : 3)) { return; }
          var nk = j.prefix + body;
          for (var i = 0; i < nk.length; i++) {
            if (LETTERS.indexOf(nk.charAt(i)) < 0) { return; }
          }
          if (nk.charAt(1) === nk.charAt(2)) { return; }
          if (dst[nk] !== undefined) { return; }
          var v = old[code];
          if (j.kind === 'list') {
            if (!Array.isArray(v) || !v.length) { return; }
            for (var k = 0; k < v.length; k++) {
              if (typeof v[k] !== 'number' || !isFinite(v[k])) { return; }
            }
          } else {
            if (typeof v !== 'string' || !v.trim()) { return; }
          }
          dst[nk] = v;
          moved++;
        });
        if (moved) {
          try { localStorage.setItem(j.to, JSON.stringify(dst)); } catch (e) {}
        }
      });
      try { localStorage.setItem(MIGRATE_KEY, '1'); } catch (e) {}
    } catch (e) {}
  }
  migrateLegacy();

  return {
    LETTERS: LETTERS,
    SYSTEMS: SYSTEMS,
    sysOf: sysOf,
    load: load,
    cached: cached,
    getBuf: getBuf,
    setBuf: setBuf,
    swapsKey: swapsKey,
    getSwaps: getSwaps,
    saveSwaps: saveSwaps,
    setSwap: setSwap,
    cellOf: cellOf,
    baseAlgOf: baseAlgOf,
    refListOf: refListOf,
    originOf: originOf,
    originLabel: originLabel,
    groupLabel: groupLabel,
    posStr: posStr,
    illegalFn: illegalFn,
    isBlank: isBlank,
    normalizeSwaps: normalizeSwaps,
    commOf: commOf,
    commOfAlg: commOfAlg,
    commOn: commOn,
    setComm: setComm,
    algView: algView,
    setAlgView: setAlgView,
    STAR_COLORS: STAR_COLORS,
    starsKey: starsKey,
    getStars: getStars,
    saveStars: saveStars,
    starColorName: starColorName,
    repMode: repMode,
    setRepMode: setRepMode
  };
})();
