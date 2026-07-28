/* ===== api.js — iTunes 接口请求逻辑 ===== */
var GM = window.GM = window.GM || {};

GM.CORS_PROXY = "https://api.allorigins.win/raw?url=";
GM.BASE_URL = "https://itunes.apple.com"; // 修复1：抛弃 .com.cn，统一使用全球主域名规避强拦截

GM._jsonpMode = false; // 全局标记：一旦 fetch 被拦截（如 iOS），后续全走 JSONP
GM._jsonpSeq = 0;

/* ===== 高度封装的统一请求 (Fetch 优先，失败秒切 JSONP) ===== */
GM.get = async function(url) {
  if (!GM._jsonpMode && window.fetch) {
    try {
      var ctrl = new AbortController();
      // 修复3：9秒超时物理斩断，防止 iOS 遇到拦截时挂起请求导致假死
      var timer = setTimeout(function() { ctrl.abort(); }, 9000); 
      try {
        var response = await fetch(url, { signal: ctrl.signal });
        if (!response.ok) throw new Error("HTTP " + response.status);
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      // 修复4：只要 fetch 失败（被 iOS 拦截抛出 CORS 或中止），立即全局切为 JSONP
      console.warn("Fetch 失败 (可能被 iOS 拦截)，切换到 JSONP 模式:", error);
      GM._jsonpMode = true; 
    }
  }
  
  // JSONP 兜底（直接生成 script 标签，完美规避 iOS Universal Links 拦截）
  return new Promise(function(resolve, reject) {
    var cbName = "__itunesCb" + (++GM._jsonpSeq);
    var script = document.createElement("script");
    var done = false;
    
    var timer = setTimeout(function() {
      if (done) return; done = true;
      cleanup();
      reject(new Error("JSONP Timeout"));
    }, 12000);
    
    function cleanup() {
      clearTimeout(timer);
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    
    window[cbName] = function(data) {
      if (done) return; done = true;
      cleanup();
      resolve(data);
    };
    
    script.onerror = function() {
      if (done) return; done = true;
      cleanup();
      reject(new Error("JSONP Failed"));
    };
    
    script.src = url + (url.indexOf("?") > -1 ? "&" : "?") + "callback=" + cbName;
    document.body.appendChild(script); 
  });
};

/* ===== 旧的通用 Fetch 请求 (保留给 CORS 代理兜底用) ===== */
GM.fetchJson = function (url, cb) {
  if (!window.fetch) { cb(new Error("no fetch")); return; }
  var timer = setTimeout(function () { cb(new Error("请求超时")); }, 12000);
  fetch(url).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }).then(function (data) {
    clearTimeout(timer);
    cb(null, data);
  }).catch(function (e) {
    clearTimeout(timer);
    cb(e);
  });
};

/* ===== 歌曲数据处理 ===== */
GM.handleSongs = function (name, data) {
  var limit = GM.seeds();
  var results = (data && data.results) || [];
  var kw = name.toLowerCase();
  var seen = {};
  var songs = [];
  var metaData = {};

  for (var i = 0; i < results.length; i++) {
    var it = results[i];
    var track = (it.trackName || "").replace(/^\s+|\s+$/g, "");
    var artist = (it.artistName || "").toLowerCase();
    if (!track) continue;
    if (/(live|remix|acoustic)/i.test(track)) continue;
    if (artist.indexOf(kw) === -1 && kw.indexOf(artist) === -1) continue;
    var key = track.toLowerCase();
    if (seen[key]) continue;
    seen[key] = 1;

    var songStr = track.slice(0, 30);
    songs.push(songStr);

    metaData[songStr] = {
      trackName: track,
      artistName: it.artistName || "",
      collectionName: it.collectionName || "",
      releaseDate: it.releaseDate || "",
      artworkUrl100: it.artworkUrl100 || "",
      source: 'api'
    };

    if (songs.length >= limit) break;
  }
  return { songs: songs, metaData: metaData };
};

/* ===== 核心获取歌手歌曲 ===== */
GM.coreFetchArtist = function (name, onSuccess, onFail) {
  // 修复2：关键移除容易触发 Apple Music 唤醒的 &media=music 参数，仅保留 entity=song
  var query = "/search?term=" + encodeURIComponent(name) + "&entity=song&attribute=artistTerm&limit=200&country=CN";
  var targetUrl = GM.BASE_URL + query;
  
  function onData(data) {
    var res = GM.handleSongs(name, data);
    if (res.songs.length === 0) {
      onFail("未找到「" + name + "」的热门歌曲，请检查歌手名或换个写法");
      return;
    }
    onSuccess(res);
  }

  function failAll() {
    onFail("获取失败：无法连接歌曲服务，请换个网络环境再试，或到电脑端使用该功能");
  }

  // 使用封装好的 GM.get，它会自动处理 iOS 拦截并实现 Fetch 到 JSONP 的无缝降级
  GM.get(targetUrl)
    .then(function(data) {
      onData(data);
    })
    .catch(function(e) {
      console.warn("官方直连与 JSONP 均失败，启用 Functions 代理兜底", e);
      tryFunctionsProxy();
    });

  function tryFunctionsProxy() {
    var apiUrl = "/api/search?term=" + encodeURIComponent(name);
    fetch(apiUrl)
      .then(function(res) {
        if (!res.ok) throw new Error("Functions API Error");
        return res.json();
      })
      .then(function(data) {
        onData(data);
      })
      .catch(function(e) {
        console.warn("Functions 代理失败，最后降级到公共 CORS 代理:", e);
        tryProxy();
      });
  }

  function tryProxy() {
    GM.fetchJson(GM.CORS_PROXY + encodeURIComponent(targetUrl), function (err, data) {
      if (err) { failAll(); return; }
      onData(data);
    });
  }
};

/* ===== 提取封面通用逻辑 ===== */
GM.extractCoversFromApiRes = function (res) {
  var newCovers = [];
  for (var i = 0; i < res.songs.length; i++) {
    var s = res.songs[i];
    if (res.metaData[s] && res.metaData[s].artworkUrl100) {
      var url = res.metaData[s].artworkUrl100.replace('100x100bb', '600x600bb');
      if (newCovers.indexOf(url) === -1) {
        newCovers.push(url);
      }
    }
    if (newCovers.length >= 8) break;
  }
  return newCovers;
};