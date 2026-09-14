/* =========================================================
   test_cube.js — 贴纸模型（rubik-core.js）基础回归
   用法：node tools/cfop/scripts/test_cube.js
   （十字求解器与打乱生成的完整回归见 test_cross_solver.js）
   ========================================================= */
"use strict";
const fs = require("fs");
const path = require("path");

globalThis.window = globalThis;
eval(fs.readFileSync(path.join(__dirname, "..", "js", "rubik-core.js"), "utf8"));
const R = globalThis.RubikCore;

let ok = 0, fail = 0;
function check(name, cond) { console.log(name + ":", cond ? "OK" : "FAIL"); cond ? ok++ : fail++; }

let c = R.newCube();
for (let i = 0; i < 4; i++) R.apply(c, "U");
check("U x4 solved", R.isSolved(c));

c = R.newCube(); R.apply(c, "U"); R.apply(c, "U'");
check("U+U' solved", R.isSolved(c));

["R", "F", "L", "B", "D"].forEach(m => {
  const x = R.newCube();
  for (let i = 0; i < 4; i++) R.apply(x, m);
  check(m + " x4 solved", R.isSolved(x));
});

const moves = R.scramble(30);
const x = R.newCube();
R.applyAlg(x, moves.join(" "));
R.applyAlg(x, R.invertMoves(moves).join(" "));
check("30-move scramble + inverse solved", R.isSolved(x));

check("scramble 无同面 / 对面相邻", (() => {
  const s = R.scramble(12);
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1][0], b = s[i][0];
    if (a === b || a === R.OPP[b]) return false;
  }
  return s.length === 12;
})());

console.log("PASS:", ok, "FAIL:", fail);
process.exit(fail ? 1 : 0);
