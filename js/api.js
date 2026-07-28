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

  // ==== 新增：先尝试请求我们部署的 Cloudflare Functions 代理 ====
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
        // 如果 Functions 代理失败（比如本地测试环境、或者没部署对），降级走原有的 JSONP 逻辑
        console.warn("Functions 代理失败，降级到原始策略:", e);
        tryJsonp(0);
      });
  }

  function tryJsonp(idx) {
    if (idx >= GM.ITUNES_HOSTS.length) { tryProxy(); return; }
    GM.jsonp(GM.ITUNES_HOSTS[idx] + query, function (err, data) {
      if (err) { tryJsonp(idx + 1); return; }
      onData(data);
    });
  }

  function tryProxy() {
    GM.fetchJson(GM.CORS_PROXY + encodeURIComponent(GM.ITUNES_HOSTS[1] + query), function (err, data) {
      if (err) { failAll(); return; }
      onData(data);
    });
  }

  // 判断是否为移动端设备（包含 iOS 和 Android，以及 iPadOS）
  var isMobile = /iPhone|iPad|iPod|Android|Mobi/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isMobile) {
    // 移动端（特别是 iOS）极易触发 Universal Links 拦截，导致跳出浏览器或请求挂起
    // 因此移动端直接使用 Functions 代理，若失败则降级到公共 CORS 代理，彻底避开直连 itunes.apple.com
    function mobileFunctionsProxy() {
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
    mobileFunctionsProxy();
  } else {
    // 默认启动流程：PC 端优先走官方直连，失败再走代理
    GM.fetchJson(GM.ITUNES_HOSTS[1] + query, function (err, data) {
      if (err) { 
        // 直连失败，走我们的 Functions 代理
        tryFunctionsProxy(); 
        return; 
      }
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
