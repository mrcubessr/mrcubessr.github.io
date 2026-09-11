// Reads {name: facelet} JSON, solves each with min2phase, writes {name: scrambleString}
// scramble F = invert(solution) because min2phase.solve returns T^{-1}.
const fs = require('fs');
const m = require('./min2phase.module.js');

function invert(movesStr) {
  const moves = movesStr.trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = moves.length - 1; i >= 0; i--) {
    const mv = moves[i];
    if (mv.endsWith("'")) out.push(mv.slice(0, -1));
    else if (mv.endsWith('2')) out.push(mv);
    else out.push(mv + "'");
  }
  return out.join(' ');
}

const inPath = process.argv[2];
const outPath = process.argv[3];
const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const out = {};
for (const [name, facelet] of Object.entries(data)) {
  let sol = m.solve(facelet, 21, 1e9, 0, 0);
  if (typeof sol !== 'string' || sol.startsWith('Error')) {
    out[name] = '__ERROR__:' + sol;
  } else {
    out[name] = invert(sol.trim());
  }
}
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('solved', Object.keys(out).length, 'facelets');
