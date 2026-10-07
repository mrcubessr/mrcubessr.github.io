#!/usr/bin/env node
/* =============================================================
 * SRS 复习页 · 真实浏览器端到端回归验证
 * -------------------------------------------------------------
 * 为什么需要它：配图/交互的问题在"数据层正确"时也会出现
 *   （例：CSS 把容器 display:none 掉了、hidden 被 display 覆盖），
 *   只看数据或 curl 无法发现。本脚本用无头 Chrome 真跑一遍：
 *     建卡 -> 进入 RAZ 复习页 -> 检查图片真的渲染出来
 *     -> 空格翻面看答案 -> 空格评分走完一轮 -> 点「全部重新学一遍」
 *   并断言关键几何量（图片高度 > 0、完成页 quiz 高度 = 0）。
 *
 * 用法：
 *   node verify_review.mjs [--base https://.../tools/srs/] [--deck "raz-aa-动物·农场"]
 * 环境变量：
 *   CHROME_PATH  指定 chrome/edge 可执行文件（默认自动探测常见路径）
 * 依赖：Node >= 22（自带全局 WebSocket，无需 npm 安装任何包）
 * ============================================================= */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const BASE = argOf('base', 'https://mrcubessr.github.io/tools/srs/');
const DECK = argOf('deck', 'raz-aa-动物·农场');
const PORT = Number(argOf('port', '9333'));
const OUT = argOf('out', path.join(os.tmpdir(), 'srs-verify'));
const PROFILE = path.join(OUT, 'chrome-profile');

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cands = process.platform === 'win32' ? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ] : [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('找不到 Chrome/Edge，请用 CHROME_PATH 指定');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getList = () => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: '/json/list' }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

const fails = [];
const ok = (cond, msg) => { console.log((cond ? '  [OK] ' : '  [FAIL] ') + msg); if (!cond) fails.push(msg); };

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(findChrome(), [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=1000,1000', 'about:blank',
  ], { stdio: 'ignore' });

  let list = null;
  for (let i = 0; i < 60; i++) {
    try { list = await getList(); if (list && list.some(t => t.type === 'page')) break; } catch { /* 还没起 */ }
    await sleep(500);
  }
  const target = list && list.find(t => t.type === 'page');
  if (!target) throw new Error('Chrome 调试端口未就绪');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable');

  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? { __err: JSON.stringify(r.exceptionDetails).slice(0, 200) } : r.result.value;
  };
  const space = async () => {
    const p = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    await sleep(420);
  };
  const shot = async name => {
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, 'base64'));
  };
  const state = () => ev(`(() => {
    var pic=document.getElementById('qPic'), apic=document.getElementById('aPic');
    var img=pic?pic.querySelector('img'):null, h=function(el){return el?Math.round(el.getBoundingClientRect().height):-1;};
    return {
      done: !document.getElementById('doneBox').hidden,
      quizH: h(document.getElementById('quiz')),
      gradesH: h(document.getElementById('grades')),
      showBarH: h(document.getElementById('showBar')),
      picH: h(pic), aPicH: h(apic),
      imgFile: img? (img.currentSrc||img.src).split('/data/img/')[1] : null,
      imgLoaded: img? (img.complete && img.naturalWidth>0) : null,
      aEn: (document.getElementById('aEn')||{}).textContent,
      answerShown: !document.getElementById('answerBox').hidden,
      redoHidden: document.getElementById('btnRedoAll').hidden,
      redoText: document.getElementById('btnRedoAll').textContent,
      prog: (document.getElementById('progText')||{}).textContent
    };
  })()`);

  console.log('1) 打开首页，等待自动建卡…');
  await send('Page.navigate', { url: BASE + '?t=verify' });
  await sleep(12000);
  const cards = await ev(`(async()=>{const g=window.SRSDB;const d=await g.getDecks();const c=await g.getAllCards();
    const rz=c.filter(x=>(x.deckId||'').indexOf('raz-aa')===0);
    return {razDecks:d.filter(x=>x.type==='raz').length,razCards:rz.length,withImg:rz.filter(x=>x.img).length};})()`);
  console.log('   数据层:', JSON.stringify(cards));
  ok(cards.razDecks > 0, 'RAZ 子卡组已生成（' + cards.razDecks + ' 组）');
  ok(cards.withImg > 0, 'RAZ 卡片带真实配图（' + cards.withImg + ' 张）');

  console.log('2) 进入复习页（' + DECK + '）…');
  await send('Page.navigate', { url: BASE + 'review.html?deck=' + encodeURIComponent(DECK) + '&t=verify' });
  await sleep(6000);
  const q = await state();
  console.log('   题面:', JSON.stringify(q));
  ok(q.picH > 0, '题面配图容器可见（高度 ' + q.picH + 'px）');
  ok(q.imgLoaded === true, '配图实际加载成功（' + q.imgFile + '）');
  ok(q.gradesH === 0, '未翻面时评分按钮隐藏');
  await shot('01-question.png');

  await space();
  const a = await state();
  console.log('   答案:', JSON.stringify(a));
  ok(a.answerShown === true, '答案区已展开');
  ok(!!a.aEn, '答案含英文单词（' + a.aEn + '）');
  ok(a.aPicH === 0, '答案区不重复显示配图');
  await shot('02-answer.png');

  console.log('3) 空格评分，走完一轮…');
  let last = null;
  for (let i = 0; i < 40; i++) {
    await space();
    last = await state();
    if (last.done) break;
  }
  console.log('   完成页:', JSON.stringify(last));
  ok(last && last.done === true, '走完一轮进入完成页');
  ok(last && last.quizH === 0, '完成页旧卡片已隐藏（quiz 高度 0）');
  ok(last && last.gradesH === 0, '完成页评分按钮已隐藏');
  ok(last && last.redoHidden === false, '「全部重新学一遍」按钮已出现（' + (last && last.redoText) + '）');
  await shot('03-done.png');

  console.log('4) 点击「全部重新学一遍」…');
  await ev(`document.getElementById('btnRedoAll').click()`);
  await sleep(1800);
  const redo = await state();
  console.log('   重学:', JSON.stringify(redo));
  ok(redo.done === false && redo.quizH > 0, '重学后回到题面');

  await send('Browser.close'); chrome.kill(); await sleep(500);
  console.log('\n截图输出目录: ' + OUT);
  if (fails.length) { console.log('\n结果：失败 ' + fails.length + ' 项\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('\n结果：全部通过 ✅');
})();
