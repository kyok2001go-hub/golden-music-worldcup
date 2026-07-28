/* ===== api.js — iTunes 接口请求逻辑 ===== */
var GM = window.GM = window.GM || {};

GM.CORS_PROXY = "https://api.allorigins.win/raw?url=";
GM.ITUNES_HOSTS = ["https://itunes.apple.com.cn", "https://itunes.apple.com"];

/* ===== JSONP 请求 ===== */
GM.jsonp = function (url, cb) {
  var cbName = "__itunesCb" + (GM._jsonpSeq = (GM._jsonpSeq || 0) + 1);
  var script = document.createElement("script");
  var done = false;
  function cleanup() {
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    if (script.parentNode) script.parentNode.removeChild(script);
  }
  var timer = setTimeout(function () {
    if (done) return; done = true;
    cleanup();
    cb(new Error("请求超时"));
  }, 12000);
  window[cbName] = function (data) {
    if (done) return; done = true;
    clearTimeout(timer);
    cleanup();
    cb(null, data);
  };
  script.onerror = function () {
    if (done) return; done = true;
    clearTimeout(timer);
    cleanup();
    cb(new Error("网络请求失败"));
  };
  script.src = url + (url.indexOf("?") > -1 ? "&" : "?") + "callback=" + cbName;
  document.body.appendChild(script);
};

/* ===== Fetch 请求 ===== */
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
GM._jsonpMode = false; // 全局标记：一旦 fetch 被拦截（如 iOS），后续全走 JSONP

GM.coreFetchArtist = function (name, onSuccess, onFail) {
  var query = "/search?term=" + encodeURIComponent(name) + "&entity=song&attribute=artistTerm&limit=200&country=CN&media=music";
  
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

  // ==== 智能请求：参考竞品方案，规避 iOS Universal Links 拦截 ====
  function smartGet(hostIdx) {
    if (hostIdx >= GM.ITUNES_HOSTS.length) {
      // 官方直连和 JSONP 都失败，走 Cloudflare Functions 代理兜底
      tryFunctionsProxy();
      return;
    }
    
    var url = GM.ITUNES_HOSTS[hostIdx] + query;
    
    if (!GM._jsonpMode && window.fetch) {
      var done = false;
      var timer = setTimeout(function() {
        if (done) return; done = true;
        GM._jsonpMode = true;
        tryJsonp(hostIdx);
      }, 8000); // 8秒超时切 jsonp
      
      fetch(url)
        .then(function(res) {
          if (done) return; done = true;
          clearTimeout(timer);
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function(data) {
          onData(data);
        })
        .catch(function(e) {
          if (done) return; done = true;
          clearTimeout(timer);
          // 核心：iOS Safari 拦截 fetch 时会抛错，此时全局切换为 jsonp 模式并立即重试
          console.warn("Fetch 失败 (可能被 iOS 拦截)，切换到 JSONP 模式:", e);
          GM._jsonpMode = true;
          tryJsonp(hostIdx);
        });
    } else {
      // 已经确认为 jsonp 模式（如已被 iOS 拦截过），直接走 jsonp
      tryJsonp(hostIdx);
    }
  }

  function tryJsonp(idx) {
    GM.jsonp(GM.ITUNES_HOSTS[idx] + query, function (err, data) {
      if (err) {
        // 当前 host 的 jsonp 也失败了，尝试下一个 host
        smartGet(idx + 1);
      } else {
        onData(data);
      }
    });
  }

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
        console.warn("Functions 代理失败，降级到公共 CORS 代理:", e);
        tryProxy();
      });
  }

  function tryProxy() {
    GM.fetchJson(GM.CORS_PROXY + encodeURIComponent(GM.ITUNES_HOSTS[1] + query), function (err, data) {
      if (err) { failAll(); return; }
      onData(data);
    });
  }

  // 默认启动流程：从主 host (itunes.apple.com) 开始尝试智能获取
  smartGet(1);
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
