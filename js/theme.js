/* ===== theme.js — 图片均色提取与主题切换 ===== */
var GM = window.GM = window.GM || {};

/* ===== 均色提取 ===== */
GM.getAverageRGB = function (imgEl) {
  var blockSize = 5,
    defaultRGB = { r: 19, g: 14, b: 24 },
    canvas = document.createElement('canvas'),
    context = canvas.getContext && canvas.getContext('2d'),
    data, width, height,
    i = -4,
    length,
    rgb = { r: 0, g: 0, b: 0 },
    count = 0;

  if (!context) return defaultRGB;
  height = canvas.height = imgEl.naturalHeight || imgEl.offsetHeight || imgEl.height;
  width = canvas.width = imgEl.naturalWidth || imgEl.offsetWidth || imgEl.width;

  try {
    context.drawImage(imgEl, 0, 0);
    data = context.getImageData(0, 0, width, height);
  } catch (e) {
    return null;
  }
  length = data.data.length;
  while ((i += blockSize * 4) < length) {
    ++count;
    rgb.r += data.data[i];
    rgb.g += data.data[i + 1];
    rgb.b += data.data[i + 2];
  }
  rgb.r = ~~(rgb.r / count);
  rgb.g = ~~(rgb.g / count);
  rgb.b = ~~(rgb.b / count);
  return rgb;
};

/* ===== 应用主题色 ===== */
GM.applyColors = function (rgb) {
  if (!rgb) { GM.resetColors(); return; }
  var root = document.documentElement;

  var baseFactor = 0.85;
  var br = Math.floor(rgb.r * baseFactor);
  var bg = Math.floor(rgb.g * baseFactor);
  var bb = Math.floor(rgb.b * baseFactor);
  var sRGB = br + ',' + bg + ',' + bb;

  var dr = Math.floor(br * 0.35);
  var dg = Math.floor(bg * 0.35);
  var db = Math.floor(bb * 0.35);
  var sDark = dr + ',' + dg + ',' + db;

  var progR = Math.floor(br * 0.6);
  var progG = Math.floor(bg * 0.6);
  var progB = Math.floor(bb * 0.6);
  var sProg = progR + ',' + progG + ',' + progB;

  var lum = 0.299 * br + 0.587 * bg + 0.114 * bb;
  var lr, lg, lb;
  if (lum > 170) {
    lr = Math.floor(br * 0.75);
    lg = Math.floor(bg * 0.75);
    lb = Math.floor(bb * 0.75);
  } else {
    lr = Math.min(255, Math.floor(br * 1.1) + 40);
    lg = Math.min(255, Math.floor(bg * 1.1) + 40);
    lb = Math.min(255, Math.floor(bb * 1.1) + 40);
  }
  var sLight = lr + ',' + lg + ',' + lb;

  var hoverFactor = lum > 170 ? 0.9 : 1.15;
  var lrH = Math.min(255, Math.floor(lr * hoverFactor));
  var lgH = Math.min(255, Math.floor(lg * hoverFactor));
  var lbH = Math.min(255, Math.floor(lb * hoverFactor));
  var sLightHover = lrH + ',' + lgH + ',' + lbH;

  root.style.setProperty('--theme-grad-start', 'rgba(' + sRGB + ', 0.3)');
  root.style.setProperty('--theme-grad-end', 'rgba(' + sRGB + ', 1)');
  root.style.setProperty('--theme-vqs-start', 'rgba(' + sRGB + ', 1)');
  root.style.setProperty('--theme-toolbar-start', 'rgba(' + sRGB + ', 1)');
  root.style.setProperty('--theme-action-bg', 'rgba(' + sDark + ', 0.95)');
  root.style.setProperty('--theme-progress', 'rgb(' + sProg + ')');
  root.style.setProperty('--theme-btn-primary', 'rgb(' + sLight + ')');
  root.style.setProperty('--theme-btn-primary-hover', 'rgb(' + sLightHover + ')');
  root.style.setProperty('--theme-primary-shadow', 'rgba(' + sLight + ', 0.4)');
  root.style.setProperty('--theme-btn-secondary', 'rgba(' + sRGB + ', 0.4)');
  root.style.setProperty('--theme-btn-secondary-hover', 'rgba(' + sRGB + ', 0.55)');
};

/* ===== 重置主题色 ===== */
GM.resetColors = function () {
  var root = document.documentElement;
  root.style.removeProperty('--theme-grad-start');
  root.style.removeProperty('--theme-grad-end');
  root.style.removeProperty('--theme-vqs-start');
  root.style.removeProperty('--theme-toolbar-start');
  root.style.removeProperty('--theme-action-bg');
  root.style.removeProperty('--theme-progress');
  root.style.removeProperty('--theme-btn-primary');
  root.style.removeProperty('--theme-btn-primary-hover');
  root.style.removeProperty('--theme-primary-shadow');
  root.style.removeProperty('--theme-btn-secondary');
  root.style.removeProperty('--theme-btn-secondary-hover');
  GM.state.avgColor = null;
};

/* ===== 提取并应用颜色 ===== */
GM.extractAndApplyColor = function (url) {
  if (!url) { GM.resetColors(); return; }
  var img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = function () {
    var rgb = GM.getAverageRGB(img);
    if (rgb) {
      GM.state.avgColor = rgb;
      GM.save();
      GM.applyColors(rgb);
    } else {
      fetchViaProxy(url);
    }
  };
  img.onerror = function () {
    fetchViaProxy(url);
  };
  img.src = url;

  function fetchViaProxy(imgUrl) {
    var proxyUrl = GM.CORS_PROXY + encodeURIComponent(imgUrl);
    fetch(proxyUrl).then(function (res) {
      if (!res.ok) throw new Error();
      return res.blob();
    }).then(function (blob) {
      var objUrl = URL.createObjectURL(blob);
      var proxyImg = new Image();
      proxyImg.onload = function () {
        var rgb = GM.getAverageRGB(proxyImg);
        if (rgb) {
          GM.state.avgColor = rgb;
          GM.save();
          GM.applyColors(rgb);
        }
        URL.revokeObjectURL(objUrl);
      };
      proxyImg.src = objUrl;
    }).catch(function () {
      GM.resetColors();
    });
  }
};

/* ===== 渲染头部封面 ===== */
GM.renderHeaderCovers = function () {
  var wrap = document.getElementById("headerCovers");
  var grad = document.getElementById("headerGradient");
  if (!GM.state.covers || GM.state.covers.length === 0) {
    wrap.innerHTML = "";
    grad.style.display = "none";
    GM.resetColors();
    return;
  }
  var html = "";
  for (var i = 0; i < Math.min(GM.state.covers.length, 8); i++) {
    html += '<img src="' + GM.state.covers[i] + '" alt="cover">';
  }
  wrap.innerHTML = html;
  grad.style.display = "block";

  if (GM.state.avgColor) {
    GM.applyColors(GM.state.avgColor);
  } else {
    GM.extractAndApplyColor(GM.state.covers[0]);
  }
};
