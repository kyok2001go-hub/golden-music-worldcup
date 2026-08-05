export async function onRequest(context) {
  // 1. 获取前端传过来的参数
  const url = new URL(context.request.url);
  const term = url.searchParams.get('term');
  const artistId = url.searchParams.get('artistId');
  const entity = url.searchParams.get('entity');

  if (!term && !artistId) {
    return new Response(JSON.stringify({ error: "Missing term parameter" }), { 
      status: 400,
      headers: { "Content-Type": "application/json;charset=UTF-8" }
    });
  }

  // 2. 拼接 iTunes 真实的请求地址
  let targetUrl;
  if (entity === 'musicArtist') {
    // 歌手候选搜索：强制带上 &lang=zh_cn 确保苹果接口返回简体中文歌手名
    // 【修复】：移除 &attribute=artistTerm，放宽匹配条件，解决搜不到“萧亚轩”等歌手的问题
    targetUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=musicArtist&limit=10&country=CN&lang=zh_cn`;
  } else {
    // 歌曲大乱斗 & 单歌手模式统一：使用 /search 模糊搜索，不加 media=music，不加 lookup，确保获取最多歌曲（166首）
    const searchKW = term || artistId;
    targetUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchKW)}&entity=song&attribute=artistTerm&limit=200&country=CN`;
  }

  try {
    // 3. 由 Cloudflare 代理请求苹果服务器，伪装 User-Agent
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