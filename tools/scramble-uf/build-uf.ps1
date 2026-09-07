# build-uf.ps1 - 重新生成 scramble-uf 子页与总览页（数据源内嵌）
# 用法: powershell -ExecutionPolicy Bypass -File build-groups.ps1
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

$groups = @(
    @{ index='1'; name='C组棱练习'; formula='R2 U R2 D2 U B2 L2 B2 U'' R2 B2 U'' L'' B R B'' F D'' F'' L R2'; codes=@('CE','CF','CI','CJ','CK','CL','CM','CN','CO','CP','CQ','CR','CS','CT','CW','CX','CY','CZ') }
    @{ index='2'; name='D组棱练习'; formula='D'' B L'' F B'' U F L B2 D2 F2 L B2 L F2 D2 F2 R U2 D'''; codes=@('DE','DF','DI','DJ','DK','DL','DM','DN','DO','DP','DQ','DR','DS','DT','DW','DX','DY','DZ') }
    @{ index='3'; name='E组棱练习'; formula='F'' U F'' B L'' B F2 L F2 L B2 D2 B2 R B2 R B2 U2'; codes=@('EC','ED','EI','EJ','EK','EL','EM','EN','EO','EP','EQ','ER','ES','ET','EW','EX','EY','EZ') }
    @{ index='4'; name='F组棱练习'; formula='F2 L'' D2 U2 L F2 L U2 L2 D2 R2 B'' U B'' L'' F2 D'' B'' D'''; codes=@('FC','FD','FI','FJ','FK','FL','FM','FN','FO','FP','FQ','FR','FS','FT','FW','FX','FY','FZ') }
    @{ index='7'; name='I组棱练习'; formula='R B'' U'' R2 L2 D F U2 F2 L U2 D2 L'' F2 R2 U2 F2 U2 L'; codes=@('IC','ID','IE','IF','IK','IL','IM','IN','IO','IP','IQ','IR','IS','IT','IW','IX','IY','IZ') }
    @{ index='8'; name='J组棱练习'; formula='F'' U'' R'' L F R L'' F2 L2 B R2 U2 L2 B D2 L2 F'' U2 D2'; codes=@('JC','JD','JE','JF','JK','JL','JM','JN','JO','JP','JQ','JR','JS','JT','JW','JX','JY','JZ') }
    @{ index='9'; name='K组棱练习'; formula='U2 B2 R'' U2 B2 R D2 U2 R2 D2 F2 L'' B'' U B U'' R U F2 D'; codes=@('KC','KD','KE','KF','KI','KJ','KM','KN','KO','KP','KQ','KR','KS','KT','KW','KX','KY','KZ') }
    @{ index='10'; name='L组棱练习'; formula='B'' D2 L'' U2 F2 L'' B2 F2 L U2 R D2 R'' B'' L D L R2 U B D2'; codes=@('LC','LD','LE','LF','LI','LJ','LM','LN','LO','LP','LQ','LR','LS','LT','LW','LX','LY','LZ') }
    @{ index='11'; name='M组棱练习'; formula='B2 F2 D B2 U B2 U R2 U L2 B2 F2 L'' B'' U'' B'' L'' B U'' F2 R'''; codes=@('MC','MD','ME','MF','MI','MJ','MK','ML','MO','MP','MQ','MR','MS','MT','MW','MX','MY','MZ') }
    @{ index='12'; name='N组棱练习'; formula='U2 L'' D2 U2 B2 D2 F2 L'' U2 B'' U B2 F2 U'' L'' D'' U'; codes=@('NC','ND','NE','NF','NI','NJ','NK','NL','NO','NP','NQ','NR','NS','NT','NW','NX','NY','NZ') }
    @{ index='13'; name='O组棱练习'; formula='L'' U R'' L F'' L F R2 U2 R B2 U2 B2 L F2 D2 R2 D2 U'; codes=@('OC','OD','OE','OF','OI','OJ','OK','OL','OM','ON','OQ','OR','OS','OT','OW','OX','OY','OZ') }
    @{ index='14'; name='P组棱练习'; formula='F D L2 R2 B'' L2 B2 U2 L2 B F U2 R2 F'' U'' F'' L'' B F'' D'' U2'; codes=@('PC','PD','PE','PF','PI','PJ','PK','PL','PM','PN','PQ','PR','PS','PT','PW','PX','PY','PZ') }
    @{ index='15'; name='Q组棱练习'; formula='F2 U B2 F2 U B2 D'' U'' B2 L2 U2 R2 B D B'' D2 U2 B R'' B'''; codes=@('QC','QD','QE','QF','QI','QJ','QK','QL','QM','QN','QO','QP','QS','QT','QW','QX','QY','QZ') }
    @{ index='16'; name='R组棱练习'; formula='U F2 L2 B2 R'' U2 B2 D2 L F2 L2 R2 B'' D'' U'' F2 U2 R'' D'; codes=@('RC','RD','RE','RF','RI','RJ','RK','RL','RM','RN','RO','RP','RS','RT','RW','RX','RY','RZ') }
    @{ index='17'; name='S组棱练习'; formula='U'' B2 D2 U2 B L2 D2 U2 F'' L2 R2 B2 F'' L'' B'' U B D2 R B'; codes=@('SC','SD','SE','SF','SI','SJ','SK','SL','SM','SN','SO','SP','SQ','SR','SW','SX','SY','SZ') }
    @{ index='18'; name='T组棱练习'; formula='U'' B2 L'' U2 F2 D2 L'' B2 L R F2 U2 F2 B'' D U'' L B2 D'' U2'; codes=@('TC','TD','TE','TF','TI','TJ','TK','TL','TM','TN','TO','TP','TQ','TR','TW','TX','TY','TZ') }
    @{ index='19'; name='W组棱练习'; formula='D F U F'' B L'' B F2 L F2 D2 R B2 U2 B2 L B2 R'' U2 D'; codes=@('WC','WD','WE','WF','WI','WJ','WK','WL','WM','WN','WO','WP','WQ','WR','WS','WT','WY','WZ') }
    @{ index='20'; name='X组棱练习'; formula='U B2 R2 U2 R D2 L R'' U2 F2 R B2 F D U'' R'' B2 R2 D'; codes=@('XC','XD','XE','XF','XI','XJ','XK','XL','XM','XN','XO','XP','XQ','XR','XS','XT','XY','XZ') }
    @{ index='21'; name='Y组棱练习'; formula='D'' L'' F'' B U F L U B2 R2 F2 D'' B2 U D F2 L2 U2 B'; codes=@('YC','YD','YE','YF','YI','YJ','YK','YL','YM','YN','YO','YP','YQ','YR','YS','YT','YW','YX') }
    @{ index='22'; name='Z组棱练习'; formula='D2 U L'' B2 D2 F2 R F2 L2 U2 R2 U2 F'' D U'' R'' B2 R2 D'; codes=@('ZC','ZD','ZE','ZF','ZI','ZJ','ZK','ZL','ZM','ZN','ZO','ZP','ZQ','ZR','ZS','ZT','ZW','ZX') }
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
<link rel="stylesheet" href="uf-common.css">
<link rel="stylesheet" href="/assets/css/site-nav.css">
</head>
<body data-nav="scramble-uf">
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
  <h1>UF缓冲公式连拧专项训练</h1>
  <div class="sub">选择你的拿法坐标系进行打乱，按练习顺序做完UF缓冲复原公式，魔方恢复复原状态。</div>
</div>
<a class="back-link" href="index.html">← 返回训练组总览</a>
<div class="orientation-selector">
  <span class="orientation-label">打乱/复原拿法坐标系</span>
  <select id="orientationSelect">
    <option value="white-green">白顶绿前</option>
    <option value="yellow-red" selected>黄顶红前（默认）</option>
    <option value="yellow-blue">黄顶蓝前</option>
    <option value="yellow-green">黄顶绿前</option>
    <option value="yellow-orange">黄顶橘前</option>
  </select>
  <span class="orientation-hint">按所选拿法坐标系打乱，按练习顺序做完复原公式，魔方恢复复原状态。</span>
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
    if (typeof drawScrambleNet === 'undefined') return;
    if (cvs) {
      cvs.setAttribute('data-orientation', ori);
      try { drawScrambleNet(baseAlg, cvs, ori); } catch (e) {}
    }
    if (codeEl) { codeEl.textContent = baseAlg; }
  }
  try {
    var saved = localStorage.getItem('uf-orientation');
    if (saved && valid.indexOf(saved) >= 0) { sel.value = saved; }
  } catch (e) {}
  applyOri(sel.value);
  sel.addEventListener('change', function () {
    applyOri(sel.value);
    try { localStorage.setItem('uf-orientation', sel.value); } catch (e) {}
  });
})();
</script>
<script src="uf-ref.js"></script>
<script src="uf-timer.js"></script>
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
  <h1>UF缓冲公式连拧专项训练</h1>
  <div class="sub">选择你的拿法坐标系进行打乱，按练习顺序做完UF缓冲复原公式，魔方恢复复原状态。点击组卡片进入对应子页训练。</div>
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
  $title = $g.name + ' - UF缓冲公式连拧专项训练'
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

$h = $head.Replace('__TITLE__', 'UF缓冲公式连拧专项训练')
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
