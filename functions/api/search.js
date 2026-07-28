export async function onRequest(context) {
  // 1. 获取前端传过来的参数
  const url = new URL(context.request.url);
  const term = url.searchParams.get('term');

  if (!term) {
    return new Response(JSON.stringify({ error: "Missing term parameter" }), { 
      status: 400,
      headers: { "Content-Type": "application/json;charset=UTF-8" }
    });
  }

  // 2. 拼接 iTunes 真实的请求地址 (带上 attribute=artistTerm 精准匹配歌手)
  const targetUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&attribute=artistTerm&limit=200&country=CN&media=music`;

  try {
    // 3. 核心：由 Cloudflare 代理请求苹果服务器，并伪装 User-Agent 为桌面端
    // 这样苹果就不会返回针对移动端的拦截逻辑（拉起 Apple Music App）
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const data = await response.json();

    // 4. 将拿到的 JSON 数据原封不动返回给前端
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        // 允许跨域（虽然都在同一个 pages.dev 域名下，但加上更保险）
        "Access-Control-Allow-Origin": "*", 
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json;charset=UTF-8" }
    });
  }
}
