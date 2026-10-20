/*
 * 魔方训练站 · 全站 PWA Service Worker
 * 放在站点根目录，作用域为 '/'。
 *
 * 【2026-10-18 改造：从「只服务计时器」升级为「服务全站」】
 * 旧版用 isOurConcern() 把接管范围限制在 /tools/timer/ + 预缓存清单，
 * 于是除计时器外的 200+ 个页面完全没有离线能力与资源缓存。
 * 现改为接管整个同源 GET 请求，并按资源类型分策略：
 *   ① 导航请求（页面 HTML）：network-first —— 在线永远拿最新，离线才回退缓存/兜底页；
 *   ② 静态资源（css/js/图片/字体/数据）：stale-while-revalidate —— 秒开 + 后台静默更新；
 *   ③ 其余（含 /api/ 代理、非 GET、跨域）：不接管，直接放行。
 *
 * ⚠️ 作用域隔离（勿改）：站内共 3 个 PWA，各自独立作用域 ——
 *   根 sw.js（本文件，scope '/'）、tools/corner-trainer/sw.js（scope 该目录）、
 *   tools/edge-trainer/sw.js（scope 该目录）。
 *   对 corner/edge 目录下的页面，由「作用域更长」的专属 SW 接管，本文件不冲突。
 *   因此 activate 清理缓存必须按前缀过滤，绝不能无差别删除其他 PWA 的缓存。
 */
/* v8（2026-10-10）：修复「导入本站 JSON 备份」整份失败 + csTimer 往返导入不幂等——
   ① parseOwnJson 的分组容器写死 {"3x3":[],"2x2":[]} 缺 bld 键，备份里只要含三盲
      分组就 v2["bld"].push() 抛 TypeError → 整份导入报「无法解析文件内容」（全丢）；
      现改为按 EVENTS 派生 EVENT_KEYS，导入/迁移/合并/提示语一律不再写死项目列表。
   ② csTimer 导出少写「打乱」槽位只导出 3 元素，解析器按官方 4 元素读 e[3] → 时间戳丢失
      → normSolve 用 Date.now() 兜底 → 成绩签名每次都变 → 重复导入同一文件成绩翻倍。
      现导出补齐 4 元素，解析器同时兼容 3/4 两种历史格式。
   timer.js 变更，故递增。
   静态资源走的是 stale-while-revalidate（cache-first + 后台更新），不递增版本号的话
   已安装的 PWA 首次打开会先拿到旧的 timer.js，第二次才更新；
   递增版本号可让 SW 重新 install + activate，一次性丢弃旧缓存。
   沿用 v3 的规矩：**凡是动到 APP_SHELL 里的文件，都要递增这个版本号。** */
/* v9（2026-10-12）：site-nav.js（在 APP_SHELL 清单内）新增「四阶盲拧中心块公式」导航项
   （tools/4bld/），按上述规矩递增，避免计时器 PWA 用户首屏拿到旧的侧栏菜单。 */
/* v10（2026-10-13）：timer.css（APP_SHELL 内）把手机单屏布局断点扩展到
   竖屏触屏平板（≤1024px + portrait + pointer:coarse），Pad 竖持时计时区
   铺满全屏，不再下方留大片空白。 */
/* v11（2026-10-14）：site-nav.js（在 APP_SHELL 清单内）删除「CFOP公式库」顶级项
   （与「教程 → 三阶」内容重复，已并入教程分组），按上述规矩递增，
   避免计时器 PWA 用户首屏拿到旧的侧栏菜单。 */
/* v12（2026-10-15）：site-nav.js（在 APP_SHELL 清单内）新增「高阶翼棱公式」导航项
   （tools/4bld/wing.html），按上述规矩递增，避免计时器 PWA 用户首屏拿到旧的侧栏菜单。 */
/* v13（2026-10-16）：site-nav.js（在 APP_SHELL 清单内）新增「四阶角心公式」导航项
   （tools/4bld/xcenter.html），按上述规矩递增，避免计时器 PWA 用户首屏拿到旧的侧栏菜单。 */
/* v14（2026-10-16）：角心页与四阶中心块页为同一套 case 空间（缓冲 Ubl + 另两中心块位），
   已整合进中心块页（数据作参考公式源），删除独立角心页并移除对应导航项 → 再递增。 */
/* v15（2026-10-18）：site-nav.js 重组导航（拆出「高阶盲拧(4×4)」组、三盲训练去重改名、
   新增三阶知识地图入口、教程下加 PLL/OLL 训练、删外链组）→ 再递增。 */
/* v16（2026-10-18）：全站 PWA 化 —— 本文件由「只服务计时器」改为接管全站；
   activate 改为按前缀清理（不再误删 corner/edge 两个独立 PWA 的缓存）；
   APP_SHELL 补进 site-shell.css / site-wide.css / palettes.css（三者由 site-nav.js
   运行时注入，不在任何静态 HTML 里，此前从未被预缓存，离线首屏会缺样式）→ 再递增。 */
/* v17（2026-10-19）：site-nav.js（在 APP_SHELL 清单内）新增顶级「公式训练器」入口
   （/tools/ft/，三盲角/棱 + 四阶中心 + 高阶翼棱四体系统一入口），按上述规矩递增，
   避免已安装 PWA 的用户首屏拿到旧的侧栏菜单。 */
/* v18（2026-10-18）：site-nav.js（在 APP_SHELL 清单内）移除三个已并入公式训练器的旧入口
   （四阶中心块公式 / 高阶翼棱公式 / UF440公式训练，页面暂留）、UF/UR 分组连拧训练改名，
   按上述规矩递增，避免已安装 PWA 的用户首屏拿到旧的侧栏菜单。 */
/* v19（2026-10-18）：① site-nav.js（在 APP_SHELL 清单内）导航重组为四项
   （首页 / 魔方教程与公式库 / 魔方教练工具箱 / 盲拧公式训练器）；
   ② /tools/timer/timer.js + timer.css（均在 APP_SHELL 内）给三阶/二阶也加上
   打乱展开图 + 时间数字禁选中。按上述规矩递增，避免已安装 PWA 的用户首屏拿到旧版。 */
/* v21（2026-10-19）：site-nav.js + site-shell.css（均在 APP_SHELL 清单内）新增
   「侧栏收起」——入口按钮改到侧栏自身右上角，页面内的「隐藏侧栏」按钮全部删除；
   同时 tools/ft/ft-page.js + ft.css 删除字母筛选行（行列坐标点击成为唯一入口）、
   详情/练习浮窗公式默认直接显示括号格式。按上述规矩递增，避免已安装 PWA
   的用户首屏拿到旧版。 */
/* v22（2026-10-19）：tools/ft/ft-page.js + ft.css（公式训练器）两处改动：
   ① 矩阵卡字母放大一倍——--mx-fs 是框架按公式行高算的（一屏 500+ 格时仅 5px，
     字母再乘 1.55 也才 7.75px），改按格子高度 --mx-h 驱动（约 2 倍），时间移到
     右下角避免压字；   ② 星标标记功能搬进练习浮层——公式正下方常驻五档颜色 +
     备注输入框，点开就能直接选，不必再进详情浮层。递增版本号让已安装 PWA
   重新激活、促使工具页新脚本尽快生效。 */
/* v23（2026-10-19）：tools/ft/ft.css（公式训练器）排版微调：
   ① 矩阵卡字母居中排（词组居中、时间移到正下方一起居中），字母由 .84 收到
     .68×mx-h 给时间行让位，padding 归零；② 练习总览卡片字母放大并改等宽
   字体（原 2.3em 且未指定字体，落到系统比例字体，W/M 等宽字母在小卡上会
   溢出）——新 min(2.9em, .52×卡宽)，实测一屏 500+ 卡时不溢出且比原来大约
   27%；仅覆盖 ft 页，四阶/UF440 复用方不受影响。 */
/* v24（2026-10-19）：接入 Web 蓝牙（智能魔方计时器 / 智能魔方）——
   ① /tools/timer/index.html + timer.js（均在 APP_SHELL 内）：timer.js 的
   window.__tm 新增 btArm/btStart/btStop 三个蓝牙起停入口，index.html 工具条
   新增「蓝牙计时器 / 智能魔方计时 / 准备」三个按钮，按规矩递增，避免已安装
   PWA 用户拿到旧的计时器外壳而连不上硬件；
   ② 新增的蓝牙文件不进 APP_SHELL：assets/js/bt-cube.js（适配层，ESM）与
   assets/vendor/bt/*.esm.js（协议库+rxjs+aes-js+tslib，约 137KB）都是
   「用户点连接才动态 import」的按需资源，预缓存只会拖慢安装，
   交由运行时 stale-while-revalidate 缓存即可（.js 命中 STATIC_RE）。 */
/* v25（2026-10-20）：工具箱权限划分 ——
   ① /assets/js/site-nav.js 在 APP_SHELL 内且已改动（「魔方教练工具箱」下拉
   新增「教练专用 · 需开通」分组，10 项专项工具从原位置移入），
   不递增的话已安装 PWA 用户会一直拿到旧菜单、看不到这个分组，按规矩递增；
   ② 新增 assets/js/vip-gate.js、assets/js/announce.js、
   assets/css/vip-gate.css、assets/css/announce.css 均位于 /assets/ 下，
   由运行时 stale-while-revalidate 自动缓存，不进 APP_SHELL；
   ③ assets/data/announcements.json（全站公告）属"改完立即生效"内容，
   已加入 NO_CACHE_PREFIX 绕开缓存。 */
/* v26（2026-10-20）：首页导航修复 + 首页结构重排 ——
   ① /assets/js/site-nav.js 在 APP_SHELL 内且已改动（侧栏收起状态从
   localStorage 永久记忆改为 sessionStorage 会话级记忆，并清理旧键；
   展开条改为带「导航」文字的明显标签），
   ② /assets/css/site-shell.css 在 APP_SHELL 内且已改动（sr-only 规则
   排除 .hero，恢复首页主视觉；展开条样式加宽加文字），
   ①②都在 APP_SHELL 内，不递增的话已安装 PWA 用户会一直拿到旧版
   侧栏逻辑与旧首页，按规矩递增；
   ③ 新增 /index.html 与 /assets/css/pages/home.css 进 APP_SHELL：
   首页是全站入口且本次整页重写，靠运行时 stale-while-revalidate 的话
   用户第一次打开仍会看到旧首页、第二次刷新才变。 */
/* v27（2026-10-20）：首页 + 导航按「项目」重组（v2.0.44）——
   ① /index.html 在 APP_SHELL 内且已整节重写（Hero 去副标行、
   删「快速开始」区、教程区删 PLL/OLL 卡、⑤区改「盲拧公式库与训练」
   并加角/棱查询直链、工具箱删两张卡），
   ② /assets/js/site-nav.js 在 APP_SHELL 内且已改（tutorial 组删
   PLL/OLL、删顶层独立 ft、coach 组删 bld-level 与 3bld），
   ③ /tools/timer/index.html 在 APP_SHELL 内且已改（三盲参数脚
   加难度分级标准直链）。
   三件均在 APP_SHELL 内，不递增已安装用户拿旧结构，按规矩递增。 */
const CACHE = 'fto-timer-v28';

/* 运行时缓存：装「用户实际访问过」的页面与资源，与版本化的外壳缓存分开。
   分开的理由：外壳缓存按版本整批作废，运行时缓存靠 stale-while-revalidate
   后台更新即可，不需要跟着版本号一起丢；且裁剪容量时不会误删外壳。 */
const RT_CACHE = 'fto-site-rt-v1';
const RT_MAX = 300; // 运行时缓存条目上限，超出后淘汰最早写入的

// 预缓存清单：计时器应用壳 + 全站共享的站点级资源（注入型 CSS 也在内）
const APP_SHELL = [
  '/',
  '/index.html',
  '/assets/css/pages/home.css',
  '/tools/timer/',
  '/tools/timer/index.html',
  '/tools/timer/timer.js',
  '/tools/timer/timer.css',
  '/tools/timer/scramble.js',
  '/tools/timer/stats.js',
  '/tools/timer/bld-stats.js',
  '/assets/js/theme.js',
  '/assets/js/sync-boot.js',
  '/assets/js/site-nav.js',
  '/assets/js/bld-engine.js',
  '/assets/js/cube-net.js',
  '/tools/cfop/js/cfop-ui.js',
  '/assets/css/site-nav.css',
  '/assets/css/components.css',
  '/assets/css/site-layout.css',
  '/assets/css/site-shell.css',
  '/assets/css/site-wide.css',
  '/assets/css/palettes.css',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png',
  '/offline.html',
  '/manifest.webmanifest'
];

/* 不接管的路径前缀：这些是动态接口，缓存会返回脏数据 */
const NO_CACHE_PREFIX = [
  '/api/',
  '/vercel-proxy/api/',
  /* v2.0.37：全站公告数据。它是"改完就想让用户立刻看到"的内容，
     而 .json 命中 STATIC_RE 会走 stale-while-revalidate —— 用户第一次
     拿到旧副本，要点第二次刷新才看得见新公告。这里放行让它每次走网络。 */
  '/assets/data/announcements.json'
];

/* 按扩展名判定为「静态资源」→ 走 stale-while-revalidate */
const STATIC_RE = /\.(?:css|js|mjs|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|mp3|mp4|wasm)$/i;

function isNoCache(pathname) {
  for (var i = 0; i < NO_CACHE_PREFIX.length; i++) {
    if (pathname.indexOf(NO_CACHE_PREFIX[i]) === 0) return true;
  }
  return false;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        /* 逐个 add 并吞掉单个失败：cache.addAll 会因任意一个 404 整批失败，
           导致整个 SW 装不上、PWA 完全不可用（corner/edge 的 SW 已采用此写法）。 */
        return Promise.all(APP_SHELL.map(function (u) {
          return cache.add(u).catch(function (e) {
            console.warn('[sw] precache skip', u, e && e.message);
          });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            /* ⚠️ 必须按前缀过滤：caches 是同源共享的，无差别删除会把
               tools/corner-trainer/sw.js（fto-corner-v1）与
               tools/edge-trainer/sw.js（fto-edge-v1）的缓存一起清掉，
               导致那两个独立 PWA 离线失效。 */
            .filter(function (k) { return k.indexOf('fto-timer-') === 0 && k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

function trimRuntime(cache) {
  /* 容量裁剪：只在超限时才遍历，避免每次请求都查全量 key */
  return cache.keys().then(function (keys) {
    if (keys.length <= RT_MAX) return;
    var drop = keys.slice(0, keys.length - RT_MAX);
    return Promise.all(drop.map(function (k) { return cache.delete(k); }));
  }).catch(function () { /* 裁剪失败不影响主流程 */ });
}

function putRuntime(req, res) {
  caches.open(RT_CACHE).then(function (c) {
    c.put(req, res).then(function () { return trimRuntime(c); });
  }).catch(function () {});
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // 不碰跨域（云同步等）
  if (isNoCache(url.pathname)) return;                // 动态接口放行

  // ① 导航请求：network-first —— 在线取最新，离线依次回退「本页缓存 → offline 兜底」
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.status === 200) putRuntime(req, res.clone());
          return res;
        })
        .catch(function () {
          return caches.match(req)
            .then(function (r) { return r || caches.match('/offline.html'); })
            .then(function (r) { return r || new Response('离线', { status: 503 }); });
        })
    );
    return;
  }

  // ② 静态资源：stale-while-revalidate —— 命中即返回，同时后台拉新版本更新缓存
  if (STATIC_RE.test(url.pathname) || url.pathname.indexOf('/assets/') === 0) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200) putRuntime(req, res.clone());
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      })
    );
    return;
  }

  // ③ 其余同源 GET（无扩展名的目录请求等）：不接管，走浏览器默认
});
