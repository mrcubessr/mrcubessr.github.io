# build-groups.ps1 - 重新生成 scramble-ur 子页与总览页（数据源内嵌）
# 用法: powershell -ExecutionPolicy Bypass -File build-groups.ps1
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

$groups = @(
    @{ index='1'; name='C组棱练习'; formula='R'' S'' R U2 R'' S R U2 R S2 R'' U2 R S2 R'' U2 S R'' E'' R2 E R'' S'' R E'' R2 E R'' S R2 S'' S R E R2 E'' R S'' R'' E R2 E'' R S R2 S'' R S'' R'' U2 R S R'' U2 S'' R2 S'' R S R2 S R'' U2 R'' E'' R U2 R'' E R R2 S R2 S'' R'' B R'' S R2 S'' R'' B'' R U'' M U2 M'' U'' R S R'' U2 R S'' R'' U2 S'' U2 R2 S R2 U2 R F'' R S R2 S'' R F R'' U M'' U2 M U R'' B'' R'' S R2 S'' R'' B R R U'' R S2 R'' U R S2 R2'; codes=@('CE','CF','CI','CJ','CK','CL','CM','CN','CO','CP','CQ','CR','CS','CT','CW','CX','CY','CZ') }
    @{ index='2'; name='D组棱练习'; formula='R'' U2 R S'' R'' U2 R S U M U'' R'' U M'' U'' R E'' R E R'' S R'' S'' R S R B2 R'' S'' R B2 R'' E R'' E'' R S R S'' R'' S R'' F2 R S'' R'' F2 R R U2 R'' S'' R U2 R'' S U M U'' R U M'' U'' R'' D'' S R'' F'' R S'' R'' F R D R'' E'' R S R2 S'' R'' E R'' S R B R'' S'' R B'' R'' U2 R B R'' S R B'' R'' S'' U2 R S'' R S R2 S R'' S'' R R'' F'' R2 S R'' U R S'' R'' U'' R'' F R S R'' F'' R S'' R'' F R U2 R'' F'' R S R'' F R S'' U2 S R B'' R'' S'' R B R'' S U R'' E'' R U'' R'' E R S'''; codes=@('DE','DF','DI','DJ','DK','DL','DM','DN','DO','DP','DQ','DR','DS','DT','DW','DX','DY','DZ') }
    @{ index='3'; name='E组棱练习'; formula='U'' R'' S'' R U'' R'' S R U2 U'' R S2 R'' U'' R S2 R'' U2 U R E'' R'' U'' R E R'' U R'' E2 R U'' R'' E2 R U R'' E R U'' R'' E'' R U R E2 R'' U'' R E2 R'' U'' R S'' R'' U'' R S R'' U2 U R'' U'' R2 U'' R'' U R'' U R U2 R U R'' U R'' E'' R U'' R'' E R U R E'' R2 E R U'' R'' E'' R2 E R'' r'' U R U'' M'' U R'' U'' R S R B'' R2 E'' R2 E B R'' S'' U'' R S R'' U'' R S'' R'' U2 S'' R B'' R'' S R2 S'' R'' B R'' S U'' M'' U'' M U'' M'' U'' M R F R'' U R'' E R U'' R'' E'' R2 F'' R'''; codes=@('EI','EJ','EK','EL','EM','EN','EO','EP','EQ','ER','ES','ET','EW','EX','EY','EZ') }
    @{ index='4'; name='F组棱练习'; formula='S'' U'' R S2 R'' U R S2 R'' S S'' U'' R'' S'' R U R'' S R S U R F R2 E'' R2 E F'' R'' U'' R'' E'' R U R'' E R2 E'' R'' U'' R'' E R S U R E R2 E'' R U'' S'' R'' B'' E R2 E'' R2 B R R'' u R'' E R2 E'' R'' u'' R S'' U'' R S'' R'' U R S R'' S R B'' R'' S'' R B R'' S U S'' R'' F R S R'' F'' R U'' R'' B'' R2 E'' R2 E B R R B R'' U R E'' R'' U'' R E B'' R'' R B'' R S'' R'' B R S R2 R'' B'' R'' S'' R2 S R'' B R D R B'' R'' S'' R B R'' S D'' U R F E R2 E'' R2 F'' R'' U'''; codes=@('FI','FJ','FK','FL','FM','FN','FO','FP','FQ','FR','FS','FT','FW','FX','FY','FZ') }
    @{ index='5'; name='I组棱练习'; formula='D R'' S'' R S R2 S'' R S R D'' U'' M2 U R'' U'' M2 U R S R'' F'' E'' R2 E R2 F R S'' R'' F'' R2 E'' R'' U'' R E R'' U R'' F R R'' E'' R U'' R'' F R U R'' E R U'' R'' F'' R U D R'' E R2 E'' R'' D'' D R S'' R'' S R2 S'' R'' S R'' D'' D U R U'' R'' D'' R'' D R2 U R'' U'' R'' D'' R S R F'' R'' S'' R F R'' R'' F'' R2 E R'' U'' R E'' R'' U R'' F R D'' U'' R'' B'' R S'' R'' B R S D U D R2 S'' R2 S D'' D'' R'' B R S'' R2 S R B'' R D S'' R'' F'' R S R2 S'' R F R S'; codes=@('IK','IL','IM','IN','IO','IP','IQ','IR','IS','IT','IW','IX','IY','IZ') }
    @{ index='6'; name='J组棱练习'; formula='u M'' U'' R U M U'' R'' E U M'' U'' R'' U M U'' R U'' R'' F'' R2 E'' R'' U R E R'' U'' R'' F R U R F'' E'' R2 E R2 F R'' R'' E R S'' R'' F'' R S R'' F E'' R R F'' R'' U M U'' R F R'' U M'' U'' R'' F R E'' R'' F R E R'' F2 R U M'' U'' R U M U'' R'' R'' F'' R S'' R'' F R S R F R'' U M U'' R F'' R'' U M'' U'' D'' U'' R B'' R'' S'' R2 S R'' B R'' D U D U'' S'' R'' B'' R S R'' B R D'' U R'' F'' R'' S'' R F R'' S R2 R F'' R S'' R2 S R F R'''; codes=@('JK','JL','JM','JN','JO','JP','JQ','JR','JS','JT','JW','JX','JY','JZ') }
    @{ index='7'; name='K组棱练习'; formula='U'' B'' R S'' R'' B R S R'' U R2 S R2 S R'' S'' R2 S'' R'' R2 S'' R E'' R2 E R S R2 R E'' R2 E R S'' R2 S R2 R2 S'' R'' E R2 E'' R'' S R2 R'' E R2 E'' R'' S'' R2 S R2 U'' R2 B'' R S'' R'' B R S R U R2 S R2 S R S'' R2 S'' R U'' R'' B'' R S'' R'' B R S U S'' R2 S R2 R'' B R S'' R2 S R B'' R S'' R B R S R2 S'' R B'' R'' S'; codes=@('KM','KN','KO','KP','KQ','KR','KS','KT','KW','KX','KY','KZ') }
    @{ index='8'; name='L组棱练习'; formula='R'' u'' R U R2 S'' R2 S U'' R'' u R R E R S'' R'' S R'' E'' E'' R E R S'' R'' S R'' R E'' R S'' R2 S R E R'' E R'' E'' R'' S'' R S R R'' E R'' S'' R2 S R'' E'' R R u R'' U'' R2 S'' R2 S U R u'' R'' R'' E'' R'' S'' R S R E U'' R B'' R'' S'' R2 S R'' B R'' U R'' E'' R'' S'' R2 S R E R'' R2 S'' R'' B R S R'' B'' R'' D R F'' R S'' R2 S R F R'' D'''; codes=@('LM','LN','LO','LP','LQ','LR','LS','LT','LW','LX','LY','LZ') }
    @{ index='9'; name='M组棱练习'; formula='D'' R'' S'' R S R2 S'' R S R D U M2 U'' R'' U M2 U'' R R'' B'' R2 E'' R'' U R E R'' U'' R'' B R D'' R E'' R2 E R D S R B E R2 E'' R2 B'' R'' S'' D'' R'' E R2 E'' R'' D U'' B'' R2 E'' R2 E B U U R U'' R2 D'' R D R U R'' D'' U'' R'' D R S R'' B R S'' R'' B'' R R'' D R S'' R2 S R D'' R'; codes=@('MO','MP','MQ','MR','MS','MT','MW','MX','MY','MZ') }
    @{ index='10'; name='N组棱练习'; formula='M U'' R'' S'' R U'' R'' S R U2 M'' U'' M U R'' U'' M'' U R D'' U R'' F R2 E'' R2 E F'' R D U'' R'' B R U'' M'' U R'' B'' R U'' M U M U R'' E R U'' R'' E'' r R'' B E R2 E'' R2 B'' R M U'' R S'' R'' U'' R S R'' U2 M'' U'' M U R U'' M'' U R'' R B R'' S'' R B'' R'' S R'' B'' R U'' M'' U R'' B R U'' M U'; codes=@('NO','NP','NQ','NR','NS','NT','NW','NX','NY','NZ') }
    @{ index='11'; name='O组棱练习'; formula='R'' S'' R S R2 S'' R S R U'' R'' U R D R D'' R2 U'' R U R D R'' D'' R2 S'' R E'' R2 E R'' S R E'' R2 E R R2 S'' R'' E R2 E'' R S R'' E R2 E'' R'' R S'' R'' S R2 S'' R'' S R'' U R U'' R'' D'' R'' D R2 U R'' U'' R'' D'' R D'; codes=@('OQ','OR','OS','OT','OW','OX','OY','OZ') }
    @{ index='12'; name='P组棱练习'; formula='U'' R U S U'' R'' U S'' R'' u R U'' R'' E R U R'' U'' R U R'' F R2 E'' R2 E F'' R U'' S'' R B2 R'' S R B2 R'' U'' R B'' R2 E R2 E'' B R'' U S'' R'' F2 R S R'' F2 R U'' R'' U S U'' R U S'' R u'' R'' U R E'' R'' U'' R U R'''; codes=@('PQ','PR','PS','PT','PW','PX','PY','PZ') }
    @{ index='13'; name='Q组棱练习'; formula='u R U'' R'' E R U R'' U'' U2 R S R2 S'' R U2 R U R'' U'' R E'' R'' U R u'' R'' U'' R'' U R E'' R2 E R U'' R U U R'' F'' R E'' R'' F R u'' U'' R'' U R'' E R2 E'' R'' U'' R U'; codes=@('QS','QT','QW','QX','QY','QZ') }
    @{ index='14'; name='R组棱练习'; formula='S'' R S R2 S'' R S U'' R'' U R E R'' U'' R u R S'' R'' S R'' E'' R2 E R'' S'' R S R'' u'' R2 E R U R'' E'' R U'' R u U'' B'' R2 E R2 E'' B U R u'' R'' U R E'' R2 E R U'' R u R'''; codes=@('RS','RT','RW','RX','RY','RZ') }
    @{ index='15'; name='S组棱练习'; formula='S'' R'' S R E R2 E'' R S'' R S U'' R U R E R2 E'' R U'' R'' U U'' R B R'' E'' R B'' R'' E U R E'' R2 E R2 E R2 E'' R'; codes=@('SW','SX','SY','SZ') }
    @{ index='16'; name='T组棱练习'; formula='u'' R'' U R E'' R2 E R U'' R u R'' u'' R U R'' E'' R U'' R'' U R R F R'' U'' R E'' R'' U R E F'' R'' E U R'' F'' R E'' R'' F R U'''; codes=@('TW','TX','TY','TZ') }
    @{ index='17'; name='W组棱练习'; formula='R'' u R U'' R E R2 E'' R U R'' u'' R U'' R U R'' E'' R2 E R'' U'' R'' U'; codes=@('WY','WZ') }
    @{ index='18'; name='X组棱练习'; formula='u'' R'' U R E2 R'' U'' R'' E R2 U U R'' U'' R E'' R'' U R u'''; codes=@('XY','XZ') }
)
$nav = @'
<nav class="site-nav" id="siteNav">
  <div class="nav-inner">
    <a class="nav-logo" href="/">魔方先生SSR魔方训练中心</a>
    <button class="nav-toggle-btn" id="navToggle" aria-label="菜单" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-links" id="navLinks">
      <a href="/" class="nav-link" data-nav="home">首页</a>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="tutorial">教程 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/fto" data-nav="fto">FTO</a>
          <a href="/tools/3x3" data-nav="3x3">三阶</a>
          <a class="nav-soon" title="即将上线">二阶</a>
          <a class="nav-soon" title="即将上线">金字塔</a>
          <a class="nav-soon" title="暂时预留">三盲</a>
        </div>
      </div>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="tools">个人训练工具 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/tools/scramble-ur" data-nav="scramble-ur">UR公式训练</a>
          <a href="/tools/scramble-uf" data-nav="scramble-uf">UF公式训练</a>
          <a href="/tools/bldtrainer" data-nav="bldtrainer">读码还原</a>
          <a href="/tools/3bld" data-nav="3bld">出题器</a>
          <a href="/tools/2x2" data-nav="2x2">二阶练习</a>
          <a href="/tools/kmap" data-nav="kmap">知识地图</a>
          <a href="/tools/invert" data-nav="invert">逆序转换</a>
          <a href="/tools/practice" data-nav="practice">练习纸生成</a>
        </div>
      </div>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="links">外链 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/tools/nav" data-nav="nav">工具导航</a>
        </div>
      </div>
    </div>
  </div>
</nav>
'@

$footer = @'
<div class="footer">
  制作人：B站博主：魔方先生SSR　WCAID : 2009ZHAN24<br>抖音ID : 魔方总动员
</div>
'@

$head = @'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<link rel="stylesheet" href="ur-common.css">
<link rel="stylesheet" href="/assets/css/site-nav.css">
</head>
<body data-nav="scramble-ur">
'@

$pageTemplate = @'
__HEAD__
<nav class="site-nav" id="siteNav">
  <div class="nav-inner">
    <a class="nav-logo" href="/">魔方先生SSR魔方训练中心</a>
    <button class="nav-toggle-btn" id="navToggle" aria-label="菜单" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-links" id="navLinks">
      <a href="/" class="nav-link" data-nav="home">首页</a>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="tutorial">教程 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/fto" data-nav="fto">FTO</a>
          <a href="/tools/3x3" data-nav="3x3">三阶</a>
          <a class="nav-soon" title="即将上线">二阶</a>
          <a class="nav-soon" title="即将上线">金字塔</a>
          <a class="nav-soon" title="暂时预留">三盲</a>
        </div>
      </div>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="tools">个人训练工具 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/tools/scramble-ur" data-nav="scramble-ur">UR公式训练</a>
          <a href="/tools/scramble-uf" data-nav="scramble-uf">UF公式训练</a>
          <a href="/tools/3bld" data-nav="3bld">出题器</a>
          <a href="/tools/2x2" data-nav="2x2">二阶练习</a>
          <a href="/tools/kmap" data-nav="kmap">知识地图</a>
          <a href="/tools/invert" data-nav="invert">逆序转换</a>
          <a href="/tools/practice" data-nav="practice">练习纸生成</a>
        </div>
      </div>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="links">外链 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/tools/nav" data-nav="nav">工具导航</a>
        </div>
      </div>
    </div>
  </div>
</nav>

<div class="header">
  <h1>UR缓冲公式连拧专项训练</h1>
  <div class="sub">白顶绿前打乱，打乱之后按照顺序做UR缓冲的复原公式，按照顺序做完，魔方会是复原状态。</div>
</div>
<a class="back-link" href="index.html">← 返回训练组总览</a>
<div class="orientation-selector">
  <span class="orientation-label">复原拿法坐标系</span>
  <select id="orientationSelect">
    <option value="white-green">白顶绿前</option>
    <option value="yellow-red" selected>黄顶红前（默认）</option>
    <option value="yellow-blue">黄顶蓝前</option>
    <option value="yellow-green">黄顶绿前</option>
    <option value="yellow-orange">黄顶橘前</option>
  </select>
  <span class="orientation-hint">打乱公式、展开图与参考复原公式均按所选拿法坐标系显示（物理效果等价于白顶绿前打乱）；按所选拿法下的复原公式做完，魔方恢复复原状态。</span>
</div>
<div class="entries">
  <div class="entry single">
    <div class="entry-header">
      <span class="index">__IDX__</span>
      <h2>__NAME__</h2>
    </div>
    <div class="entry-body">
      <div class="diagram">
        <canvas class="ur-cube" data-formula="__FORMULA__" data-orientation="white-green"></canvas>
      </div>
      <div class="info-panel">
        <div class="formula-block">
          <span class="label">打乱公式</span>
          <code id="scramble-formula">__FORMULA__</code>
        </div>
        <div>
          <span class="label">练习顺序</span>
        </div>
        <div class="order-list">
          __ORDER__
        </div>
        <div class="timer-block" id="timer-group" data-group="__LETTER__">
          <span class="label">计时器</span>
        </div>
      </div>
    </div>
    <div class="ref-formula">
      <button type="button" class="ref-toggle">参考公式</button>
      <div class="ref-panel" style="display:none;"></div>
    </div>
  </div>
</div>

__FOOTER__
<script src="/assets/js/site-nav.js"></script>
<script src="/assets/js/cube-net.js"></script>
<script>
(function () {
  var sel = document.getElementById('orientationSelect');
  if (!sel) return;
  var cvs = document.querySelector('.ur-cube');
  var codeEl = document.getElementById('scramble-formula');
  var baseAlg = cvs ? (cvs.getAttribute('data-formula') || '') : '';
  var valid = ['white-green', 'yellow-red', 'yellow-blue', 'yellow-green', 'yellow-orange'];
  function applyOri(ori) {
    if (typeof mapAlgOrientation === 'undefined') return;
    if (cvs) {
      cvs.setAttribute('data-orientation', ori);
      if (typeof drawScrambleNet === 'function') {
        try { drawScrambleNet(baseAlg, cvs, ori); } catch (e) {}
      }
    }
    if (codeEl) {
      codeEl.textContent = (ori === 'white-green') ? baseAlg : mapAlgOrientation(baseAlg, ori);
    }
  }
  try {
    var saved = localStorage.getItem('ur-orientation');
    if (saved && valid.indexOf(saved) >= 0) { sel.value = saved; }
  } catch (e) {}
  applyOri(sel.value);
  sel.addEventListener('change', function () {
    applyOri(sel.value);
    try { localStorage.setItem('ur-orientation', sel.value); } catch (e) {}
  });
})();
</script>
<script src="ur-ref.js"></script>
<script src="ur-timer.js"></script>
</body>
</html>
'@

$indexTemplate = @'
__HEAD__
<nav class="site-nav" id="siteNav">
  <div class="nav-inner">
    <a class="nav-logo" href="/">魔方先生SSR魔方训练中心</a>
    <button class="nav-toggle-btn" id="navToggle" aria-label="菜单" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-links" id="navLinks">
      <a href="/" class="nav-link" data-nav="home">首页</a>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="tutorial">教程 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/fto" data-nav="fto">FTO</a>
          <a href="/tools/3x3" data-nav="3x3">三阶</a>
          <a class="nav-soon" title="即将上线">二阶</a>
          <a class="nav-soon" title="即将上线">金字塔</a>
          <a class="nav-soon" title="暂时预留">三盲</a>
        </div>
      </div>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="tools">个人训练工具 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/tools/scramble-ur" data-nav="scramble-ur">UR公式训练</a>
          <a href="/tools/scramble-uf" data-nav="scramble-uf">UF公式训练</a>
          <a href="/tools/3bld" data-nav="3bld">出题器</a>
          <a href="/tools/2x2" data-nav="2x2">二阶练习</a>
          <a href="/tools/kmap" data-nav="kmap">知识地图</a>
          <a href="/tools/invert" data-nav="invert">逆序转换</a>
          <a href="/tools/practice" data-nav="practice">练习纸生成</a>
        </div>
      </div>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="links">外链 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/tools/nav" data-nav="nav">工具导航</a>
        </div>
      </div>
    </div>
  </div>
</nav>

<div class="header">
  <h1>UR缓冲公式连拧专项训练</h1>
  <div class="sub">白顶绿前打乱，打乱之后按照顺序做UR缓冲的复原公式，按照顺序做完，魔方会是复原状态。点击组卡片进入对应子页训练。</div>
</div>
<div class="entries">
  <div class="group-grid">
__CARDS__
  </div>
</div>

__FOOTER__
<script src="/assets/js/site-nav.js"></script>
</body>
</html>
'@

$cardTemplate = @'
<a class="group-card" href="__FILE__">
  <span class="card-index">__IDX__</span>
  <div class="card-name">__NAME__</div>
  <div class="card-tags">__TAGS__</div>
</a>
'@

function New-GroupOrder($codes) {
  $parts = @()
  for ($i = 0; $i -lt $codes.Count; $i++) {
    if ($i -gt 0) { $parts += '<span class="arrow">→</span>' }
    $cls = if ($i -eq 0) { 'order-tag current' } else { 'order-tag' }
    $parts += ('<span class="' + $cls + '">' + $codes[$i] + '</span>')
  }
  return ($parts -join "`n          ")
}

$cards = @()
foreach ($g in $groups) {
  $letter = ($g.name -replace '^([A-Z]+)组.*$', '$1')
  $file = 'group-' + $letter + '.html'
  $order = New-GroupOrder $g.codes
  $title = $g.name + ' - UR缓冲公式连拧专项训练'
  $h = $head.Replace('__TITLE__', $title)
  $page = $pageTemplate.Replace('__HEAD__', $h)
  $page = $page.Replace('<nav class="site-nav" id="siteNav">
  <div class="nav-inner">
    <a class="nav-logo" href="/">魔方先生SSR魔方训练中心</a>
    <button class="nav-toggle-btn" id="navToggle" aria-label="菜单" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-links" id="navLinks">
      <a href="/" class="nav-link" data-nav="home">首页</a>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="tutorial">教程 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/fto" data-nav="fto">FTO</a>
          <a href="/tools/3x3" data-nav="3x3">三阶</a>
          <a class="nav-soon" title="即将上线">二阶</a>
          <a class="nav-soon" title="即将上线">金字塔</a>
          <a class="nav-soon" title="暂时预留">三盲</a>
        </div>
      </div>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="tools">个人训练工具 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/tools/scramble-ur" data-nav="scramble-ur">UR公式训练</a>
          <a href="/tools/scramble-uf" data-nav="scramble-uf">UF公式训练</a>
          <a href="/tools/3bld" data-nav="3bld">出题器</a>
          <a href="/tools/2x2" data-nav="2x2">二阶练习</a>
          <a href="/tools/kmap" data-nav="kmap">知识地图</a>
          <a href="/tools/invert" data-nav="invert">逆序转换</a>
          <a href="/tools/practice" data-nav="practice">练习纸生成</a>
        </div>
      </div>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="links">外链 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/tools/nav" data-nav="nav">工具导航</a>
        </div>
      </div>
    </div>
  </div>
</nav>', $nav)
  $page = $page.Replace('__FOOTER__', $footer)
  $page = $page.Replace('__IDX__', $g.index)
  $page = $page.Replace('__NAME__', $g.name)
  $page = $page.Replace('__FORMULA__', $g.formula)
  $page = $page.Replace('__LETTER__', $letter)
  $page = $page.Replace('__ORDER__', $order)
  Set-Content -Path (Join-Path $dir $file) -Value $page -Encoding UTF8
  Write-Host ("generated " + $file)

  $card = $cardTemplate.Replace('__FILE__', $file)
  $card = $card.Replace('__IDX__', $g.index)
  $card = $card.Replace('__NAME__', $g.name)
  $card = $card.Replace('__TAGS__', ($g.codes -join ' '))
  $cards += $card
}

$h = $head.Replace('__TITLE__', 'UR缓冲公式连拧专项训练')
$index = $indexTemplate.Replace('__HEAD__', $h)
$index = $index.Replace('<nav class="site-nav" id="siteNav">
  <div class="nav-inner">
    <a class="nav-logo" href="/">魔方先生SSR魔方训练中心</a>
    <button class="nav-toggle-btn" id="navToggle" aria-label="菜单" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-links" id="navLinks">
      <a href="/" class="nav-link" data-nav="home">首页</a>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="tutorial">教程 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/fto" data-nav="fto">FTO</a>
          <a href="/tools/3x3" data-nav="3x3">三阶</a>
          <a class="nav-soon" title="即将上线">二阶</a>
          <a class="nav-soon" title="即将上线">金字塔</a>
          <a class="nav-soon" title="暂时预留">三盲</a>
        </div>
      </div>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="tools">个人训练工具 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/tools/scramble-ur" data-nav="scramble-ur">UR公式训练</a>
          <a href="/tools/scramble-uf" data-nav="scramble-uf">UF公式训练</a>
          <a href="/tools/3bld" data-nav="3bld">出题器</a>
          <a href="/tools/2x2" data-nav="2x2">二阶练习</a>
          <a href="/tools/kmap" data-nav="kmap">知识地图</a>
          <a href="/tools/invert" data-nav="invert">逆序转换</a>
          <a href="/tools/practice" data-nav="practice">练习纸生成</a>
        </div>
      </div>
      <div class="nav-drop">
        <span class="nav-link nav-drop-toggle" data-nav="links">外链 <span class="caret">▾</span></span>
        <div class="nav-menu">
          <a href="/tools/nav" data-nav="nav">工具导航</a>
        </div>
      </div>
    </div>
  </div>
</nav>', $nav)
$index = $index.Replace('__FOOTER__', $footer)
$index = $index.Replace('__CARDS__', ($cards -join "`n"))
Set-Content -Path (Join-Path $dir 'index.html') -Value $index -Encoding UTF8
Write-Host "generated index.html"
