/* ===== api.js — iTunes 接口请求逻辑 ===== */
var GM = window.GM = window.GM || {};

GM.CORS_PROXY = "https://api.allorigins.win/raw?url=";
GM.BASE_URL = "https://itunes.apple.com"; 

GM._jsonpMode = false;
GM._jsonpSeq = 0;

GM.get = async function(url) {
  if (!GM._jsonpMode && window.fetch) {
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function() { ctrl.abort(); }, 9000); 
      try {
        var response = await fetch(url, { signal: ctrl.signal });
        if (!response.ok) throw new Error("HTTP " + response.status);
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      console.warn("Fetch 失败 (可能被 iOS 拦截)，切换到 JSONP 模式:", error);
      GM._jsonpMode = true; 
    }
  }
  
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
      previewUrl: it.previewUrl || "",
      source: 'api'
    };
  }
  return { songs: songs, metaData: metaData };
};

/* ===== 核心获取歌手歌曲（单歌手模式） ===== */
GM.coreFetchArtist = function (name, onSuccess, onFail) {
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

/* ===== V3.0.2优化 歌曲大乱斗：歌手候选搜索（entity=musicArtist，带 &lang=zh_cn） ===== */
GM.fetchArtistCandidates = function (term) {
  // 【修复】：移除 &attribute=artistTerm，放宽匹配条件
  var query = "/search?term=" + encodeURIComponent(term) + "&entity=musicArtist&limit=10&country=CN&lang=zh_cn";
  var targetUrl = GM.BASE_URL + query;

  function parse(data) {
    var results = (data && data.results) || [];
    var out = [];
    var seen = {};
    for (var i = 0; i < results.length; i++) {
      var it = results[i];
      if (!it || !it.artistId || !it.artistName) continue;
      var id = String(it.artistId);
      if (seen[id]) continue;
      seen[id] = 1;
      out.push({ artistId: id, artistName: it.artistName, genre: it.primaryGenreName || "" });
      if (out.length >= 8) break;
    }
    return out;
  }

  return GM.get(targetUrl).then(parse).catch(function (e) {
    console.warn("歌手候选直连失败，启用 Functions 代理", e);
    return fetch("/api/search?term=" + encodeURIComponent(term) + "&entity=musicArtist")
      .then(function (res) {
        if (!res.ok) throw new Error("Functions API Error");
        return res.json();
      })
      .then(parse)
      .catch(function (e2) {
        console.warn("Functions 代理失败，降级到公共 CORS 代理:", e2);
        return new Promise(function (resolve, reject) {
          GM.fetchJson(GM.CORS_PROXY + encodeURIComponent(targetUrl), function (err, data) {
            if (err) { reject(err); return; }
            resolve(parse(data));
          });
        });
      });
  });
};

/* ===== V3.0.2优化 歌曲大乱斗：解析某歌手的完整歌单 ===== */
GM.handleBrawlSongs = function (artistId, artistName, data) {
  var results = (data && data.results) || [];
  var seen = {};
  var songs = [];

  for (var i = 0; i < results.length; i++) {
    var it = results[i];
    if (!it || it.wrapperType !== "track" || it.kind !== "song") continue;
    if (!it.trackId || !it.trackName) continue;
    
    var track = (it.trackName || "").replace(/^\s+|\s+$/g, "");
    if (!track) continue;
    if (/(live|remix|acoustic)/i.test(track)) continue;

    var key = track.toLowerCase();
    if (seen[key]) continue;
    seen[key] = 1;

    songs.push({
      trackId: String(it.trackId),
      trackName: track,
      artistId: String(artistId),
      artistName: it.artistName || artistName || "",
      collectionName: it.collectionName || "",
      releaseDate: it.releaseDate || "",
      artworkUrl100: it.artworkUrl100 || "",
      previewUrl: it.previewUrl || "",
      source: 'api'
    });
    if (songs.length >= 200) break;
  }
  return songs;
};

/* ===== V3.0.2优化 歌曲大乱斗：按歌手名搜索歌曲（走 /search 获得最多歌曲，与单歌手模式彻底一致） ===== */
GM.fetchArtistSongsById = function (artistId, artistName) {
  var query = "/search?term=" + encodeURIComponent(artistName) + "&entity=song&attribute=artistTerm&limit=200&country=CN";
  var targetUrl = GM.BASE_URL + query;

  function parse(data) {
    return GM.handleBrawlSongs(artistId, artistName, data);
  }

  return GM.get(targetUrl).then(function (data) {
    var songs = parse(data);
    if (songs.length === 0) throw new Error("EMPTY");
    return songs;
  }).catch(function (e) {
    console.warn("大乱斗直连获取歌曲失败，启用 Functions 代理", e);
    // 强制传 term=artistName 走 /search，杜绝走 lookup 精确接口
    return fetch("/api/search?term=" + encodeURIComponent(artistName))
      .then(function (res) {
        if (!res.ok) throw new Error("Functions API Error");
        return res.json();
      })
      .then(function (data) {
        var songs = parse(data);
        if (songs.length === 0) throw new Error("EMPTY");
        return songs;
      })
      .catch(function (e2) {
        console.warn("Functions 代理失败，降级到公共 CORS 代理:", e2);
        return new Promise(function (resolve, reject) {
          GM.fetchJson(GM.CORS_PROXY + encodeURIComponent(targetUrl), function (err, data) {
            if (err) { reject(err); return; }
            var songs = parse(data);
            if (songs.length === 0) { reject(new Error("EMPTY")); return; }
            resolve(songs);
          });
        });
      });
  });
};

GM.extractCoversFromApiRes = function (res) {
  var allCovers = [];
  for (var i = 0; i < res.songs.length; i++) {
    var s = res.songs[i];
    if (res.metaData[s] && res.metaData[s].artworkUrl100) {
      var url = res.metaData[s].artworkUrl100.replace('100x100bb', '600x600bb');
      if (allCovers.indexOf(url) === -1) {
        allCovers.push(url);
      }
    }
  }

  for (var k = allCovers.length - 1; k > 0; k--) {
    var j = Math.floor(Math.random() * (k + 1));
    var tmp = allCovers[k];
    allCovers[k] = allCovers[j];
    allCovers[j] = tmp;
  }
  return allCovers.slice(0, 8);
};