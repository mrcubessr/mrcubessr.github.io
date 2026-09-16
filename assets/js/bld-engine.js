/* =========================================================
   assets/js/bld-engine.js — 三盲盲拧解法引擎（无 DOM 依赖）

   从 tools/bldtrainer 的读码工具抽取的核心算法：
   · 轻量魔方状态机（initialize / operate / operatealg / track1 / track2）
   · 读码四件套：edgeRead(棱块读码) / edgeOrientation(棱块翻色) /
     cornerRead(角块读码) / cornerOrientation(角块翻色)
   · 坐标朝向 24 种、随机打乱生成、奇偶性

   对外暴露 window.BLDEngine（浏览器）与 module.exports（Node 测试）：
     BLDEngine.readCodes(scramble, opts) -> {
        orientedScramble, edge, flip, corner, twist, parity, complexity
     }
     BLDEngine.getScramble(n)
     BLDEngine.CUBE_ORIENTATIONS   // [{label, prefix}]
     BLDEngine.DEFAULTS
     BLDEngine.validate(opts)
   所有读码结果均为纯文本（已去除原工具的 HTML 着色标签）。

   说明：min2phase 求解器（把读码转成具体步序）不在本引擎，
   仅“从打乱算出读码”不需要它。
   ========================================================= */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.BLDEngine = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /* ---------- 编码字母表 ---------- */
  const globalState = "ABCDEFGHIJKLWMNOPQRSTXYZabcdefghijklmnopqrstwxyz123456";
  const eglobalState = "abcdefghijklmnopqrstwxyz";
  const cglobalState = "ABCDEFGHIJKLWMNOPQRSTXYZ";

  /* ---------- 魔方状态（贴纸级模拟） ---------- */
  let cornerCh = " JKLGHIABCDEFXYZWMNRSTOPQ",
      edgeCh = " GHABCDEFOPKLQRSTYZIJWXMN";

  const arra = [[0], [0], [0], [0], [0], [0], [0]];
  const arrc = [[0], [0], [0], [0], [0], [0], [0]];

  function transformation1(transa, transb, transc, transd) {
    arrc[transa][transb] = arra[transa][transb];
    arra[transa][transb] = arrc[transc][transd];
  }
  function transformation2(transa, transb, transc, transd) {
    arrc[transa][transb] = arra[transa][transb];
    arra[transa][transb] = arra[transc][transd];
  }

  function movef() {
    for (let i = 1; i <= 9; i++) { arrc[5][i] = arra[5][i]; }
    arra[5][1] = arra[5][7]; arra[5][7] = arra[5][9]; arra[5][9] = arra[5][3]; arra[5][3] = arrc[5][1];
    arra[5][2] = arra[5][4]; arra[5][4] = arra[5][8]; arra[5][8] = arra[5][6]; arra[5][6] = arrc[5][2];
    for (let i = 1; i <= 3; i++) { transformation2(3, 3 * i, 2, i); }
    for (let i = 1; i <= 3; i++) { transformation2(2, i, 4, 10 - 3 * i); }
    for (let i = 1; i <= 3; i++) { transformation2(4, 3 * i - 2, 1, 6 + i); }
    for (let i = 1; i <= 3; i++) { transformation1(1, 6 + i, 3, 12 - 3 * i); }
  }
  function movex() {
    for (let i = 1; i <= 9; i++) { arrc[3][i] = arra[3][i]; arrc[4][i] = arra[4][i]; }
    arra[3][1] = arra[3][3]; arra[3][3] = arra[3][9]; arra[3][9] = arra[3][7]; arra[3][7] = arrc[3][1];
    arra[3][2] = arra[3][6]; arra[3][6] = arra[3][8]; arra[3][8] = arra[3][4]; arra[3][4] = arrc[3][2];
    arra[4][1] = arra[4][7]; arra[4][7] = arra[4][9]; arra[4][9] = arra[4][3]; arra[4][3] = arrc[4][1];
    arra[4][2] = arra[4][4]; arra[4][4] = arra[4][8]; arra[4][8] = arra[4][6]; arra[4][6] = arrc[4][2];
    for (let i = 1; i <= 9; i++) { transformation2(6, i, 1, 10 - i); }
    for (let i = 1; i <= 9; i++) { transformation1(2, i, 6, 10 - i); }
    for (let i = 1; i <= 9; i++) { transformation1(5, i, 2, i); }
    for (let i = 1; i <= 9; i++) { transformation1(1, i, 5, i); }
  }
  function movey() {
    for (let i = 1; i <= 9; i++) { arrc[1][i] = arra[1][i]; arrc[2][i] = arra[2][i]; }
    arra[2][1] = arra[2][3]; arra[2][3] = arra[2][9]; arra[2][9] = arra[2][7]; arra[2][7] = arrc[2][1];
    arra[2][2] = arra[2][6]; arra[2][6] = arra[2][8]; arra[2][8] = arra[2][4]; arra[2][4] = arrc[2][2];
    arra[1][1] = arra[1][7]; arra[1][7] = arra[1][9]; arra[1][9] = arra[1][3]; arra[1][3] = arrc[1][1];
    arra[1][2] = arra[1][4]; arra[1][4] = arra[1][8]; arra[1][8] = arra[1][6]; arra[1][6] = arrc[1][2];
    for (let i = 1; i <= 9; i++) { transformation2(6, i, 3, i); }
    for (let i = 1; i <= 9; i++) { transformation2(3, i, 5, i); }
    for (let i = 1; i <= 9; i++) { transformation2(5, i, 4, i); }
    for (let i = 1; i <= 9; i++) { arra[4][i] = arrc[6][i]; }
  }
  function movez() { movex(); movey(); movex(); movex(); movex(); }
  function movel() { movey(); movey(); movey(); movef(); movey(); }
  function moveu() { movex(); movex(); movex(); movef(); movex(); }
  function moveb() { movex(); movex(); movef(); movex(); movex(); }
  function mover() { movey(); movef(); movey(); movey(); movey(); }
  function moved() { movex(); movef(); movex(); movex(); movex(); }
  function movedi() { moved(); moved(); moved(); }
  function moveli() { movel(); movel(); movel(); }
  function moveri() { mover(); mover(); mover(); }
  function movefi() { movef(); movef(); movef(); }
  function moveui() { moveu(); moveu(); moveu(); }
  function movebi() { moveb(); moveb(); moveb(); }
  function moved2() { moved(); moved(); }
  function movel2() { movel(); movel(); }
  function mover2() { mover(); mover(); }
  function movef2() { movef(); movef(); }
  function moveu2() { moveu(); moveu(); }
  function moveb2() { moveb(); moveb(); }
  function movexr() { movel(); movex(); }
  function movexf() { moveb(); movez(); }
  function movexu() { moved(); movey(); }
  function movexd() { moveu(); movey(); movey(); movey(); }
  function movexl() { mover(); movex(); movex(); movex(); }
  function movexb() { movef(); movez(); movez(); movez(); }
  function movex2() { movex(); movex(); }
  function movey2() { movey(); movey(); }
  function movez2() { movez(); movez(); }
  function movexi() { movex(); movex(); movex(); }
  function moveyi() { movey(); movey(); movey(); }
  function movezi() { movez(); movez(); movez(); }
  function movem() { mover(); moveli(); movex(); movex(); movex(); }
  function movem2() { mover2(); movel2(); movex2(); }
  function movemi() { movex(); movel(); mover(); mover(); mover(); }
  function moves() { movef(); movef(); movef(); moveb(); movez(); }
  function moves2() { movef2(); moveb2(); movez2(); }
  function movesi() { movez(); movez(); movez(); moveb(); moveb(); moveb(); movef(); }
  function movee() { moveu(); moved(); moved(); moved(); movey(); movey(); movey(); }
  function movee2() { moveu2(); moved2(); movey2(); }
  function moveei() { movey(); moved(); moveu(); moveu(); moveu(); }
  function movexr2() { movexr(); movexr(); }
  function movexf2() { movexf(); movexf(); }
  function movexu2() { movexu(); movexu(); }
  function movexd2() { movexd(); movexd(); }
  function movexl2() { movexl(); movexl(); }
  function movexb2() { movexb(); movexb(); }
  function movexri() { movexr(); movexr(); movexr(); }
  function movexfi() { movexf(); movexf(); movexf(); }
  function movexui() { movexu(); movexu(); movexu(); }
  function movexdi() { movexd(); movexd(); movexd(); }
  function movexli() { movexl(); movexl(); movexl(); }
  function movexbi() { movexb(); movexb(); movexb(); }

  function initialize() {
    arra[1][1] = "D"; arra[1][2] = "E"; arra[1][3] = "G"; arra[1][4] = "C"; arra[1][5] = "U"; arra[1][6] = "G"; arra[1][7] = "A"; arra[1][8] = "A"; arra[1][9] = "J";
    arra[2][1] = "W"; arra[2][2] = "I"; arra[2][3] = "X"; arra[2][4] = "K"; arra[2][5] = "D"; arra[2][6] = "O"; arra[2][7] = "O"; arra[2][8] = "M"; arra[2][9] = "R";
    arra[3][1] = "E"; arra[3][2] = "D"; arra[3][3] = "C"; arra[3][4] = "X"; arra[3][5] = "L"; arra[3][6] = "T"; arra[3][7] = "Q"; arra[3][8] = "L"; arra[3][9] = "M";
    arra[4][1] = "K"; arra[4][2] = "H"; arra[4][3] = "I"; arra[4][4] = "R"; arra[4][5] = "R"; arra[4][6] = "Z"; arra[4][7] = "Z"; arra[4][8] = "P"; arra[4][9] = "S";
    arra[5][1] = "B"; arra[5][2] = "B"; arra[5][3] = "L"; arra[5][4] = "S"; arra[5][5] = "F"; arra[5][6] = "Q"; arra[5][7] = "N"; arra[5][8] = "J"; arra[5][9] = "Y";
    arra[6][1] = "H"; arra[6][2] = "F"; arra[6][3] = "F"; arra[6][4] = "Y"; arra[6][5] = "B"; arra[6][6] = "W"; arra[6][7] = "T"; arra[6][8] = "N"; arra[6][9] = "P";
  }

  function operate(operateChar) {
    switch (operateChar) {
      case "R": mover(); break; case "L": movel(); break; case "F": movef(); break; case "B": moveb(); break;
      case "U": moveu(); break; case "D": moved(); break;
      case "R2": mover2(); break; case "L2": movel2(); break; case "F2": movef2(); break; case "B2": moveb2(); break;
      case "U2": moveu2(); break; case "D2": moved2(); break;
      case "R'": moveri(); break; case "L'": moveli(); break; case "F'": movefi(); break; case "B'": movebi(); break;
      case "U'": moveui(); break; case "D'": movedi(); break;
      case "x": movex(); break; case "x2": movex2(); break; case "x'": movexi(); break;
      case "y": movey(); break; case "y2": movey2(); break; case "y'": moveyi(); break;
      case "z": movez(); break; case "z2": movez2(); break; case "z'": movezi(); break;
      case "r": movexr(); break; case "r2": movexr2(); break; case "r'": movexri(); break;
      case "f": movexf(); break; case "f2": movexf2(); break; case "f'": movexfi(); break;
      case "u": movexu(); break; case "u2": movexu2(); break; case "u'": movexui(); break;
      case "d": movexd(); break; case "d2": movexd2(); break; case "d'": movexdi(); break;
      case "l": movexl(); break; case "l2": movexl2(); break; case "l'": movexli(); break;
      case "b": movexb(); break; case "b2": movexb2(); break; case "b'": movexbi(); break;
      case "S": moves(); break; case "S2": moves2(); break; case "S'": movesi(); break;
      case "M": movem(); break; case "M2": movem2(); break; case "M'": movemi(); break;
      case "E": movee(); break; case "E2": movee2(); break; case "E'": moveei(); break;
      case "Rw": movexr(); break; case "Rw2": movexr2(); break; case "Rw'": movexri(); break;
      case "Fw": movexf(); break; case "Fw2": movexf2(); break; case "Fw'": movexfi(); break;
      case "Uw": movexu(); break; case "Uw2": movexu2(); break; case "Uw'": movexui(); break;
      case "Dw": movexd(); break; case "Dw2": movexd2(); break; case "Dw'": movexdi(); break;
      case "Lw": movexl(); break; case "Lw2": movexl2(); break; case "Lw'": movexli(); break;
      case "Bw": movexb(); break; case "Bw2": movexb2(); break; case "Bw'": movexbi(); break;
      default: break;
    }
  }

  function operatealg(s1) {
    initialize();
    const arr = s1.split(" ");
    const validMoves = [
      "R", "L", "F", "B", "U", "D", "R2", "L2", "F2", "B2", "U2", "D2", "R'", "L'", "F'", "B'", "U'", "D'",
      "x", "x2", "x'", "y", "y2", "y'", "z", "z2", "z'",
      "r", "r2", "r'", "f", "f2", "f'", "u", "u2", "u'", "d", "d2", "d'", "l", "l2", "l'", "b", "b2", "b'",
      "S", "S2", "S'", "M", "M2", "M'", "E", "E2", "E'",
      "Rw", "Rw2", "Rw'", "Fw", "Fw2", "Fw'", "Uw", "Uw2", "Uw'", "Dw", "Dw2", "Dw'", "Lw", "Lw2", "Lw'", "Bw", "Bw2", "Bw'"
    ];
    for (let i = 0; i < arr.length; i++) {
      if (validMoves.indexOf(arr[i]) > -1) operate(arr[i]);
    }
    return arra;
  }

  function track1(track1Str) {
    switch (track1Str) {
      case "A": return arra[1][8]; case "B": return arra[5][2]; case "C": return arra[1][4]; case "D": return arra[3][2];
      case "E": return arra[1][2]; case "F": return arra[6][2]; case "G": return arra[1][6]; case "H": return arra[4][2];
      case "I": return arra[2][2]; case "J": return arra[5][8]; case "K": return arra[2][4]; case "L": return arra[3][8];
      case "M": return arra[2][8]; case "N": return arra[6][8]; case "O": return arra[2][6]; case "P": return arra[4][8];
      case "Q": return arra[5][6]; case "R": return arra[4][4]; case "S": return arra[5][4]; case "T": return arra[3][6];
      case "W": return arra[6][6]; case "X": return arra[3][4]; case "Y": return arra[6][4]; case "Z": return arra[4][6];
      default: return 0;
    }
  }
  function track2(track2Str) {
    switch (track2Str) {
      case "A": return arra[1][7]; case "B": return arra[5][1]; case "C": return arra[3][3]; case "D": return arra[1][1];
      case "E": return arra[3][1]; case "F": return arra[6][3]; case "G": return arra[1][3]; case "H": return arra[6][1];
      case "I": return arra[4][3]; case "J": return arra[1][9]; case "K": return arra[4][1]; case "L": return arra[5][3];
      case "W": return arra[2][1]; case "M": return arra[3][9]; case "N": return arra[5][7]; case "O": return arra[2][7];
      case "P": return arra[6][9]; case "Q": return arra[3][7]; case "R": return arra[2][9]; case "S": return arra[4][9];
      case "T": return arra[6][7]; case "X": return arra[2][3]; case "Y": return arra[5][9]; case "Z": return arra[4][7];
      default: return 0;
    }
  }

  function nearedge(s1) {
    const edgeChtemp = " GHABCDEFOPKLQRSTYZIJWXMN";
    if (edgeChtemp.indexOf(s1) % 2 === 1) return edgeChtemp[edgeChtemp.indexOf(s1) + 1];
    return edgeChtemp[edgeChtemp.indexOf(s1) - 1];
  }
  function nearcorner(s1) {
    const cornerChtemp = " JKLGHIABCDEFXYZWMNRSTOPQ";
    if (cornerChtemp.indexOf(s1) % 3 === 0) return cornerChtemp[cornerChtemp.indexOf(s1) - 2];
    return cornerChtemp[cornerChtemp.indexOf(s1) + 1];
  }
  function groupRecog(input_code) {
    let div, indexNum;
    if (input_code.charCodeAt(0) >= 65 && input_code.charCodeAt(0) <= 90) { div = 3; indexNum = 0; }
    else if (input_code.charCodeAt(0) >= 97 && input_code.charCodeAt(0) <= 122) { div = 2; indexNum = 24; }
    else { div = 1; indexNum = 48; }
    return { div, indexNum };
  }
  function posChichu(input_code) {
    if (globalState.indexOf(input_code) === -1) return -1;
    if (input_code.charCodeAt(0) >= 65 && input_code.charCodeAt(0) <= 90) return ~~(globalState.indexOf(input_code) / 3);
    else if (input_code.charCodeAt(0) >= 97 && input_code.charCodeAt(0) <= 122) return ~~((globalState.indexOf(input_code) - 24) / 2);
    return -1;
  }
  function isAlphabet(char) {
    const code = char.charCodeAt(0);
    if (code === 85 || code === 86 || code === 117 || code === 118) return false;
    else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return true;
    return false;
  }
  function count(str, substr) { return str.split(substr).length - 1; }
  function stm(s1) { return count(s1, " ") + 1; }
  function qtm(s1) { return count(s1, " ") + count(s1, "2") + 1; }
  function getParity(alg) { return ((stm(alg) * 2 - qtm(alg)) % 2 === 0) ? 0 : 1; }

  /* ---------- 校验（无弹窗，返回 true/false） ---------- */
  function edgeOrderCheck(opts) {
    const edgebuffer = String(opts.edgeBuffer || "").toLowerCase();
    const edgeorder = String(opts.edgeOrder || "").toLowerCase();
    if (edgeorder.length + edgebuffer.length === 12) {
      const allcodes = edgebuffer + edgeorder;
      const allpos = [];
      for (let i = 0; i < allcodes.length; i++) allpos.push(posChichu(allcodes[i]));
      if (new Set(allpos).size !== 12) return false;
    }
    return true;
  }
  function cornerOrderCheck(opts) {
    const cornerbuffer = String(opts.cornerBuffer || "").toUpperCase();
    const cornerorder = String(opts.cornerOrder || "").toUpperCase();
    if (cornerorder.length + cornerbuffer.length === 8) {
      const allcodes = cornerbuffer + cornerorder;
      const allpos = [];
      for (let i = 0; i < allcodes.length; i++) allpos.push(posChichu(allcodes[i]));
      if (new Set(allpos).size !== 8) return false;
    }
    return true;
  }

  /* ---------- 读码四件套（纯文本输出） ---------- */
  function stripHtml(s) { return s.replace(/<[^>]+>/g, ""); }

  function edgeRead(s1, opts, meta) {
    operatealg(s1);
    const orientFlag = opts.edgeOrientFlag ? 1 : 0;
    const skipCycleNum = opts.edgeSkip ? 1 : 0;
    const edgebuffer = String(opts.edgeBuffer || "").toUpperCase();
    const edgeorder = String(opts.edgeOrder || "").toUpperCase();
    edgeCh = ` ${edgebuffer}${nearedge(edgebuffer)}`;
    for (let i = 0; i <= edgeorder.length - 1; i++) edgeCh = edgeCh + edgeorder[i] + nearedge(edgeorder[i]);

    let cycleList = [], cycleOrders = [], edgereadChar = "", edgereadpartChar = "", sumorient = 0;
    for (let i = 1; i <= 24; i = i + 2) {
      if (edgereadChar.indexOf(edgeCh[i]) === -1 && edgereadChar.indexOf(edgeCh[i + 1]) === -1) {
        edgereadpartChar = edgeCh[i];
        while (track1(edgereadpartChar[edgereadpartChar.length - 1]) !== edgereadpartChar[0]
            && nearedge(track1(edgereadpartChar[edgereadpartChar.length - 1])) !== edgereadpartChar[0]) {
          edgereadpartChar = edgereadpartChar + track1(edgereadpartChar[edgereadpartChar.length - 1]);
        }
        if (edgereadpartChar !== edgeCh[i] || i === 1) {
          edgereadpartChar = edgereadpartChar + track1(edgereadpartChar[edgereadpartChar.length - 1]);
          edgereadChar = edgereadChar + edgereadpartChar;
          cycleList.push(edgereadpartChar);
          cycleOrders.push(~~((i - 1) / 2));
        }
        sumorient += edgeCh.indexOf(edgereadpartChar[edgereadpartChar.length - 1]) - edgeCh.indexOf(edgereadpartChar[0]);
      }
    }
    if (meta) meta.cycles = cycleList.length;
    let orientLast = 0, edgereadOut = "", endList = "", codenum = 0;
    for (let i = 0; i < cycleList.length; i++) {
      if (i > 0) orientLast += edgeCh.indexOf(cycleList[i - 1][cycleList[i - 1].length - 1]) - edgeCh.indexOf(cycleList[i - 1][0]);
      for (let j = 0; j < cycleList[i].length; j++) {
        let code = cycleList[i][j];
        if (i > 0 && (orientFlag === 1 || (orientFlag === 0 && cycleOrders[i] <= skipCycleNum))) {
          for (let k = 0; k < orientLast; k++) code = nearedge(code);
        }
        if (j === cycleList[i].length - 1 && cycleOrders[i] === 0) continue;
        if (j === cycleList[i].length - 1 && cycleOrders[i] <= skipCycleNum) {
          let lastcode = eglobalState[~~posChichu(code.toLowerCase()) * 2].toUpperCase();
          for (let k = 0; k < sumorient % 2; k++) lastcode = nearedge(lastcode);
          endList += lastcode;
        } else {
          if (i > 0 && j === 0) edgereadOut += `<span style='color:blue'>${code}</span>`;
          else if (i > 0 && j === cycleList[i].length - 1) edgereadOut += `<span style='color:green'>${code}</span>`;
          else edgereadOut += code;
          codenum += 1;
          if (codenum > 1 && codenum % 2 === 1) edgereadOut += " ";
        }
      }
    }
    if (skipCycleNum > 0) edgereadOut += `<span style='color:green'>${endList.split("").reverse().join("")}</span>`;
    edgereadOut = edgereadOut.slice(1, edgereadOut.length);
    return stripHtml(edgereadOut);
  }

  function edgeOrientation(s1, opts) {
    operatealg(s1);
    const edgebuffer = String(opts.edgeBuffer || "").toUpperCase();
    const edgeorder = String(opts.edgeOrder || "").toUpperCase();
    edgeCh = ` ${edgebuffer}${nearedge(edgebuffer)}`;
    for (let i = 0; i <= edgeorder.length - 1; i++) edgeCh = edgeCh + edgeorder[i] + nearedge(edgeorder[i]);
    let out = "";
    for (let i = 3; i <= 24; i = i + 2) {
      if (track1(edgeCh[i]) === edgeCh[i + 1]) out = `${out + edgeCh[i + 1] + edgeCh[i]} `;
    }
    out = out.slice(0, out.length - 1);
    return out;
  }

  function cornerRead(s1, opts, meta) {
    operatealg(s1);
    const orientFlag = opts.cornerOrientFlag ? 1 : 0;
    const skipCycleNum = opts.cornerSkip ? 1 : 0;
    const cornerbuffer = String(opts.cornerBuffer || "").toUpperCase();
    const cornerorder = String(opts.cornerOrder || "").toUpperCase();
    cornerCh = ` ${cornerbuffer}${nearcorner(cornerbuffer)}${nearcorner(nearcorner(cornerbuffer))}`;
    for (let i = 0; i <= cornerorder.length - 1; i++) {
      cornerCh = cornerCh + cornerorder[i] + nearcorner(cornerorder[i]) + nearcorner(nearcorner(cornerorder[i]));
    }
    let cycleList = [], cycleOrders = [], cornerreadChar = "", cornerreadpartChar = "", sumorient = 0;
    for (let i = 1; i <= 24; i = i + 3) {
      if (cornerreadChar.indexOf(cornerCh[i]) === -1 && cornerreadChar.indexOf(cornerCh[i + 1]) === -1 && cornerreadChar.indexOf(cornerCh[i + 2]) === -1) {
        cornerreadpartChar = cornerCh[i];
        while (track2(cornerreadpartChar[cornerreadpartChar.length - 1]) !== cornerreadpartChar[0]
            && nearcorner(track2(cornerreadpartChar[cornerreadpartChar.length - 1])) !== cornerreadpartChar[0]
            && track2(cornerreadpartChar[cornerreadpartChar.length - 1]) !== nearcorner(cornerreadpartChar[0])) {
          cornerreadpartChar = cornerreadpartChar + track2(cornerreadpartChar[cornerreadpartChar.length - 1]);
        }
        if (cornerreadpartChar !== cornerCh[i] || i === 1) {
          cornerreadpartChar = cornerreadpartChar + track2(cornerreadpartChar[cornerreadpartChar.length - 1]);
          cornerreadChar = cornerreadChar + cornerreadpartChar;
          cycleList.push(cornerreadpartChar);
          cycleOrders.push(~~((i - 1) / 3));
        }
        sumorient += cornerCh.indexOf(cornerreadpartChar[cornerreadpartChar.length - 1]) - cornerCh.indexOf(cornerreadpartChar[0]);
      }
    }
    if (meta) meta.cycles = cycleList.length;
    let orientLast = 0, cornerreadOut = "", endList = "", codenum = 0;
    for (let i = 0; i < cycleList.length; i++) {
      if (i > 0) orientLast += cornerCh.indexOf(cycleList[i - 1][cycleList[i - 1].length - 1]) - cornerCh.indexOf(cycleList[i - 1][0]);
      for (let j = 0; j < cycleList[i].length; j++) {
        let code = cycleList[i][j];
        if (i > 0 && (orientFlag === 1 || (orientFlag === 0 && cycleOrders[i] <= skipCycleNum))) {
          for (let k = 0; k < orientLast; k++) code = nearcorner(code);
        }
        if (j === cycleList[i].length - 1 && cycleOrders[i] === 0) continue;
        if (j === cycleList[i].length - 1 && cycleOrders[i] <= skipCycleNum) {
          let lastcode = cglobalState[~~posChichu(code) * 3];
          for (let k = 0; k < sumorient % 3; k++) lastcode = nearcorner(lastcode);
          endList += lastcode;
        } else {
          if (i > 0 && j === 0) cornerreadOut += `<span style='color:blue'>${code}</span>`;
          else if (i > 0 && j === cycleList[i].length - 1) cornerreadOut += `<span style='color:green'>${code}</span>`;
          else cornerreadOut += code;
          codenum += 1;
          if (codenum > 1 && codenum % 2 === 1) cornerreadOut += " ";
        }
      }
    }
    if (skipCycleNum > 0) cornerreadOut += `<span style='color:green'>${endList.split("").reverse().join("")}</span>`;
    cornerreadOut = cornerreadOut.slice(1, cornerreadOut.length);
    return stripHtml(cornerreadOut);
  }

  function cornerOrientation(s1, opts) {
    operatealg(s1);
    const cornerbuffer = String(opts.cornerBuffer || "").toUpperCase();
    const cornerorder = String(opts.cornerOrder || "").toUpperCase();
    cornerCh = ` ${cornerbuffer}${nearcorner(cornerbuffer)}${nearcorner(nearcorner(cornerbuffer))}`;
    for (let i = 0; i <= cornerorder.length - 1; i++) {
      cornerCh = cornerCh + cornerorder[i] + nearcorner(cornerorder[i]) + nearcorner(nearcorner(cornerorder[i]));
    }
    let out = "";
    for (let i = 4; i <= 24; i = i + 3) {
      if (track2(cornerCh[i]) === cornerCh[i + 1]) out = `${out + cornerCh[i + 2] + cornerCh[i]} `;
      if (track2(cornerCh[i]) === cornerCh[i + 2]) out = `${out + cornerCh[i + 1] + cornerCh[i]} `;
    }
    out = out.slice(0, out.length - 1);
    return out;
  }

  function fixorientation(scr) {
    operatealg(scr);
    const cubeorientation = arra[1][5] + arra[5][5];
    switch (cubeorientation) {
      case "UF": return ""; case "UR": return "y'"; case "UB": return "y2"; case "UL": return "y";
      case "DB": return "x2"; case "DR": return "y' x2"; case "DF": return "y2 x2"; case "DL": return "y x2";
      case "FD": return "x'"; case "FR": return "y' x'"; case "FU": return "y2 x'"; case "FL": return "y x'";
      case "BU": return "x"; case "BR": return "y' x"; case "BD": return "y2 x"; case "BL": return "y x";
      case "RF": return "z"; case "RD": return "y' z"; case "RB": return "y2 z"; case "RU": return "y z";
      case "LF": return "z'"; case "LU": return "y' z'"; case "LB": return "y2 z'"; case "LD": return "y z'";
      default: return "";
    }
  }

  /* ---------- 坐标朝向（24 种） ---------- */
  const CUBE_ORIENTATIONS = [
    { label: "白顶绿前", prefix: "" }, { label: "白顶红前", prefix: "y " }, { label: "白顶蓝前", prefix: "y2 " }, { label: "白顶橙前", prefix: "y' " },
    { label: "黄顶蓝前", prefix: "x2 " }, { label: "黄顶红前", prefix: "x2 y " }, { label: "黄顶绿前", prefix: "x2 y2 " }, { label: "黄顶橙前", prefix: "x2 y' " },
    { label: "绿顶黄前", prefix: "x " }, { label: "绿顶红前", prefix: "x y " }, { label: "绿顶白前", prefix: "x y2 " }, { label: "绿顶橙前", prefix: "x y' " },
    { label: "蓝顶白前", prefix: "x' " }, { label: "蓝顶红前", prefix: "x' y " }, { label: "蓝顶黄前", prefix: "x' y2 " }, { label: "蓝顶橙前", prefix: "x' y' " },
    { label: "红顶绿前", prefix: "z' " }, { label: "红顶黄前", prefix: "z' y " }, { label: "红顶蓝前", prefix: "z' y2 " }, { label: "红顶白前", prefix: "z' y' " },
    { label: "橙顶绿前", prefix: "z " }, { label: "橙顶白前", prefix: "z y " }, { label: "橙顶蓝前", prefix: "z y2 " }, { label: "橙顶黄前", prefix: "z y' " }
  ];

  /* ---------- 随机打乱（WCA 风格 20 步） ---------- */
  const TEMPLATE = ["R", "L", "F", "B", "U", "D", "R2", "L2", "F2", "B2", "U2", "D2", "R'", "L'", "F'", "B'", "U'", "D'"];
  function getScramble(n) {
    n = n > 0 ? n : 20;
    const moveList = [];
    let guard = 0;
    while (moveList.length < n && guard < 1000) {
      guard++;
      const c = TEMPLATE[(Math.random() * TEMPLATE.length) | 0];
      if (moveList.length === 0) { moveList.push(c); continue; }
      const prev = moveList[moveList.length - 1][0];
      const prev2 = moveList.length > 1 ? moveList[moveList.length - 2][0] : "";
      if (c[0] !== prev && c[0] !== prev2) moveList.push(c);
    }
    return moveList.join(" ");
  }

  /* ---------- 默认参数（与 bldtrainer 原默认值一致） ---------- */
  const DEFAULTS = {
    orientation: 0,
    edgeBuffer: "A", edgeOrder: "GECIKMOQSWY",
    edgeOrientFlag: false, edgeSkip: false,
    cornerBuffer: "J", cornerOrder: "GADXWRO",
    cornerOrientFlag: false, cornerSkip: false
  };

  function normalize(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    o.edgeBuffer = String(o.edgeBuffer || "").toUpperCase();
    o.edgeOrder = String(o.edgeOrder || "").toUpperCase();
    o.cornerBuffer = String(o.cornerBuffer || "").toUpperCase();
    o.cornerOrder = String(o.cornerOrder || "").toUpperCase();
    o.orientation = (typeof o.orientation === "number") ? o.orientation : 0;
    return o;
  }

  function letterCount(s) { return (s || "").replace(/[^A-Za-z]/g, "").length; }

  /* ---------- 主入口 ---------- */
  /* ---------- 难度量化 ----------
     规则（与圈内习惯一致）：2 个编码 = 1 条公式
       - 棱/角读码：ceil(字母数/2)
       - 翻色 2 码 = 1 条；三角翻 3 码 = ceil(3/2) = 2 条（同一规则自动成立）
       - 奇偶：+1 条
     借位次数 = 循环数 - 1（第一个循环无需借位），作为记忆难度参考指标 */
  function formulasOfLetters(n) { return Math.ceil((n || 0) / 2); }

  function buildDifficulty(edge, flip, corner, twist, parity, eCycles, cCycles) {
    const eL = letterCount(edge), fL = letterCount(flip);
    const cL = letterCount(corner), tL = letterCount(twist);
    const edgeF = formulasOfLetters(eL), flipF = formulasOfLetters(fL);
    const cornerF = formulasOfLetters(cL), twistF = formulasOfLetters(tL);
    const parityF = parity === 1 ? 1 : 0;
    const borrowEdge = Math.max(0, (eCycles || 1) - 1);
    const borrowCorner = Math.max(0, (cCycles || 1) - 1);
    const borrow = borrowEdge + borrowCorner;
    const total = edgeF + flipF + cornerF + twistF + parityF;
    const score = Math.round((total + borrow * 0.5) * 10) / 10;
    let level = "简单";
    if (total >= 13) level = "很难";
    else if (total >= 11) level = "偏难";
    else if (total >= 9) level = "中等";
    return {
      edgeLetters: eL, flipLetters: fL, cornerLetters: cL, twistLetters: tL,
      edgeF: edgeF, flipF: flipF, cornerF: cornerF, twistF: twistF, parityF: parityF,
      borrowEdge: borrowEdge, borrowCorner: borrowCorner, borrow: borrow,
      edgeCycles: eCycles || 0, cornerCycles: cCycles || 0,
      total: total, score: score, level: level,
      notation: "棱" + edgeF + "+角" + cornerF + (parityF ? "+1" : "")
    };
  }

  function readCodes(scramble, opts) {
    const o = normalize(opts);
    const orient = CUBE_ORIENTATIONS[o.orientation] || CUBE_ORIENTATIONS[0];
    /* 编码与朝向解耦：一律按「原始打乱」在标准朝向下读码，
       因此同一个打乱公式，所有人（无论选什么拿法）得到的编码完全一致，便于交流。
       坐标朝向只喂给展开图 orientedScramble，不影响编码。 */
    const canonical = String(scramble || "").trim().replace(/\s+/g, " ");
    const oriented = (orient.prefix + canonical).trim().replace(/\s+/g, " ");
    const eMeta = {}, cMeta = {};
    const edge = edgeRead(canonical, o, eMeta);
    const flip = edgeOrientation(canonical, o);
    const corner = cornerRead(canonical, o, cMeta);
    const twist = cornerOrientation(canonical, o);
    const parity = getParity(canonical);
    const complexity = letterCount(edge) + letterCount(flip) + letterCount(corner) + letterCount(twist);
    const difficulty = buildDifficulty(edge, flip, corner, twist, parity, eMeta.cycles, cMeta.cycles);
    return {
      scramble: canonical,
      orientedScramble: oriented,
      orientationLabel: orient.label,
      orientationIndex: o.orientation,
      edge: edge, flip: flip, corner: corner, twist: twist,
      parity: parity,
      complexity: complexity,
      difficulty: difficulty
    };
  }

  function validate(opts) {
    const o = normalize(opts);
    return { edge: edgeOrderCheck(o), corner: cornerOrderCheck(o) };
  }

  return {
    readCodes: readCodes,
    edgeRead: edgeRead,
    edgeOrientation: edgeOrientation,
    cornerRead: cornerRead,
    cornerOrientation: cornerOrientation,
    getScramble: getScramble,
    fixorientation: fixorientation,
    validate: validate,
    buildDifficulty: buildDifficulty,
    CUBE_ORIENTATIONS: CUBE_ORIENTATIONS,
    DEFAULTS: DEFAULTS,
    getParity: getParity
  };
});
