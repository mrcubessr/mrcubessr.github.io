/* =============================================================
 * SRS · SM-2 间隔重复调度引擎
 * -------------------------------------------------------------
 * 纯函数、无 DOM 依赖，可在浏览器与 Node 中共用（便于单测）。
 * 状态机：new -> learning -> review ->(lapse) relearning -> review
 * 评分：0=重来 1=困难 2=良好 3=简单
 * ============================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SM2 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN = 60000, DAY = 86400000;

  var DEFAULT_CFG = {
    learningSteps: [1, 10],      // 分钟
    relearnSteps: [10],          // 分钟
    graduatingInterval: 1,       // 天
    easyInterval: 4,             // 天
    startingEase: 2.5,
    easyBonus: 1.3,
    hardFactor: 1.2,
    lapseEasePenalty: 0.2,
    hardEasePenalty: 0.15,
    easyEaseBonus: 0.15,
    minimumInterval: 1,          // 天
    maximumInterval: 36500,      // 天
    maxEase: 3.5,                // ease 上限，防止连续 EASY 导致间隔失控
    newIntervalFactor: 0.5,      // 重来后毕业间隔 = 原间隔 × 该系数
    intervalModifier: 1.0,
    dayCutoffHour: 4,            // 每日分界小时（Anki 惯例）
    fuzz: true                   // 间隔随机扰动，避免卡片扎堆
  };

  var GRADE = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };
  var GRADE_LABEL = ['重来', '困难', '良好', '简单'];

  function cfgOf(c) {
    var o = {}, k;
    for (k in DEFAULT_CFG) o[k] = DEFAULT_CFG[k];
    if (c) for (k in c) if (c[k] !== undefined && c[k] !== null) o[k] = c[k];
    return o;
  }

  /** 新建一张卡的初始调度状态 */
  function newCard(id, deckId, now) {
    now = now || Date.now();
    return {
      id: id, deckId: deckId,
      state: 'new', step: 0,
      ease: DEFAULT_CFG.startingEase,
      interval: 0, reps: 0, lapses: 0,
      due: now, lastReviewed: 0, totalTimeMs: 0, flags: 0
    };
  }

  /** 当天分界时间戳：例如下午 4 点前算前一天 */
  function dayStart(ts, cutoffHour) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    var s = d.getTime();
    if (d.getHours() < cutoffHour) { /* 占位，逻辑在下方 */ }
    return s + cutoffHour * 3600000 > ts ? s - DAY + cutoffHour * 3600000
                                         : s + cutoffHour * 3600000;
  }

  function fuzzInterval(iv, fuzz) {
    if (!fuzz || iv < 2) return iv;
    var f = 0.95 + Math.random() * 0.10;   // ±5%
    return Math.max(1, Math.round(iv * f));
  }

  /**
   * 调度核心：给定卡片状态与评分，返回新的调度状态 + 下次间隔文本
   * @param {object} card  含 state/interval/ease/step/reps/lapses
   * @param {number} grade 0..3
   * @param {object} cfg   可选，覆盖默认配置
   * @param {number} now   可选，时间戳
   * @returns {object} {state,interval,ease,step,reps,lapses,due,deltaMs}
   */
  function schedule(card, grade, cfg, now) {
    cfg = cfgOf(cfg);
    now = now || Date.now();
    if (grade < 0) grade = 0;
    if (grade > 3) grade = 3;

    var c = {
      state: card.state || 'new',
      interval: card.interval || 0,
      ease: card.ease || cfg.startingEase,
      step: card.step || 0,
      reps: card.reps || 0,
      lapses: card.lapses || 0
    };
    var learning = (c.state === 'learning' || c.state === 'relearning' || c.state === 'new');
    var due;

    if (learning) {
      var steps = c.state === 'relearning' ? cfg.relearnSteps : cfg.learningSteps;
      var stay = c.state === 'relearning' ? 'relearning' : 'learning';
      if (grade === GRADE.AGAIN) {
        c.step = 0;
        c.state = stay;
        due = now + steps[0] * MIN;
      } else if (grade === GRADE.HARD) {
        // 停留在本步，时长取本步与下一步的中值；已在最后一步则取该步时长
        var cur = steps[Math.min(c.step, steps.length - 1)];
        var nxt = c.step + 1 < steps.length ? steps[c.step + 1] : cur;
        due = now + Math.max(1, (cur + nxt) / 2) * MIN;
        c.step = Math.min(c.step, steps.length - 1);
        c.state = stay;
      } else if (grade === GRADE.GOOD) {
        c.step += 1;
        if (c.step >= steps.length) {
          // 毕业
          if (c.state === 'relearning') {
            c.interval = Math.max(cfg.minimumInterval,
              Math.round(Math.max(c.interval, cfg.graduatingInterval) * cfg.newIntervalFactor));
          } else {
            c.interval = cfg.graduatingInterval;
          }
          c.state = 'review';
          c.reps += 1;
          due = now + fuzzInterval(c.interval, cfg.fuzz) * DAY;
        } else {
          c.state = stay;
          due = now + steps[c.step] * MIN;
        }
      } else { // EASY：直接毕业
        c.state = 'review';
        c.interval = c.state === 'relearning'
          ? Math.max(cfg.minimumInterval, Math.max(c.interval || cfg.graduatingInterval, cfg.easyInterval))
          : cfg.easyInterval;
        c.reps += 1;
        due = now + fuzzInterval(c.interval, cfg.fuzz) * DAY;
      }
    } else {
      // ---- review ----
      if (grade === GRADE.AGAIN) {
        c.lapses += 1;
        c.ease = Math.max(1.3, c.ease - cfg.lapseEasePenalty);
        c.state = 'relearning';
        c.step = 0;
        c.interval = Math.max(cfg.minimumInterval,
          Math.round(c.interval * cfg.newIntervalFactor));
        due = now + cfg.relearnSteps[0] * MIN;
      } else {
        var iv;
        if (grade === GRADE.HARD) {
          c.ease = Math.max(1.3, c.ease - cfg.hardEasePenalty);
          iv = Math.max(cfg.minimumInterval, c.interval * cfg.hardFactor);
        } else if (grade === GRADE.GOOD) {
          iv = c.interval * c.ease * cfg.intervalModifier;
        } else {
          c.ease = Math.min(cfg.maxEase, c.ease + cfg.easyEaseBonus);
          iv = c.interval * c.ease * cfg.intervalModifier * cfg.easyBonus;
        }
        iv = Math.max(cfg.minimumInterval, Math.min(cfg.maximumInterval, Math.round(iv)));
        c.interval = iv;
        c.reps += 1;
        c.state = 'review';
        due = now + fuzzInterval(iv, cfg.fuzz) * DAY;
      }
    }

    return {
      state: c.state, interval: c.interval, ease: Math.round(c.ease * 1000) / 1000,
      step: c.step, reps: c.reps, lapses: c.lapses,
      due: due, deltaMs: due - now
    };
  }

  /** 下次间隔的人类可读文本（用于按钮上预告） */
  function previewIntervals(card, cfg, now) {
    cfg = cfgOf(cfg); now = now || Date.now();
    return [0, 1, 2, 3].map(function (g) {
      var r = schedule(card, g, cfg, now);
      return { grade: g, label: GRADE_LABEL[g], ms: r.due - now, text: humanize(r.due - now) };
    });
  }

  function humanize(ms) {
    if (ms < MIN) return '1分钟';
    if (ms < 60 * MIN) return Math.round(ms / MIN) + '分钟';
    var d = ms / DAY;
    if (d < 1) return Math.round(ms / 3600000) + '小时';
    if (d < 30) return (Math.round(d * 10) / 10) + '天';
    if (d < 365) return Math.round(d / 30) + '个月';
    return (Math.round(d / 365 * 10) / 10) + '年';
  }

  /** 卡片是否到期（可复习） */
  function isDue(card, now) {
    now = now || Date.now();
    if (card.state === 'new') return true;
    return (card.due || 0) <= now;
  }

  return {
    GRADE: GRADE, GRADE_LABEL: GRADE_LABEL, CONFIG: DEFAULT_CFG,
    cfgOf: cfgOf, newCard: newCard, schedule: schedule,
    previewIntervals: previewIntervals, humanize: humanize,
    isDue: isDue, dayStart: dayStart, DAY: DAY, MIN: MIN
  };
});
