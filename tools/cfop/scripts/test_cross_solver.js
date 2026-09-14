/* =========================================================
   test_cross_solver.js — 十字求解器 / 打乱生成器的回归测试（Node 直跑）
   用法：node tools/cfop/scripts/test_cross_solver.js
   ========================================================= */
"use strict";
const fs = require("fs");
const path = require("path");

globalThis.window = globalThis;
const JSDIR = path.join(__dirname, "..", "js");
["rubik-core.js", "cross-solver.js"].forEach(f =>
  eval(fs.readFileSync(path.join(JSDIR, f), "utf8"))
);
const R = globalThis.RubikCore, CS = globalThis.CrossSolver;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  OK   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  → " + extra : "")); }
}

/* ---------- 1. 贴纸模型基础不变量 ---------- */
console.log("[1] 贴纸模型");
["U", "D", "L", "R", "F", "B"].forEach(m => {
  const c = R.newCube();
  for (let i = 0; i < 4; i++) R.apply(c, m);
  check(m + " ×4 复原", R.isSolved(c));
});
{
  const c = R.newCube();
  const s = R.scramble(30);
  R.applyAlg(c, s.join(" "));
  R.applyAlg(c, R.invertMoves(s).join(" "));
  check("30 步打乱 + 逆序列复原", R.isSolved(c));
}
check("打乱无同面 / 对面相邻", (() => {
  for (let t = 0; t < 200; t++) {
    const s = R.scramble(10);
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1][0], b = s[i][0];
      if (a === b || a === R.OPP[b]) return false;
    }
  }
  return true;
})());

/* ---------- 2. 十字距离表 ---------- */
console.log("[2] 十字距离表（半步制）");
const EXPECT = { 0: 1, 1: 15, 2: 158, 3: 1394, 4: 9809, 5: 46381, 6: 97254, 7: 34966, 8: 102 };
const t0 = Date.now();
const tblW = CS.table("w");
const buildMs = Date.now() - t0;
{
  const hist = {};
  let reach = 0;
  for (let e = 0; e < tblW.length; e++) {
    const d = tblW[e];
    if (d === CS.UNREACHABLE) continue;
    hist[d] = (hist[d] || 0) + 1;
    reach++;
  }
  check("可达状态数 = 190080", reach === 190080, reach);
  check("距离分布与理论值一致", JSON.stringify(hist) === JSON.stringify(EXPECT), JSON.stringify(hist));
  check("首次建表耗时 < 1500ms", buildMs < 1500, buildMs + "ms");
  console.log("       建表耗时 " + buildMs + "ms，分布 " + JSON.stringify(hist));
}
check("6 种颜色的距离分布完全相同", CS.COLORS.every(c => {
  const t = CS.table(c.key), h = {};
  for (let e = 0; e < t.length; e++) if (t[e] !== CS.UNREACHABLE) h[t[e]] = (h[t[e]] || 0) + 1;
  return JSON.stringify(h) === JSON.stringify(EXPECT);
}));

/* ---------- 3. 最优解：在贴纸模型上直接验证（不依赖距离表） ---------- */
console.log("[3] 解法有效性（贴纸模型直接判定）");
function crossSolved(cube, color) {
  const pairs = CS.EDGE_PAIRS;
  const SOLVED = { U: "w", R: "r", F: "g", D: "y", L: "o", B: "b" };
  for (let k = 0; k < 12; k++) {
    if (SOLVED[pairs[k][0][0]] !== color && SOLVED[pairs[k][1][0]] !== color) continue;
    const a = cube[pairs[k][0][0]][pairs[k][0][1]];
    const b = cube[pairs[k][1][0]][pairs[k][1][1]];
    if (a !== SOLVED[pairs[k][0][0]] || b !== SOLVED[pairs[k][1][0]]) return false;
  }
  return true;
}
{
  let ok = true, checked = 0, worst = "";
  for (const c of CS.COLORS) {
    for (let t = 0; t < 40; t++) {
      const s = R.scramble(2 + Math.floor(Math.random() * 9));
      const sol = CS.solve(c.key, s);
      const cube = R.newCube();
      R.applyAlg(cube, s.join(" "));
      R.applyAlg(cube, sol.join(" "));
      checked++;
      if (!crossSolved(cube, c.key) || sol.length !== CS.distance(c.key, s)) {
        ok = false; worst = c.key + " " + s.join(" ") + " → " + sol.join(" ");
      }
    }
  }
  check(checked + " 组：解法长度 == 最优步数，且套用后十字复原", ok, worst);
}

/* ---------- 4. 交叉验证：贴纸模型直接 BFS vs 置换表 ----------
   两条推导路径完全独立：
     A. rubik-core 贴纸模型（已由 verify_cube_model.py 对 pycuber 校验）→ 直接 BFS
     B. cross-solver 的 PERM/FLIP 置换表 → LO/HI 转移 → BFS
   A 逐状态比对 B。默认只跑到深度 5（约 5.8 万状态，1~2 秒）；
   全量（190080 状态，约 25 秒）用 CROSS_DEEP=1 运行。 */
console.log("[4] 距离表交叉验证（贴纸模型直接 BFS，不经置换表）");
{
  const FACES = R.COLOR_ORDER;
  const EDGES = CS.EDGE_PAIRS;
  const CANON = EDGES.map(p => [R.SOLVED[p[0][0]], R.SOLVED[p[1][0]]]);
  const COLOR = "w";
  const TRACK = CS.COLOR_EDGES[COLOR];
  const POW4 = [1, 24, 576, 13824];
  const ser = c => FACES.map(f => c[f].join("")).join("");
  const de = s => {
    const c = {};
    FACES.forEach((f, i) => { c[f] = s.slice(i * 9, i * 9 + 9).split(""); });
    return c;
  };
  /* 在贴纸模型上定位某棱块 → slot*2+orient（朝向规则与 cross-solver 一致） */
  function locate(cube, k) {
    const t = CANON[k].slice().sort().join("");
    for (let j = 0; j < 12; j++) {
      const a = cube[EDGES[j][0][0]][EDGES[j][0][1]];
      const b = cube[EDGES[j][1][0]][EDGES[j][1][1]];
      if ([a, b].sort().join("") === t) return j * 2 + (a === CANON[k][0] ? 0 : 1);
    }
    return -1;
  }
  const keyOf = cube => TRACK.map(k => locate(cube, k)).join(",");
  const encOf = k => {
    const v = k.split(",").map(Number);
    let e = 0;
    for (let i = 0; i < 4; i++) e += v[i] * POW4[i];
    return e;
  };

  const FULL = process.env.CROSS_DEEP === "1";
  const DEPTH = FULL ? 99 : 5;
  const t = CS.table(COLOR);
  const start = R.newCube();
  const seen = new Map([[keyOf(start), 0]]);
  let front = [ser(start)], d = 0;
  while (front.length && d < DEPTH) {
    const nxt = [];
    for (const s of front) {
      const cube = de(s);
      for (const mv of R.MOVES18) {
        const nb = R.applyAlg(R.clone(cube), mv);
        const k = keyOf(nb);
        if (seen.has(k)) continue;
        seen.set(k, d + 1);
        nxt.push(ser(nb));
      }
    }
    front = nxt; d++;
  }
  let mism = 0, first = "";
  seen.forEach((v, k) => {
    const got = t[encOf(k)];
    if (got !== v) { mism++; if (!first) first = k + " 期望 " + v + " 得到 " + got; }
  });
  check("贴纸模型 BFS " + seen.size + " 个状态的十字距离与置换表完全一致"
    + (FULL ? "" : "（深度 ≤ " + DEPTH + "）"), mism === 0, mism + " 处不一致，首个：" + first);
  check("距离 0 的状态唯一（十字复原态唯一）",
    [...seen.values()].filter(v => v === 0).length === 1);
  if (FULL) {
    let reach = 0;
    for (let e = 0; e < t.length; e++) if (t[e] !== CS.UNREACHABLE) reach++;
    check("全量：独立 BFS 覆盖全部可达状态", seen.size === reach, seen.size + " vs " + reach);
  } else {
    console.log("       全量校验（190080 状态，约 25 秒）：CROSS_DEEP=1 node tools/cfop/scripts/test_cross_solver.js");
  }
}

/* ---------- 5. 打乱生成：6 色 × 1~8 步 ---------- */
console.log("[5] 打乱生成");
let genOk = true, genInfo = [], genFail = "";
const g0 = Date.now();
for (const c of CS.COLORS) {
  const row = [];
  for (let n = 1; n <= CS.MAX_STEPS; n++) {
    for (let rep = 0; rep < 3; rep++) {
      const r = CS.generate(c.key, n, 10);
      if (!r) { genOk = false; genFail = c.key + " N=" + n + " 未生成"; continue; }
      const cube = R.newCube();
      R.applyAlg(cube, r.moves.join(" "));
      R.applyAlg(cube, r.solution.join(" "));
      const bad =
        r.moves.length > 10 ||
        r.moves.length === 0 ||
        r.steps !== n ||
        r.solution.length !== n ||
        CS.distance(c.key, r.moves) !== n ||
        !crossSolved(cube, c.key) ||
        (() => {
          for (let i = 1; i < r.moves.length; i++) {
            const a = r.moves[i - 1][0], b = r.moves[i][0];
            if (a === b || a === R.OPP[b]) return true;
          }
          return false;
        })();
      if (bad) { genOk = false; genFail = c.key + " N=" + n + " → " + r.moves.join(" "); }
    }
    row.push(n + ":" + CS.generate(c.key, n, 10).moves.length);
  }
  genInfo.push(c.key + "(" + row.join(" ") + ")");
}
check("6 色 × 1~8 步 × 各 3 次：长度 ≤10、最优步数 == 目标、解法有效", genOk, genFail);
console.log("       打乱长度（色(目标步数:实际长度)）：" + genInfo.join("  "));
console.log("       总耗时 " + (Date.now() - g0) + "ms");

/* ---------- 6. 单次生成耗时 ---------- */
console.log("[6] 单次生成耗时");
{
  let worst = 0, worstN = 0;
  for (let n = 1; n <= 8; n++) {
    const s = Date.now();
    CS.generate("y", n, 10);
    const ms = Date.now() - s;
    if (ms > worst) { worst = ms; worstN = n; }
  }
  check("单次生成耗时 < 600ms", worst < 600, "N=" + worstN + " " + worst + "ms");
  console.log("       最慢一次 N=" + worstN + " " + worst + "ms");
}

/* ---------- 7. 样例输出 ---------- */
console.log("[7] 样例（黄十字 · 4 步）");
for (let i = 0; i < 3; i++) {
  const r = CS.generate("y", 4, 10);
  console.log("       打乱 " + r.moves.join(" ") + "   （" + r.length + " 步）  →  解法 "
    + r.solution.join(" ") + "   （" + r.steps + " 步）");
}

console.log("\nPASS: " + pass + "  FAIL: " + fail);
process.exit(fail ? 1 : 0);
