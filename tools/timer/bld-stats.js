/* =========================================================
   tools/timer/bld-stats.js — 三盲专项分析（无外部依赖）

   暴露：window.TimerBldStats = { analyze(solves), renderReport(solves) }

   分析维度（对应「完整版」需求）：
     ① 按坐标朝向分组 —— 哪些坐标下整体偏慢
     ② 复杂度 vs 时间合理性 —— 同复杂度分桶，看实际时间相对中位是快还是慢
     ③ 拖慢你的棱组合 —— 慢局里出现频次最高的棱字母对
     ④ 常出现在慢局的字母 / 公式片段 —— 跨棱角、按出现占比排序的 Top 列表

   输入 solves：当前分组的成绩数组（最新在前），含 .bld 解法负载。
   ========================================================= */
(function (root) {
  "use strict";

  function fmt(ms) {
    var S = root.TimerStats;
    if (S && S.fmt) return S.fmt(ms);
    if (ms == null || !isFinite(ms)) return "--";
    return (ms / 1000).toFixed(2);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  /* 难度等级徽章：带 L1~L5 代号，与计时器主区显示一致 */
  function lvBadge(level) {
    var E = window.BLDEngine;
    var code = (E && E.levelCodeOf) ? E.levelCodeOf(level) : "";
    var txt = (code ? code + " " : "") + (level || "");
    return '<span class="tm-bld__diff-lv" data-lv="' + esc(level || "") + '">' + esc(txt) + "</span>";
  }
  /* 难度分级标准说明页（集中一处，各入口统一跳转） */
  var LEVEL_DOC = "/tools/3bld/level.html";
  function lvDoc(txt) {
    return '<a class="tm-bld__doc" href="' + LEVEL_DOC + '" target="_blank" rel="noopener" ' +
           'title="查看难度分级标准（评分公式 / 五档划分）">' + (txt || "难度说明") + "</a>";
  }

  /* 把读码字符串拆成相邻字母对（用于「棱组合」频率统计） */
  function letterPairs(code) {
    var pairs = [], cyc = (code || "").trim().split(/\s+/).filter(Boolean);
    cyc.forEach(function (c) {
      for (var i = 0; i < c.length - 1; i++) pairs.push(c.slice(i, i + 2));
    });
    return pairs;
  }
  /* 全部字母（用于「公式片段」统计，跨棱角） */
  function letters(code) { return (code || "").replace(/[^A-Z]/g, "").split(""); }

  /* 复杂度分桶：把相近字母数的打乱归到同一档，便于做「同复杂度」对比 */
  function bucketOf(c) {
    if (c <= 12) return "≤12";
    if (c <= 16) return "13–16";
    if (c <= 20) return "17–20";
    if (c <= 24) return "21–24";
    return "25+";
  }
  var BUCKET_ORDER = ["≤12", "13–16", "17–20", "21–24", "25+"];

  function effectiveMs(r) {
    if (!r) return Infinity;
    if (r.pen === "DNF") return Infinity;
    return r.ms + (r.pen === "+2" ? 2000 : 0);
  }

  /* ---------- 核心分析 ---------- */
  function analyze(solves) {
    var arr = (solves || []).filter(function (r) {
      return r && r.bld && typeof r.bld.complexity === "number";
    });
    var out = {
      total: arr.length,
      byOrientation: {},
      complexityBuckets: {},
      slowEdgePairs: {}, pairTotals: {},
      slowLetters: {}, letterTotals: {},
      slowCount: 0, verdicts: [],
      difficultyBuckets: [], overallMean: null, trend: null,
      success: { solve: 0, dnf: 0, plus2: 0 },
      dnfReasons: { memo: 0, exec: 0, other: 0 }, dnfTotal: 0,
      memoExec: {
        splitCount: 0, memoMean: null, execMean: null, ratioMean: null, lpmMean: null,
        tpsExecMean: null, tpsAllMean: null, secPerAlgMean: null
      }
    };
    if (!arr.length) return out;

    /* 难度口径统一：历史成绩里存的是旧权重 / 旧七档（入门…大师），
       若不重算，分组表里会新旧等级名混排、还多出几个永远为空的档。
       重算只依赖 edgeF/flipF/cornerF/twistF/parityF/borrow 分量，旧数据全都带着。 */
    var ENG = window.BLDEngine;
    if (ENG && typeof ENG.recalcDifficulty === "function") {
      arr.forEach(function (r) {
        if (r.bld && r.bld.difficulty) {
          try {
            var nd = ENG.recalcDifficulty(r.bld.difficulty);
            if (nd) r.bld.difficulty = nd;
          } catch (e) { /* 降级：保留原值 */ }
        }
      });
    }

    /* 分桶与每桶中位用时 */
    var buckets = {};
    arr.forEach(function (r) {
      var b = bucketOf(r.bld.complexity);
      (buckets[b] = buckets[b] || []).push(r);
    });
    var bucketMedians = {};
    Object.keys(buckets).forEach(function (b) {
      var vals = buckets[b].map(effectiveMs).filter(isFinite).slice().sort(function (a, c) { return a - c; });
      var med = vals.length ? vals[Math.floor(vals.length / 2)] : null;
      bucketMedians[b] = med;
      out.complexityBuckets[b] = {
        count: buckets[b].length,
        median: med,
        min: vals.length ? vals[0] : null,
        max: vals.length ? vals[vals.length - 1] : null
      };
    });

    /* 按坐标朝向聚合 */
    arr.forEach(function (r) {
      var k = r.bld.orientationLabel || ("#" + r.bld.orientation);
      var s = out.byOrientation[k] || (out.byOrientation[k] = { count: 0, totalMs: 0, valid: 0, best: Infinity, worst: -Infinity });
      s.count++;
      var ms = effectiveMs(r);
      if (isFinite(ms)) {
        s.totalMs += ms; s.valid++;
        if (ms < s.best) s.best = ms;
        if (ms > s.worst) s.worst = ms;
      }
    });
    Object.keys(out.byOrientation).forEach(function (k) {
      var s = out.byOrientation[k];
      s.mean = s.valid ? s.totalMs / s.valid : null;
    });

    /* 逐次判定：是否合理 / 偏慢 */
    arr.forEach(function (r) {
      var c = r.bld.complexity, b = bucketOf(c), med = bucketMedians[b];
      var ms = effectiveMs(r);
      var verdict = "正常";
      if (isFinite(ms) && med) {
        if (ms > med * 1.6) verdict = "偏慢";
        else if (ms > med * 1.4) verdict = "略慢";
        else if (ms < med * 0.7) verdict = "很快";
      }
      out.verdicts.push({ ms: isFinite(ms) ? ms : null, complexity: c, verdict: verdict, median: med || null });

      var isSlow = (verdict === "偏慢" || verdict === "略慢");
      if (isSlow) {
        out.slowCount++;
        letterPairs(r.bld.edge).forEach(function (p) { out.slowEdgePairs[p] = (out.slowEdgePairs[p] || 0) + 1; out.pairTotals[p] = (out.pairTotals[p] || 0) + 1; });
        letters(r.bld.edge).forEach(function (l) { out.slowLetters[l] = (out.slowLetters[l] || 0) + 1; out.letterTotals[l] = (out.letterTotals[l] || 0) + 1; });
        letterPairs(r.bld.corner).forEach(function (p) { out.slowLetters[p] = (out.slowLetters[p] || 0) + 1; out.letterTotals[p] = (out.letterTotals[p] || 0) + 1; });
        letters(r.bld.corner).forEach(function (l) { out.slowLetters[l] = (out.slowLetters[l] || 0) + 1; out.letterTotals[l] = (out.letterTotals[l] || 0) + 1; });
      } else {
        letterPairs(r.bld.edge).forEach(function (p) { out.pairTotals[p] = (out.pairTotals[p] || 0) + 1; });
        letters(r.bld.edge).forEach(function (l) { out.letterTotals[l] = (out.letterTotals[l] || 0) + 1; });
        letterPairs(r.bld.corner).forEach(function (p) { out.letterTotals[p] = (out.letterTotals[p] || 0) + 1; });
        letters(r.bld.corner).forEach(function (l) { out.letterTotals[l] = (out.letterTotals[l] || 0) + 1; });
      }
    });

    /* ⑤ 按难度等级分组 —— 同等级打乱记忆负担相近，可直接互比（含 TPS）。
       等级按「难度分 0~100」分五档，难度分 = 公式条数（第一权重）+ 翻色/扭角、
       奇偶、借位的加权，比单纯条数更贴近真实难度。 */
    var KNOWN = (window.BLDEngine && window.BLDEngine.BLD_LEVELS) || ["入门", "初级", "中级", "高级", "专家"];
    var diffMap = {};
    arr.forEach(function (r) {
      var d = r.bld.difficulty;
      if (!d) return;
      var key = d.level || "未分级";
      var s = diffMap[key] || (diffMap[key] = {
        level: key, totalMin: Infinity, totalMax: 0, memSum: 0, memValid: 0,
        count: 0, sum: 0, valid: 0, best: Infinity, vals: [],
        tpsExecSum: 0, tpsExecValid: 0, tpsAllSum: 0, tpsAllValid: 0
      });
      s.count++;
      if (isFinite(d.total)) { if (d.total < s.totalMin) s.totalMin = d.total; if (d.total > s.totalMax) s.totalMax = d.total; }
      if (isFinite(d.score)) { s.memSum += d.score; s.memValid++; }
      var ms = effectiveMs(r);
      if (isFinite(ms)) { s.sum += ms; s.valid++; s.vals.push(ms); if (ms < s.best) s.best = ms; }
      var m = r.bld.metrics;
      if (m && isFinite(m.tpsExec)) { s.tpsExecSum += m.tpsExec; s.tpsExecValid++; }
      if (m && isFinite(m.tpsAll)) { s.tpsAllSum += m.tpsAll; s.tpsAllValid++; }
    });
    out.difficultyBuckets = Object.keys(diffMap).map(function (k) {
      var s = diffMap[k];
      s.mean = s.valid ? s.sum / s.valid : null;
      var v = s.vals.slice().sort(function (a, c) { return a - c; });
      s.median = v.length ? v[Math.floor(v.length / 2)] : null;
      s.mem = s.memValid ? s.memSum / s.memValid : null;
      s.tpsExec = s.tpsExecValid ? s.tpsExecSum / s.tpsExecValid : null;
      s.tpsAll = s.tpsAllValid ? s.tpsAllSum / s.tpsAllValid : null;
      return s;
    }).sort(function (x, y) {
      var ix = KNOWN.indexOf(x.level), iy = KNOWN.indexOf(y.level);
      ix = ix < 0 ? 999 : ix; iy = iy < 0 ? 999 : iy;
      return ix - iy;
    });

    var allVals = arr.map(effectiveMs).filter(isFinite).sort(function (a, c) { return a - c; });
    out.overallMean = allVals.length ? allVals.reduce(function (a, c) { return a + c; }, 0) / allVals.length : null;

    /* ⑦ 成功率 + DNF 归因；⑧ 记忆/执行构成与 TPS 汇总 */
    out.success = { solve: 0, dnf: 0, plus2: 0 };
    out.dnfReasons = { memo: 0, exec: 0, other: 0 };
    out.memoExec = {
      splitCount: 0, memoSum: 0, memoValid: 0, execSum: 0, execValid: 0,
      ratioSum: 0, ratioValid: 0, lettersPerMinSum: 0, lpmValid: 0,
      tpsExecSum: 0, tpsExecValid: 0, tpsAllSum: 0, tpsAllValid: 0,
      secPerAlgSum: 0, secPerAlgValid: 0
    };
    arr.forEach(function (r) {
      if (r.pen === "DNF") { out.success.dnf++; if (r.bld && r.bld.dnfReason) out.dnfReasons[r.bld.dnfReason] = (out.dnfReasons[r.bld.dnfReason] || 0) + 1; }
      else if (r.pen === "+2") out.success.plus2++;
      else out.success.solve++;
      var m = r.bld && r.bld.metrics;
      if (!m) return;
      var me = out.memoExec;
      if (m.split) {
        me.splitCount++;
        if (isFinite(m.memoMs)) { me.memoSum += m.memoMs; me.memoValid++; }
        if (isFinite(m.execMs)) { me.execSum += m.execMs; me.execValid++; }
        if (isFinite(m.memoRatio)) { me.ratioSum += m.memoRatio; me.ratioValid++; }
        if (isFinite(m.lettersPerMin)) { me.lettersPerMinSum += m.lettersPerMin; me.lpmValid++; }
      }
      if (isFinite(m.tpsExec)) { me.tpsExecSum += m.tpsExec; me.tpsExecValid++; }
      if (isFinite(m.tpsAll)) { me.tpsAllSum += m.tpsAll; me.tpsAllValid++; }
      if (isFinite(m.secPerAlg)) { me.secPerAlgSum += m.secPerAlg; me.secPerAlgValid++; }
    });
    var me2 = out.memoExec;
    me2.memoMean = me2.memoValid ? me2.memoSum / me2.memoValid : null;
    me2.execMean = me2.execValid ? me2.execSum / me2.execValid : null;
    me2.ratioMean = me2.ratioValid ? me2.ratioSum / me2.ratioValid : null;
    me2.lpmMean = me2.lpmValid ? me2.lettersPerMinSum / me2.lpmValid : null;
    me2.tpsExecMean = me2.tpsExecValid ? me2.tpsExecSum / me2.tpsExecValid : null;
    me2.tpsAllMean = me2.tpsAllValid ? me2.tpsAllSum / me2.tpsAllValid : null;
    me2.secPerAlgMean = me2.secPerAlgValid ? me2.secPerAlgSum / me2.secPerAlgValid : null;
    out.dnfTotal = out.success.dnf;

    /* ⑥ 近期趋势：按时间均分 3 段 × 难度等级，看不同难度打乱的成绩变化 */
    var withDiff = arr.filter(function (r) { return r.bld.difficulty; })
      .slice().sort(function (x, y) { return (x.date || 0) - (y.date || 0); });
    var KNOWN_T = (window.BLDEngine && window.BLDEngine.BLD_LEVELS) || ["入门", "初级", "中级", "高级", "专家"];
    var seenT = {}, presentT = [];
    withDiff.forEach(function (r) {
      var lv = r.bld.difficulty && r.bld.difficulty.level;
      if (lv && !seenT[lv]) { seenT[lv] = 1; presentT.push(lv); }
    });
    presentT.sort(function (a, b) { var ia = KNOWN_T.indexOf(a), ib = KNOWN_T.indexOf(b); ia = ia < 0 ? 999 : ia; ib = ib < 0 ? 999 : ib; return ia - ib; });
    var LEVELS = presentT;
    var NB = 3, segs = [[], [], []];
    if (withDiff.length) {
      var per = Math.ceil(withDiff.length / NB);
      withDiff.forEach(function (r, i) { segs[Math.min(NB - 1, Math.floor(i / per))].push(r); });
    }
    out.trend = { levels: LEVELS, segLabels: ["早期", "中期", "近期"], rows: [] };
    LEVELS.forEach(function (lv) {
      var row = { level: lv, means: [], counts: [] };
      segs.forEach(function (seg) {
        var vs = seg.filter(function (r) { return r.bld.difficulty.level === lv; })
                    .map(effectiveMs).filter(isFinite);
        row.counts.push(vs.length);
        row.means.push(vs.length ? vs.reduce(function (a, c) { return a + c; }, 0) / vs.length : null);
      });
      out.trend.rows.push(row);
    });

    return out;
  }

  /* ---------- 报告渲染（HTML 片段，注入统计弹窗） ---------- */
  function cell(k, v) {
    return '<div class="tm-ba-ov__cell"><span class="tm-ba-ov__k">' + esc(k) +
      '</span><span class="tm-ba-ov__v">' + esc(v) + "</span></div>";
  }
  function bar(label, count, pct) {
    return '<div class="tm-ba-bar"><span class="tm-ba-bar__k">' + esc(label) + "</span>" +
      '<span class="tm-ba-bar__track"><span class="tm-ba-bar__fill" style="width:' + Math.max(4, pct) + '%"></span></span>' +
      '<span class="tm-ba-bar__v">' + count + " 次 · " + pct + "%</span></div>";
  }

  function renderReport(solves) {
    var a = analyze(solves);
    if (a.total < 3) {
      return '<h3 class="tm-h3">三盲专项分析</h3>' +
        '<div class="tm-chart__empty">至少需要 3 次「三盲」成绩（且含解法）才能分析。继续练习、记录成绩后这里会自动给出针对性建议。</div>';
    }

    var h = '<h3 class="tm-h3">三盲专项分析（本组 ' + a.total + " 次成绩）</h3>";

    /* 概览 */
    var slowPct = a.total ? Math.round(a.slowCount / a.total * 100) : 0;
    h += '<div class="tm-ba-ov">' +
      cell("成绩数", a.total) +
      cell("偏慢 / 略慢", a.slowCount + "（" + slowPct + "%）") +
      cell("坐标数", Object.keys(a.byOrientation).length) +
      "</div>";

    /* ① 按坐标分组 */
    h += '<h3 class="tm-h3">① 按坐标朝向分组（速度对比）</h3>';
    h += '<div class="tm-ba-table"><table><thead><tr><th>坐标</th><th>次数</th><th>平均</th><th>最好</th><th>最差</th></tr></thead><tbody>';
    Object.keys(a.byOrientation).sort(function (x, y) { return a.byOrientation[y].count - a.byOrientation[x].count; })
      .forEach(function (k) {
        var s = a.byOrientation[k];
        h += "<tr><td>" + esc(k) + "</td><td>" + s.count + "</td><td>" +
          (s.mean != null ? fmt(s.mean) : "—") + "</td><td>" +
          (s.best !== Infinity ? fmt(s.best) : "—") + "</td><td>" +
          (s.worst !== -Infinity && s.worst !== Infinity ? fmt(s.worst) : "—") + "</td></tr>";
      });
    h += "</tbody></table></div>";

    /* ② 复杂度 vs 时间 */
    h += '<h3 class="tm-h3">② 复杂度 vs 时间（同复杂度中位对比）</h3>';
    h += '<div class="tm-ba-table"><table><thead><tr><th>复杂度</th><th>次数</th><th>中位用时</th><th>最快</th><th>最慢</th></tr></thead><tbody>';
    BUCKET_ORDER.forEach(function (b) {
      var s = a.complexityBuckets[b]; if (!s) return;
      h += "<tr><td>" + b + "</td><td>" + s.count + "</td><td>" +
        (s.median != null ? fmt(s.median) : "—") + "</td><td>" +
        (s.min != null ? fmt(s.min) : "—") + "</td><td>" +
        (s.max != null ? fmt(s.max) : "—") + "</td></tr>";
    });
    h += "</tbody></table></div>";

    /* ③ 拖慢的棱组合 */
    h += '<h3 class="tm-h3">③ 拖慢你的棱组合（慢局出现频次）</h3>';
    var pairs = Object.keys(a.slowEdgePairs)
      .map(function (p) { return { p: p, slow: a.slowEdgePairs[p], total: a.pairTotals[p] || 0 }; })
      .sort(function (x, y) { return y.slow - x.slow; }).slice(0, 12);
    if (!pairs.length) h += '<div class="tm-ba-note">暂无明显拖慢的棱组合，挺均衡。</div>';
    else {
      h += '<div class="tm-ba-bars">';
      pairs.forEach(function (it) {
        var pct = it.total ? Math.round(it.slow / it.total * 100) : 0;
        h += bar(it.p, it.slow, pct);
      });
      h += "</div>";
    }

    /* ④ 常出现在慢局的字母 / 公式片段 */
    h += '<h3 class="tm-h3">④ 常出现在慢局的字母 / 公式片段</h3>';
    var lets = Object.keys(a.slowLetters)
      .map(function (l) { return { l: l, slow: a.slowLetters[l], total: a.letterTotals[l] || 0 }; })
      .sort(function (x, y) { return y.slow - x.slow; }).slice(0, 12);
    if (!lets.length) h += '<div class="tm-ba-note">暂无明显拖慢的特定片段。</div>';
    else {
      h += '<div class="tm-ba-bars">';
      lets.forEach(function (it) {
        var pct = it.total ? Math.round(it.slow / it.total * 100) : 0;
        h += bar(it.l, it.slow, pct);
      });
      h += "</div>";
    }

    /* ⑤ 按难度分组（同类对比） */
      h += '<h3 class="tm-h3">⑤ 按难度等级分组（同等级互比）' + lvDoc() + "</h3>";
      if (!a.difficultyBuckets.length) {
        h += '<div class="tm-ba-note">暂无难度数据（旧成绩不含难度指标，新记录的成绩会自动带上）。</div>';
      } else {
        h += '<div class="tm-ba-table"><table><thead><tr><th>难度等级</th><th>难度分</th><th>公式条数</th><th>次数</th><th>平均</th><th>中位</th><th>最好</th><th>执行TPS</th><th>整体TPS</th><th>对比整体</th></tr></thead><tbody>';
        a.difficultyBuckets.forEach(function (s) {
          var delta = (s.mean != null && a.overallMean) ? Math.round((s.mean - a.overallMean) / a.overallMean * 100) : null;
          var dtxt = delta == null ? "—" : (delta > 0 ? "+" + delta + "% 偏慢" : (delta < 0 ? delta + "% 偏快" : "持平"));
          var tRange = (s.totalMin !== Infinity) ? (s.totalMin === s.totalMax ? s.totalMin + " 条" : s.totalMin + "–" + s.totalMax + " 条") : "—";
          h += "<tr><td>" + lvBadge(s.level) + "</td><td>" +
            (s.mem != null ? Math.round(s.mem) : "—") + "</td><td>" + tRange + "</td><td>" + s.count + "</td><td>" +
          (s.mean != null ? fmt(s.mean) : "—") + "</td><td>" +
          (s.median != null ? fmt(s.median) : "—") + "</td><td>" +
          (s.best !== Infinity ? fmt(s.best) : "—") + "</td><td>" +
          (s.tpsExec != null ? s.tpsExec.toFixed(2) : "—") + "</td><td>" +
          (s.tpsAll != null ? s.tpsAll.toFixed(2) : "—") + "</td><td>" + dtxt + "</td></tr>";
      });
      h += "</tbody></table></div>";
      h += '<p class="tm-ba-note">同一难度等级的打乱记忆负担相近，可直接互比。「公式条数」为该等级内各次打乱的总公式条数范围（棱+角+翻色+扭角+奇偶），「难度分」为该等级的平均难度分（0~100）。TPS 取该等级所有分段成绩的执行/整体均值。</p>';
    }

    /* ⑥ 近期趋势：不同难度打乱的成绩变化 */
    h += '<h3 class="tm-h3">⑥ 近期练习：不同难度打乱的成绩变化</h3>';
    var trendRows = ((a.trend && a.trend.rows) || []).filter(function (r) {
      return r.counts.some(function (c) { return c > 0; });
    });
    if (!trendRows.length) {
      h += '<div class="tm-ba-note">暂无足够数据（需要带难度指标的成绩）。</div>';
    } else {
      h += '<div class="tm-ba-table"><table><thead><tr><th>难度等级</th>';
      a.trend.segLabels.forEach(function (l) { h += "<th>" + l + "</th>"; });
      h += "<th>早期→近期</th></tr></thead><tbody>";
      trendRows.forEach(function (r) {
        h += '<tr><td>' + lvBadge(r.level) + "</td>";
        r.means.forEach(function (m) { h += "<td>" + (m != null ? fmt(m) : "—") + "</td>"; });
        var first = r.means[0], last = r.means[r.means.length - 1];
        var chg = (first != null && last != null && first > 0) ? Math.round((last - first) / first * 100) : null;
        h += "<td>" + (chg == null ? "—" : (chg < 0 ? "进步 " + (-chg) + "%" : (chg > 0 ? "退步 " + chg + "%" : "持平"))) + "</td></tr>";
      });
      h += "</tbody></table></div>";
      h += '<p class="tm-ba-note">按时间顺序把成绩均分为早期 / 中期 / 近期三段，数值是该段内该难度等级的平均用时。</p>';
    }

    /* ⑦ 成功率与 DNF 归因 */
    h += '<h3 class="tm-h3">⑦ 成功率与 DNF 归因</h3>';
    var sc = a.success, tot = sc.solve + sc.plus2 + sc.dnf;
    var solveRate = tot ? Math.round(sc.solve / tot * 100) : 0;
    var dnfRate = tot ? Math.round(sc.dnf / tot * 100) : 0;
    h += '<div class="tm-ba-ov">' +
      cell("完成", sc.solve) + cell("+2", sc.plus2) + cell("DNF", sc.dnf) +
      cell("成功率", solveRate + "%") + cell("DNF 率", dnfRate + "%") + "</div>";
    var dr = a.dnfReasons, dt = a.dnfTotal;
    if (dt > 0) {
      var drMap = [["记忆错", dr.memo, "memo"], ["执行错", dr.exec, "exec"], ["其他", dr.other, "other"]];
      h += '<div class="tm-ba-bars">';
      drMap.forEach(function (it) {
        var pct = dt ? Math.round((it[1] || 0) / dt * 100) : 0;
        h += bar(it[0], it[1] || 0, pct);
      });
      h += "</div>";
      h += '<p class="tm-ba-note">记忆错多 → 该练记忆（编码习惯 / 稳定性）；执行错多 → 该练手速与公式熟练度。两者练法完全不同。</p>';
    } else {
      h += '<p class="tm-ba-note">暂无 DNF 记录。</p>';
    }

    /* ⑧ 记忆 / 执行构成（瓶颈在哪） */
    h += '<h3 class="tm-h3">⑧ 记忆 / 执行构成（瓶颈诊断）</h3>';
    var me = a.memoExec;
    if (me.splitCount === 0) {
      h += '<div class="tm-ba-note">当前成绩未启用「记忆/执行分段计时」（或均为旧数据），无法拆解。开启分段后，计时中用空格标记记忆结束即可看到构成。</div>';
    } else {
      h += '<div class="tm-ba-ov">' +
        cell("分段成绩", me.splitCount) +
        cell("平均记忆", me.memoMean != null ? fmt(me.memoMean) : "—") +
        cell("平均执行", me.execMean != null ? fmt(me.execMean) : "—") +
        cell("记忆占比", me.ratioMean != null ? Math.round(me.ratioMean * 100) + "%" : "—") +
        cell("记忆速度", me.lpmMean != null ? me.lpmMean.toFixed(1) + " 字母/分" : "—") +
        "</div>";
      var bottleneck = "";
      if (me.ratioMean != null) {
        bottleneck = me.ratioMean >= 0.5 ? "记忆是主要耗时环节，提升空间在记忆速度。" :
          "执行占比偏低，瓶颈可能在记忆；若记忆已快，则执行手速是主要提升空间。";
      }
      h += '<p class="tm-ba-note">' + bottleneck + "（占比越高，说明计时里越大部分花在背记上。）</p>";
    }

    /* ⑨ TPS 汇总与按难度 */
    h += '<h3 class="tm-h3">⑨ TPS（每秒转动次数）</h3>';
    if (me.tpsAllMean == null && me.tpsExecMean == null) {
      h += '<div class="tm-ba-note">暂无 TPS 数据（需带分段/步数配置的成绩）。开启分段计时后自动计算。</div>';
    } else {
      h += '<div class="tm-ba-ov">' +
        cell("执行 TPS", me.tpsExecMean != null ? me.tpsExecMean.toFixed(2) : "—") +
        cell("整体 TPS", me.tpsAllMean != null ? me.tpsAllMean.toFixed(2) : "—") +
        cell("每公式秒数", me.secPerAlgMean != null ? me.secPerAlgMean.toFixed(1) + "s" : "—") +
        "</div>";
      h += '<p class="tm-ba-note">执行 TPS = 估算步数 ÷ 执行时间（真手速）；整体 TPS = 估算步数 ÷ 总时间（含记忆）。盲拧总时间里有大量记忆静止期，所以整体 TPS 会显著低于执行 TPS——这是正常现象，比较时请优先看执行 TPS。</p>';
      var tpsDiff = a.difficultyBuckets.filter(function (s) { return s.tpsExec != null; });
      if (tpsDiff.length) {
        h += '<div class="tm-ba-table"><table><thead><tr><th>难度(总公式)</th><th>次数</th><th>执行TPS</th><th>整体TPS</th></tr></thead><tbody>';
        tpsDiff.forEach(function (s) {
          h += "<tr><td>" + s.total + " 条</td><td>" + s.count + "</td><td>" +
            s.tpsExec.toFixed(2) + "</td><td>" + (s.tpsAll != null ? s.tpsAll.toFixed(2) : "—") + "</td></tr>";
        });
        h += "</tbody></table></div>";
        h += '<p class="tm-ba-note">同难度下执行 TPS 越高、手速越好；若难度升高时 TPS 骤降，说明高难公式库执行不熟。</p>';
      }
    }

    h += '<p class="tm-ba-foot">说明：慢局定义为「用时超过同复杂度中位 1.4 倍」。占比越高的组合 / 片段，越值得针对性加练。</p>';
    return h;
  }

  root.TimerBldStats = { analyze: analyze, renderReport: renderReport };
})(typeof window !== "undefined" ? window : globalThis);
