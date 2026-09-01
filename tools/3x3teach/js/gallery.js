/* 原课件图库：筛选 + 网格 + 灯箱。依赖 window.COURSEWARE（courseware-data.js）。 */
(function () {
  "use strict";
  var DATA = (window.COURSEWARE && window.COURSEWARE.lessons) || [];
  var filtersEl = document.getElementById("gFilters");
  var gridEl = document.getElementById("gGrid");
  var searchEl = document.getElementById("gSearch");
  var lb = document.getElementById("gLightbox");
  var lbImg = document.getElementById("gLbImg");
  var lbCap = document.getElementById("gLbCap");
  var lbCount = document.getElementById("gLbCount");

  var activeLesson = "all";
  var currentList = [];
  var currentIndex = 0;

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // 构建筛选器（全部 + 各课）
  var allBtn = document.createElement("button");
  allBtn.className = "g-filter active";
  allBtn.textContent = "全部";
  allBtn.dataset.lesson = "all";
  filtersEl.appendChild(allBtn);
  DATA.forEach(function (les) {
    var b = document.createElement("button");
    b.className = "g-filter";
    b.textContent = "第" + les.id + "课";
    b.dataset.lesson = String(les.id);
    b.title = les.title || "";
    filtersEl.appendChild(b);
  });
  filtersEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".g-filter");
    if (!btn) return;
    activeLesson = btn.dataset.lesson;
    Array.prototype.forEach.call(filtersEl.children, function (c) {
      c.classList.toggle("active", c === btn);
    });
    renderGrid();
  });

  function buildList() {
    var list = [];
    DATA.forEach(function (les) {
      (les.pages || []).forEach(function (im) {
        list.push({
          src: im.src,
          caption: im.caption || "",
          slide: im.page,
          lessonId: les.id,
          lessonTitle: les.title || "",
        });
      });
    });
    if (activeLesson !== "all") {
      list = list.filter(function (im) {
        return String(im.lessonId) === activeLesson;
      });
    }
    var q = (searchEl.value || "").trim();
    if (q) {
      list = list.filter(function (im) {
        return (im.caption || "").indexOf(q) >= 0;
      });
    }
    return list;
  }

  function renderGrid() {
    currentList = buildList();
    gridEl.innerHTML = "";
    if (currentList.length === 0) {
      gridEl.innerHTML =
        '<p style="color:var(--ink-soft);padding:24px;">没有匹配的图片，换个关键词试试。</p>';
      return;
    }
    currentList.forEach(function (im, i) {
      var card = document.createElement("div");
      card.className = "g-card";
      card.innerHTML =
        '<div class="g-thumb"><img loading="lazy" src="' +
        im.src +
        '" alt="' +
        escapeHtml(im.caption) +
        '"></div>' +
        '<div class="g-cap">' +
        escapeHtml(im.caption || "（无说明）") +
        "</div>" +
        '<span class="g-slide">第' +
        im.lessonId +
        "课 · 原第 " +
        im.page +
        " 页</span>";
      card.addEventListener("click", function () {
        openLightbox(i);
      });
      gridEl.appendChild(card);
    });
  }

  function openLightbox(i) {
    currentIndex = i;
    showLb();
    lb.classList.add("open");
  }
  function showLb() {
    var im = currentList[currentIndex];
    if (!im) return;
    lbImg.src = im.src;
    lbImg.alt = im.caption || "";
    lbCap.textContent =
      "第" + im.lessonId + "课 · 原第 " + im.page + " 页 · " + (im.caption || "");
    lbCount.textContent = currentIndex + 1 + " / " + currentList.length;
  }
  function closeLb() {
    lb.classList.remove("open");
  }
  function step(d) {
    if (!currentList.length) return;
    currentIndex = (currentIndex + d + currentList.length) % currentList.length;
    showLb();
  }

  document.getElementById("gLbClose").addEventListener("click", closeLb);
  document.getElementById("gLbPrev").addEventListener("click", function () {
    step(-1);
  });
  document.getElementById("gLbNext").addEventListener("click", function () {
    step(1);
  });
  lb.addEventListener("click", function (e) {
    if (e.target === lb || e.target.classList.contains("g-lb-stage")) closeLb();
  });
  document.addEventListener("keydown", function (e) {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") closeLb();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  searchEl.addEventListener("input", renderGrid);

  function togglePresent() {
    document.body.classList.toggle("g-present");
    var on = document.body.classList.contains("g-present");
    document.getElementById("btnPresent").textContent = on ? "退出投影" : "投影模式";
    if (on && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {});
    } else if (!on && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
  }
  document.getElementById("btnPresent").addEventListener("click", togglePresent);
  var bp = document.getElementById("btnPresent2");
  if (bp) bp.addEventListener("click", togglePresent);

  renderGrid();
})();
