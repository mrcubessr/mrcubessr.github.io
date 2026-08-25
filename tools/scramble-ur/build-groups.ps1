# build-groups.ps1 - 重新生成 scramble-ur 子页与总览页（数据源内嵌）
# 用法: powershell -ExecutionPolicy Bypass -File build-groups.ps1
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

$groups = @(
    @{ index='1'; name='C组棱练习'; formula='D L2 B2 L2 D U B2 L2 F'' L F'' R'' F2 D'' R'' D L U'''; codes=@('CE','CF','CI','CJ','CK','CL','CM','CN','CO','CP','CQ','CR','CS','CT','CW','CX','CY','CZ') }
    @{ index='2'; name='D组棱练习'; formula='B2 U'' F2 D2 R2 D R2 F2 L2 U'' F R2 U'' B D'' L'' D U L'' B'; codes=@('DE','DF','DI','DJ','DK','DL','DM','DN','DO','DP','DQ','DR','DS','DT','DW','DX','DY','DZ') }
    @{ index='3'; name='E组棱练习'; formula='F2 R2 F2 U'' B2 D'' R2 F2 L2 U'' R2 D2 R'' U B2 F2 L'' R F'' R U'; codes=@('EI','EJ','EK','EL','EM','EN','EO','EP','EQ','ER','ES','ET','EW','EX','EY','EZ') }
    @{ index='4'; name='F组棱练习'; formula='L2 D F2 R2 F2 D R2 B2 D2 U'' L2 U F'' L'' U'' F'' L2 F'' L U F'; codes=@('FI','FJ','FK','FL','FM','FN','FO','FP','FQ','FR','FS','FT','FW','FX','FY','FZ') }
    @{ index='5'; name='I组棱练习'; formula='F2 L'' U R L'' B'' R'' U2 F2 U2 B R2 L2 F'' R2 U2 D2 B2 D2'; codes=@('IK','IL','IM','IN','IO','IP','IQ','IR','IS','IT','IW','IX','IY','IZ') }
    @{ index='6'; name='J组棱练习'; formula='U'' F'' R2 D2 B'' L2 B2 D2 R2 U2 F2 D'' L D2 U'' R2 D'' F'''; codes=@('JK','JL','JM','JN','JO','JP','JQ','JR','JS','JT','JW','JX','JY','JZ') }
    @{ index='7'; name='K组棱练习'; formula='F2 R2 U'' F2 R2 F2 U'' L2 D U2 R'' D L R'' D2 U2 F'' R U'; codes=@('KM','KN','KO','KP','KQ','KR','KS','KT','KW','KX','KY','KZ') }
    @{ index='8'; name='L组棱练习'; formula='D L2 R2 U2 L2 B2 L2 R2 F2 R'' D'' B F'' R B F'' L'' D'' U2'; codes=@('LM','LN','LO','LP','LQ','LR','LS','LT','LW','LX','LY','LZ') }
    @{ index='9'; name='M组棱练习'; formula='L2 R2 D U2 L2 D L2 R2 U'' R D L R'' D2 U2 F'' R U'; codes=@('MO','MP','MQ','MR','MS','MT','MW','MX','MY','MZ') }
    @{ index='10'; name='N组棱练习'; formula='F2 L2 B2 R2 D U2 B2 D2 U2 R2 B'' L2 B'' D'' L'' U'' L2 D F'''; codes=@('NO','NP','NQ','NR','NS','NT','NW','NX','NY','NZ') }
    @{ index='11'; name='O组棱练习'; formula='B2 D B2 U B2 F2 U'' L2 U'' L2 B'' U'' B D U'' L R2 D L'; codes=@('OQ','OR','OS','OT','OW','OX','OY','OZ') }
    @{ index='12'; name='P组棱练习'; formula='F D2 U2 B'' D2 U2 F D'' U L'' D U'''; codes=@('PQ','PR','PS','PT','PW','PX','PY','PZ') }
    @{ index='13'; name='Q组棱练习'; formula='U'' L2 D'' U'' L D2 F2 U2 R D'''; codes=@('QS','QT','QW','QX','QY','QZ') }
    @{ index='14'; name='R组棱练习'; formula='F U2 L2 D2 B'' D2 L2 D'' U'' L'' D U'' F'''; codes=@('RS','RT','RW','RX','RY','RZ') }
    @{ index='15'; name='S组棱练习'; formula='D R2 D2 B2 U2 L'' D2 F2 U2 R D'''; codes=@('SW','SX','SY','SZ') }
    @{ index='16'; name='T组棱练习'; formula='D2 B'' L2 D2 R2 F'' U2 F2 D'' U L'' D U'' F'' R2'; codes=@('TW','TX','TY','TZ') }
    @{ index='17'; name='W组棱练习'; formula='z2 y'' E L S'' L2 S L E'''; codes=@('WY','WZ') }
    @{ index='18'; name='X组棱练习'; formula='z2 y'' L U2 L'' E L U2 L'' E'''; codes=@('XY','XZ') }
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
<div class="entries">
  <div class="entry single">
    <div class="entry-header">
      <span class="index">__IDX__</span>
      <h2>__NAME__</h2>
    </div>
    <div class="entry-body">
      <div class="diagram">
        <canvas class="ur-cube" data-formula="__FORMULA__"></canvas>
      </div>
      <div class="info-panel">
        <div class="formula-block">
          <span class="label">打乱公式</span>
          <code>__FORMULA__</code>
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
<script src="ur-cube.js"></script>
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
