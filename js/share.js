export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 设置 CORS 跨域请求头
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // 1. 处理预检请求 (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 2. GET 请求：接收短码 id，从 KV 读取数据
  if (request.method === "GET") {
    const id = url.searchParams.get("id");
    if (!id) {
      return new Response(JSON.stringify({ error: "缺少 id 参数" }), { 
        status: 400, 
        headers: { "Content-Type": "application/json;charset=UTF-8", ...corsHeaders } 
      });
    }

    try {
      // 通过绑定的名称 "share" 访问 KV 数据库
      const data = await env.share.get(id);
      if (!data) {
        return new Response(JSON.stringify({ error: "数据不存在或已过期" }), { 
          status: 404, 
          headers: { "Content-Type": "application/json;charset=UTF-8", ...corsHeaders } 
        });
      }
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/json;charset=UTF-8", ...corsHeaders }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, 
        headers: { "Content-Type": "application/json;charset=UTF-8", ...corsHeaders } 
      });
    }
  }

  // 3. POST 请求：接收前端传来的配置，存入 KV 并生成短码返回
  if (request.method === "POST") {
    try {
      const body = await request.text();
      
      // 生成 6 位随机短链字符
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let id = '';
      for (let i = 0; i < 6; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      // 存入 KV 数据库，并设置自动过期时间 (30天 = 2592000秒) 以免长期堆积
      await env.share.put(id, body, { expirationTtl: 2592000 });

      return new Response(JSON.stringify({ id: id }), {
        status: 200,
        headers: { "Content-Type": "application/json;charset=UTF-8", ...corsHeaders }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, 
        headers: { "Content-Type": "application/json;charset=UTF-8", ...corsHeaders } 
      });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}