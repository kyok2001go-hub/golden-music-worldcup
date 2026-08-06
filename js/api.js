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
  // 【修复】：追加 &lang=zh_cn，确保语境纯净
  var query = "/search?term=" + encodeURIComponent(name) + "&entity=song&attribute=artistTerm&limit=200&country=CN&lang=zh_cn";
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
    fetch("/api/search?term=" + encodeURIComponent(name))
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

/* ===== V3.0.4 终极双通道 歌曲大乱斗：歌手候选搜索 ===== */
GM.fetchArtistCandidates = function (term) {
  var queryArtist = "/search?term=" + encodeURIComponent(term) + "&entity=musicArtist&attribute=artistTerm&limit=10&country=CN&lang=zh_cn";
  var targetUrlArtist = GM.BASE_URL + queryArtist;

  // 1. 提取官方歌手实体结果
  function parseArtistData(data) {
    var results = (data && data.results) || [];
    var out = [];
    var seen = {};
    var kw = (term || "").toLowerCase();
    for (var i = 0; i < results.length; i++) {
      var it = results[i];
      if (!it || !it.artistId || !it.artistName) continue;
      
      // 【核心防御】：防止苹果返回“乱七八糟不包含关键字的合集歌手”导致不触发降级
      // 因为加了 lang=zh_cn，简繁差异已抹平，可以放心校验
      var nameLower = it.artistName.toLowerCase();
      if (nameLower.indexOf(kw) === -1 && kw.indexOf(nameLower) === -1) {
        continue; // 丢弃不相关的假阳性歌手
      }

      var id = String(it.artistId);
      if (seen[id]) continue;
      seen[id] = 1;
      out.push({ artistId: id, artistName: it.artistName, genre: it.primaryGenreName || "" });
      if (out.length >= 8) break;
    }
    return out;
  }

  // 2. 智能拆分合作歌手名称
  function extractCleanName(rawName, kw) {
    if (!rawName) return kw;
    var cleanKW = kw.trim().toLowerCase();
    var parts = rawName.split(/[,&/、;]|\s+feat\.?\s+|\s+Feat\.?\s+|\s+与\s+|\s+和\s+/i);
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p].trim();
      if (part.toLowerCase().indexOf(cleanKW) !== -1 || cleanKW.indexOf(part.toLowerCase()) !== -1) {
        return part;
      }
    }
    return rawName;
  }

  // 3. 从歌曲列表中提取歌手（降级方案）
  function parseSongData(data) {
    var results = (data && data.results) || [];
    var out = [];
    var seen = {};
    for (var i = 0; i < results.length; i++) {
      var it = results[i];
      if (!it || !it.artistId || !it.artistName) continue;
      var id = String(it.artistId);
      if (seen[id]) continue;
      seen[id] = 1;

      var cleanName = extractCleanName(it.artistName, term);
      out.push({ artistId: id, artistName: cleanName, genre: it.primaryGenreName || "" });
      if (out.length >= 8) break;
    }
    return out;
  }

  // 降级查询歌曲库
  function fallbackToSongSearch() {
    // 【核心修复】：追加 &lang=zh_cn，防止降级通道语言漂移
    var querySong = "/search?term=" + encodeURIComponent(term) + "&entity=song&attribute=artistTerm&limit=40&country=CN&lang=zh_cn";
    var targetUrlSong = GM.BASE_URL + querySong;

    return GM.get(targetUrlSong).then(parseSongData).catch(function () {
      return fetch("/api/search?term=" + encodeURIComponent(term) + "&entity=song")
        .then(function (res) { return res.json(); })
        .then(parseSongData)
        .catch(function () { return []; });
    });
  }

  // 优先查询官方歌手实体库
  return GM.get(targetUrlArtist).then(function (data) {
    var list = parseArtistData(data);
    if (list.length > 0) return list; 
    return fallbackToSongSearch();   
  }).catch(function () {
    return fetch("/api/search?term=" + encodeURIComponent(term) + "&entity=musicArtist")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var list = parseArtistData(data);
        if (list.length > 0) return list;
        return fallbackToSongSearch();
      })
      .catch(function () {
        return fallbackToSongSearch();
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

/* ===== V3.0.2优化 歌曲大乱斗：按歌手名搜索歌曲 ===== */
GM.fetchArtistSongsById = function (artistId, artistName) {
  // 【核心修复】：追加 &lang=zh_cn，保证拉歌全链路不带英文
  var query = "/search?term=" + encodeURIComponent(artistName) + "&entity=song&attribute=artistTerm&limit=200&country=CN&lang=zh_cn";
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

/* ===== V3.1.2 歌曲深度搜索：结合歌手名与关键词再次请求 API ===== */
GM.deepSearchSongs = function (artistName, keyword) {
  var kw = (keyword || "").replace(/^\s+|\s+$/g, "");
  var name = (artistName || "").replace(/^\s+|\s+$/g, "");
  if (!kw) return Promise.resolve([]);

  var term = name ? (name + " " + kw) : kw;
  var query = "/search?term=" + encodeURIComponent(term) + "&entity=song&limit=50&country=CN&lang=zh_cn";
  var targetUrl = GM.BASE_URL + query;

  function parseResults(data) {
    var results = (data && data.results) || [];
    var list = [];
    var seen = {};
    for (var i = 0; i < results.length; i++) {
      var it = results[i];
      if (!it || !it.trackName) continue;
      var track = (it.trackName || "").replace(/^\s+|\s+$/g, "");
      if (!track) continue;

      var tid = String(it.trackId || (track + "_" + i));
      if (seen[tid]) continue;
      seen[tid] = 1;

      list.push({
        trackId: String(it.trackId || ""),
        trackName: track,
        artistName: it.artistName || name || "",
        collectionName: it.collectionName || "",
        releaseDate: it.releaseDate || "",
        artworkUrl100: it.artworkUrl100 || "",
        previewUrl: it.previewUrl || "",
        source: 'api'
      });
    }
    return list;
  }

  function fetchPrimary() {
    return GM.get(targetUrl).then(function (data) {
      var res = parseResults(data);
      if (res.length === 0 && name) {
        // 若带歌手名搜索结果为空，降级仅用关键词再次检索
        var fallbackUrl = GM.BASE_URL + "/search?term=" + encodeURIComponent(kw) + "&entity=song&limit=50&country=CN&lang=zh_cn";
        return GM.get(fallbackUrl).then(parseResults).catch(function() { return []; });
      }
      return res;
    }).catch(function (e) {
      console.warn("深度搜索直连失败，尝试 Functions 代理", e);
      return fetch("/api/search?term=" + encodeURIComponent(term))
        .then(function (res) {
          if (!res.ok) throw new Error("Functions API Error");
          return res.json();
        })
        .then(parseResults)
        .catch(function (e2) {
          console.warn("Functions 代理失败，降级 CORS 代理", e2);
          return new Promise(function (resolve, reject) {
            GM.fetchJson(GM.CORS_PROXY + encodeURIComponent(targetUrl), function (err, data) {
              if (err) { reject(err); return; }
              resolve(parseResults(data));
            });
          });
        });
    });
  }

  return fetchPrimary();
};