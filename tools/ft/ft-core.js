/* ft-core.js — 公式训练器（tools/ft）共用内核
 *
 * 覆盖页面：index.html（统一入口）、corner/edge/center/wing.html（四个体系训练页）、
 *           special.html（特殊情形查阅）。
 * 本文件只管「数据与体系」，不管页面形式（矩阵/看板/计时器在 ft-page.js + TrainMatrix）。
 *
 * 职责：
 *   ① 体系注册表（三盲角块 / 三盲棱块 / 四阶中心块 / 高阶翼棱）
 *   ② 按缓冲懒加载 data/<sys>-<BUF>.json（内存缓存 + 进行中去重，切缓冲不重复请求）
 *   ③ 缓冲选择记忆（localStorage ft_buf_<sys>，每页记住上次用的缓冲）
 *   ④ 路线 C 手动补全 / 参考公式切换（localStorage ft_swaps_<sys>）
 *      —— 与 4bld 旧页同一套交互：点备选即切换、✎ 手动输入、恢复默认
 *   ⑤ 派生展示名（组名 / 来源标签 / 合法格判定）
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
  /* cellsPerBuffer 等数字与 data/manifest.json 一致（改数据后同步改这里或跑 gen-data.py 对账） */
  var SYSTEMS = {
    corner: {
      id: 'corner', name: '三盲 · 角块', short: '角块',
      page: 'corner.html',
      defBuf: 'A',                 // blddb 噩梦风格默认缓冲
      cellsPerBuffer: 378, groups: 8, lettersPerGroup: 3,
      kind: 'same-piece',          // 三字母须分属三块才合法（角/棱）
      letterDesc: '24 字母色组体系',
      pieceDesc: '每角 3 个字母',
      srcDesc: 'blddb 噩梦风格',
      desc: '三阶盲拧角块 3-style：选缓冲后，其余两角的所有排列组合直接进矩阵，点格即练。'
    },
    edge: {
      id: 'edge', name: '三盲 · 棱块', short: '棱块',
      page: 'edge.html',
      defBuf: 'A',
      cellsPerBuffer: 440, groups: 12, lettersPerGroup: 2,
      kind: 'same-piece',
      letterDesc: '24 字母标准配对',
      pieceDesc: '每棱 2 个字母',
      srcDesc: 'blddb 噩梦风格',
      desc: '三阶盲拧棱块 3-style：与角块同构，24 个缓冲任选，440 种情况一屏铺开。'
    },
    center: {
      id: 'center', name: '四阶 · 中心块', short: '中心块',
      page: 'center.html',
      defBuf: 'D',                 // 你的 Excel 公式表缓冲 Ubl
      cellsPerBuffer: 506, groups: 6, lettersPerGroup: 3,
      kind: 'self-only',           // 每个字母自成一块，仅同格非法（中心/翼棱）
      letterDesc: '24 个中心块',
      pieceDesc: '每中心块 1 个字母',
      srcDesc: 'blddb 人造风格 + 你的 Excel 公式表',
      desc: '四阶盲拧中心块：缓冲 D 用你的公式表，其余 23 个缓冲由 blddb 抓取 + 旋转派生补全。'
    },
    wing: {
      id: 'wing', name: '高阶 · 翼棱', short: '翼棱',
      page: 'wing.html',
      defBuf: 'A',
      cellsPerBuffer: 506, groups: 12, lettersPerGroup: 2,
      kind: 'self-only',
      letterDesc: '24 个翼块',
      pieceDesc: '每翼块 1 个字母',
      srcDesc: 'blddb 人造风格（旋转派生补全非 A 缓冲）',
      desc: '高阶盲拧翼棱：含 G/H（UR 棱）情况，非 A 缓冲由整魔方旋转共轭派生，覆盖率 100%。'
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
  /* 有序参考公式列表 [[公式, 来源数]...]，index 0 = 默认主公式 */
  function refListOf(data, code) {
    var v = cellOf(data, code);
    if (!v) { return []; }
    var out = [[v[0], v[1] || 0]];
    (v[2] || []).forEach(function (x) {
      var pair = (x && typeof x.length === 'number' && typeof x !== 'string')
        ? [x[0], x[1] || 0] : [x, 0];
      if (!pair[0]) { return; }
      for (var i = 0; i < out.length; i++) { if (out[i][0] === pair[0]) { return; } }
      out.push(pair);
    });
    return out;
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

  /* ============ 组名 / 位置名 ============ */
  /* 角块有中文色组名（names）；棱/翼棱取位置名前两字符（UF 棱）；中心块取面字母（U 面）。 */
  function groupLabel(sys, data, gi) {
    var g = (data && data.groups && data.groups[gi]) || [];
    if (!g.length) { return '第 ' + (gi + 1) + ' 组'; }
    var tag = '';
    if (sys === 'corner' && data.names && data.names[gi]) {
      tag = data.names[gi];
    } else if (sys === 'wing' || sys === 'edge') {
      tag = (data.pos[g[0]] || '').slice(0, 2) + ' 棱';
    } else if (sys === 'center') {
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
    isBlank: isBlank
  };
})();
