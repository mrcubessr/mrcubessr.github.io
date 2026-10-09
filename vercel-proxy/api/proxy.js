/* =============================================================
 * Vercel Serverless Function — Supabase 反向代理（显式路由版）
 * -------------------------------------------------------------
 * 由 vercel.json 的 rewrites 把 /api/sb/<path> 显式转发到这里：
 *   /api/sb/auth/v1/health  →  /api/proxy?up=auth/v1/health
 * 同时保留直呼兼容：/api/proxy/<path> 也剥前缀透传。
 * （api/sb/[[...path]].js 的文件名约定式路由在某些项目配置下
 *   未被 Vercel 构建收录，改用显式 rewrite 不再依赖自动探测。）
 * ============================================================= */
const UPSTREAM_DEFAULT = 'https://pjgkevyhhnswknvwgvar.supabase.co';

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

  /* 取子路径：优先 ?up=（rewrite 传入），否则剥掉已知前缀 */
  const url = new URL(req.url || '/', 'http://internal');
  let sub = url.searchParams.get('up');
  if (!sub) {
    let p = url.pathname;
    for (const pre of ['/api/sb', '/api/proxy']) {
      if (p.indexOf(pre) === 0) { p = p.slice(pre.length) || '/'; break; }
    }
    sub = p;
  }
  if (sub[0] !== '/') sub = '/' + sub;
  const qs = url.search.replace(/[?&]up=[^&]*/, '').replace(/^\&/, '');
  const target = upstream + sub + (qs ? '?' + qs : '');

  /* 收集 body（同步数据均为小 JSON，内存缓冲足够） */
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    body = chunks.length ? Buffer.concat(chunks) : undefined;
  }

  /* 透传请求头（去掉逐跳头；identity 避免上游 gzip 分支） */
  const headers = Object.assign({}, req.headers);
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];
  delete headers['accept-encoding'];
  headers['accept-encoding'] = 'identity';

  try {
    const r = await fetch(target, { method: req.method, headers: headers, body: body });
    /* 上游（Kong/CF）自带 CORS 头，与我们的重复会致浏览器 ERR_FAILED，全部剥掉 */
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
