/* =============================================================
 * Vercel Serverless Function — Supabase 反向代理
 * -------------------------------------------------------------
 * 路由：/api/sb/<任何路径>  →  <SB_UPSTREAM>/<任何路径>
 * 用途：国内部分网络（尤其手机流量）直连 *.supabase.co 不通，
 *       站点前端探测到直连失败时，自动改走本代理完成登录/数据同步。
 *
 * 设计要点：
 *   · 全量透传 method / 头（去掉逐跳头）/ body / 查询串（PostgREST 依赖 ?select=...）
 *   · OPTIONS 预检直接 204 + CORS（浏览器跨域调用必需）
 *   · 响应统一加 CORS 头 + no-store，剥掉 content-encoding（代理侧已解压）
 *   · anon key 本就是公开前端密钥，安全边界仍是 Supabase RLS，代理不引入新风险
 * 上游地址：环境变量 SB_UPSTREAM 可覆盖（默认内网项目地址）
 * ============================================================= */
const UPSTREAM_DEFAULT = 'https://pjgkevyhhnswknvwgvar.supabase.co';
const PREFIX = '/api/sb';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'apikey,authorization,content-type,x-client-info,x-supabase-api-version,prefer,accept-profile,content-profile,range,accept,accept-language,count,return',
  'Access-Control-Expose-Headers': 'content-range,x-total-count',
  'Access-Control-Max-Age': '86400'
};

module.exports = async function handler(req, res) {
  /* 预检：直接放行 */
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  const upstream = (process.env.SB_UPSTREAM || UPSTREAM_DEFAULT).replace(/\/+$/, '');
  let path = req.url || '/';
  if (path.indexOf(PREFIX) === 0) path = path.slice(PREFIX.length) || '/';
  if (path[0] !== '/') path = '/' + path;

  /* 收集 body（同步数据均为小 JSON，内存缓冲足够） */
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    body = chunks.length ? Buffer.concat(chunks) : undefined;
  }

  /* 透传请求头（去掉逐跳头；identity 避免 gzip 解压分支） */
  const headers = Object.assign({}, req.headers);
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];
  delete headers['accept-encoding'];
  headers['accept-encoding'] = 'identity';

  try {
    const r = await fetch(upstream + path, {
      method: req.method,
      headers: headers,
      body: body
    });
    /* 上游（Kong/CF）自带一份 CORS 头，若与我们的重复会导致浏览器报
       "multiple Access-Control-Allow-Origin" → ERR_FAILED。全部剥掉，只留下面这份。 */
    const SKIP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']);
    const resHeaders = {};
    r.headers.forEach((v, k) => {
      const kl = k.toLowerCase();
      if (SKIP.has(kl) || kl.indexOf('access-control-') === 0) return;
      resHeaders[k] = v;
    });
    Object.assign(resHeaders, CORS);
    resHeaders['Cache-Control'] = 'no-store';

    res.writeHead(r.status, resHeaders);
    const buf = Buffer.from(await r.arrayBuffer());
    return res.end(buf);
  } catch (e) {
    res.writeHead(502, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
    return res.end(JSON.stringify({ proxy_error: String((e && e.message) || e) }));
  }
};
