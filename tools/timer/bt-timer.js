/**
 * bt-timer.js —— 计时器页蓝牙接线
 *
 * 只负责：按钮 UI、连接生命周期、把硬件事件翻译成 __tm.btArm/btStart/btStop 调用。
 * 不改变计时器原有键盘 / 触屏逻辑——蓝牙只是「多了一个输入源」。
 *
 * 两种硬件：
 *  1) 蓝牙计时器垫（GAN Smart Timer / Halo）：设备自带完整状态机，起停最准；
 *  2) 智能魔方本身：需先打乱再点「准备」，第一次转动起表、还原停表。
 */
(function () {
  "use strict";

  var els = {};
  var mode = "";            /* "" | "timer" | "cube" */
  var cubeArmed = false;    /* 智能魔方计时：是否已武装（已打乱、等第一次转动） */
  var lastFacelets = "";

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.hidden = !on; }
  function hint(txt) { if (els.hint) { els.hint.textContent = txt || ""; show(els.hint, !!txt); } }

  /* 适配层是 ESM（晚于经典脚本执行），这里等它就绪 */
  function whenReady(fn) {
    if (window.BTCube) { fn(); return; }
    document.addEventListener("btcube:ready", fn, { once: true });
  }

  /* ---------- 状态文案 ---------- */
  var STATE_TEXT = {
    IDLE: "计时器待机",
    HANDS_ON: "手已放上…",
    HANDS_OFF: "手已离开（宽限期内）",
    GET_SET: "准备完成，抬手即开始",
    RUNNING: "计时中…",
    STOPPED: "已停表",
    FINISHED: "完成",
    DISCONNECT: "已断开"
  };

  /* ---------- 蓝牙计时器垫 ---------- */
  function connectTimer() {
    if (!window.__tm) { hint("计时器尚未就绪，请刷新页面"); return; }
    hint("正在搜索蓝牙计时器…");
    window.BTCube.connectTimer({
      onState: function (name, ev) {
        if (name === "HANDS_ON" || name === "GET_SET" || name === "HANDS_OFF") {
          window.__tm.btArm();
          hint(STATE_TEXT[name] || name);
        } else if (name === "RUNNING") {
          window.__tm.btStart();
          hint(STATE_TEXT.RUNNING);
        } else if (name === "STOPPED") {
          window.__tm.btStop();
          var t = ev && ev.recordedTime;
          hint("完成" + (t ? " · 计时器记录 " + fmtSec(t) : " · 已停表"));
        } else if (name === "IDLE") {
          hint(STATE_TEXT.IDLE);
        }
      },
      onDisconnect: function () { reset(); hint("蓝牙计时器已断开"); },
      onError: function (e) { reset(); hint("连接失败：" + describe(e)); }
    }).then(function () {
      mode = "timer";
      els.timer.textContent = "断开计时器";
      hint("已连接蓝牙计时器");
    }).catch(function (e) { reset(); hint("连接失败：" + describe(e)); });
  }

  /* ---------- 智能魔方当计时器 ---------- */
  function connectCube() {
    if (!window.__tm) { hint("计时器尚未就绪，请刷新页面"); return; }
    hint("正在搜索智能魔方…");
    window.BTCube.connectCube({
      onFacelets: function (f) {
        lastFacelets = f || "";
        var solved = window.BTCube.isSolved(lastFacelets);
        if (mode !== "cube") return;
        if (window.__tm.state === "running") {
          /* 计时中：还原即停表（不要求 !cubeArmed —— 武装后第一次转动即起表，
             cubeArmed 会一直是 true，若留这个条件将永远停不了表） */
          if (solved) { window.__tm.btStop(); cubeArmed = false; hint("还原完成，已停表"); }
        } else if (!cubeArmed) {
          hint(solved ? "魔方已还原 —— 请先打乱，再点【准备】" : "已连接，打乱后点【准备】");
        }
      },
      onMove: function () {
        if (mode !== "cube" || !cubeArmed) return;
        if (window.__tm.state !== "running") {
          window.__tm.btStart();
          hint("计时中…（还原即停表）");
        }
        /* 库不保证每次转动都推 FACELETS，故主动按节流请求一次状态用于判定还原 */
        scheduleFacelets();
      },
      onDisconnect: function () { reset(); hint("智能魔方已断开"); },
      onError: function (e) { reset(); hint("连接失败：" + describe(e)); }
    }).then(function () {
      mode = "cube";
      cubeArmed = false;
      els.cube.textContent = "断开魔方";
      show(els.arm, true);
      window.BTCube.requestFacelets();
      hint("已连接智能魔方：打乱后点【准备】");
    }).catch(function (e) { reset(); hint("连接失败：" + describe(e)); });
  }

  /* 节流请求魔方当前状态（用于判定还原）：连续转动时只在停下 250ms 后请求一次 */
  var faceletsTimer = 0;
  function scheduleFacelets() {
    clearTimeout(faceletsTimer);
    faceletsTimer = setTimeout(function () {
      try { window.BTCube.requestFacelets(); } catch (e) {}
    }, 250);
  }

  /* 武装：只有当前处于「非还原」状态才允许，避免把打乱动作当成起表 */
  function armCube() {
    if (mode !== "cube") return;
    if (lastFacelets && window.BTCube.isSolved(lastFacelets)) {
      hint("魔方还是还原状态，请先打乱再点【准备】");
      return;
    }
    cubeArmed = true;
    window.__tm.btArm();
    hint("已准备 —— 第一次转动即开始计时");
  }

  /* ---------- 通用 ---------- */
  function reset() {
    try { window.BTCube.disconnect(); } catch (e) {}
    clearTimeout(faceletsTimer);
    mode = ""; cubeArmed = false; lastFacelets = "";
    if (els.timer) els.timer.textContent = "蓝牙计时器";
    if (els.cube) els.cube.textContent = "智能魔方计时";
    show(els.arm, false);
  }

  function fmtSec(v) {
    var ms = typeof v === "number" ? v : Number(v) || 0;
    if (ms > 0 && ms < 1000) ms = ms * 1000;         /* 计时器垫给的是秒 */
    return (ms / 1000).toFixed(2) + "s";
  }
  function describe(e) {
    if (!e) return "未知错误";
    var s = (e && (e.message || e.name)) || String(e);
    if (/User cancelled|NotFoundError|用户取消/i.test(s)) return "已取消选择设备";
    return s;
  }

  function boot() {
    els.timer = $("tm-bt-timer");
    els.cube = $("tm-bt-cube");
    els.arm = $("tm-bt-arm");
    els.hint = $("tm-bt-hint");

    whenReady(function () {
      if (!window.BTCube.supported()) {
        show(els.timer, false); show(els.cube, false); show(els.arm, false);
        hint(window.BTCube.isIOS()
          ? "iOS 的 Safari 不支持网页蓝牙 —— 请改用 Bluefy 浏览器"
          : "当前浏览器不支持 Web 蓝牙 —— 请用 Chrome / Edge（需 HTTPS）");
        return;
      }
      show(els.timer, true); show(els.cube, true);
      els.timer.addEventListener("click", function () {
        if (mode === "timer") { reset(); hint("已断开"); return; }
        if (mode === "cube") reset();
        connectTimer();
      });
      els.cube.addEventListener("click", function () {
        if (mode === "cube") { reset(); hint("已断开"); return; }
        if (mode === "timer") reset();
        connectCube();
      });
      els.arm.addEventListener("click", armCube);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
