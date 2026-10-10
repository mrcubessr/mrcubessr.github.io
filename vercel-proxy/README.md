# Supabase 反向代理（部署在 Vercel）

国内部分网络（尤其手机流量）直连 `*.supabase.co` 不通，导致手机端登录失败。  
把这个小项目部署到 Vercel 后，登录请求可以走你自己的 Vercel 域名转发，  
站点前端会**自动探测**：直连通就用直连，直连不通就自动改走这个代理，无需手动切换。

## 部署步骤（网页操作，约 5 分钟）

1. 打开 <https://vercel.com> ，用 GitHub 账号（mrcubessr）登录。
2. 右上角 **Add New → Project**。
3. 在「Import Git Repository」里找到 `mrcubessr/mrcubessr.github.io`，点 **Import**。  
   （找不到就点「Adjust GitHub App Permissions」授权这个仓库）
4. 在配置页 **Before Deploying**：
   - **Root Directory**：点 Edit，选中 `vercel-proxy`，确认框选 include 上游文件时选 **Include**。
   - Framework Preset 保持 **Other**。
   - Build Command / Output Directory 全部留空。
   - （可选）Environment Variables 加一条：`SB_UPSTREAM` = 你的 Supabase 项目地址  
     （不填则用代码里的默认值，默认值就是当前项目，可不填）。
5. 点 **Deploy**，等 1 分钟左右完成。
6. 部署完成后页面会给你一个域名，形如 `https://xxxx.vercel.app`。  
   **验证**：浏览器打开 `https://xxxx.vercel.app/api/sb/auth/v1/health`，  
   看到 JSON（哪怕是报错 JSON）就说明代理活了。

## 部署后要做什么

把 `https://xxxx.vercel.app/api/sb` 这个地址填回主站 `assets/js/cb-config.js` 的  
`supabaseProxyUrl` 字段并推送上线，手机端即可自动走代理登录。

## 注意

- `*.vercel.app` 在国内**大部分网络可达，但不保证全部**。部署后请先用手机浏览器  
  直接打开上面的 health 地址测一下；如果手机也打不开 vercel.app，就需要给这个  
  Vercel 项目绑定一个自定义域名（Settings → Domains，CNAME 解析到  
  `cname.vercel-dns.com`），并把填回主站的地址换成自定义域名。
- 该代理只转发 Supabase API，不存储任何数据；anon key 本就是公开前端密钥，  
  数据安全边界仍是 Supabase 的 Row Level Security，代理不引入新风险。

