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

  if (entity === 'artist_candidate') {
    // 【核心修复】：大乱斗搜歌手，彻底废弃 musicArtist，改为搜歌 (entity=song)，限制30首足够提取出歌手
    targetUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchKW)}&entity=song&limit=30&country=CN`;
  } else {
    // 【核心修复】：获取歌单时，彻底移除 &attribute=artistTerm，最大程度防止苹果漏抓
    targetUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchKW)}&entity=song&limit=200&country=CN`;
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