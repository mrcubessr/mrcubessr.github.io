-- =============================================================
-- 教练专用功能：VIP 白名单表（v2.0.37）
-- -------------------------------------------------------------
-- 用途：记录"哪些账号开通了教练专用工具"。
--      前端 assets/js/vip-gate.js 会查询当前登录账号是否在本表中。
--
-- 怎么用：打开 Supabase 后台 → 左侧 SQL Editor → New query
--        把本文件整段粘进去 → 点 RUN（只需执行一次）
--
-- ⚠️ 安全说明：这张表启用了 RLS（行级安全），
--    每个登录用户**只能读到自己那一行**，看不到其他人的名单，
--    也无法自己往表里插入给自己开通。
-- =============================================================

-- 1) 建表
create table if not exists public.vip_access (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null,          -- 必须是对方登录时用的邮箱
  note        text,                          -- 备注：谁、什么渠道赞助的
  active      boolean     not null default true,
  expires_at  timestamptz,                   -- 可留空 = 永久；也可设到期时间
  created_at  timestamptz not null default now()
);

-- 2) 邮箱不区分大小写去重（避免同一个人被加两次）
create unique index if not exists vip_access_email_lower_key
  on public.vip_access (lower(email));

-- 3) 开启行级安全（RLS）
alter table public.vip_access enable row level security;

-- 4) 读策略：已登录用户只能读自己那一行
drop policy if exists vip_access_read_own on public.vip_access;
create policy vip_access_read_own
  on public.vip_access
  for select
  to authenticated
  using ( lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) );

-- ⚠️ 刻意**不建** insert / update / delete 策略：
--    任何人都不能在前端给自己开通，只能由你在 Supabase 后台手动加行。


-- =============================================================
-- 日常操作（每次要改时，粘这一段到 SQL Editor 执行）
-- =============================================================

-- 开通给某人（把邮箱换成对方的）
-- insert into public.vip_access (email, note)
-- values ('friend@example.com', '2026-10 赞助者');

-- 到期制：开通一年
-- insert into public.vip_access (email, note, expires_at)
-- values ('friend@example.com', '年费', now() + interval '1 year');

-- 停用某人（保留记录，不删除）
-- update public.vip_access set active = false where lower(email) = 'friend@example.com';

-- 恢复某人
-- update public.vip_access set active = true where lower(email) = 'friend@example.com';

-- 延长到期时间
-- update public.vip_access set expires_at = now() + interval '1 year'
--  where lower(email) = 'friend@example.com';

-- 查看全部名单（只有你在后台能看，前端看不到）
-- select email, active, expires_at, note, created_at
--   from public.vip_access order by created_at desc;

-- 彻底删除某条记录
-- delete from public.vip_access where lower(email) = 'friend@example.com';


-- =============================================================
-- 排错
-- =============================================================
-- 现象：对方说"我已经开通了，但还是提示未开通"
-- 排查顺序：
--   1) 对方登录用的邮箱，和你写进表里的邮箱是否**完全一致**（大小写、@前后空格）
--      让对方打开页面，浮层上会显示"当前账号：xxx"，以那个为准。
--   2) 查一下是否真的有这条记录：
--        select * from public.vip_access where lower(email) = lower('对方邮箱');
--   3) 确认 active 为 true、expires_at 为空或未过期。
--   4) 让对方退出重登（会话可能缓存了旧状态）：浮层上有「换个账号」。

-- 现象：所有人都打不开（包括你自己）
--   原因可能是 RLS 策略没生效或表没建成。
--   注意：站长邮箱 380972743@qq.com、gamejia@qq.com 已在 vip-gate.js 的 OWNER_EMAILS 里做了本地豁免，
--   即使这张表完全不可用，你用这个邮箱登录仍可正常使用全部工具。
