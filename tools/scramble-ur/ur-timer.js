/** ur-timer.js - 各组迷你计时器
 * localStorage 键 ur_times = {"C":[毫秒,...]}，按组独立；展示 本次/最快/平均/次数/最近5次；支持删除单次与清空
 * 触发方式：空格键或鼠标左键开始/停止，鼠标右键取消
 */
(function () {
  var STORAGE_KEY = 'ur_times';
  var activeCtrl = null; // 当前活跃计时器控制器（空格状态机入口），bind 时更新
  function getGroup() {
    var el = document.getElementById('timer-group');
    return el ? (el.getAttribute('data-group') || 'C') : 'C';
  }
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveAll(all) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function fmt(ms) {
    if (!isFinite(ms) || ms < 0) return '--:--.---';
    var total = Math.round(ms);
    var min = Math.floor(total / 60000);
    var sec = Math.floor((total % 60000) / 1000);
    var mill = total % 1000;
    return (min > 0 ? min + ':' : '') + (min > 0 ? String(sec).padStart(2, '0') : String(sec)) + '.' + String(mill).padStart(3, '0');
  }
  function avg(arr) {
    if (!arr.length) return NaN;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }
  function render(block) {
    var group = getGroup();
    var all = loadAll();
    var arr = all[group] || [];
    var last = arr.length ? arr[arr.length - 1] : NaN;
    var best = arr.length ? Math.min.apply(null, arr) : NaN;
    var avgV = avg(arr);
    block.innerHTML =
      '<div class="timer-display" data-state="idle">' + fmt(last) + '</div>' +
      '<div class="timer-stats">' +
        '<span>最快 <b>' + fmt(best) + '</b></span>' +
        '<span>平均 <b>' + fmt(avgV) + '</b></span>' +
        '<span>次数 <b>' + arr.length + '</b></span>' +
      '</div>' +
      '<div class="timer-recent"><span class="timer-recent-label">最近5次</span>' + recentHtml(arr) + '</div>' +
      '<div class="timer-actions">' +
        '<button type="button" class="timer-btn timer-btn-del">删除最近一次</button>' +
        '<button type="button" class="timer-btn timer-btn-clear">清空该组</button>' +
      '</div>';
  }
  function recentHtml(arr) {
    if (!arr.length) return '<span class="timer-empty">暂无记录</span>';
    var recent = arr.slice(-5).slice().reverse();
    var parts = [];
    for (var i = 0; i < recent.length; i++) {
      parts.push('<span class="timer-recent-item">' + fmt(recent[i]) + '</span>');
    }
    return parts.join('');
  }
  function bind(block) {
    var display = block.querySelector('.timer-display');
    var running = false;
    var startTime = 0;
    var acc = 0;
    var raf = 0;
    var prepTimer = 0;
    var prepState = ''; // '' 无准备 | 'red' 按住未满3秒 | 'green' 可触发
    function tick() {
      var ms = acc + (Date.now() - startTime);
      display.textContent = fmt(ms);
      raf = requestAnimationFrame(tick);
    }
    function resetUI() {
      cancelAnimationFrame(raf);
      running = false;
      acc = 0;
      display.setAttribute('data-state', 'idle');
      display.textContent = fmt(0);
    }
    function startRun() {
      running = true;
      startTime = Date.now();
      acc = 0;
      display.setAttribute('data-state', 'running');
      tick();
    }
    function stopRun() {
      var ms = acc + (Date.now() - startTime);
      resetUI();
      var group = getGroup();
      var all = loadAll();
      if (!all[group]) all[group] = [];
      all[group].push(ms);
      saveAll(all);
      render(block);
      bind(block);
    }
    function clearPrep() {
      if (prepState) {
        clearTimeout(prepTimer);
        prepState = '';
        display.setAttribute('data-state', 'idle');
        display.textContent = fmt(0);
      }
    }
    function keydownSpace(e) {
      if (running) {
        stopRun();
        return;
      }
      clearPrep();
      prepState = 'red';
      display.setAttribute('data-state', 'prep');
      prepTimer = setTimeout(function () {
        if (prepState === 'red') {
          prepState = 'green';
          display.setAttribute('data-state', 'green');
        }
      }, 1000);
    }
    function keyupSpace(e) {
      if (!prepState) return;
      clearTimeout(prepTimer);
      if (prepState === 'green') {
        prepState = '';
        startRun();
      } else {
        clearPrep();
      }
    }
    display.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      clearPrep();
      if (!running) {
        startRun();
      } else {
        stopRun();
      }
    });
    display.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      resetUI();
    });
    activeCtrl = {
      keydownSpace: keydownSpace,
      keyupSpace: keyupSpace
    };
    block.querySelector('.timer-btn-del').addEventListener('click', function () {
      var group = getGroup();
      var all = loadAll();
      var arr = all[group] || [];
      if (arr.length) {
        arr.pop();
        all[group] = arr;
        saveAll(all);
      }
      render(block);
      bind(block);
    });
    block.querySelector('.timer-btn-clear').addEventListener('click', function () {
      var group = getGroup();
      var all = loadAll();
      if (all[group]) {
        delete all[group];
        saveAll(all);
      }
      render(block);
      bind(block);
    });
  }
  // 空格键触发：按住进入准备（红）→ 3秒变绿 → 松开开始；计时中按空格停止。全局监听一次，输入类元素与长按重复跳过
  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var isSpace = (e.code === 'Space') || (e.key === ' ') || (e.key === 'Spacebar');
    if (!isSpace) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    e.preventDefault();
    if (activeCtrl) activeCtrl.keydownSpace(e);
  });
  document.addEventListener('keyup', function (e) {
    var isSpace = (e.code === 'Space') || (e.key === ' ') || (e.key === 'Spacebar');
    if (!isSpace) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (activeCtrl) activeCtrl.keyupSpace(e);
  });

  var blocks = document.querySelectorAll('.timer-block');
  Array.prototype.forEach.call(blocks, function (b) {
    render(b);
    bind(b);
  });
})();
