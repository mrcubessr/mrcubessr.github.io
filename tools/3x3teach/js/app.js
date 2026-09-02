/*
 * app.js — 三阶魔方教学网站主控
 * 依赖：THREE、CubeModel(全局 CM)、CubeEngine(全局)、COURSES_DATA(全局)
 */
(function () {
  'use strict';
  const CM = window.CubeModel;
  const DATA = window.COURSES_DATA;
  const CN = DATA.CN;
  const CW = window.COURSEWARE;

  const BASE_DUR = 360;   // 单步基准时长(ms)
  const BASE_GAP = 120;   // 步间基准间隔(ms)

  // ---------- 引擎初始化 ----------
  const cubeEl = document.getElementById('cube');
  const engine = new window.CubeEngine(cubeEl, {});

  // 安全收尾当前动画
  function finishAnim() { if (engine.anim) engine._finishAnim(); }

  // 第 8 课「顶层黄色面·七种情况」高亮：
  //  - 黄色面所在的层：只保留黄面（黄色贴纸本色），侧面贴纸置灰；
  //  - 其余（前两层等）整块保留本色。
  // 旋转不变——整体转体后黄色中心法向随之改变，高亮自动跟着黄色面走；
  // 灰色贴纸附着在 cubie 上，会随魔方一起转动。
  function yellowFaceLayer(c) {
    const st = engine.getState();
    let yn = [0, 1, 0];
    for (let i = 0; i < st.length; i++) {
      const cc = st[i];
      if (cc.s.length === 1 && cc.s[0].c === '黄') { yn = cc.s[0].n; break; }
    }
    const onYellowFace = c.p[0] * yn[0] + c.p[1] * yn[1] + c.p[2] * yn[2] === 1;
    return onYellowFace ? { keep: ['黄'] } : true;
  }

  // ---------- 公式播放器 ----------
  function cnOfTok(tok) { return CN[tok] || tok; }

  const Player = {
    tokens: [],
    pos: 0,
    playing: false,
    loop: false,
    speed: 1,
    onDone: null,
    timer: null,
    wd: null,
    chipBox: document.getElementById('formulaChips'),

    duration: function () { return BASE_DUR / this.speed; },
    gap: function () { return BASE_GAP / this.speed; },

    load: function (tokens, label, onDone) {
      this.tokens = tokens.slice();
      this.pos = 0;
      this.playing = false;
      this.onDone = onDone || null;
      this.renderChips(label);
      this.clearMarks();
      this.updateBtn();
    },
    renderChips: function (label) {
      const box = this.chipBox;
      box.innerHTML = '';
      if (this.tokens.length === 0) {
        box.innerHTML = '<span class="formula-empty">' + (label || '（无公式）') + '</span>';
        return;
      }
      this.tokens.forEach(function (tok, i) {
        const c = document.createElement('div');
        c.className = 'chip';
        c.dataset.idx = i;
        c.innerHTML = '<span class="std">' + tok + '</span><span class="cn">' + cnOfTok(tok) + '</span>';
        box.appendChild(c);
      });
    },
    clearMarks: function () {
      const chips = this.chipBox.querySelectorAll('.chip');
      chips.forEach(function (c) { c.classList.remove('active', 'done'); });
    },
    setActive: function (i) {
      const chip = this.chipBox.querySelector('.chip[data-idx="' + i + '"]');
      if (chip) chip.classList.add('active');
    },
    setDone: function (i) {
      const chip = this.chipBox.querySelector('.chip[data-idx="' + i + '"]');
      if (chip) { chip.classList.remove('active'); chip.classList.add('done'); }
    },
    _advance: function () {
      if (this.pos >= this.tokens.length) { this._allDone(); return; }
      const self = this;
      const idx = this.pos;
      const tok = this.tokens[idx];
      const dur = this.duration();
      this.setActive(idx);
      const useSpeech = soundOn && !!window.speechSynthesis;
      let animDone = false;
      let speechDone = !useSpeech; // 无语音时只等动画
      let settled = false;
      const maybeSettle = function () {
        if (settled) return;
        if (!animDone) return;
        if (useSpeech && !speechDone) return;
        settled = true;
        if (self._wd) { clearTimeout(self._wd); self._wd = null; }
        self.setDone(idx);
        self.pos++;
        if (!self.playing) return;
        self._timer = setTimeout(function () { self._tick(); }, self.gap());
      };
      // 转动立即开始，与语音几乎同时；下一拍必须等「转动完成 + 语音结束」才走，
      // 因此既不漏播、也不会重叠错位。
      engine.playMove(tok, dur, function () { self.setDone(idx); animDone = true; maybeSettle(); });
      if (useSpeech) {
        const spoke = speakMove(tok, null, function () { speechDone = true; maybeSettle(); });
        if (spoke) {
          // 看门狗：语音异常未触发 onend 时兜底推进，避免卡住
          self._wd = setTimeout(function () { speechDone = true; maybeSettle(); }, dur + 6000);
        } else {
          speechDone = true; maybeSettle();
        }
      }
    },
    _tick: function () {
      if (!this.playing) return;
      if (this.pos >= this.tokens.length) { this._allDone(); return; }
      this._advance();
    },
    play: function () {
      if (this.playing) { this.pause(); return; }
      if (this.pos >= this.tokens.length) { this.pos = 0; this.clearMarks(); }
      if (engine.anim) finishAnim();
      this.playing = true;
      this.updateBtn();
      this._tick();
    },
    _stopTimers: function () {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      if (this._wd) { clearTimeout(this._wd); this._wd = null; }
    },
    pause: function () { this.playing = false; this.updateBtn(); this._stopTimers(); cancelSpeech(); },
    step: function () {
      if (this.playing) this.pause();
      if (this.pos >= this.tokens.length) { this.pos = 0; this.clearMarks(); }
      if (engine.anim) return; // 上一步动画未结束，忽略
      this._advance();
    },
    reset: function () {
      this.playing = false; this.pos = 0; this.clearMarks(); this.updateBtn(); this._stopTimers(); cancelSpeech();
    },
    _allDone: function () {
      if (this.loop && this.playing) {
        this.pos = 0;
        this.clearMarks();
        this._tick();
        return;
      }
      this.playing = false;
      this.updateBtn();
      if (this.onDone) this.onDone();
    },
    updateBtn: function () {
      const b = document.getElementById('btnPlay');
      b.textContent = this.playing ? '⏸ 暂停' : '▶ 播放';
    },
  };

  // ---------- 语音播报（一边做一边念出动作） ----------
  let soundOn = true;
  let ssVoice = null;
  let currentUtter = null; // 持有当前语音引用，避免被 GC 丢弃导致漏播
  function pickVoice() {
    if (!window.speechSynthesis) return;
    try {
      const voices = window.speechSynthesis.getVoices();
      ssVoice = voices.find(function (v) { return /zh|cmn/i.test(v.lang || ''); }) || null;
    } catch (e) {}
  }
  if (window.speechSynthesis) {
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }
  function cancelSpeech() {
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }
  // 播报一个动作；返回 true 表示已成功排进语音队列。
  // onStart：语音开始（可用于同步起转）；onEnd：语音结束（驱动下一拍）。
  // 注意：这里【不再】调用 cancel()，否则在快速循环中引擎处于“停止中”会丢弃下一条语音。
  function speakMove(token, onStart, onEnd) {
    if (!soundOn || !window.speechSynthesis) return false;
    try {
      const u = new SpeechSynthesisUtterance(cnOfTok(token));
      u.lang = 'zh-CN';
      u.rate = 0.95;
      u.pitch = 1.0;
      if (ssVoice) u.voice = ssVoice;
      if (onStart) u.onstart = function () { onStart(); };
      u.onend = function () { if (onEnd) onEnd(); };
      u.onerror = function () { if (onEnd) onEnd(); };
      currentUtter = u; // 持有引用防 GC
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  // ---------- 渲染课程导航 ----------
  const nav = document.getElementById('lessonNav');
  DATA.COURSES.forEach(function (c) {
    const item = document.createElement('div');
    item.className = 'lesson-item';
    item.dataset.id = c.id;
    item.innerHTML = '<div class="lesson-badge">' + c.id + '</div>' +
      '<div class="lesson-meta"><b>' + c.title + '</b><span>' + c.subtitle + '</span></div>';
    item.addEventListener('click', function () { selectLesson(c.id); });
    nav.appendChild(item);
  });

  // ---------- 渲染右侧内容 ----------
  const elKnowledge = document.getElementById('knowledge');
  const elFormulaList = document.getElementById('formulaList');
  const elExercises = document.getElementById('exercises');
  const elLessonNote = document.getElementById('lessonNote');

  function renderKnowledge(list) {
    elKnowledge.innerHTML = '';
    list.forEach(function (k) {
      const li = document.createElement('li');
      li.textContent = k;
      elKnowledge.appendChild(li);
    });
  }
  function renderFormulas(list) {
    elFormulaList.innerHTML = '';
    if (!list || !list.length) {
      elFormulaList.innerHTML = '<p style="color:var(--ink-soft);font-size:14px;margin:0">本课以认知 / 讲解为主，无专属公式。</p>';
      return;
    }
    list.forEach(function (f) {
      const div = document.createElement('div');
      div.className = 'f-item';
      let chips = '';
      f.std.split(/\s+/).filter(Boolean).forEach(function (t) {
        chips += '<span class="chip"><span class="std">' + t + '</span><span class="cn">' + cnOfTok(t) + '</span></span>';
      });
      div.innerHTML = '<div class="f-name">' + f.name + '</div>' +
        '<div class="f-line">' + chips + '</div>' +
        (f.note ? '<div class="f-note">' + f.note + '</div>' : '');
      elFormulaList.appendChild(div);
    });
  }
  function renderExercises(list) {
    elExercises.innerHTML = '';
    if (!list || !list.length) { elExercises.innerHTML = '<p style="color:var(--ink-soft);font-size:14px;margin:0">本课无练习。</p>'; return; }
    list.forEach(function (ex) {
      const item = document.createElement('div');
      item.className = 'ex-item';
      item.innerHTML = '<div class="ex-q"><span>' + ex.q + '</span><span class="toggle">显示答案</span></div>' +
        '<div class="ex-a">' + ex.a + '</div>';
      item.querySelector('.ex-q').addEventListener('click', function () {
        item.classList.toggle('open');
        item.querySelector('.toggle').textContent = item.classList.contains('open') ? '隐藏答案' : '显示答案';
      });
      elExercises.appendChild(item);
    });
  }

  // ---------- 演示加载 ----------
  const elDemoList = document.getElementById('demoList');
  const elHoldTag = document.getElementById('holdTag');
  let activeDemoBtn = null;

  function renderDemos(list) {
    elDemoList.innerHTML = '';
    activeDemoBtn = null;
    if (!list || !list.length) {
      elDemoList.innerHTML = '<span style="color:var(--ink-soft);font-size:13px">本课无动态演示，可到下方「自由转动」手动操作。</span>';
      return;
    }
    list.forEach(function (demo, i) {
      const b = document.createElement('button');
      b.className = 'demo-btn';
      b.textContent = demo.label;
      b.addEventListener('click', function () { loadDemo(demo, b); });
      elDemoList.appendChild(b);
    });
  }

  function loadDemo(demo, btn) {
    finishAnim();
    engine.reset();
    if (demo.preset) engine.applySeq(demo.preset);
    if (demo.hold) engine.applySeq(demo.hold);

    // 展开公式（含 repeat 重复）
    const f = demo.formula.split(/\s+/).filter(Boolean);
    const tokens = [];
    const rep = demo.repeat || 1;
    for (let r = 0; r < rep; r++) for (let k = 0; k < f.length; k++) tokens.push(f[k]);

    // 握持标签
    if (demo.hold) {
      elHoldTag.hidden = false;
      elHoldTag.textContent = '握持：' + (demo.holdCn || cnOfTok(demo.hold));
    } else {
      elHoldTag.hidden = true;
    }

    Player.load(tokens, '点击播放演示', null);
    if (demo.note) elLessonNote.textContent = demo.note;

    if (activeDemoBtn) activeDemoBtn.classList.remove('active');
    if (btn) { btn.classList.add('active'); activeDemoBtn = btn; }
  }

  // ---------- 选择课程 ----------
  let curId = 1;
  function selectLesson(id) {
    const c = DATA.COURSES.find(function (x) { return x.id === id; });
    if (!c) return;
    curId = id;
    finishAnim();
    // 3D 魔方重点块高亮（数据驱动）
    if (c.highlight === 'flower') engine.setHighlight(CM.isFlowerKeyCubie);
    else if (c.highlight === 'whiteLayer') engine.setHighlight(CM.isWhiteLayerKeyCubie);
    else if (c.highlight === 'twoLayer') engine.setHighlight(CM.isTwoLayerKeyCubie);
    else if (c.highlight === 'yellowCross') engine.setHighlight(CM.isYellowCrossKeyCubie);
    else if (c.highlight === 'yellowFace') engine.setHighlight(CM.isYellowFaceKeyCubie);
    else if (c.highlight === 'eyes') engine.setHighlight(CM.isEyesKeyCubie);
    else if (c.highlight === 'topLayer') engine.setHighlight(yellowFaceLayer);
    else engine.clearHighlight();
    engine.reset();
    Player.reset();
    Player.loop = false;
    const bl = document.getElementById('btnLoop'); if (bl) bl.classList.remove('on');
    document.querySelectorAll('.loop-btn').forEach(function (b) { b.classList.remove('active'); });
    elHoldTag.hidden = true;
    elLessonNote.textContent = '点击本课演示或下方「自由转动」开始操作。';

    // 导航高亮
    nav.querySelectorAll('.lesson-item').forEach(function (it) {
      it.classList.toggle('active', it.dataset.id === String(id));
    });
    // 顶部标题
    document.getElementById('curNo').textContent = c.id;
    document.getElementById('curTitle').textContent = c.title;
    document.getElementById('curSub').textContent = c.subtitle;
    // 内容
    renderKnowledge(c.knowledge || []);
    renderFormulas(c.formulas || []);
    renderExercises(c.exercises || []);
    renderDemos(c.demos || []);
    // 清空公式展示
    Player.load([], '点击下面的演示或自由转动来加载公式', null);
    // 渲染本课原课件（即使当前不在课件模式也预渲染，切到课件模式即见）
    renderCourseware(c.id);
  }

  // ---------- 原课件（每课图文） ----------
  const cwTitle = document.getElementById('cwTitle');
  const cwCount = document.getElementById('cwCount');
  const cwGrid = document.getElementById('cwGrid');
  let cwImages = [];   // 当前课的图片数组
  let cwIdx = 0;       // 灯箱当前索引
  let lbEl = null;     // 灯箱 DOM

  function findCW(id) {
    if (!CW || !CW.lessons) return null;
    for (let i = 0; i < CW.lessons.length; i++) if (CW.lessons[i].id === id) return CW.lessons[i];
    return null;
  }
  function renderCourseware(id) {
    const cw = findCW(id);
    cwGrid.innerHTML = '';
    if (!cw) {
      cwTitle.textContent = '';
      cwCount.textContent = '';
      return;
    }
    cwTitle.textContent = cw.title || ('第 ' + id + ' 课');
    const imgs = cw.pages || [];
    cwCount.textContent = '原课件 · 共 ' + imgs.length + ' 页';
    // 图片网格
    cwImages = imgs;
    imgs.forEach(function (img, i) {
      const card = document.createElement('div');
      card.className = 'cw-card';
      card.innerHTML = '<img loading="lazy" src="' + img.src + '" alt="' + (img.caption || '') + '">' +
        (img.caption ? '<div class="cap">' + img.caption + '</div>' : '') +
        '<span class="slide">原第 ' + (img.page || '?') + ' 页</span>';
      card.addEventListener('click', function () { openLightbox(i); });
      cwGrid.appendChild(card);
    });
  }

  // 灯箱
  function buildLightbox() {
    lbEl = document.createElement('div');
    lbEl.className = 'cw-lightbox';
    lbEl.innerHTML =
      '<button class="cw-lb-close" title="关闭 (Esc)">×</button>' +
      '<div class="cw-lb-count"></div>' +
      '<button class="cw-lb-btn cw-lb-prev" title="上一张 (←)">‹</button>' +
      '<div class="cw-lb-stage"><img class="cw-lb-img" src="" alt=""><div class="cw-lb-cap"></div></div>' +
      '<button class="cw-lb-btn cw-lb-next" title="下一张 (→)">›</button>';
    document.body.appendChild(lbEl);
    lbEl.querySelector('.cw-lb-close').addEventListener('click', closeLightbox);
    lbEl.querySelector('.cw-lb-prev').addEventListener('click', function (e) { e.stopPropagation(); lbPrev(); });
    lbEl.querySelector('.cw-lb-next').addEventListener('click', function (e) { e.stopPropagation(); lbNext(); });
    lbEl.addEventListener('click', function (e) { if (e.target === lbEl) closeLightbox(); });
  }
  function showLbImage() {
    if (!cwImages.length) return;
    const img = cwImages[cwIdx];
    lbEl.querySelector('.cw-lb-img').src = img.src;
    lbEl.querySelector('.cw-lb-cap').textContent = (img.caption || '') + '（原第 ' + (img.page || '?') + ' 页）';
    lbEl.querySelector('.cw-lb-count').textContent = (cwIdx + 1) + ' / ' + cwImages.length;
  }
  function openLightbox(i) {
    if (!lbEl) buildLightbox();
    cwIdx = i; showLbImage(); lbEl.classList.add('open');
  }
  function closeLightbox() { if (lbEl) lbEl.classList.remove('open'); }
  function lbPrev() { if (!cwImages.length) return; cwIdx = (cwIdx - 1 + cwImages.length) % cwImages.length; showLbImage(); }
  function lbNext() { if (!cwImages.length) return; cwIdx = (cwIdx + 1) % cwImages.length; showLbImage(); }

  // ---------- 课件幻灯片播放（全屏自动翻页） ----------
  const Slideshow = {
    slides: [],
    idx: 0,
    playing: false,
    timer: null,
    interval: 5000,
    len: 0,
    el: null,
    isOpen: function () { return !!(this.el && this.el.classList.contains('open')); },
    init: function () {
      this.el = document.getElementById('cwSlideshow');
      const self = this;
      document.getElementById('ssClose').addEventListener('click', function () { self.close(); });
      document.getElementById('ssPrev').addEventListener('click', function (e) { e.stopPropagation(); self.prev(); });
      document.getElementById('ssNext').addEventListener('click', function (e) { e.stopPropagation(); self.next(); });
      document.getElementById('ssPlay').addEventListener('click', function () { self.togglePlay(); });
      document.getElementById('ssFs').addEventListener('click', function () { self.toggleFs(); });
      document.getElementById('ssStage').addEventListener('click', function () { self.next(); });
      const speed = document.getElementById('ssSpeed');
      const speedVal = document.getElementById('ssSpeedVal');
      speed.addEventListener('input', function () {
        self.interval = parseInt(speed.value, 10) * 1000;
        speedVal.textContent = speed.value + 's';
        if (self.playing) self._restart();
      });
      // 防止点击控制栏 / 顶栏穿透到舞台触发翻页
      document.querySelector('.cw-ss-controls').addEventListener('click', function (e) { e.stopPropagation(); });
      document.querySelector('.cw-ss-top').addEventListener('click', function (e) { e.stopPropagation(); });
    },
    open: function (slides, title) {
      if (!slides || !slides.length) return;
      this.slides = slides; this.len = slides.length; this.idx = 0;
      document.getElementById('ssTitle').textContent = (title || '课件') + ' · 幻灯片播放';
      this.el.classList.add('open');
      this.show();
      this._requestFs();
      this.play();
    },
    close: function () {
      this.pause();
      this.el.classList.remove('open');
      if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
    },
    show: function () {
      const s = this.slides[this.idx];
      document.getElementById('ssImg').src = s.src;
      document.getElementById('ssCount').textContent = (this.idx + 1) + ' / ' + this.len;
    },
    prev: function () { this.idx = (this.idx - 1 + this.len) % this.len; this.show(); if (this.playing) this._restart(); },
    next: function () { this.idx = (this.idx + 1) % this.len; this.show(); if (this.playing) this._restart(); },
    play: function () { this.playing = true; document.getElementById('ssPlay').textContent = '⏸ 暂停'; this._restart(); },
    pause: function () { this.playing = false; document.getElementById('ssPlay').textContent = '▶ 播放'; this._clearTimer(); this._resetBar(); },
    togglePlay: function () { if (this.playing) this.pause(); else this.play(); },
    _restart: function () { this._clearTimer(); this._startBar(); const self = this; this.timer = setTimeout(function () { self.next(); }, this.interval); },
    _clearTimer: function () { if (this.timer) { clearTimeout(this.timer); this.timer = null; } },
    _startBar: function () {
      const bar = document.getElementById('ssBar');
      bar.style.transition = 'none';
      bar.style.width = '0%';
      void bar.offsetWidth; // 强制回流，使下一帧过渡生效
      bar.style.transition = 'width ' + this.interval + 'ms linear';
      bar.style.width = '100%';
    },
    _resetBar: function () { const bar = document.getElementById('ssBar'); bar.style.transition = 'none'; bar.style.width = '0%'; },
    toggleFs: function () {
      const el = this.el;
      try {
        if (!document.fullscreenElement) {
          if (el.requestFullscreen) el.requestFullscreen();
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      } catch (e) {}
    },
    _requestFs: function () { this.toggleFs(); }
  };

  document.getElementById('btnSlidePlay').addEventListener('click', function () {
    if (!cwImages.length) return;
    const title = cwTitle.textContent || ('第 ' + curId + ' 课');
    Slideshow.open(cwImages, title);
  });
  Slideshow.init();

  // 幻灯片播放快捷键（打开时）
  document.addEventListener('keydown', function (e) {
    if (!Slideshow.isOpen()) return;
    if (e.key === 'Escape') { Slideshow.close(); }
    else if (e.key === 'ArrowLeft') { Slideshow.prev(); }
    else if (e.key === 'ArrowRight') { Slideshow.next(); }
    else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); Slideshow.togglePlay(); }
  });

  // ---------- 视图模式切换 ----------
  let mode = 'teach';
  function setMode(m) {
    mode = m;
    document.body.classList.toggle('courseware-mode', m === 'courseware');
    document.getElementById('modeTeach').classList.toggle('active', m === 'teach');
    document.getElementById('modeCourse').classList.toggle('active', m === 'courseware');
    if (m === 'teach') {
      // 3D 画布曾被隐藏，回到教学需重算尺寸
      setTimeout(function () { if (engine._resize) engine._resize(); }, 60);
    }
  }
  document.getElementById('modeTeach').addEventListener('click', function () { setMode('teach'); });
  document.getElementById('modeCourse').addEventListener('click', function () { setMode('courseware'); });

  // 灯箱键盘（全局，仅在灯箱打开时响应）
  document.addEventListener('keydown', function (e) {
    if (Slideshow.isOpen()) return; // 幻灯片打开时优先处理
    if (lbEl && lbEl.classList.contains('open')) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') lbPrev();
      else if (e.key === 'ArrowRight') lbNext();
    }
  });

  // ---------- 播放控制按钮 ----------
  document.getElementById('btnPlay').addEventListener('click', function () { Player.play(); });
  document.getElementById('btnStep').addEventListener('click', function () { Player.step(); });
  document.getElementById('btnResetCube').addEventListener('click', function () {
    finishAnim(); engine.reset(); Player.reset();
    Player.loop = false;
    const bl = document.getElementById('btnLoop'); if (bl) bl.classList.remove('on');
    document.querySelectorAll('.loop-btn').forEach(function (b) { b.classList.remove('active'); });
    elHoldTag.hidden = true;
    elLessonNote.textContent = '已复位魔方。';
  });

  // 循环开关：一遍结束后自动重来
  const btnLoop = document.getElementById('btnLoop');
  btnLoop.addEventListener('click', function () {
    Player.loop = !Player.loop;
    btnLoop.classList.toggle('on', Player.loop);
    if (Player.loop) {
      if (!Player.tokens.length) {
        elLessonNote.textContent = '先点一个「手法循环练习」或本课演示，再开循环。';
        Player.loop = false; btnLoop.classList.remove('on');
        return;
      }
      if (!Player.playing) Player.play();
    }
  });

  // 声音开关：语音播报可开可关
  const btnSound = document.getElementById('btnSound');
  btnSound.addEventListener('click', function () {
    soundOn = !soundOn;
    btnSound.classList.toggle('on', soundOn);
    if (!soundOn) cancelSpeech();
    elLessonNote.textContent = soundOn ? '语音播报：开（一边做一边念）。' : '语音播报：关。';
  });

  // 手法循环练习：点一下就循环做该手法
  function startLoop(formula, name, btn) {
    finishAnim();
    engine.reset();
    Player.reset();
    Player.loop = true;
    btnLoop.classList.add('on');
    document.querySelectorAll('.loop-btn').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    const tokens = formula.split(/\s+/).filter(Boolean);
    Player.load(tokens, name + '（循环）', null);
    elHoldTag.hidden = true;
    elLessonNote.textContent = '正在循环：' + name + '（' + formula + '）' + (soundOn ? ' · 语音播报开' : '');
    Player.play();
  }
  document.querySelectorAll('.loop-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const formula = btn.dataset.formula;
      const name = btn.dataset.name || formula;
      startLoop(formula, name, btn);
    });
  });

  const speed = document.getElementById('speed');
  const speedVal = document.getElementById('speedVal');
  speed.addEventListener('input', function () {
    Player.speed = parseFloat(speed.value);
    speedVal.textContent = Player.speed.toFixed(1) + '×';
  });

  // ---------- 自由转动 ----------
  document.querySelectorAll('.pad-btn[data-move]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const mv = btn.dataset.move;
      finishAnim();
      Player.reset();
      elHoldTag.hidden = true;
      // 用引擎播放单步（带动画）
      engine.playMove(mv, Player.duration(), function () {});
      // 展示当前动作
      Player.load([mv], null, null);
      Player.setActive(0);
      elLessonNote.textContent = '自由转动：' + mv + '（' + cnOfTok(mv) + '）';
    });
  });
  document.getElementById('btnScramble').addEventListener('click', function () {
    finishAnim(); engine.scramble(20); Player.reset();
    elHoldTag.hidden = true;
    Player.load([], '已随机打乱', null);
    elLessonNote.textContent = '已随机打乱，点「回到复原」可复位。';
  });

  // 整体转体工具栏（第 8 课常用：把黄色面转到左手边等）
  document.querySelectorAll('.turn-btn[data-move]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const mv = btn.dataset.move;
      finishAnim();
      Player.reset();
      elHoldTag.hidden = true;
      engine.playMove(mv, Player.duration(), function () {});
      Player.load([mv], null, null);
      Player.setActive(0);
      elLessonNote.textContent = '整体转体：' + mv + '（' + cnOfTok(mv) + '）';
    });
  });
  document.getElementById('btnSolve').addEventListener('click', function () {
    finishAnim(); engine.reset(); Player.reset();
    elHoldTag.hidden = true;
    Player.load([], '魔方已复原', null);
    elLessonNote.textContent = '魔方已回到复原状态。';
  });

  // 自由拖拽转动某一层后，在提示区显示所完成的动作
  engine.onTwist = function (tok, steps) {
    elHoldTag.hidden = true;
    elLessonNote.textContent = '自由拖拽完成：' + tok + (steps > 1 ? ' ×' + steps : '') +
      '（' + cnOfTok(tok) + (steps > 1 ? ' ×' + steps : '') + '）';
  };

  // ---------- 记号说明弹层 ----------
  const legendModal = document.getElementById('legendModal');
  const legendGrid = document.getElementById('legendGrid');
  function renderLegend() {
    const order = ['R', "R'", 'U', "U'", 'F', "F'", 'D', "D'", 'L', "L'", 'B', "B'"];
    legendGrid.innerHTML = '';
    order.forEach(function (t) {
      const cell = document.createElement('div');
      cell.className = 'legend-cell';
      cell.innerHTML = '<div class="badge">' + t + '</div><div class="mean"><b>' + cnOfTok(t) + '</b>标准记号 ' + t + '</div>';
      legendGrid.appendChild(cell);
    });
  }
  renderLegend();
  document.getElementById('btnLegend').addEventListener('click', function () { legendModal.hidden = false; });
  document.getElementById('btnCloseLegend').addEventListener('click', function () { legendModal.hidden = true; });
  legendModal.addEventListener('click', function (e) { if (e.target === legendModal) legendModal.hidden = true; });

  // ---------- 投影模式 ----------
  document.getElementById('btnPresent').addEventListener('click', function () {
    document.body.classList.toggle('present');
    setTimeout(function () { engine._resize(); }, 60);
  });

  // ---------- 翻课按钮 + 键盘 ----------
  document.getElementById('btnPrev').addEventListener('click', function () {
    if (curId > 1) selectLesson(curId - 1);
  });
  document.getElementById('btnNext').addEventListener('click', function () {
    if (curId < DATA.COURSES.length) selectLesson(curId + 1);
  });
  document.addEventListener('keydown', function (e) {
    if (Slideshow.isOpen()) return; // 幻灯片打开时优先处理
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (lbEl && lbEl.classList.contains('open')) return; // 灯箱打开时用方向键翻图
    if (e.key === 'ArrowLeft' && curId > 1) { selectLesson(curId - 1); }
    else if (e.key === 'ArrowRight' && curId < DATA.COURSES.length) { selectLesson(curId + 1); }
    else if (e.key === ' ' || e.key === 'Spacebar') { if (mode === 'teach') { e.preventDefault(); Player.play(); } }
  });

  // ---------- 启动 ----------
  selectLesson(1);
  window.__player = Player; // 便于自动化测试 / 调试
})();
