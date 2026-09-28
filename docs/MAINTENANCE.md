# 网站维护管理计划（fto-site 魔方训练站）

> 适用版本：1.0.0 起
> 目标：让站点「可更新、可回滚、不丢库、不泄密」

---

## 1. 版本与发布管理

- **语义化版本**：MAJOR=不兼容口径变更 / MINOR=向后兼容功能新增 / PATCH=缺陷修复。版本号写入 `docs/VERSION`，变更同步追加 `docs/CHANGELOG.md` 顶部条目。
- **分支模型**：`main` = 可上线稳定版；新功能在独立功能分支开发，合并走 `git merge --no-ff`（**禁止 `git rebase`**）。
- **标签**：每个发布打轻量标签 `v<版本号>`（如 `v1.0.0`）。默认仅本地留存；推送公网属「公开发布」，须经确认。
- **发布节奏**：稳定后可按月/按里程碑发布；紧急修复走 PATCH 即时发布。

## 2. 备份与恢复（防 360 误删 / 防库损坏）

- **`.git` 快照（核心）**：360 安全卫士（`360tray`/`360UDiskPro`）会静默删除 `.git` 内容。每次上线前执行：
  ```
  robocopy .git D:\魔方站点备份\.git-snapshots\fto-site-<时间戳> /E
  ```
- **周自动快照**：已建每周自动任务，对 `D:/魔方站点备份/fto-site/.git` 做 `robocopy` 副本并校验。
- **多副本**：快照目录 `D:\魔方站点备份\.git-snapshots\` 与仓库分处，建议再有一份异盘/云备份。
- **损坏判定**：仓库异常先怀疑 360，而非代码问题；用 `git fsck` 快速验证对象库完整性。
- **恢复**：从最新快照 `robocopy` 回 `.git` 即可；`.git.broken-*` 为旧对象库留档，已被 gitignore。

## 3. 上线前质量门禁

1. 本地起服务（`python serve_threaded.py`，端口 8256），跑回归脚本（`.workbuddy/outputs/`）。
2. **断言必须覆盖真实点击路径**（学生列表 / 计分页 / 计时路径），不能只跑默认视图——本地全绿 ≠ 线上可用。
3. `node --check` + 控制台无报错；同文件多处改动串行 Edit，改完必查控制台。
4. 推送后等约 85s 让 GitHub Pages 构建完，再跑线上实机抽样（直连，勿走代理）。
5. 用 `git ls-remote origin refs/heads/main` 对比 HEAD 确认已推送（本地 `status` 的 ahead 计数可能假象）。

## 4. 隐私与合规（保护重要信息）

- **`.gitignore` 审计清单（已生效）**：`output/`（含学生姓名截图）、`.git.broken-*/`（旧对象库）、`tools/cfop/data/_raw/`、`assets/pets/ref/` 等不得发布。
- **禁止 PII 入库**：学生学号/姓名/积分存于用户侧云存储或 LocalStorage，源码仅作 UI 导入项，**不得硬编码**入仓库。
- **密钥红线**：仓库内只允许 Supabase **公开 anon key**（配合 RLS 本就公开）；**严禁 `service_role` 私有密钥 / 任何 JWT 私钥 / 平台 token** 入库。一旦误提交：立即在提供方后台轮换 + 用 `git filter-repo` 清历史（清历史属破坏性操作，先快照再执行）。
- **发布前自查**：`git diff --stat` 看增删行数，警惕把审计截图/旧对象库带进提交。

## 5. 代码与协作红线

- `.git` 内部文件禁止用 Write/Edit 修改，改引用走 git 命令。
- git 操作走 PowerShell；提交用「写 msg 文件 + `git commit -F <file>`」，**勿用 `git commit -F - <<'EOF'`**（会被误解析成额外命令）。
- 同一文件多处修改必须串行 Edit（并发互相覆盖、静默丢改动）。
- 判定「是不是我改坏的」先看 `git diff --stat` 增删行数；陈旧回归脚本会伪装成新回归。
- 大范围重命名/破坏性变更前先问确认。

## 6. 定期巡检清单

| 频率 | 动作 |
|------|------|
| 每次上线前 | `.git` 快照 + 回归脚本 + 线上抽样 |
| 每周（自动） | `.git` 快照任务 |
| 每月 | `git fsck` 验库完整性；复查 `.gitignore` 是否覆盖新敏感目录；核对 `docs/VERSION` 与线上一致 |
| 每次发布 | 打 `v*` 标签 + 追加 CHANGELOG + 同步 VERSION |
| 季度 | 密钥复核（无 service_role 入库）；依赖/SDK 版本复核 |
