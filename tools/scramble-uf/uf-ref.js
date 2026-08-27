/** ur-ref.js - 参考公式下拉面板（跨页共享 uf_ref_selections / uf_ref_style） */
(function () {
  var STYLE_SOURCES = {
    info:      { url: 'edgeAlgToInfo.json',          backup: 'https://blddb.net/assets/json/edgeAlgToInfo.json',          kind: 'list' },
    manmade:   { url: 'edgeAlgToInfoManmade.json',   backup: 'https://blddb.net/assets/json/edgeAlgToInfoManmade.json',   kind: 'manmade' },
    nightmare: { url: 'edgeAlgToNightmare.json',     backup: 'https://blddb.net/assets/json/edgeAlgToNightmare.json',     kind: 'nightmare' }
  };
  var STYLE_STORAGE_KEY = 'uf_ref_style';
  var STORAGE_KEY = 'uf_ref_selections';
  var ORIENTATION_KEY = 'uf-orientation';
  var algCache = {};
  var dataPromises = {};

  // 当前拿法：优先读页面选择器，其次读 localStorage（与 group 页共享键）；默认黄顶红前
  function getCurrentOrientation() {
    try {
      var sel = document.getElementById('orientationSelect');
      if (sel && sel.value) return sel.value;
    } catch (e) {}
    try { return localStorage.getItem(ORIENTATION_KEY) || 'yellow-red'; } catch (e) {}
    return 'yellow-red';
  }
  // 按当前拿法显示公式（存储值始终为白顶绿前基准，显示时才映射）
  function displayAlg(alg) {
    var ori = getCurrentOrientation();
    return (window.mapAlgOrientation && ori !== 'white-green' && alg)
      ? mapAlgOrientation(String(alg), ori) : String(alg);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadStyleData(style) {
    if (algCache[style]) return Promise.resolve(algCache[style]);
    if (!dataPromises[style]) {
      var src = STYLE_SOURCES[style];
      dataPromises[style] = fetch(src.url)
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (json) {
          algCache[style] = json;
          return json;
        })
        .catch(function () {
          dataPromises[style] = null;
          return fetch(src.backup)
            .then(function (r) {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.json();
            })
            .then(function (json) {
              algCache[style] = json;
              return json;
            });
        })
        .catch(function (err) {
          dataPromises[style] = null;
          throw err;
        });
    }
    return dataPromises[style];
  }

  function getCurrentStyle() {
    try { return localStorage.getItem(STYLE_STORAGE_KEY) || 'info'; } catch (e) { return 'info'; }
  }
  function setCurrentStyle(s) {
    try { localStorage.setItem(STYLE_STORAGE_KEY, s); } catch (e) {}
  }

  function getGroupName(entry) {
    var h2 = entry.querySelector('.entry-header h2');
    if (!h2) return '';
    var t = h2.textContent.trim();
    var m = t.match(/^([A-Za-z]+)组/);
    return m ? m[1] : t;
  }

  function loadSelections() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function saveSelections(selections) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selections)); }
    catch (e) {}
  }

  function buildAlgItems(style, code, data) {
    var key = 'G' + code;
    var items = [];
    if (style === 'manmade') {
      var man = data[key];
      if (Array.isArray(man)) {
        man.forEach(function (pair) {
          var algList = (pair && pair[0]) ? pair[0] : [];
          var srcList = (pair && pair[1]) ? pair[1] : [];
          algList.forEach(function (alg, idx) {
            items.push({ text: String(alg), source: srcList[idx] ? String(srcList[idx]) : '' });
          });
        });
      }
      return items;
    }
    if (style === 'nightmare') {
      var nmMap = algCache['nightmare'];
      var nm = nmMap ? nmMap[key] : undefined;
      var infoData = algCache['info'];
      var base = (infoData && Array.isArray(infoData[key])) ? infoData[key] : [];
      base.forEach(function (alg) {
        items.push({ text: String(alg), marked: typeof nm === 'string' && nm === alg });
      });
      return items;
    }
    var list = data[key];
    if (Array.isArray(list)) {
      list.forEach(function (alg) { items.push({ text: String(alg) }); });
    }
    return items;
  }

  function renderPanel(btn, panel) {
    var style = getCurrentStyle();
    panel.innerHTML = '<div class="ref-loading">加载中…</div>';
    var entry = btn.closest('.entry');
    var codes = [];
    var tags = entry.querySelectorAll('.order-tag');
    Array.prototype.forEach.call(tags, function (t) {
      var c = t.textContent.trim();
      if (c) codes.push(c);
    });
    var group = getGroupName(entry);
    var dataPromise = (style === 'nightmare')
      ? loadStyleData('nightmare').then(function () { return loadStyleData('info'); })
      : loadStyleData(style);
    dataPromise.then(function (data) {
      var selections = loadSelections();
      var groupSel = selections[group] || {};
      var html = '<div class="ref-style-bar">'
        + '<span class="ref-style-label">公式风格</span>'
        + '<select class="ref-style-select" data-style-select="1">'
        + '<option value="info"' + (style === 'info' ? ' selected' : '') + '>标准</option>'
        + '<option value="manmade"' + (style === 'manmade' ? ' selected' : '') + '>人造</option>'
        + '<option value="nightmare"' + (style === 'nightmare' ? ' selected' : '') + '>噩梦</option>'
        + '</select>'
        + '<span class="ref-style-hint">切换风格后公式列表自动更新，已选参考公式保持不变</span>'
        + '</div>';
      html += '<div class="ref-table">';
      codes.forEach(function (code) {
        var items = buildAlgItems(style, code, data);
        var saved = groupSel[code] || '';
        html += '<div class="ref-row">';
        html += '<div class="ref-code-col">' + escapeHtml(code) + '</div>';
        html += '<div class="ref-sel-col">';
        html += '<button type="button" class="ref-sel-box' + (saved ? ' ref-selected' : '') + '" data-code="' + code + '">' + (saved ? escapeHtml(displayAlg(saved)) : '点击选择公式') + '</button>';
        html += '<div class="ref-dropdown" data-code="' + code + '">';
        items.forEach(function (item, idx) {
          var cls = 'ref-opt' + (idx >= 5 ? ' ref-hidden' : '');
          if (item.marked) cls += ' ref-opt-marked';
          var label = escapeHtml(displayAlg(item.text));
          if (item.source) label += '<span class="ref-opt-src">（' + escapeHtml(item.source) + '）</span>';
          html += '<button type="button" class="' + cls + '" data-alg="' + escapeHtml(item.text) + '">' + label + '</button>';
        });
        if (items.length > 5) {
          html += '<button type="button" class="ref-more-btn">展开更多（共 ' + items.length + ' 条）</button>';
        }
        html += '<button type="button" class="ref-manual-btn" data-code="' + code + '">✎ 手动输入公式…</button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
      panel.innerHTML = html;
      panel.setAttribute('data-loaded', '1');
      bindRefEvents(entry, group);
    }).catch(function (err) {
      panel.innerHTML = '<div class="ref-error">公式数据加载失败：' + escapeHtml(err.message) + '，请稍后重试。</div>';
    });
  }

  function closeAllDropdowns(entry) {
    var dds = entry.querySelectorAll('.ref-dropdown.open');
    Array.prototype.forEach.call(dds, function (d) { d.classList.remove('open'); });
  }

  function manualInput(entry, group, code) {
    var box = entry.querySelector('.ref-sel-box[data-code="' + code + '"]');
    var current = box ? box.textContent : '';
    var input = prompt('输入该编码的参考公式（公式库没有时可手动填写）：', current === '点击选择公式' ? '' : current);
    if (input === null) return;
    var alg = input.trim();
    if (!alg) return;
    // 用户输入为当前拿法坐标，存储时逆映射回白顶绿前基准
    var ori = getCurrentOrientation();
    var stored = (window.mapAlgOrientation && ori !== 'white-green')
      ? mapAlgOrientation(alg, ori) : alg;
    if (box) {
      box.textContent = displayAlg(stored);
      box.classList.add('ref-selected');
    }
    closeAllDropdowns(entry);
    var selections = loadSelections();
    if (!selections[group]) selections[group] = {};
    selections[group][code] = stored;
    saveSelections(selections);
  }

  function bindRefEvents(entry, group) {
    var styleSel = entry.querySelector('.ref-style-select');
    if (styleSel) {
      styleSel.addEventListener('change', function () {
        setCurrentStyle(styleSel.value);
        var panel = entry.querySelector('.ref-panel');
        var btn = entry.querySelector('.ref-toggle');
        if (panel && btn) renderPanel(btn, panel);
      });
    }
    var selBoxes = entry.querySelectorAll('.ref-sel-box');
    Array.prototype.forEach.call(selBoxes, function (box) {
      box.addEventListener('click', function (e) {
        e.stopPropagation();
        closeAllDropdowns(entry);
        var dd = entry.querySelector('.ref-dropdown[data-code="' + box.getAttribute('data-code') + '"]');
        if (!dd) return;
        dd.classList.toggle('open');
      });
    });
    var opts = entry.querySelectorAll('.ref-opt');
    Array.prototype.forEach.call(opts, function (opt) {
      opt.addEventListener('click', function (e) {
        e.stopPropagation();
        var code = opt.parentElement.getAttribute('data-code');
        var alg = opt.getAttribute('data-alg');
        var box = entry.querySelector('.ref-sel-box[data-code="' + code + '"]');
        if (box) {
          box.textContent = displayAlg(alg);
          box.classList.add('ref-selected');
        }
        closeAllDropdowns(entry);
        var selections = loadSelections();
        if (!selections[group]) selections[group] = {};
        selections[group][code] = alg;
        saveSelections(selections);
      });
    });
    var manualBtns = entry.querySelectorAll('.ref-manual-btn');
    Array.prototype.forEach.call(manualBtns, function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        manualInput(entry, group, btn.getAttribute('data-code'));
      });
    });
    var moreBtns = entry.querySelectorAll('.ref-more-btn');
    Array.prototype.forEach.call(moreBtns, function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var dd = btn.parentElement;
        var hidden = dd.querySelectorAll('.ref-opt.ref-hidden');
        Array.prototype.forEach.call(hidden, function (h) { h.classList.remove('ref-hidden'); });
        btn.style.display = 'none';
      });
    });
  }

  document.addEventListener('click', function () {
    var entries = document.querySelectorAll('.entry');
    Array.prototype.forEach.call(entries, function (en) { closeAllDropdowns(en); });
  });

  var toggles = document.querySelectorAll('.ref-toggle');
  Array.prototype.forEach.call(toggles, function (btn) {
    btn.addEventListener('click', function () {
      var panel = btn.nextElementSibling;
      var isOpen = panel.style.display !== 'none';
      if (isOpen) {
        panel.style.display = 'none';
        return;
      }
      panel.style.display = 'block';
      if (panel.getAttribute('data-loaded') !== '1') {
        renderPanel(btn, panel);
      }
    });
  });

  // 拿法切换后，若参考面板已打开则按新拿法重绘
  var oriSelect = document.getElementById('orientationSelect');
  if (oriSelect) {
    oriSelect.addEventListener('change', function () {
      Array.prototype.forEach.call(toggles, function (btn) {
        var panel = btn.nextElementSibling;
        if (panel && panel.style.display !== 'none') {
          renderPanel(btn, panel);
        }
      });
    });
  }
})();
