# sw.js 版本变更历史

> 本文件由 `sw.js` 头部的注释迁移而来（2026-10-28 代码优化）。
> 规则：**凡是改动 `APP_SHELL` 清单里的文件，都要递增 `sw.js` 的 `CACHE` 常量**，
> 否则已安装的 PWA 用户会一直拿到旧缓存。新版本请追加到本文件顶部（按版本倒序不必强制，但请注明日期）。

## v8（2026-10-10）

修复「导入本站 JSON 备份」整份失败 + csTimer 往返导入不幂等——
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
沿用 v3 的规矩：**凡是动到 APP_SHELL 里的文件，都要递增这个版本号。**

## v9（2026-10-12）

site-nav.js（在 APP_SHELL 清单内）新增「四阶盲拧中心块公式」导航项
（tools/4bld/），按上述规矩递增，避免计时器 PWA 用户首屏拿到旧的侧栏菜单。

## v10（2026-10-13）

timer.css（APP_SHELL 内）把手机单屏布局断点扩展到
竖屏触屏平板（≤1024px + portrait + pointer:coarse），Pad 竖持时计时区
铺满全屏，不再下方留大片空白。

## v11（2026-10-14）

site-nav.js（在 APP_SHELL 清单内）删除「CFOP公式库」顶级项
（与「教程 → 三阶」内容重复，已并入教程分组），按上述规矩递增，
避免计时器 PWA 用户首屏拿到旧的侧栏菜单。

## v12（2026-10-15）

site-nav.js（在 APP_SHELL 清单内）新增「高阶翼棱公式」导航项
（tools/4bld/wing.html），按上述规矩递增，避免计时器 PWA 用户首屏拿到旧的侧栏菜单。

## v13（2026-10-16）

site-nav.js（在 APP_SHELL 清单内）新增「四阶角心公式」导航项
（tools/4bld/xcenter.html），按上述规矩递增，避免计时器 PWA 用户首屏拿到旧的侧栏菜单。

## v14（2026-10-16）

角心页与四阶中心块页为同一套 case 空间（缓冲 Ubl + 另两中心块位），
已整合进中心块页（数据作参考公式源），删除独立角心页并移除对应导航项 → 再递增。

## v15（2026-10-18）

site-nav.js 重组导航（拆出「高阶盲拧(4×4)」组、三盲训练去重改名、
新增三阶知识地图入口、教程下加 PLL/OLL 训练、删外链组）→ 再递增。

## v16（2026-10-18）

全站 PWA 化 —— 本文件由「只服务计时器」改为接管全站；
activate 改为按前缀清理（不再误删 corner/edge 两个独立 PWA 的缓存）；
APP_SHELL 补进 site-shell.css / site-wide.css / palettes.css（三者由 site-nav.js
运行时注入，不在任何静态 HTML 里，此前从未被预缓存，离线首屏会缺样式）→ 再递增。

## v17（2026-10-19）

site-nav.js（在 APP_SHELL 清单内）新增顶级「公式训练器」入口
（/tools/ft/，三盲角/棱 + 四阶中心 + 高阶翼棱四体系统一入口），按上述规矩递增，
避免已安装 PWA 的用户首屏拿到旧的侧栏菜单。

## v18（2026-10-18）

site-nav.js（在 APP_SHELL 清单内）移除三个已并入公式训练器的旧入口
（四阶中心块公式 / 高阶翼棱公式 / UF440公式训练，页面暂留）、UF/UR 分组连拧训练改名，
按上述规矩递增，避免已安装 PWA 的用户首屏拿到旧的侧栏菜单。

## v19（2026-10-18）

① site-nav.js（在 APP_SHELL 清单内）导航重组为四项
（首页 / 魔方教程与公式库 / 魔方教练工具箱 / 盲拧公式训练器）；
② /tools/timer/timer.js + timer.css（均在 APP_SHELL 内）给三阶/二阶也加上
打乱展开图 + 时间数字禁选中。按上述规矩递增，避免已安装 PWA 的用户首屏拿到旧版。

## v21（2026-10-19）

site-nav.js + site-shell.css（均在 APP_SHELL 清单内）新增
「侧栏收起」——入口按钮改到侧栏自身右上角，页面内的「隐藏侧栏」按钮全部删除；
同时 tools/ft/ft-page.js + ft.css 删除字母筛选行（行列坐标点击成为唯一入口）、
详情/练习浮窗公式默认直接显示括号格式。按上述规矩递增，避免已安装 PWA
的用户首屏拿到旧版。

## v22（2026-10-19）

tools/ft/ft-page.js + ft.css（公式训练器）两处改动：
① 矩阵卡字母放大一倍——--mx-fs 是框架按公式行高算的（一屏 500+ 格时仅 5px，
字母再乘 1.55 也才 7.75px），改按格子高度 --mx-h 驱动（约 2 倍），时间移到
右下角避免压字；   ② 星标标记功能搬进练习浮层——公式正下方常驻五档颜色 +
备注输入框，点开就能直接选，不必再进详情浮层。递增版本号让已安装 PWA
重新激活、促使工具页新脚本尽快生效。

## v23（2026-10-19）

tools/ft/ft.css（公式训练器）排版微调：
① 矩阵卡字母居中排（词组居中、时间移到正下方一起居中），字母由 .84 收到
.68×mx-h 给时间行让位，padding 归零；② 练习总览卡片字母放大并改等宽
字体（原 2.3em 且未指定字体，落到系统比例字体，W/M 等宽字母在小卡上会
溢出）——新 min(2.9em, .52×卡宽)，实测一屏 500+ 卡时不溢出且比原来大约
27%；仅覆盖 ft 页，四阶/UF440 复用方不受影响。

## v24（2026-10-19）

接入 Web 蓝牙（智能魔方计时器 / 智能魔方）——
① /tools/timer/index.html + timer.js（均在 APP_SHELL 内）：timer.js 的
window.__tm 新增 btArm/btStart/btStop 三个蓝牙起停入口，index.html 工具条
新增「蓝牙计时器 / 智能魔方计时 / 准备」三个按钮，按规矩递增，避免已安装
PWA 用户拿到旧的计时器外壳而连不上硬件；
② 新增的蓝牙文件不进 APP_SHELL：assets/js/bt-cube.js（适配层，ESM）与
assets/vendor/bt/*.esm.js（协议库+rxjs+aes-js+tslib，约 137KB）都是
「用户点连接才动态 import」的按需资源，预缓存只会拖慢安装，
交由运行时 stale-while-revalidate 缓存即可（.js 命中 STATIC_RE）。

## v25（2026-10-20）

工具箱权限划分 ——
① /assets/js/site-nav.js 在 APP_SHELL 内且已改动（「魔方教练工具箱」下拉
新增「教练专用 · 需开通」分组，10 项专项工具从原位置移入），
不递增的话已安装 PWA 用户会一直拿到旧菜单、看不到这个分组，按规矩递增；
② 新增 assets/js/vip-gate.js、assets/js/announce.js、
assets/css/vip-gate.css、assets/css/announce.css 均位于 /assets/ 下，
由运行时 stale-while-revalidate 自动缓存，不进 APP_SHELL；
③ assets/data/announcements.json（全站公告）属"改完立即生效"内容，
已加入 NO_CACHE_PREFIX 绕开缓存。

## v26（2026-10-20）

首页导航修复 + 首页结构重排 ——
① /assets/js/site-nav.js 在 APP_SHELL 内且已改动（侧栏收起状态从
localStorage 永久记忆改为 sessionStorage 会话级记忆，并清理旧键；
展开条改为带「导航」文字的明显标签），
② /assets/css/site-shell.css 在 APP_SHELL 内且已改动（sr-only 规则
排除 .hero，恢复首页主视觉；展开条样式加宽加文字），
①②都在 APP_SHELL 内，不递增的话已安装 PWA 用户会一直拿到旧版
侧栏逻辑与旧首页，按规矩递增；
③ 新增 /index.html 与 /assets/css/pages/home.css 进 APP_SHELL：
首页是全站入口且本次整页重写，靠运行时 stale-while-revalidate 的话
用户第一次打开仍会看到旧首页、第二次刷新才变。

## v27（2026-10-20）

首页 + 导航按「项目」重组（v2.0.44）——
① /index.html 在 APP_SHELL 内且已整节重写（Hero 去副标行、
删「快速开始」区、教程区删 PLL/OLL 卡、⑤区改「盲拧公式库与训练」
并加角/棱查询直链、工具箱删两张卡），
② /assets/js/site-nav.js 在 APP_SHELL 内且已改（tutorial 组删
PLL/OLL、删顶层独立 ft、coach 组删 bld-level 与 3bld），
③ /tools/timer/index.html 在 APP_SHELL 内且已改（三盲参数脚
加难度分级标准直链）。
三件均在 APP_SHELL 内，不递增已安装用户拿旧结构，按规矩递增。

## v29（2026-10-21）

移除 blddb 公式库查询界面（v2.0.49）——
① /index.html 在 APP_SHELL 内且已改（⑤区改「盲拧公式训练」，
两张公式库查询卡换成三阶盲拧角/棱训练器直链，盲拧卡文案同步），
② /assets/js/site-nav.js 在 APP_SHELL 内且已改（盲拧项注释口径更新，
公式库查询入口已不存在）。
两件均在 APP_SHELL 内，不递增已安装用户拿旧结构，按规矩递增。

## v30（2026-10-21）

「教练专用」整组暂时下线（v2.0.50，用户要求之后再加）——
① /index.html 在 APP_SHELL 内且已改（⑥区删「教练专用 · 需开通」小标题
与 9 张专用卡，只留公开工具 8 项），
② /assets/js/site-nav.js 在 APP_SHELL 内且已改（coach 组删 sep 小标题
与 9 个专用项；vip-gate.js 的 VIP_PAGES 门禁未动，直链仍受保护）。
两件均在 APP_SHELL 内，不递增已安装用户拿旧结构，按规矩递增。

## v31（2026-10-21）

恢复「教练专用」与盲拧公式库界面（v2.0.52，用户：「发现好几个
功能都不见了，帮我恢复过来」）—— 把 v2.0.49 / v2.0.50 摘掉的入口全部加回：
① /index.html 在 APP_SHELL 内且已改（⑥区恢复小标题 + 9 张专用卡；⑤区恢复
公式库棱/角查询卡，并保留 v2.0.49 新增的角/棱训练器直链卡），
② /assets/js/site-nav.js 在 APP_SHELL 内且已改（coach 组恢复 sep + 9 个专用项）。
两件均在 APP_SHELL 内，不递增已安装用户拿旧结构，按规矩递增。

## v32（2026-10-21）

去掉「教练专用」权限门槛、保留全部功能（v2.0.53，用户：
「把教练专用的权限去掉，功能保留」）——
① /assets/js/vip-gate.js 的 VIP_PAGES 置空，原 13 个教练专用页不再弹开通浮层、
指向它们的链接不再被拦截；boot/renderContactBlocks 逻辑保留，首页「联系管理员」
区块仍正常注入；
② /assets/js/site-nav.js 在 APP_SHELL 内且已改（coach 组 sep 标签「教练专用 · 需开通」
→「教练专用」）；
③ /index.html 在 APP_SHELL 内且已改（⑥区小标题「教练专用 · 需开通后使用」→「教练专用」）；
④ /assets/data/announcements.json 移除已失效的 vip-tools-2026 公告、修正 server-fund
中「赞助者可以开通教练专用」的过时表述（该文件走 NO_CACHE_PREFIX，实际不受影响，
但文案需与新状态一致）。
②③④均在 APP_SHELL 或需立即一致，按规矩递增。

## v33（2026-10-26）

计时器加四阶 / 五阶 + 复盘打乱 + UF/UR 桌面重设计（v2.0.55）——
① /tools/timer/timer.js、/tools/timer/scramble.js、/tools/timer/timer.css
均在 APP_SHELL 内且已改（新增 4x4/5x5 项目与打乱、成绩存档打乱公式并支持回放、
长按起表进度反馈、修计时区内按钮 click 被 pointerdown 吞掉 / 焦点在按钮上时空格误起表）；
② /assets/js/cube-net.js 在 APP_SHELL 内且已改（词法支持 Rw/Lw/Uw/Dw/Fw/Bw 宽层记法，
四阶 / 五阶展开图的关键缺口；UF/UR 组页共用此文件）。
两件均在 APP_SHELL 内，不递增已安装用户拿旧结构，按规矩递增。

## v34（2026-10-27）

① /assets/js/site-nav.js 在 APP_SHELL 内且已改（侧栏默认收起 + 悬停展开：
进入页面即 nav-hidden，鼠标移到左缘『导航』条临时滑出、离开自动收回；
全站统一的大气流导航体验）；② /assets/css/site-shell.css 在 APP_SHELL 内且已改
（侧栏收起从 display:none 改为 transform 滑出，支持 peek 滑入动画）。
两件均在 APP_SHELL 内，不递增已安装 PWA 用户会一直拿到旧版布局，按规矩递增。

## v35（2026-10-27）

/tools/timer/index.html + timer.js + timer.css 三件均在 APP_SHELL 内且已改
（计时器新增「个性化」设置：index.html 多出面板挂载点与 personal.js/personal.css 引用，
timer.js 暴露 window.TimerOpt、opt 增加 personal 字段，timer.css 新增一组 --tm-* 变量）。
新增的 personal.js / personal.css 不在 APP_SHELL，走运行时 SWR 缓存自动获得；
但 index.html 在壳内，不递增的话已安装用户拿到的旧壳根本不会去请求 personal.js，
个性化入口直接缺失 —— 按规矩递增。

## v36（2026-10-28）

首屏性能优化（第一期：止血）。本次改动集中在「交付层」，不碰业务逻辑：

① **118 个页面的 `<head>` 重排** —— `theme.js` / `palette.js` 原先作为同步脚本
   排在 `<meta name="viewport">` 之前，浏览器必须执行完这两个脚本才能读到 viewport，
   移动端会出现「先按 980px 排版、再跳成正确宽度」的缩放闪动。现改为：
   `charset → viewport → 内联主题初始化 → CSS → 其余脚本`，
   `theme.js` / `palette.js` 移到 `</body>` 前。首屏同步脚本从 3 个降到 0 个
   （只剩约 500 字节内联，负责写 `data-theme` / `data-theme-pref` /
   `color-scheme` / `data-palette` 四个属性，与原脚本首屏行为等价）。

② **`vip-gate.js` / `sync-boot.js` 从 `<head>` 首行移到 `</body>` 前**（17 个页面）。
   这两个脚本的 DOM 操作本来就在 `DOMContentLoaded` 之后，前置没有收益。

③ **`sync-boot.js` 重写加载策略** —— 原先 `chain = chain.then(loadScript)`
   串行加载 8 个文件 = 8 次串行往返，且立即与首屏 CSS/字体抢带宽。
   现改为「并行下载 + 按序执行」（动态 `<script>` 设 `async=false` 即 in-order），
   8 次往返压成 1 次；启动时机推迟到 `DOMContentLoaded` 后的空闲时段
   （`requestIdleCallback`，timeout 2s 兜底）。`SyncBoot.ready()` 在此之前即可用，
   回调照常排队 —— 对页面侧完全透明。

④ **修复 6 个页面重复引入 `sync-boot.js` 的原有 bug**
   （timer / corner-trainer / edge-trainer / bld-trainer / scramble-uf / scramble-ur）。
   重复引入会让第二个实例重建 `SyncBoot` 单例并清空回调队列，是隐性的时序雷。
   本次改造把该竞争暴露成了可见报错（`LSProvider is not defined`），已一并修掉。

⑤ **全站版本参数统一为 `?v=2.1.0`** —— 原来 59 处引用分散在 5 种格式
   （`2.0.43` / `2.0.48` / `2.0.54` / `20261012b` 这类日期串 / 空值），
   且 `index.html` 里 `vip-gate.js?v=2.0.43` 早与文件实际修改时间脱节，
   用户可能拿到「新 HTML + 旧 JS」的混合态。

⑥ **`sw.js` 头部 150 行 changelog 迁移到本文件**，代码从第 164 行回到第 25 行。

以上 ①③⑥ 均改到 `APP_SHELL` 清单内的文件（`index.html`、`sync-boot.js`、
`theme.js`、各工具页 HTML），故 `CACHE` 递增至 `fto-timer-v36`。

## v37（2026-10-29）

新增工具页 `tools/2bld/`（二阶盲拧：编码 → 打乱公式）与配套模块
`assets/js/bld2-core.js`，并在 `site-nav.js`（在 `APP_SHELL` 清单内）
「魔方教练工具箱 → 公开工具」中 bldscramble 之后挂上入口「二阶盲拧打乱」。

与已有 `tools/bldscramble/` 的 2×2 能力互补：那个工具按「错位角块数 k +
翻色数 f」参数化**随机生成**，本工具按用户给的具体编码**精确反解**打乱。

编码约定（**以魔方本身的记法为准，不要按「位置/朝向分离」那套去改**）：
- 固定持握：**黄顶红前**打乱。
- 字母表：黄红蓝 ABC / 黄蓝橘 DEF / 黄橘绿 GHI / 黄绿红 JKL（缓冲 J，UFR）；
  白蓝红 WMN / 白橘蓝 OPQ / 白绿橘 RST / 白红绿 XYZ（定位块，DFR）。
- 打乱后先找 XYZ（白红绿）摆正到 DFR（白下、红前、绿右）确定坐标系，再从 **J** 起笔读码。
- 循环断裂借位顺序：**G → D → A → W → O → R**（`BREAK_ORDER = [1,0,3,4,7,6]`）。
- 翻色角写**两个**字母：第一个是位置字母，第二个是在该位置高位贴纸上读到的字母。
  顺翻 `DEF → DE`，逆翻 `DEF → DF`。

实现要点（供后续维护参考）：
① **二阶没有中心块，U 面由持握决定**，所以不能假定绝对朝向。工具把打乱态当作
   「锚点态 × 某个整体旋转」来生成：`findAnchorRot` 在 24 个整体旋转里挑出让
   `cp[5] === 5 && co[5] === 0`（XYZ 归位且不翻）的那个，锚点态由它乘回去得到。
   默认排除恒等旋转，以练习「打乱后自己找 XYZ」。24 个旋转由 6 个坐标轴置换 ×
   8 个符号组合筛选 `det = +1` 生成，贴纸映射按几何算（`buildPerm`）。
② 贴纸位用**面索引**：`3i + t` 直接对应 `FACES[i][t]`（UBL=`[U,B,L]`、UBR=`[U,B,R]`、
   UFR=`[U,F,R]`、UFL=`[U,F,L]`、DFL=`[D,F,L]`、DFR=`[D,F,R]`、DBR=`[D,B,R]`、DBL=`[D,B,L]`）。
   **由此复原态不是 `[0..23]`**，而是 `3*i + CS_INV[i][t]`（`CS` 见下）。写成 `[0..23]`
   会得到一个「八个角全部扭转」的状态——这是第一版读码全错的根因。
③ 朝向定义改为 `co = 高位贴纸上是该角块第几个字母`（0/1/2），即 `co = 1 ⇔ 顺翻`。
   站点三阶沿用的 `((CS[i][0] - CS[b][j0]) % 3 + 3) % 3` 那张表在 UBL/UFR/DFL/DBR
   四个角上是**反的**，直接套会把这四个角的顺翻/逆翻对调。
   `CS = [[0,2,1],[0,1,2],[0,2,1],[0,1,2],[0,2,1],[0,1,2],[0,2,1],[0,1,2]]`，
   `toCubie: cp = floor(c[3i]/3), co = c[3i] % 3`，
   `fromCubie: c[3*i + CS[i][(j - o + 3) % 3]] = 3*b + j`。
④ **读码是「贴纸级」的，不是「角位级」的**——这一条最容易搞错。
   一个字母 L 代表一张贴纸，它的老家在贴纸位 `L2S[L]`；读到 L 就跳到 `L2S[L]` 再读。
   错误写法是「跳到那个角块的高位（U/D 面）贴纸」：读到 H（H 是 UBR 的**橘面**字母）
   应该去读 UBR 的橘面，而不是 UBR 的黄面。第一版就是错在这里，导致照着打乱后读不出原码。
   令 `f(s) = L2S[读到 s 上的字母]`，f 是 24 元置换，**编码就是 f 的循环分解**。
   顺带：角位内三张贴纸一旦有一张落定，块号和朝向就同时确定，
   所以「这个角位处理过了吗」只要看它有没有贴纸被读过（`posTaken`）。
⑤ 循环分解的写法：
   · 缓冲循环从贴纸位 6（UFR 的 U 面 = J）起笔，读到 J 收尾、不写 J；
   · 其余循环按 G → D → A → W → O → R 找排头，排头字母先写一个，再逐个读老家；
     绕回排头时那个字母（等于排头）**不再写第二遍**，否则每段都多一个字母；
   · 原位翻角只写两个字母（位置字母 + 该位置高位贴纸上的字母），
     等价于「读完第一个内容就闭合」。
⑥ **记法唯一的固有多义性**：缓冲循环在哪一位收尾（J 不写，没有分隔符）。
   解码端用 DFS 逐位试「在这里收尾」，并在每个循环步也试一次「在这里闭合」，
   最后用「把解出的状态重新读码，必须与输入完全一致」验收。
   缓冲块是否已复原不需要单独枚举——「在贴纸位 6 上放缓冲块」就是「循环在此收尾」；
   缓冲块所在角位的朝向也不需要反推，它的贴纸一落位就同时确定了。
⑦ 求解不用三阶 min2phase：二阶角状态为奇置换时它需要人为交换两个棱才肯求解，
   解会从 1 步膨胀到 18~20 步。改为二阶专用 IDA*（cp 40320 × co 2187 双剪枝表，
   BFS 建表 ~250ms，最优解 ≤ 11 步）。建表放在 `requestIdleCallback` 预热。
   性能注意：递归每层必须用独立的 `kidsD[depth]/coD[depth]/mvD[depth]` 缓冲，
   共用一份会被内层覆盖，实测会随机 `ERR` 求解失败。
   24 个整体旋转先按 `lb = max(CP_PRUN[cpi], CO_PRUN[coi])` 排序，只解前 4 个候选
   （每个候选都从 0 搜一遍太贵），全链路平均 ~30ms。
⑧ 页面按钮不能直接叫 `.btn` / `.btn-primary`：`components.css` 里的
   `.btn:hover { background: var(--surface-3) }` 特异性高于单类的
   `.btn-primary`，鼠标停在按钮上时实心蓝会被换成浅灰。改用页面私有的
   `.gbtn / .gbtn--primary / .gbtn--ghost / .gbtn--copy` 隔离。
   标题同理不能用 `.page-head`（`site-shell.css` 在 `@media screen` 下把它 sr-only 化），
   用 `.intro-head`。`.note b` 是块级（当小标题用），正文里的强调要写 `<b class="i">`。

仅 `site-nav.js` 在 `APP_SHELL` 内，故 `CACHE` 递增至 `fto-timer-v37`。
新页面与 `bld2-core.js` 不进预缓存清单，走运行时缓存（stale-while-revalidate）。

> 2026-10-30 补记（两次重写，同一个函数）：
> **第一版**按「位置/朝向分离 + untwist」读码，坐标还假定成「白顶绿前」，
> 而实际约定是「黄顶红前」→ 照着打乱后读不出原编码。
> **第二版**改成「面索引 + co = 高位字母序号」，但读码仍按「跳到该角块的高位贴纸」，
> 仍然错：用户实测输入 `HTCMFP` 生成的打乱，打完读出来是 `HRCWFO`。
> **第三版（当前）**改为贴纸级读码（见上面 ④⑤⑥），
> 输入 `HRCWFO` 生成的打乱与第二版给 `HTCMFP` 生成的那条完全相同——
> 说明状态一直是对的，错的只有读码方向。
> `bld2-core.js` 与 `tools/2bld/` 均不在 `APP_SHELL` 内，几次重写都**不需要**递增 `CACHE`。

## v38（2026-10-30）

新增「24点训练」工具（`tools/24game/`），并在 `site-nav.js`（APP_SHELL 内）「魔方教练工具箱」
分组新增入口「24点训练」、在 `index.html`（APP_SHELL 内）首页教练区块新增「24点训练」卡片。
两处均在 APP_SHELL 预缓存清单内，故 `CACHE` 递增至 `fto-timer-v38`，
避免已安装 PWA 用户首屏拿到旧导航 / 旧首页而看不到新入口。

24点功能本身（求解器内核 `assets/vendor/suan24/suan24.js`、题库 `tools/24game/data/levels.json`、
页面与脚本 `tools/24game/{index.html,game24.js,game24.css}`）均为新增目录，
不进预缓存清单，走运行时缓存（stale-while-revalidate），首次访问即最新。
