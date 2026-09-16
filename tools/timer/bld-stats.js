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
      difficultyBuckets: [], overallMean: null, trend: null
    };
    if (!arr.length) return out;

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

    /* ⑤ 按难度（总公式条数）分组 —— 同难度互相比较才有意义 */
    var diffMap = {};
    arr.forEach(function (r) {
      var d = r.bld.difficulty;
      if (!d) return;
      var key = d.total;
      var s = diffMap[key] || (diffMap[key] = {
        total: key, level: d.level, notation: d.notation,
        count: 0, sum: 0, valid: 0, best: Infinity, vals: []
      });
      s.count++;
      var ms = effectiveMs(r);
      if (isFinite(ms)) { s.sum += ms; s.valid++; s.vals.push(ms); if (ms < s.best) s.best = ms; }
    });
    out.difficultyBuckets = Object.keys(diffMap).map(function (k) {
      var s = diffMap[k];
      s.mean = s.valid ? s.sum / s.valid : null;
      var v = s.vals.slice().sort(function (a, c) { return a - c; });
      s.median = v.length ? v[Math.floor(v.length / 2)] : null;
      return s;
    }).sort(function (x, y) { return x.total - y.total; });

    var allVals = arr.map(effectiveMs).filter(isFinite).sort(function (a, c) { return a - c; });
    out.overallMean = allVals.length ? allVals.reduce(function (a, c) { return a + c; }, 0) / allVals.length : null;

    /* ⑥ 近期趋势：按时间均分 3 段 × 难度等级，看不同难度打乱的成绩变化 */
    var withDiff = arr.filter(function (r) { return r.bld.difficulty; })
      .slice().sort(function (x, y) { return (x.date || 0) - (y.date || 0); });
    var LEVELS = ["简单", "中等", "偏难", "很难"];
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
    h += '<h3 class="tm-h3">⑤ 按难度分组（同类难度互比）</h3>';
    if (!a.difficultyBuckets.length) {
      h += '<div class="tm-ba-note">暂无难度数据（旧成绩不含难度指标，新记录的成绩会自动带上）。</div>';
    } else {
      h += '<div class="tm-ba-table"><table><thead><tr><th>难度(总公式)</th><th>等级</th><th>次数</th><th>平均</th><th>中位</th><th>最好</th><th>对比整体</th></tr></thead><tbody>';
      a.difficultyBuckets.forEach(function (s) {
        var delta = (s.mean != null && a.overallMean) ? Math.round((s.mean - a.overallMean) / a.overallMean * 100) : null;
        var dtxt = delta == null ? "—" : (delta > 0 ? "+" + delta + "% 偏慢" : (delta < 0 ? delta + "% 偏快" : "持平"));
        h += "<tr><td>" + s.total + " 条</td><td>" + esc(s.level) + "</td><td>" + s.count + "</td><td>" +
          (s.mean != null ? fmt(s.mean) : "—") + "</td><td>" +
          (s.median != null ? fmt(s.median) : "—") + "</td><td>" +
          (s.best !== Infinity ? fmt(s.best) : "—") + "</td><td>" + dtxt + "</td></tr>";
      });
      h += "</tbody></table></div>";
      h += '<p class="tm-ba-note">总公式条数相同的打乱难度相当，可直接互比 —— 这就是你的「同类难度基准线」。</p>';
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
        h += "<tr><td>" + esc(r.level) + "</td>";
        r.means.forEach(function (m) { h += "<td>" + (m != null ? fmt(m) : "—") + "</td>"; });
        var first = r.means[0], last = r.means[r.means.length - 1];
        var chg = (first != null && last != null && first > 0) ? Math.round((last - first) / first * 100) : null;
        h += "<td>" + (chg == null ? "—" : (chg < 0 ? "进步 " + (-chg) + "%" : (chg > 0 ? "退步 " + chg + "%" : "持平"))) + "</td></tr>";
      });
      h += "</tbody></table></div>";
      h += '<p class="tm-ba-note">按时间顺序把成绩均分为早期 / 中期 / 近期三段，数值是该段内该难度等级的平均用时。</p>';
    }

    h += '<p class="tm-ba-foot">说明：慢局定义为「用时超过同复杂度中位 1.4 倍」。占比越高的组合 / 片段，越值得针对性加练。</p>';
    return h;
  }

  root.TimerBldStats = { analyze: analyze, renderReport: renderReport };
})(typeof window !== "undefined" ? window : globalThis);
