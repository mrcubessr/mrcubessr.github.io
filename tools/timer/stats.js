/* =========================================================
   tools/timer/stats.js — 成绩统计与图表（无外部依赖，纯 SVG）
   暴露：window.TimerStats = {
     fmt, val, avgN, bestAvgN, sessionStats, byDay,
     dailyChart, trendChart, distChart, escapeHtml
   }

   成绩记录结构（solves，数组「最新在前」）：
     { ms:Number(毫秒), pen:"" | "+2" | "DNF", date:Number(时间戳) }

   平均口径（与 csTimer / WCA 一致）：
     · ao5 / ao12  → 去掉 1 个最好、1 个最差，其余取平均
     · ao100       → 去掉 5 个最好、5 个最差，其余取平均
     · DNF 记为 +∞；若窗口内 DNF 数量超过被去掉的个数，该平均记为 DNF

   盲拧专用口径（大量 DNF 时 aoN 会整片作废，故另设）：
     · meaN  → 窗口内 DNF 直接剔除，其余取平均（不因 DNF 作废）；
               窗口内 1 次有效都没有时返回 null；跳过仍有 >0 有效成绩的窗口
     · 成功率 → 完成次数 / 总次数（+2 计入完成，DNF 不计）
   ========================================================= */
(function (root) {
  "use strict";

  var INF = Infinity;

  /* ---------- 基础工具 ---------- */
  function fmt(ms) {
    if (ms == null || !isFinite(ms) || ms < 0) return "--";
    var s = ms / 1000;
    if (s >= 60) {
      var m = Math.floor(s / 60);
      var r = s - m * 60;
      return m + ":" + (r < 10 ? "0" : "") + r.toFixed(2);
    }
    return s.toFixed(2);
  }

  /* 单次有效用时（含罚时）；DNF 为 +∞ */
  function val(s) {
    if (!s) return INF;
    if (s.pen === "DNF") return INF;
    return s.ms + (s.pen === "+2" ? 2000 : 0);
  }

  /* arr 为「最新在前」；取 arr[idx .. idx+n-1] 窗口的去尾平均 */
  function avgN(arr, n, idx) {
    idx = idx || 0;
    if (!arr || arr.length < idx + n) return null;
    var vals = [];
    for (var i = idx; i < idx + n; i++) vals.push(val(arr[i]));
    vals.sort(function (a, b) { return a - b; });
    var trim = n >= 100 ? Math.round(n * 0.05) : 1;   /* ao100 → 各去 5 个 */
    var dnfs = 0;
    for (var j = 0; j < vals.length; j++) if (vals[j] === INF) dnfs++;
    if (dnfs > trim) return INF;                       /* 有效数据不足 → DNF */
    var kept = vals.slice(trim, n - trim);
    var sum = 0;
    for (var k = 0; k < kept.length; k++) sum += kept[k];
    return sum / kept.length;
  }

  /* 全会话最好的 aoN（跳过 null 与 DNF） */
  function bestAvgN(arr, n) {
    if (!arr || arr.length < n) return null;
    var best = null;
    for (var i = 0; i + n <= arr.length; i++) {
      var a = avgN(arr, n, i);
      if (a == null || a === INF) continue;
      if (best == null || a < best) best = a;
    }
    return best;
  }

  /* ---------- 盲拧口径：meaN（DNF 剔除，不整片作废） ----------
     arr 为「最新在前」；取 arr[idx .. idx+n-1] 窗口，剔除 DNF 后取平均。
     窗口内一次有效成绩都没有 → null（该窗口无参考价值）。
     arr[idx]（最新一次）本身是 DNF 且窗口内无其它有效 → 仍返回平均，
     因为盲拧正是要看「含 DNF 的这段练习」的平均水准。 */
  function meaN(arr, n, idx) {
    idx = idx || 0;
    if (!arr || arr.length < idx + n) return null;
    var sum = 0, cnt = 0;
    for (var i = idx; i < idx + n; i++) {
      var v = val(arr[i]);
      if (v === INF) continue;      /* DNF 直接剔除，不作废整个窗口 */
      sum += v; cnt++;
    }
    return cnt ? sum / cnt : null;
  }

  /* 全会话最好的 meaN（跳过 null） */
  function bestMeaN(arr, n) {
    if (!arr || arr.length < n) return null;
    var best = null;
    for (var i = 0; i + n <= arr.length; i++) {
      var a = meaN(arr, n, i);
      if (a == null) continue;
      if (best == null || a < best) best = a;
    }
    return best;
  }

  /* 成功率：完成（含 +2）/ 总次数；无成绩返回 null */
  function successRate(arr) {
    if (!arr || !arr.length) return null;
    var ok = 0;
    for (var i = 0; i < arr.length; i++) if (val(arr[i]) !== INF) ok++;
    return ok / arr.length;
  }

  /* 滚动成功率：窗口 arr[idx .. idx+n-1] 内完成数 / 窗口长度；
     窗口不满 → null（无从判断）；全 DNF → 0（是有效信息，不作废） */
  function succN(arr, n, idx) {
    idx = idx || 0;
    if (!arr || arr.length < idx + n) return null;
    var ok = 0;
    for (var i = idx; i < idx + n; i++) if (val(arr[i]) !== INF) ok++;
    return ok / n;
  }

  /* ---------- 本组概览 ---------- */
  function sessionStats(arr) {
    arr = arr || [];
    var n = arr.length;
    var best = INF, worst = -INF, sum = 0, valid = 0;
    for (var i = 0; i < n; i++) {
      var v = val(arr[i]);
      if (v === INF) { worst = INF; continue; }        /* 有 DNF → 最差为 DNF */
      if (v < best) best = v;
      if (v > worst) worst = v;
      sum += v; valid++;
    }
    return {
      count: n,
      valid: valid,
      best: best === INF ? null : best,
      worst: worst === -INF || worst === INF ? (n ? worst : null) : worst,
      mean: valid ? sum / valid : null,
      ao5: avgN(arr, 5, 0),
      ao12: avgN(arr, 12, 0),
      ao100: avgN(arr, 100, 0),
      bestAo5: bestAvgN(arr, 5),
      bestAo12: bestAvgN(arr, 12),
      bestAo100: bestAvgN(arr, 100),
      /* 盲拧口径：DNF 不计入但也不作废，成功率单独统计 */
      dnf: n - valid,
      successRate: successRate(arr),
      mea3: meaN(arr, 3, 0),
      mea12: meaN(arr, 12, 0),
      bestMea3: bestMeaN(arr, 3),
      bestMea12: bestMeaN(arr, 12)
    };
  }

  /* ---------- 按自然日聚合（本地时区） ---------- */
  function dayKey(ts) {
    var d = new Date(ts);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  }
  function dayLabel(key) { return key.slice(5); }   /* MM-DD */

  function byDay(arr) {
    var map = {}, order = [];
    for (var i = 0; i < arr.length; i++) {
      var k = dayKey(arr[i].date || Date.now());
      if (!map[k]) { map[k] = { key: k, count: 0, best: INF }; order.push(k); }
      map[k].count++;
      var v = val(arr[i]);
      if (v !== INF && v < map[k].best) map[k].best = v;
    }
    order.sort();
    return order.map(function (k) {
      var g = map[k];
      return { key: k, label: dayLabel(k), count: g.count, best: g.best === INF ? null : g.best };
    });
  }

  /* ---------- SVG 图表 ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var W = 640, H = 220, PAD_L = 44, PAD_R = 14, PAD_T = 16, PAD_B = 34;

  function emptyBox(text) {
    return '<div class="tm-chart__empty">' + escapeHtml(text) + "</div>";
  }

  /* 逐日统计：每天做了多少次（柱状） */
  function dailyChart(arr, maxDays) {
    var days = byDay(arr);
    if (!days.length) return emptyBox("暂无数据");
    maxDays = maxDays || 30;
    if (days.length > maxDays) days = days.slice(days.length - maxDays);
    var maxV = 1;
    days.forEach(function (d) { if (d.count > maxV) maxV = d.count; });

    var iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
    var slot = iw / days.length;
    var bw = Math.max(2, Math.min(26, slot * 0.62));
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" class="tm-svg" role="img" aria-label="逐日练习次数">';
    /* 网格 + y 轴刻度 */
    for (var t = 0; t <= 4; t++) {
      var y = PAD_T + ih - (ih * t / 4);
      s += '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y +
           '" stroke="var(--line)" stroke-width="1"/>';
      s += '<text x="' + (PAD_L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="var(--fg-3)">' +
           Math.round(maxV * t / 4) + "</text>";
    }
    days.forEach(function (d, i) {
      var cx = PAD_L + slot * i + slot / 2;
      var bh = Math.max(1, ih * d.count / maxV);
      var y = PAD_T + ih - bh;
      s += '<rect x="' + (cx - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + bh +
           '" fill="var(--brand)" opacity="0.85"><title>' + d.key + " · " + d.count + " 次" +
           (d.best != null ? " · 最好 " + fmt(d.best) : "") + "</title></rect>";
      s += '<text x="' + cx + '" y="' + (y - 4) + '" text-anchor="middle" font-size="10" fill="var(--fg-3)">' +
           d.count + "</text>";
      /* x 轴标签：稀疏显示，避免拥挤 */
      var step = Math.ceil(days.length / 8);
      if (i % step === 0 || i === days.length - 1) {
        s += '<text x="' + cx + '" y="' + (H - PAD_B + 16) + '" text-anchor="middle" font-size="10" fill="var(--fg-3)">' +
             d.label + "</text>";
      }
    });
    s += "</svg>";
    return s;
  }

  /* 成绩趋势：按时间顺序的折线（DNF 跳过） */
  function trendChart(arr) {
    var chrono = arr.slice().reverse().filter(function (x) { return val(x) !== INF; });
    if (chrono.length < 2) return emptyBox("至少需要 2 次有效成绩");
    var xs = chrono.map(function (x) { return val(x) / 1000; });
    var maxV = Math.max.apply(null, xs), minV = Math.min.apply(null, xs);
    if (maxV === minV) { maxV = minV + 1; }
    var iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
    function px(i) { return PAD_L + (chrono.length === 1 ? 0 : iw * i / (chrono.length - 1)); }
    function py(v) { return PAD_T + ih - ih * (v - minV) / (maxV - minV); }

    var s = '<svg viewBox="0 0 ' + W + " " + H + '" class="tm-svg" role="img" aria-label="成绩趋势">';
    for (var t = 0; t <= 4; t++) {
      var v = minV + (maxV - minV) * t / 4;
      var y = py(v);
      s += '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y +
           '" stroke="var(--line)" stroke-width="1"/>';
      s += '<text x="' + (PAD_L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="var(--fg-3)">' +
           v.toFixed(1) + "</text>";
    }
    var pts = xs.map(function (v, i) { return px(i) + "," + py(v); }).join(" ");
    s += '<polyline points="' + pts + '" fill="none" stroke="var(--brand)" stroke-width="1.6" opacity="0.9"/>';
    xs.forEach(function (v, i) {
      s += '<circle cx="' + px(i) + '" cy="' + py(v) + '" r="2.6" fill="var(--brand)"><title>第 ' + (i + 1) +
           " 次 · " + v.toFixed(2) + "s</title></circle>";
    });
    s += "</svg>";
    return s;
  }

  /* 成绩分布：直方图 */
  function distChart(arr) {
    var xs = arr.map(val).filter(function (v) { return v !== INF; }).map(function (v) { return v / 1000; });
    if (xs.length < 2) return emptyBox("至少需要 2 次有效成绩");
    var minV = Math.min.apply(null, xs), maxV = Math.max.apply(null, xs);
    if (maxV === minV) { maxV = minV + 1; }
    var buckets = 10, counts = new Array(buckets).fill(0), step = (maxV - minV) / buckets;
    xs.forEach(function (v) {
      var b = Math.floor((v - minV) / step);
      if (b >= buckets) b = buckets - 1;
      if (b < 0) b = 0;
      counts[b]++;
    });
    var maxC = Math.max.apply(null, counts);
    var iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
    var bw = iw / buckets;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" class="tm-svg" role="img" aria-label="成绩分布">';
    for (var t = 0; t <= 4; t++) {
      var y = PAD_T + ih - (ih * t / 4);
      s += '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y +
           '" stroke="var(--line)" stroke-width="1"/>';
      s += '<text x="' + (PAD_L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="var(--fg-3)">' +
           Math.round(maxC * t / 4) + "</text>";
    }
    counts.forEach(function (c, i) {
      var bh = Math.max(0, ih * c / maxC);
      var x = PAD_L + bw * i, y = PAD_T + ih - bh;
      var lo = (minV + step * i).toFixed(2), hi = (minV + step * (i + 1)).toFixed(2);
      s += '<rect x="' + (x + 2) + '" y="' + y + '" width="' + Math.max(1, bw - 4) + '" height="' + bh +
           '" fill="var(--violet)" opacity="0.85"><title>' + lo + "–" + hi + "s · " + c + " 次</title></rect>";
      if (c > 0) {
        s += '<text x="' + (x + bw / 2) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="10" fill="var(--fg-3)">' +
             c + "</text>";
      }
    });
    s += '<text x="' + PAD_L + '" y="' + (H - PAD_B + 16) + '" font-size="10" fill="var(--fg-3)">' +
         minV.toFixed(2) + "s</text>";
    s += '<text x="' + (W - PAD_R) + '" y="' + (H - PAD_B + 16) + '" text-anchor="end" font-size="10" fill="var(--fg-3)">' +
         maxV.toFixed(2) + "s</text>";
    s += "</svg>";
    return s;
  }

  root.TimerStats = {
    fmt: fmt, val: val, avgN: avgN, bestAvgN: bestAvgN,
    meaN: meaN, bestMeaN: bestMeaN, successRate: successRate, succN: succN,
    sessionStats: sessionStats, byDay: byDay,
    dailyChart: dailyChart, trendChart: trendChart, distChart: distChart,
    escapeHtml: escapeHtml
  };
})(typeof window !== "undefined" ? window : globalThis);
