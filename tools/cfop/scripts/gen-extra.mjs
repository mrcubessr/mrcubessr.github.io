// 生成 4x4 / 5x5 / 金字塔 三套公式库 JSON（cubing.js 权威引擎出图）
// 数据来源：NexusTimer .ts（4x4/5x5）+ algs.pyraminx.tips .tsx（金字塔）
// 图：对每个 case 的 setup（无 setup 则用 alg 逆序）套用 cubing.js → SVG → 清洗
import { puzzles } from "cubing/puzzles";
import { Alg } from "cubing/alg";
import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const OUT = "D:/魔方站点备份/fto-site/tools/cfop/data";
const NT = "D:/魔方站点备份/fto-site/.workbuddy/outputs/nt_src";
const PY = "D:/魔方站点备份/fto-site/.workbuddy/outputs/pyra_src";
const TMP = os.tmpdir();

const kpCache = {};
async function kp(key) {
  if (!kpCache[key]) { const k = await puzzles[key]; kpCache[key] = await k.kpuzzle(); }
  return kpCache[key];
}

// ---- 加载 NexusTimer .ts（AlgorithmCollection[]）为 JS 数组 ----
function loadNT(file) {
  let txt = fs.readFileSync(path.join(NT, file), "utf-8");
  txt = txt.replace(/^\s*import .*$/mg, "");                       // 去 import
  txt = txt.replace(/export const \w+:\s*\w+\[\]\s*=\s*/, "module.exports = "); // 去类型注解
  const mjs = path.join(TMP, "nt_" + file.replace(/\W/g, "_") + ".cjs");
  fs.writeFileSync(mjs, txt);
  return require(mjs);
}

// ---- 加载 pyraminx .tsx（AlgSet） ----
function loadPyra(file) {
  let txt = fs.readFileSync(path.join(PY, file), "utf-8");
  txt = txt.replace(/^\s*import .*$/mg, "");
  txt = txt.replace(/const cases:\s*\w+\s*=/, "const cases =");
  const mjs = path.join(TMP, "py_" + file.replace(/\W/g, "_") + ".mjs");
  fs.writeFileSync(mjs, txt);
  return (async () => { const m = await import("file://" + mjs); return m.default; })();
}

// ---- 应用 scramble 到 puzzle，返回 SVG 字符串 ----
async function svgFor(puzzleKey, scramble) {
  if (!scramble || !scramble.trim()) return null;
  const kpz = await kp(puzzleKey);
  let pat;
  try { pat = kpz.defaultPattern().applyAlg(new Alg(scramble)); }
  catch (e) { return null; }
  const svg = await puzzles[puzzleKey].svg(pat, {});
  return typeof svg === "string" ? svg : null;
}

// ---- 清洗 SVG：去内联 <style>，统一 root class，贴纸描边交给 CSS ----
function cleanSvg(svg, typeClass) {
  if (!svg) return null;
  let s = svg;
  // 去掉 cubing.js 自带的 <style>...</style>（其 .sticker 描边用死黑）
  s = s.replace(/<style[\s\S]*?<\/style>/g, "");
  // root <svg ...> 加 class
  s = s.replace(/<svg\b/, `<svg class="cfop-net cfop-net--${typeClass}"`);
  return s;
}

// ---- 生成单套 ----
async function buildNTPuzzle(file, puzzleKey, set, typeClass, groupFallback) {
  const groups = loadNT(file); // array of {name, group?, setup?, algs:[{moves,id}]}
  const cases = [];
  let ci = 0;
  for (const g of groups) {
    const sub = g.group || g.name || groupFallback;
    const algs = (g.algs || []).map(a => (a.moves || "").trim()).filter(Boolean);
    if (!algs.length) continue;
    // setup：优先显式；否则用首 alg 的逆序（该位置即 alg 要解的 case）
    let setup = (g.setup || "").trim();
    if (!setup) setup = new Alg(algs[0]).invert().toString();
    const svg = cleanSvg(await svgFor(puzzleKey, setup), typeClass);
    cases.push({
      id: `${set}-${String(ci + 1).padStart(3, "0")}`,
      sub,
      name: g.name || sub,
      setup,
      facelets: null,
      art: svg,
      orientations: [{ name: g.name || sub, algs }]
    });
    ci++;
  }
  return cases;
}

async function buildPyra(file, setName, typeClass) {
  const data = await loadPyra(file); // {id,name,subsets:[{id,name,cases:[{name,algs[],variants?[]}]}]}
  const cases = [];
  let ci = 0;
  for (const subset of data.subsets || []) {
    for (const c of subset.cases || []) {
      const algs = (c.algs || []).map(a => a.trim()).filter(Boolean);
      if (!algs.length) continue;
      let setup = new Alg(algs[0]).invert().toString();
      const svg = cleanSvg(await svgFor("pyraminx", setup), typeClass);
      const orientations = [{ name: c.name || subset.name, algs }];
      // variants 作为额外解法（同名）
      for (const v of c.variants || []) {
        const va = (v.algs || []).map(a => a.trim()).filter(Boolean);
        if (va.length) orientations.push({ name: `${c.name} (${v.name || "变体"})`, algs: va });
      }
      cases.push({
        id: `${setName}-${String(ci + 1).padStart(3, "0")}`,
        sub: `${data.name} · ${subset.name}`,
        name: c.name,
        setup,
        facelets: null,
        art: svg,
        orientations
      });
      ci++;
    }
  }
  return { data, cases };
}

async function main() {
  // 4x4
  const c4 = await buildNTPuzzle("parity-444.ts", "4x4x4", "4x4", "nxn", "4x4 Parity");
  fs.writeFileSync(path.join(OUT, "4x4.json"), JSON.stringify({ set: "4x4", count: c4.length, cases: c4 }, null, 0));
  console.log(`4x4: ${c4.length} cases, art=${c4.filter(c => c.art).length}`);

  // 5x5 (合并三个源)
  const c5a = await buildNTPuzzle("parity-555.ts", "5x5x5", "5x5", "nxn", "5x5 Parity");
  const c5b = await buildNTPuzzle("l2c-555.ts", "5x5x5", "5x5", "nxn", "5x5 L2C");
  const c5c = await buildNTPuzzle("l2e-555.ts", "5x5x5", "5x5", "nxn", "5x5 L2E");
  const c5 = [...c5a, ...c5b, ...c5c];
  fs.writeFileSync(path.join(OUT, "5x5.json"), JSON.stringify({ set: "5x5", count: c5.length, cases: c5 }, null, 0));
  console.log(`5x5: ${c5.length} cases (parity ${c5a.length}+l2c ${c5b.length}+l2e ${c5c.length}), art=${c5.filter(c => c.art).length}`);

  // 金字塔（4 套集合）
  let pyCases = [];
  for (const f of ["l3e.tsx", "l4e.tsx", "ml4e-left.tsx", "top-first.tsx"]) {
    const { data, cases } = await buildPyra(f, "pyraminx", "pyra");
    pyCases = pyCases.concat(cases);
  }
  fs.writeFileSync(path.join(OUT, "pyraminx.json"), JSON.stringify({ set: "pyraminx", count: pyCases.length, cases: pyCases }, null, 0));
  console.log(`pyraminx: ${pyCases.length} cases, art=${pyCases.filter(c => c.art).length}`);
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
