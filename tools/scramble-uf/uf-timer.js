/** ur-timer.js - 各组迷你计时器
 * localStorage 键 ur_times = {"C":[毫秒,...]}，按组独立；展示 本次/最快/平均/次数/最近5次；支持删除单次与清空
 * 触发方式：空格键或鼠标左键开始/停止，鼠标右键取消
 */
(function () {
  var STORAGE_KEY = 'uf_times';
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
  /* 速拧标准均值：取最近 n 次，去掉一个最快 + 一个最慢后平均（n<3 不裁剪）。
     Ao5→中间 3 次、Ao12→中间 10 次；次数不足返回 NaN（界面显示 —）。 */
  function avgOfN(arr, n) {
    if (!arr || arr.length < n) return NaN;
    var s = arr.slice(-n).slice().sort(function (a, b) { return a - b; });
    var lo = (n >= 3) ? 1 : 0, hi = s.length - ((n >= 3) ? 1 : 0);
    var sum = 0, cnt = 0;
    for (var i = lo; i <= hi; i++) { sum += s[i]; cnt++; }
    return cnt ? sum / cnt : NaN;
  }
  /* 成绩统计卡：注入到 .pc-side（计时器之后、参考公式之前），
     竖向数列展示 本次/最快/平均/Ao5/Ao12/次数。 */
  function renderScore() {
    var group = getGroup();
    var all = loadAll();
    var arr = (all[group] || []).filter(function (v) { return isFinite(v) && v > 0; });
    var last = arr.length ? arr[arr.length - 1] : NaN;
    var best = arr.length ? Math.min.apply(null, arr) : NaN;
    var avgV = avg(arr);
    var ao5 = avgOfN(arr, 5);
    var ao12 = avgOfN(arr, 12);
    var side = document.querySelector('.pc-side');
    if (!side) return;
    var card = document.getElementById('timer-score');
    if (!card) {
      card = document.createElement('div');
      card.id = 'timer-score';
      card.className = 'pc-card timer-score';
      var timer = side.querySelector('.timer-block');
      if (timer && timer.nextSibling) side.insertBefore(card, timer.nextSibling);
      else side.appendChild(card);
    }
    function r(k, v) {
      var na = !isFinite(v);
      return '<div class="timer-score__row"><span class="k">' + k + '</span>' +
        '<span class="v' + (na ? ' is-na' : '') + '">' + (na ? '—' : fmt(v)) + '</span></div>';
    }
    card.innerHTML =
      '<div class="timer-score__title">成绩统计</div>' +
      '<div class="timer-score__list">' +
        r('本次', last) + r('最快', best) + r('平均', avgV) +
        r('Ao5', ao5) + r('Ao12', ao12) +
        '<div class="timer-score__row"><span class="k">次数</span><span class="v">' + arr.length + '</span></div>' +
      '</div>';
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
      '<div class="timer-recent"><span class="timer-recent-label">最近5次</span>' + recentHtml(arr) + '</div>' +
      '<div class="timer-actions">' +
        '<button type="button" class="timer-btn timer-btn-del">删除最近一次</button>' +
        '<button type="button" class="timer-btn timer-btn-clear">清空该组</button>' +
      '</div>';
    renderScore();
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
      }, 500);
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
  // 焦点在按钮/链接上时让位给原生行为（v2.0.55）：否则点过「复制」等按钮后按空格会被计时器劫走
  function uiBlocker(t) {
    return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
                    t.tagName === 'BUTTON' || t.tagName === 'A' || t.isContentEditable));
  }
  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var isSpace = (e.code === 'Space') || (e.key === ' ') || (e.key === 'Spacebar');
    if (!isSpace) return;
    if (uiBlocker(e.target)) return;
    e.preventDefault();
    if (activeCtrl) activeCtrl.keydownSpace(e);
  });
  document.addEventListener('keyup', function (e) {
    var isSpace = (e.code === 'Space') || (e.key === ' ') || (e.key === 'Spacebar');
    if (!isSpace) return;
    if (uiBlocker(e.target)) return;
    if (activeCtrl) activeCtrl.keyupSpace(e);
  });

  var blocks = document.querySelectorAll('.timer-block');
  Array.prototype.forEach.call(blocks, function (b) {
    render(b);
    bind(b);
  });
})();

/* ---------- 打乱公式增强（v2.0.55）----------
   ① 按转法拆 token：公式字号加大后也能整齐换行，不会把 "R'" 拆成两截
   ② 公式卡右上角加「复制」按钮：一键复制，方便粘到计时器里对照
   ③ MutationObserver 监听：切换拿法坐标系时页内脚本会整块重置公式文本，自动重新分词 */
(function () {
  var code = document.getElementById('scramble-formula');
  if (!code) return;
  function spansText() {
    var spans = code.querySelectorAll('.mv'), t = '';
    for (var i = 0; i < spans.length; i++) t += (i ? ' ' : '') + spans[i].textContent;
    return t;
  }
  /* ⚠️ 分词后 code.textContent 会把 token 间的空格吃掉（span 拼接无分隔），
     所以「是否已是分词状态」必须两侧都折叠空白再比较，否则 observer 会被
     自己触发的 mutation 再次唤醒，把整条公式并成一个 token（历史bug）。 */
  function squash(s) { return String(s || '').replace(/\s+/g, ''); }
  function tokenize() {
    var txt = (code.textContent || '').replace(/\s+/g, ' ').trim();
    if (!txt) return;
    if (squash(spansText()) === squash(txt)) return;   /* 已是分词状态，别重刷 */
    code.textContent = '';
    txt.split(' ').forEach(function (m) {
      var s = document.createElement('span');
      s.className = 'mv';
      s.textContent = m;
      code.appendChild(s);
    });
  }
  function addCopy() {
    var card = code.closest('.pc-card');
    if (!card || card.querySelector('.pc-formula-copy')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pc-formula-copy timer-btn';
    btn.textContent = '复制';
    btn.title = '复制打乱公式';
    btn.addEventListener('click', function () {
      var t = spansText() || (code.textContent || '');
      if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {});
      btn.textContent = '已复制 ✓';
      setTimeout(function () { btn.textContent = '复制'; }, 1200);
    });
    card.appendChild(btn);
  }
  tokenize();
  addCopy();
  if (typeof MutationObserver === 'function') {
    new MutationObserver(tokenize).observe(code, { childList: true, characterData: true, subtree: true });
  }
})();
