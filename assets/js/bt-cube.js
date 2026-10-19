/**
 * bt-cube.js —— Web 蓝牙适配层（智能魔方计时器 / 智能魔方）
 *
 * 定位：只做「协议库 → 站点可用事件」的薄适配，不含任何业务/UI 逻辑。
 * 以 ESM 方式加载（<script type="module">），并把 API 挂到 window.BTCube，
 * 供站内经典脚本（timer.js / cfop-trainer.js 等）在用户点击时调用。
 *
 * 设计要点：
 * 1. 依赖库按需动态 import —— 未点「连接」就不会下载 137KB 的 vendor 包；
 * 2. 所有 vendor 依赖已改写为本地相对路径，离线/PWA 可用，不依赖外网 CDN；
 * 3. 蓝牙能力探测 + 安全上下文探测，不支持时由页面侧自行降级（隐藏按钮/提示 Bluefy）。
 */
const VENDOR = "/assets/vendor/bt/gan-web-bluetooth.esm.js";

let _lib = null;      /* 懒加载的协议库 */
let _conn = null;     /* 当前连接对象 */
let _sub = null;      /* 当前事件订阅 */
let _kind = "";        /* "timer" | "cube" */

/* ---------- 依赖库懒加载 ---------- */
async function lib() {
  if (_lib) return _lib;
  _lib = await import(VENDOR);
  return _lib;
}

/* ---------- 能力探测 ---------- */
function supported() {
  var ok = !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  var secure = window.isSecureContext === true || location.protocol === "https:" ||
               location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return !!(ok && secure);
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/* ---------- MAC 地址提供器 ----------
   GAN / 魔域(走 GAN Gen2 协议)方块用 MAC 作为解密口令。
   Chrome 未开启 #enable-experimental-web-platform-features 时自动探测会失败，
   此时由本函数向用户索取一次，并按设备名缓存到 localStorage。 */
function macKey(name) { return "bt_cube_mac_v1_" + String(name || "unknown"); }

async function defaultMacProvider(device, hardReset) {
  var name = (device && device.name) || "智能魔方";
  /* 第一次：先给库一次自动探测机会（hardReset=false 时返回空让它自己试） */
  if (!hardReset) {
    var cached = "";
    try { cached = localStorage.getItem(macKey(name)) || ""; } catch (e) { cached = ""; }
    if (cached) return cached;
    return null;                      /* 交给库自动探测，失败会再以 hardReset=true 回调 */
  }
  /* 自动探测失败（hardReset=true）：必须问用户 */
  var cached2 = "";
  try { cached2 = localStorage.getItem(macKey(name)) || ""; } catch (e) { cached2 = ""; }
  var msg = "无法自动读取「" + name + "」的蓝牙 MAC 地址。\n" +
            "请输入 MAC（形如 AB:CD:EF:12:34:56，每台魔方唯一，只需填一次）：";
  var mac = "";
  if (typeof window.BTCubeMacPrompt === "function") {
    mac = await window.BTCubeMacPrompt(msg, cached2);
  } else {
    mac = window.prompt(msg, cached2) || "";
  }
  mac = String(mac || "").trim();
  if (!mac) return null;
  try { localStorage.setItem(macKey(name), mac); } catch (e) {}
  return mac;
}

/* ---------- 统一清理 ---------- */
function cleanup() {
  if (_sub && typeof _sub.unsubscribe === "function") { try { _sub.unsubscribe(); } catch (e) {} }
  _sub = null;
  if (_conn) {
    try { if (typeof _conn.disconnect === "function") _conn.disconnect(); } catch (e) {}
  }
  _conn = null;
  _kind = "";
}

/* ---------- 连接：蓝牙计时器（GAN Smart Timer / Halo） ---------- */
async function connectTimer(h) {
  h = h || {};
  if (!supported()) { var e0 = new Error("当前浏览器不支持 Web 蓝牙"); if (h.onError) h.onError(e0); throw e0; }
  var L = await lib();
  var conn = await L.connectGanTimer();
  _conn = conn; _kind = "timer";
  var names = {};
  Object.keys(L.GanTimerState).forEach(function (k) {
    if (isNaN(Number(k))) names[L.GanTimerState[k]] = k;   /* 反查：数值 → 名称 */
  });
  _sub = conn.events$.subscribe({
    next: function (ev) {
      var name = names[ev && ev.state] || "UNKNOWN";
      if (name === "DISCONNECT") { cleanup(); if (h.onDisconnect) h.onDisconnect(); return; }
      if (h.onState) h.onState(name, ev || {});
    },
    error: function (err) { cleanup(); if (h.onError) h.onError(err); }
  });
  return conn;
}

/* ---------- 连接：智能魔方 ---------- */
async function connectCube(h, macProvider) {
  h = h || {};
  if (!supported()) { var e0 = new Error("当前浏览器不支持 Web 蓝牙"); if (h.onError) h.onError(e0); throw e0; }
  var L = await lib();
  var conn = await L.connectGanCube(macProvider || defaultMacProvider);
  _conn = conn; _kind = "cube";
  _sub = conn.events$.subscribe({
    next: function (ev) {
      if (!ev) return;
      var t = ev.type;
      if (t === "MOVE") { if (h.onMove) h.onMove(ev); }
      else if (t === "FACELETS") { if (h.onFacelets) h.onFacelets(ev.facelets, ev); }
      else if (t === "GYRO") { if (h.onGyro) h.onGyro(ev); }
      else if (t === "BATTERY") { if (h.onBattery) h.onBattery(ev.batteryLevel, ev); }
      else if (h.onEvent) h.onEvent(ev);
    },
    error: function (err) { cleanup(); if (h.onError) h.onError(err); }
  });
  return conn;
}

/* 主动向魔方请求一次当前状态 / 电量（部分型号支持） */
async function requestFacelets() {
  if (!_conn || _kind !== "cube" || typeof _conn.sendCubeCommand !== "function") return false;
  try { await _conn.sendCubeCommand({ type: "REQUEST_FACELETS" }); return true; }
  catch (e) { return false; }
}
async function requestBattery() {
  if (!_conn || _kind !== "cube" || typeof _conn.sendCubeCommand !== "function") return false;
  try { await _conn.sendCubeCommand({ type: "REQUEST_BATTERY" }); return true; }
  catch (e) { return false; }
}

/* ---------- 工具：判断是否还原 ----------
   facelets 为 54 字符（三阶，面序 URFDLB，每面 9 贴）；二阶为 24 字符（每面 4 贴）。
   还原 = 6 个面各自颜色全相同（与整体朝向无关，转体 y/x 不影响判定）。 */
function isSolved(f) {
  if (!f || f.length < 6 || f.length % 6 !== 0) return false;
  var per = f.length / 6;
  for (var i = 0; i < 6; i++) {
    var c = f[i * per];
    for (var j = 1; j < per; j++) if (f[i * per + j] !== c) return false;
  }
  return true;
}

window.BTCube = {
  supported: supported,
  isIOS: isIOS,
  connectTimer: connectTimer,
  connectCube: connectCube,
  requestFacelets: requestFacelets,
  requestBattery: requestBattery,
  disconnect: cleanup,
  isSolved: isSolved,
  get connected() { return !!_conn; },
  get kind() { return _kind; }
};
/* 通知页面：适配层已就绪（模块脚本晚于经典脚本执行，页面需监听此事件或轮询 window.BTCube） */
document.dispatchEvent(new CustomEvent("btcube:ready"));
