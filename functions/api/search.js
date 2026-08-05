export async function onRequest(context) {
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

  let targetUrl;
  const searchKW = term || artistId;

  if (entity === 'musicArtist') {
    targetUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchKW)}&entity=musicArtist&attribute=artistTerm&limit=10&country=CN&lang=zh_cn`;
  } else {
    // 【核心修复】：为所有的歌曲级别搜索也补上 lang=zh_cn，防止语言漂移
    targetUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchKW)}&entity=song&attribute=artistTerm&limit=200&country=CN&lang=zh_cn`;
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const data = await response.json();

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