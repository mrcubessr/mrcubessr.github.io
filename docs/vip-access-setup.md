# 教练专用功能 · 赞助商白名单配置教程（动态管理版）

> 适用版本：v2.0.37+  （前端 `assets/js/vip-gate.js` 已自动读取本表，**不用改任何前端代码**）
> 目标：长期动态招赞助商，能随时**停用 / 设期限 / 恢复**，无需改代码、无需重新部署。

---

## 0. 前置确认（你已经满足）

- 站点已接入 Supabase 账号登录（计时器登录同款项目）。
- 项目地址：`pjgkevyhhnswknvwgvar.supabase.co`，`anonKey` 已填，`cb-config.js` 里 `enabled` 为真。
- 结论：门禁的登录依赖已就绪，你只需在**同一个 Supabase 项目**里建一张表即可。

> ⚠️ 一定要在**上面这个项目**里操作。如果跑到别的 Supabase 项目建表，前端读不到。

---

## 1. 第一步：建表 + 开启行级安全（只需做一次）

1. 打开 [Supabase 后台](https://supabase.com/dashboard)，登录后**选中项目 `pjgkevyhhnswknvwgvar`**。
2. 左侧菜单点 **SQL Editor**（SQL 编辑器）→ 点 **New query**（新建查询）。
3. 把下面整段 SQL 粘进去：

```sql
-- 1) 建表
create table if not exists public.vip_access (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null,          -- 必须是对方登录时用的邮箱
  note        text,                          -- 备注：谁、什么渠道赞助的
  active      boolean     not null default true,
  expires_at  timestamptz,                   -- 留空=永久；也可设到期时间
  created_at  timestamptz not null default now()
);

-- 2) 邮箱不区分大小写去重
create unique index if not exists vip_access_email_lower_key
  on public.vip_access (lower(email));

-- 3) 开启行级安全（RLS）
alter table public.vip_access enable row level security;

-- 4) 读策略：已登录用户只能读"自己那一行"
drop policy if exists vip_access_read_own on public.vip_access;
create policy vip_access_read_own
  on public.vip_access
  for select
  to authenticated
  using ( lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) );

-- 注意：刻意不建 insert/update/delete 策略。
-- 任何人（含赞助商本人）都不能在前端给自己开通，只能由你在后台手动加行。
```

4. 点右上角 **Run**（或按 Ctrl/Cmd+Enter）执行。
5. 执行成功后，左侧 **Table Editor**（表编辑器）里会出现一张 `vip_access` 表（目前为空）。

> 这段 SQL 已经存成项目文件 `docs/vip-access.sql`，以后想重跑或查看，直接打开它即可。

---

## 2. 第二步：开通一个赞助商（把邮箱加进白名单）

两种方式任选，**推荐用 SQL**（最快），图形界面留着给不想写 SQL 的时候用。

### 方式 A：SQL Editor（推荐，一行搞定）

新建一个 query，粘贴并改邮箱后 Run：

```sql
-- 永久开通（不限期）
insert into public.vip_access (email, note)
values ('friend@example.com', '2026-10 微信赞助');

-- 或者：限期开通（一年）
insert into public.vip_access (email, note, expires_at)
values ('friend@example.com', '年费赞助', now() + interval '1 year');
```

> 把 `friend@example.com` 换成对方**实际登录用的邮箱**，`note` 随便写（记谁、哪笔赞助）。

### 方式 B：Table Editor（图形界面）

1. 左侧 **Table Editor** → 选 `vip_access` 表 → 点 **Insert row**（插入行）。
2. 填：
   - `email`：对方登录邮箱（必填）
   - `note`：备注（选填）
   - `active`：勾上（true）
   - `expires_at`：留空=永久；要限期就点日历选个时间
3. 点 **Save**。

---

## 3. 第三步：日常管理（停用 / 恢复 / 延长 / 删除）

都在 SQL Editor 新建 query 执行（把邮箱换成实际地址）：

```sql
-- 停用某人（保留记录，不删除；对方立刻进不去）
update public.vip_access set active = false
 where lower(email) = 'friend@example.com';

-- 恢复某人
update public.vip_access set active = true
 where lower(email) = 'friend@example.com';

-- 延长 / 重设到期时间（改成一年）
update public.vip_access
   set expires_at = now() + interval '1 year'
 where lower(email) = 'friend@example.com';

-- 改成永久（清空期限）
update public.vip_access set expires_at = null
 where lower(email) = 'friend@example.com';

-- 彻底删除某条记录
delete from public.vip_access where lower(email) = 'friend@example.com';
```

查看全部名单（**只有你在后台能看到，前端看不到别人**）：

```sql
select email, active, expires_at, note, created_at
  from public.vip_access
 order by created_at desc;
```

---

## 4. 前端不用改，验证一下

门禁已经写死读这张表（`queryRow()` 查 `active` 与 `expires_at`，RLS 保证只看自己那行）。你加完行后：

1. 让对方（或你自己用另一个号）打开任意一个教练专用页，例如 `/tools/srs/index.html`。
2. 用**你刚加进表的那个邮箱**登录（邮箱验证码，注册即登录）。
3. 现象应为：**浮层消失，直接进入页面** ✅

测试"未开通"长什么样（可选）：
- 用一个**没加进表**的邮箱登录同一页 → 应显示"当前账号尚未开通" + 联系方式 + "我刚开通了，重新检测"按钮。

---

## 5. 重要说明 & 排错

### 站长邮箱已硬编码豁免
`380972743@qq.com`、`gamejia@qq.com` 已在 `vip-gate.js` 的 `OWNER_EMAILS` 里做本地豁免——
**即使这张表完全建错 / Supabase 故障，你用这个邮箱登录仍能进全部工具**。所以这个方案你永远不会因为配错表而把自己锁在外面。

### 邮箱必须"完全一致"
对方登录用的邮箱要和你写进表的邮箱**逐字相同**（大小写、空格都算）。
最稳妥的取法：让对方打开私密页，浮层上会显示 **"当前账号：xxx"**，以那个邮箱为准写进表。

### 对方说"我已开通但还是提示未开通"的排查顺序
1. 比对邮箱：浮层"当前账号"显示的邮箱 vs 表里 `email`，是否一字不差。
2. 在 SQL Editor 查：`select * from public.vip_access where lower(email)=lower('对方邮箱');`
3. 确认 `active = true` 且 `expires_at` 为空或未过期。
4. 让对方点浮层上的「换个账号」退出重登（旧会话可能缓存了未开通状态）。

### 所有人都打不开（含你自己）
若整站私密页都报"服务不可用"，检查：
- 表是否真的建成（`Table Editor` 里看得到 `vip_access`）；
- 第 1 步的 SQL 是否完整执行（尤其是 `enable row level security` 和 `create policy` 那段）。
> 站长邮箱仍可进，所以用站长号进去后按上面排查即可。

### 安全边界（务必理解）
- 本站是 GitHub Pages **纯静态站**，本门禁是**前端软拦截 + 引导付费**，不是加密墙。
- 技术用户可直接抓 HTML 源码看到页面结构；所以**私密页里不要放真正机密的内容**。
- 白名单表开了 RLS：每个登录用户**只能读到自己那一行**，看不到其他赞助商名单；且**没有** insert/update/delete 策略，任何人无法在前端自助开通。

---

## 6. 一句话流程（给管理员自己备忘）

> 对方赞助 → 问到他登录邮箱 → SQL Editor 里 `insert into vip_access (email,note) values ('对方邮箱','备注')` → Run → 让对方重登即可。
> 要停 → `update vip_access set active=false where lower(email)='对方邮箱'`。
