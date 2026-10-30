/* 题库生成器（一次性，不随站发布）
 * 枚举 1-10 与 1-13 两个范围的 4 数组合 -> 跑精确分数求解器 -> 按五级标准分级 -> 导出 data/levels.json
 * 用法：node gen-bank.js
 */
const fs = require('fs');
const path = require('path');
const S = require('../../assets/vendor/suan24/suan24.js');

// 五级难度判定（结构法，对 1-10 / 1-13 通用）
//   真正的难度分水岭是"是否需要分数中间值"：纯+-× 最易，需整除除法变难，
//   需分数中间值最难。故 L4=需整除除法(全程整数)，L5=需分数中间值。
function classify(info) {
  if (!info.hasSolution) return null;
  if (info.requiresFraction) return 'L5';
  if (info.noDivision) {            // 纯 +−× 且全程整数
    if (info.count >= 6) return 'L1';
    if (info.count >= 3) return 'L2';
    return 'L3';
  }
  return 'L4';                      // 全程整数但必须用到除法
}

// 可复现洗牌（mulberry32）
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const CAP = 300;
const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];

function buildRange(R) {
  const buckets = { L1: [], L2: [], L3: [], L4: [], L5: [] };
  for (let a = 1; a <= R; a++)
    for (let b = a; b <= R; b++)
      for (let c = b; c <= R; c++)
        for (let d = c; d <= R; d++) {
          const info = S.solve([a, b, c, d]);
          const lv = classify(info);
          if (!lv) continue;
          buckets[lv].push([a, b, c, d, info.count]);
        }
  const rng = mulberry32(R * 1000 + 7);
  for (const lv of LEVELS) {
    shuffle(buckets[lv], rng);
    if (buckets[lv].length > CAP) buckets[lv] = buckets[lv].slice(0, CAP);
  }
  return buckets;
}

const out = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    ranges: ['1-10', '1-13'],
    levels: LEVELS,
    standard: 'L1纯+-×且解≥6；L2纯+-×解3-5；L3纯+-×解≤2；L4全程整数但须用整除除法；L5须用分数中间值(最难)',
    vendor: 'suan24 精确分数求解器（seekerlee/suan24 WTFPL + Yuanbest583 项收集去重 MIT）'
  },
  '1-10': buildRange(10),
  '1-13': buildRange(13)
};

const outPath = path.join(__dirname, 'data', 'levels.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));

console.log('已写入', outPath);
for (const r of ['1-10', '1-13']) {
  console.log(`\n范围 ${r}:`);
  for (const lv of LEVELS) console.log(`  ${lv}: ${out[r][lv].length} 题`);
}
