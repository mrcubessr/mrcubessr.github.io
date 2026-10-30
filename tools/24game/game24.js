/* game24.js — 24点 求解 / 训练 / 统计 逻辑 */
(function () {
  'use strict';

  var WRONG_KEY = 'game24_wrong_v1';
  var STATS_KEY = 'game24_stats_v1';
  var LEVEL_NAMES = { L1: '初级', L2: '中级', L3: '高级', L4: '专家级', L5: '超级专家级' };
  var LEVEL_ORDER = ['L1', 'L2', 'L3', 'L4', 'L5'];

  var BANK = null;          // 题库数据
  var S = null;             // 当前训练会话
  var timerId = null;

  /* ---------------- 存储 + 云同步 ---------------- */
  function regSync() {
    if (!window.LSProvider) return;
    try {
      window.LSProvider.register({
        id: 'game24', label: '24点', path: 'game24.json',
        keys: [WRONG_KEY, STATS_KEY],
        isEmptySnap: function (snap) {
          var w = snap[WRONG_KEY] ? JSON.parse(snap[WRONG_KEY] || '{}') : {};
          var st = snap[STATS_KEY] ? JSON.parse(snap[STATS_KEY] || '{}') : {};
          var wk = (w && typeof w === 'object') ? Object.keys(w).length : 0;
          var stk = (st && typeof st === 'object') ? Object.keys(st).length : 0;
          return wk === 0 && stk === 0;
        }
      });
    } catch (e) { /* 忽略 */ }
  }
  if (window.SyncBoot) window.SyncBoot.ready(regSync); else regSync();

  function loadWrong() { try { return JSON.parse(localStorage.getItem(WRONG_KEY) || '{}'); } catch (e) { return {}; } }
  function saveWrong(o) { localStorage.setItem(WRONG_KEY, JSON.stringify(o)); }
  function loadStats() { try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch (e) { return {}; } }
  function saveStats(o) { localStorage.setItem(STATS_KEY, JSON.stringify(o)); }

  /* ---------------- 工具 ---------------- */
  function sig(nums) { return nums.slice().sort(function (a, b) { return a - b; }).join(','); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function fmtTime(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60); s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function $(id) { return document.getElementById(id); }

  /* 分数运算（精确，支持分数中间值，如 8/(3-8/3)） */
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function mkF(n, d) { if (d === 0) return null; if (d < 0) { n = -n; d = -d; } var g = gcd(n, d); return { n: n / g, d: d / g }; }
  function addF(a, b) { return mkF(a.n * b.d + b.n * a.d, a.d * b.d); }
  function subF(a, b) { return mkF(a.n * b.d - b.n * a.d, a.d * b.d); }
  function mulF(a, b) { return mkF(a.n * b.n, a.d * b.d); }
  function divF(a, b) { if (b.n === 0) return null; return mkF(a.n * b.d, a.d * b.n); }
  function applyOp(a, op, b) { return op === '+' ? addF(a, b) : op === '-' ? subF(a, b) : op === '*' ? mulF(a, b) : divF(a, b); }
  function fracStr(f) { return f.d === 1 ? String(f.n) : (f.n + '/' + f.d); }
  function is24(f) { return f.d === 1 && f.n === 24; }
  var OP_SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  /* ---------------- 题库加载 ---------------- */
  function loadBank(cb) {
    fetch('data/levels.json').then(function (r) { return r.json(); }).then(function (j) {
      BANK = j; cb(true);
    }).catch(function (e) {
      console.warn('题库加载失败', e); cb(false);
    });
  }

  /* ---------------- 页签切换 ---------------- */
  function setupTabs() {
    var tabs = document.querySelectorAll('#tabs .tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        var name = t.getAttribute('data-tab');
        ['solver', 'train', 'stats'].forEach(function (p) {
          $('panel-' + p).hidden = (p !== name);
        });
        if (name === 'stats') renderStats();
      });
    });
  }

  /* ---------------- 求解页 ---------------- */
  var solverRange = 13;
  function setupSolver() {
    var rt = $('solverRange');
    rt.querySelectorAll('.rt').forEach(function (b) {
      b.addEventListener('click', function () {
        rt.querySelectorAll('.rt').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        solverRange = parseInt(b.getAttribute('data-range'), 10);
        $('solverRangeLabel').textContent = solverRange;
        document.querySelectorAll('#solverInputs .num-in').forEach(function (i) { i.max = solverRange; });
      });
    });
    $('solveBtn').addEventListener('click', doSolve);
    $('clearSolveBtn').addEventListener('click', function () {
      document.querySelectorAll('#solverInputs .num-in').forEach(function (i) { i.value = ''; });
      $('solveResultCard').style.display = 'none';
    });
    $('randomSolveBtn').addEventListener('click', function () {
      if (!BANK) { alert('题库未加载，无法随机'); return; }
      var all = [];
      LEVEL_ORDER.forEach(function (lv) { (BANK['1-' + solverRange][lv] || []).forEach(function (p) { all.push(p); }); });
      if (!all.length) return;
      var pick = all[Math.floor(Math.random() * all.length)];
      var ins = document.querySelectorAll('#solverInputs .num-in');
      for (var i = 0; i < 4; i++) ins[i].value = pick[i];
      doSolve();
    });
  }
  function doSolve() {
    var ins = document.querySelectorAll('#solverInputs .num-in');
    var nums = [];
    for (var i = 0; i < 4; i++) {
      var v = parseInt(ins[i].value, 10);
      if (isNaN(v) || v < 1 || v > solverRange) { alert('请输入 1 – ' + solverRange + ' 之间的整数'); return; }
      nums.push(v);
    }
    var r = Suan24.solve(nums);
    var card = $('solveResultCard'); card.style.display = 'block';
    var meta = $('solveMeta'); var box = $('solveResult'); box.innerHTML = '';
    if (!r.hasSolution) {
      meta.textContent = '';
      var none = document.createElement('div'); none.className = 'sol-item none';
      none.textContent = '无解（这四个数无法凑出 24）'; box.appendChild(none);
      return;
    }
    var tags = [];
    if (r.requiresFraction) tags.push('需分数中间值'); else if (!r.noDivision) tags.push('需整除除法'); else tags.push('纯 +−×');
    if (r.anyNegative) tags.push('含负数中间值');
    meta.textContent = '共 ' + r.count + ' 种 · ' + tags.join(' · ');
    var show = r.solutions.slice(0, 60);
    show.forEach(function (s) {
      var d = document.createElement('div'); d.className = 'sol-item';
      d.textContent = s.text + ' = 24'; box.appendChild(d);
    });
    if (r.count > show.length) {
      var more = document.createElement('div'); more.className = 'sol-item none';
      more.textContent = '… 其余 ' + (r.count - show.length) + ' 种略'; box.appendChild(more);
    }
  }

  /* ---------------- 训练设置 ---------------- */
  var tCfg = { range: 13, level: 'L1', mode: 'ten', source: 'bank', mixNoSol: false };
  function setupTrainConfig() {
    function bindGroup(id, key, isInt) {
      $(id).querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          $(id).querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          tCfg[key] = isInt ? parseInt(b.getAttribute('data-' + (key === 'range' ? 'range' : key)), 10) : b.getAttribute('data-' + key);
          updateSetupHint();
        });
      });
    }
    bindGroup('trainRange', 'range', true);
    bindGroup('trainLevel', 'level', false);
    bindGroup('trainMode', 'mode', false);
    bindGroup('trainSource', 'source', false);
    $('mixNoSol').addEventListener('change', function () { tCfg.mixNoSol = this.checked; });
    $('startTrainBtn').addEventListener('click', function () { startTraining(); });
    updateSetupHint();
  }
  function updateSetupHint() {
    var h = $('setupHint');
    if (!BANK) { h.textContent = '题库加载中…若长时间未好，请用本地服务器打开本页（fetch 需要 http）。'; return; }
    if (tCfg.source === 'wrong') {
      var cnt = wrongMatchCount();
      h.textContent = '错题模式：当前范围/难度下共有 ' + cnt + ' 道错题。';
    } else {
      h.textContent = '';
    }
  }
  function wrongMatchCount() {
    var w = loadWrong(); var c = 0;
    Object.keys(w).forEach(function (k) {
      var r = w[k];
      if (r.range == tCfg.range && (tCfg.level === 'all' || tCfg.level === 'random' || r.level === tCfg.level)) c++;
    });
    return c;
  }

  /* ---------------- 训练会话 ---------------- */
  function buildPool() {
    var pool = [];
    if (tCfg.source === 'wrong') {
      var w = loadWrong();
      Object.keys(w).forEach(function (k) {
        var r = w[k];
        if (r.range != tCfg.range) return;
        if (tCfg.level !== 'all' && tCfg.level !== 'random' && r.level !== tCfg.level) return;
        pool.push({ nums: r.nums.slice(), level: r.level, range: r.range });
      });
      return pool;
    }
    var lvls = (tCfg.level === 'all' || tCfg.level === 'random') ? LEVEL_ORDER : [tCfg.level];
    lvls.forEach(function (lv) {
      (BANK['1-' + tCfg.range][lv] || []).forEach(function (p) {
        pool.push({ nums: [p[0], p[1], p[2], p[3]], level: lv, range: tCfg.range, count: p[4] });
      });
    });
    return pool;
  }
  function randNoSolution(range) {
    for (var t = 0; t < 300; t++) {
      var nums = [];
      for (var i = 0; i < 4; i++) nums.push(1 + Math.floor(Math.random() * range));
      if (!Suan24.solve(nums).hasSolution) return nums;
    }
    return null;
  }

  function startTraining() {
    if (!BANK && tCfg.source !== 'wrong') { alert('题库未加载，请用本地服务器(http)打开本页。'); return; }
    if (timerId) { clearInterval(timerId); timerId = null; }
    stopDemo();
    var pool = buildPool();
    if (tCfg.source === 'wrong' && pool.length === 0) { alert('当前范围/难度下没有错题，先去系统题库练练吧。'); return; }

    S = {
      range: tCfg.range, level: tCfg.level, mode: tCfg.mode, source: tCfg.source, mixNoSol: tCfg.mixNoSol,
      pool: pool, queue: [], idx: 0, score: 0, correct: 0, wrongOutcomes: 0,
      wrongPuzzles: [], startTime: Date.now(), threeEnd: 0,
      demoing: false, hintA: null, hintB: null, demoTimer: null, hintTimer: null
    };

    if (S.mode === 'ten') {
      var n = 10;
      var solvable = shuffle(pool.slice());
      var noSolCount = (S.mixNoSol ? Math.min(2, n) : 0);
      var q = [];
      for (var i = 0; i < n - noSolCount && solvable.length; i++) q.push(solvable.pop());
      for (var j = 0; j < noSolCount; j++) {
        var ns = randNoSolution(S.range);
        if (ns) q.push({ nums: ns, noSolution: true, level: (S.level === 'random' ? 'all' : S.level), range: S.range });
      }
      S.queue = shuffle(q);
    }

    $('trainSetup').style.display = 'none';
    $('trainResult').style.display = 'none';
    $('trainPlay').style.display = 'block';

    if (S.mode === 'three') {
      S.threeEnd = Date.now() + 180000;
      timerId = setInterval(tickThree, 200);
    } else {
      timerId = setInterval(tickTen, 200);
    }
    drawNext();
  }

  /* 点击式递交，不再需要输入框回车提交 */

  function drawNext() {
    stopDemo();
    if (S.mode === 'ten') {
      if (S.idx >= S.queue.length) return endSession();
      S.current = S.queue[S.idx];
    } else {
      if (S.mixNoSol && Math.random() < 0.18) {
        var ns = randNoSolution(S.range);
        S.current = ns ? { nums: ns, noSolution: true, level: (S.level === 'random' ? 'all' : S.level), range: S.range } : drawSolvable();
      } else S.current = drawSolvable();
      if (!S.current) return endSession();
    }
    renderPuzzle();
  }
  function drawSolvable() {
    if (!S.pool.length) return null;
    var p = S.pool[Math.floor(Math.random() * S.pool.length)];
    return { nums: p.nums.slice(), level: p.level, range: p.range, noSolution: false };
  }

  function renderPuzzle() {
    var c = S.current;
    S.cards = c.nums.map(function (v) { return { n: v, d: 1, used: false, expr: null }; });
    S.selA = null; S.selOp = null; S.history = []; S.locked = false;
    S.hintA = null; S.hintB = null;
    $('playLevelTag').textContent = c.noSolution ? '（判断是否有解）' : ('（' + (LEVEL_NAMES[c.level] || c.level) + '）');
    renderRangeTag();
    renderCards();
    $('playFeedback').textContent = c.noSolution
      ? '这组数可能有解也可能无解，用数字和运算符合并，若确实凑不出 24 请点「此题无解」。'
      : '点数字 → 点运算符 → 点数字，依次合并直到得到 24。';
    $('playFeedback').className = 'feedback info';
    $('noSolBtn').style.display = c.noSolution ? 'inline-block' : 'none';
    if (S.mode === 'ten') $('playProgress').textContent = '第 ' + (S.idx + 1) + ' / ' + S.queue.length + ' 题';
    else $('playProgress').textContent = '已答 ' + (S.correct + S.wrongOutcomes);
    $('playScore').textContent = '答对 ' + S.score;
  }

  function renderCards() {
    var row = $('playCards'); row.innerHTML = '';
    S.cards.forEach(function (cd, i) {
      var d = document.createElement('div');
      d.className = 'pcard' + (cd.used ? ' used' : '') + (S.selA === i ? ' sel' : '') +
                    (S.hintA === i ? ' hint-a' : '') + (S.hintB === i ? ' hint-b' : '');
      d.setAttribute('data-idx', i);
      var pv = document.createElement('div'); pv.className = 'pv'; pv.textContent = cd.used ? '' : fracStr(cd);
      var pe = document.createElement('div'); pe.className = 'pe'; pe.textContent = cd.expr || '';
      d.appendChild(pv); d.appendChild(pe);
      row.appendChild(d);
    });
  }

  /* 训练进行中显示「范围 · 难度 · 模式」 */
  function renderRangeTag() {
    if (!S) return;
    var levelName = LEVEL_NAMES[S.level] ||
      (S.level === 'all' ? '全部难度' : (S.level === 'random' ? '随机难度' : '判断无解'));
    if (S.current && S.current.noSolution) levelName = '判断无解';
    var modeText = (S.mode === 'ten') ? '十题计时' : '三分钟挑战';
    $('playRangeTag').textContent = '1–' + S.range + ' · ' + levelName + ' · ' + modeText;
  }

  /* 清理演示/提示定时器与高亮状态（不动 S.locked，避免破坏答错锁定） */
  function stopDemo() {
    if (!S) return;
    if (S.demoTimer) { clearTimeout(S.demoTimer); S.demoTimer = null; }
    if (S.hintTimer) { clearTimeout(S.hintTimer); S.hintTimer = null; }
    S.demoing = false;
    S.hintA = null; S.hintB = null;
  }

  /* 在未 used 的卡片中定位某个步骤的 a / b 两个不同下标；找不到返回 null */
  function locateStep(step) {
    var aIdx = -1, bIdx = -1;
    for (var j = 0; j < S.cards.length; j++) {
      if (S.cards[j].used) continue;
      if (aIdx === -1 && fracStr(S.cards[j]) === step.a) { aIdx = j; continue; }
      if (bIdx === -1 && fracStr(S.cards[j]) === step.b) { bIdx = j; }
    }
    if (aIdx === -1 || bIdx === -1 || aIdx === bIdx) return null;
    return { a: aIdx, b: bIdx };
  }

  /* 「提示」：给出下一步该合并哪两个数、用什么运算，不改变任何题目状态 */
  function onHintClick() {
    if (!S || !S.current || S.demoing) return;
    if (S.current.noSolution) { feedback('这组数确实无解，可以点「此题无解」确认', 'info'); return; }
    var plan = Suan24.planSteps(S.current.nums);
    if (!plan) { feedback('这组数确实凑不出 24', 'bad'); return; }
    if (S.hintTimer) { clearTimeout(S.hintTimer); S.hintTimer = null; }
    S.hintA = null; S.hintB = null;
    for (var i = 0; i < plan.length; i++) {
      var at = locateStep(plan[i]);
      if (at) {
        S.hintA = at.a; S.hintB = at.b;
        renderCards();
        feedback('提示：把 ' + plan[i].a + ' 和 ' + plan[i].b + ' 用 ' + OP_SYM[plan[i].op] + ' 合并', 'info');
        S.hintTimer = setTimeout(function () {
          S.hintA = null; S.hintB = null; renderCards();
        }, 3000);
        return;
      }
    }
    renderCards();
    var chain = [];
    for (var k = 0; k < plan.length; k++) chain.push(plan[k].expr);
    feedback('提示顺序：' + chain.join(' → '), 'info');
  }

  function onCardClick(i) {
    if (!S || S.locked || !S.current) return;
    var cd = S.cards[i];
    if (!cd || cd.used) return;
    if (S.selA === null) {
      S.selA = i;
    } else if (S.selOp === null) {
      S.selA = (S.selA === i) ? null : i;
    } else {
      if (S.selA === i) { S.selA = null; }
      else { merge(S.selA, i, S.selOp); return; }
    }
    renderCards();
  }
  function onOpClick(op) {
    if (!S || S.locked || !S.current) return;
    if (S.selA === null) { feedback('请先点一个数字', 'info'); return; }
    S.selOp = op;
    renderCards();
  }
  function merge(a, b, op) {
    var A = S.cards[a], B = S.cards[b];
    var res = applyOp({ n: A.n, d: A.d }, op, { n: B.n, d: B.d });
    if (!res) { feedback('不能除以 0', 'bad'); S.selOp = null; renderCards(); return; }
    var expr = fracStr(A) + ' ' + OP_SYM[op] + ' ' + fracStr(B) + ' = ' + fracStr(res);
    var bBefore = { n: B.n, d: B.d, expr: B.expr };
    S.cards[a].used = true; S.cards[a].expr = null;
    S.cards[b] = { n: res.n, d: res.d, used: false, expr: expr };
    S.history.push({ a: a, b: b, bBefore: bBefore, op: op });
    S.selA = null; S.selOp = null;
    renderCards();
    checkComplete();
  }
  function undo() {
    if (!S || S.locked) return;
    if (!S.history.length) { feedback('没有可撤销的步骤', 'info'); return; }
    var h = S.history.pop();
    S.cards[h.a].used = false; S.cards[h.a].expr = null;
    S.cards[h.b] = { n: h.bBefore.n, d: h.bBefore.d, used: false, expr: h.bBefore.expr };
    S.selA = null; S.selOp = null;
    renderCards();
    feedback('已撤销上一步', 'info');
  }
  function feedback(msg, cls) { $('playFeedback').textContent = msg; $('playFeedback').className = 'feedback ' + (cls || ''); }
  function checkComplete() {
    var left = S.cards.filter(function (c) { return !c.used; });
    if (left.length !== 1) return;
    var v = left[0];
    if (S.demoing) {           // 演示中只提示，不计分、不 advance
      feedback(is24(v) ? '✓ 正确，结果是 24！' : ('结果是 ' + fracStr(v) + '，还差一点。'), is24(v) ? 'ok' : 'bad');
      return;
    }
    if (S.current.noSolution) {
      feedback('这组数凑不出 24，若确认无解请点「此题无解」。或撤销重来。', 'info');
      return;
    }
    if (is24(v)) {
      feedback('✓ 正确，结果是 24！', 'ok');
      S.correct++; S.score++;
      S.locked = true;
      recordResolve(S.current, true);
      advance(550);
    } else {
      feedback('结果是 ' + fracStr(v) + '，还差一点，可撤销重来或看答案。', 'bad');
      S.locked = true;
    }
  }

  function revealAnswer() {
    var c = S.current;
    if (!c || S.demoing) return;
    var plan = Suan24.planSteps(c.nums);
    if (!plan || c.noSolution) {
      var ans = '(看答案)';
      if (!c.noSolution) {
        var r = Suan24.solve(c.nums);
        ans = r.hasSolution ? ('答案：' + r.solutions[0].text + ' = 24') : '无解';
      } else ans = '这组数无解';
      $('playFeedback').textContent = ans; $('playFeedback').className = 'feedback info';
      recordResolve(c, false, '(看答案)');
      advance(900);
      return;
    }
    // 分步演示：重置本题 → 逐步自动合并
    S.cards = c.nums.map(function (v) { return { n: v, d: 1, used: false, expr: null }; });
    S.history = []; S.selA = null; S.selOp = null; S.locked = true;
    S.hintA = null; S.hintB = null;
    renderCards();
    S.demoing = true;
    var stepIdx = 0;
    function demoNext() {
      if (!S || !S.current) return;
      if (stepIdx >= plan.length) {
        var rr = Suan24.solve(c.nums);
        feedback('答案：' + rr.solutions[0].text + ' = 24', 'ok');
        recordResolve(c, false, '(看答案)');
        S.demoing = false; S.locked = false;
        advance(900);
        return;
      }
      var step = plan[stepIdx];
      var at = locateStep(step);
      if (!at) {
        var chain = [];
        for (var k = 0; k < plan.length; k++) chain.push(plan[k].expr);
        feedback('提示顺序：' + chain.join(' → '), 'info');
        recordResolve(c, false, '(看答案)');
        S.demoing = false; S.locked = false;
        advance(900);
        return;
      }
      S.hintA = at.a; S.hintB = at.b;
      renderCards();
      feedback(step.expr, 'info');
      stepIdx++;
      S.demoTimer = setTimeout(function () {
        if (!S || !S.demoing) return;
        merge(at.a, at.b, step.op);
        demoNext();
      }, 900);
    }
    demoNext();
  }
  function skipPuzzle() { revealAnswer(); }

  function declareNoSolution() {
    var c = S.current; if (!c) return;
    if (!c.noSolution) {
      $('playFeedback').textContent = '这组数有解，不能判无解哦。'; $('playFeedback').className = 'feedback bad'; return;
    }
    $('playFeedback').textContent = '✓ 正确，这组数确实无解！'; $('playFeedback').className = 'feedback ok';
    S.correct++; S.score++;
    recordResolve(c, true);
    advance(550);
  }

  function advance(delay) {
    if (S.mode === 'ten') { S.idx++; }
    setTimeout(drawNext, delay || 500);
  }

  function recordResolve(c, correct, userAns) {
    // 统计（总练习次数在 endSession 按"次"累加，这里只计题目）
    var st = loadStats();
    st.totalQuestions = (st.totalQuestions || 0) + 1;
    st.totalCorrect = (st.totalCorrect || 0) + (correct ? 1 : 0);
    st.byLevel = st.byLevel || {};
    var lv = (c.level === 'random' ? 'all' : c.level) || 'all';
    st.byLevel[lv] = st.byLevel[lv] || { att: 0, corr: 0 };
    st.byLevel[lv].att++; if (correct) st.byLevel[lv].corr++;
    // 错题
    if (!correct) {
      var w = loadWrong();
      var k = sig(c.nums);
      var rec = w[k] || { nums: c.nums.slice(), level: c.level, range: c.range, attempts: 0, wrong: 0, lastWrong: '', lastWrongAt: 0 };
      rec.attempts++; rec.wrong++; rec.lastWrong = userAns || '(未作答)';
      rec.lastWrongAt = Date.now(); rec.level = c.level; rec.range = c.range;
      w[k] = rec; saveWrong(w);
      S.wrongPuzzles.push({ nums: c.nums.slice(), answer: rec.lastWrong, noSolution: !!c.noSolution });
    } else {
      // 答对也计入 attempts（用于正确率）
      var w2 = loadWrong(); var k2 = sig(c.nums);
      if (w2[k2]) { w2[k2].attempts++; saveWrong(w2); }
    }
    saveStats(st);
  }

  function tickTen() {
    var el = $('playTimer'); el.classList.remove('warn');
    el.textContent = '⏱ ' + fmtTime(Date.now() - S.startTime);
  }
  function tickThree() {
    var left = S.threeEnd - Date.now();
    var el = $('playTimer');
    el.textContent = '⏱ ' + fmtTime(left);
    el.classList.toggle('warn', left <= 10000);
    if (left <= 0) endSession();
  }

  function quitSession() {
    stopDemo();
    if (confirm('确定结束本次训练？')) endSession();
  }

  function endSession() {
    stopDemo();
    clearInterval(timerId); timerId = null;
    S.current = null;
    // 最佳记录 + 总练习次数（按"次"计）
    var st = loadStats();
    st.totalSessions = (st.totalSessions || 0) + 1;
    if (S.mode === 'ten') {
      var sec = Math.round((Date.now() - S.startTime) / 1000);
      if (!st.best10time || sec < st.best10time) st.best10time = sec;
    } else {
      if (!st.best3min || S.score > st.best3min) st.best3min = S.score;
    }
    saveStats(st);

    $('trainPlay').style.display = 'none';
    $('trainResult').style.display = 'block';
    var totalQ = S.correct + S.wrongOutcomes;
    var acc = totalQ ? Math.round(S.correct / totalQ * 100) : 0;
    var html = '';
    if (S.mode === 'ten') {
      var secs = Math.round((Date.now() - S.startTime) / 1000);
      html += '<div>本次 <span class="big">' + S.correct + ' / ' + S.queue.length + '</span> 题正确 · 用时 <b>' + fmtTime(secs * 1000) + '</b></div>';
      html += '<div>正确率 <b>' + acc + '%</b> · 最佳十题用时 <b>' + (st.best10time != null ? fmtTime(st.best10time * 1000) : '—') + '</b></div>';
    } else {
      html += '<div>三分钟挑战：答对 <span class="big">' + S.score + '</span> 题</div>';
      html += '<div>正确率 <b>' + acc + '%</b> · 历史最高 <b>' + (st.best3min != null ? st.best3min : 0) + '</b> 题</div>';
    }
    if (S.wrongPuzzles.length) {
      html += '<div class="result-wrong"><div style="font-weight:700;margin:10px 0 6px">本次答错的 ' + S.wrongPuzzles.length + ' 题（已存入错题本）：</div>';
      S.wrongPuzzles.forEach(function (p) {
        html += '<div class="rw-item">' + p.nums.join(' , ') + ' → <span class="rw-ans">' + (p.noSolution ? '无解' : (p.answer || '看答案')) + '</span></div>';
      });
      html += '</div>';
    } else {
      html += '<div style="margin-top:10px;color:#16a34a;font-weight:600">全部答对，太棒了！</div>';
    }
    $('resultBody').innerHTML = html;
  }

  /* ---------------- 统计页 ---------------- */
  function renderStats() {
    var st = loadStats();
    var w = loadWrong();
    var wkeys = Object.keys(w);
    var totalQ = st.totalQuestions || 0, totalC = st.totalCorrect || 0;
    var acc = totalQ ? Math.round(totalC / totalQ * 100) : 0;
    var grid = $('statGrid');
    grid.innerHTML = '';
    var boxes = [
      ['练习次数', st.totalSessions || 0],
      ['累计题数', totalQ],
      ['总正确率', acc + '%'],
      ['十题最快', st.best10time != null ? fmtTime(st.best10time * 1000) : '—'],
      ['三分钟最高', (st.best3min != null ? st.best3min : 0) + ' 题'],
      ['错题数', wkeys.length]
    ];
    boxes.forEach(function (b) {
      var d = document.createElement('div'); d.className = 'stat-box';
      d.innerHTML = '<div class="v">' + b[1] + '</div><div class="l">' + b[0] + '</div>'; grid.appendChild(d);
    });

    // 各级正确率
    var bars = $('levelBars'); bars.innerHTML = '';
    var bl = st.byLevel || {};
    LEVEL_ORDER.forEach(function (lv) {
      var d = bl[lv]; var pct = 0;
      if (d && d.att) pct = Math.round(d.corr / d.att * 100);
      var att = d ? d.att : 0;
      var row = document.createElement('div'); row.className = 'bar-row';
      row.innerHTML = '<div class="name">' + LEVEL_NAMES[lv] + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="pct">' + pct + '% (' + att + '题)</div>';
      bars.appendChild(row);
    });

    // 错题列表
    var list = $('wrongList'); list.innerHTML = '';
    $('wrongCount').textContent = '共 ' + wkeys.length + ' 道';
    if (!wkeys.length) {
      list.innerHTML = '<div class="hint">还没有错题。去训练里做几道题吧！</div>';
    } else {
      // 按最后错答时间倒序
      wkeys.sort(function (a, b) { return (w[b].lastWrongAt || 0) - (w[a].lastWrongAt || 0); });
      wkeys.forEach(function (k) {
        var r = w[k];
        var item = document.createElement('div'); item.className = 'wrong-item';
        var acc2 = r.attempts ? Math.round((r.attempts - r.wrong) / r.attempts * 100) : 0;
        item.innerHTML = '<div class="wnums">' + r.nums.join(' , ') + '</div>' +
          '<div class="wmeta">难度 <b>' + (LEVEL_NAMES[r.level] || r.level) + '</b> · 做过 <b>' + r.attempts + '</b> 次 / 错 <b>' + r.wrong + '</b> · 上次错答「' + (r.lastWrong || '') + '」</div>';
        var rep = document.createElement('button'); rep.className = 'wbtn'; rep.textContent = '重练';
        rep.addEventListener('click', function () { startFromWrong(r.range, r.level); });
        var del = document.createElement('button'); del.className = 'wbtn danger'; del.textContent = '移除';
        del.addEventListener('click', function () {
          var ww = loadWrong(); delete ww[k]; saveWrong(ww); renderStats();
        });
        item.appendChild(rep); item.appendChild(del); list.appendChild(item);
      });
    }
  }

  function startFromWrong(range, level) {
    tCfg.range = range; tCfg.level = level; tCfg.source = 'wrong'; tCfg.mixNoSol = false;
    // 同步设置 UI
    setActive('trainRange', 'range', String(range));
    setActive('trainLevel', 'level', level);
    setActive('trainSource', 'source', 'wrong');
    $('mixNoSol').checked = false;
    // 切到训练页并开始
    document.querySelectorAll('#tabs .tab').forEach(function (x) { x.classList.remove('active'); if (x.getAttribute('data-tab') === 'train') x.classList.add('active'); });
    ['solver', 'train', 'stats'].forEach(function (p) { $('panel-' + p).hidden = (p !== 'train'); });
    startTraining();
  }
  function setActive(groupId, attr, val) {
    $(groupId).querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-' + attr) === val);
    });
  }

  /* ---------------- 绑定 ---------------- */
  function bindPlayButtons() {
    $('playCards').addEventListener('click', function (e) {
      var el = e.target.closest('.pcard'); if (!el) return;
      onCardClick(parseInt(el.getAttribute('data-idx'), 10));
    });
    $('playOps').addEventListener('click', function (e) {
      var el = e.target.closest('.op'); if (!el) return;
      onOpClick(el.getAttribute('data-op'));
    });
    $('undoBtn').addEventListener('click', undo);
    $('hintBtn').addEventListener('click', onHintClick);
    $('revealBtn').addEventListener('click', revealAnswer);
    $('skipBtn').addEventListener('click', skipPuzzle);
    $('noSolBtn').addEventListener('click', declareNoSolution);
    $('quitBtn').addEventListener('click', quitSession);
    $('againBtn').addEventListener('click', function () { startTraining(); });
    $('backSetupBtn').addEventListener('click', function () {
      $('trainResult').style.display = 'none'; $('trainSetup').style.display = 'block';
    });
    $('clearWrongBtn').addEventListener('click', function () {
      if (confirm('确定清空全部错题？此操作不可恢复。')) { saveWrong({}); renderStats(); }
    });
  }

  function initUI() {
    setupTabs();
    setupSolver();
    setupTrainConfig();
    bindPlayButtons();
    updateSetupHint();
  }

  loadBank(function (ok) {
    initUI();
    if (!ok) { var h = $('setupHint'); if (h) h.textContent = '题库加载失败：请用本地 HTTP 服务器打开本页（fetch 需要 http 协议）。'; }
  });

})();
