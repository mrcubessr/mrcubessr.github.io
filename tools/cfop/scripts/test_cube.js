const fs = require("fs");
let src = fs.readFileSync(__dirname + "/../js/cross-trainer.js", "utf8");
global.window = {}; global.performance = { now: () => 0 };
global.requestAnimationFrame = () => 0; global.cancelAnimationFrame = () => {};
global.getComputedStyle = () => ({ getPropertyValue: () => "#888" });
global.document = { readyState: "loading", addEventListener: () => {}, getElementById: () => null, createElementNS: () => ({ setAttribute: () => {}, appendChild: () => {} }) };
eval(src);
const C = global.window.__ct;
function solved(c) { return Object.keys(c).every(f => c[f].every(x => x === c[f][0])); }
let ok = 0, fail = 0;
function check(name, cond) { console.log(name + ":", cond ? "OK" : "FAIL"); cond ? ok++ : fail++; }

let c = C.newCube(); for (let i = 0; i < 4; i++) C.apply(c, "U"); check("U x4 solved", solved(c));
c = C.newCube(); C.apply(c, "U"); C.apply(c, "U'"); check("U+U' solved", solved(c));
["R", "F", "L", "B", "D"].forEach(m => { let x = C.newCube(); for (let i = 0; i < 4; i++) C.apply(x, m); check(m + " x4 solved", solved(x)); });

let moves = C.scramble(30);
let x = C.newCube(); moves.forEach(m => C.apply(x, m));
let inv = moves.slice().reverse().map(m => { if (m.endsWith("2")) return m; if (m.endsWith("'")) return m[0]; return m + "'"; });
inv.forEach(m => C.apply(x, m));
check("30-move scramble + inverse solved", solved(x));
console.log("PASS:", ok, "FAIL:", fail);
process.exit(fail ? 1 : 0);
