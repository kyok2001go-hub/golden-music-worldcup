/* ===== export.js — Canvas 对阵图生成逻辑 ===== */
var GM = window.GM = window.GM || {};

GM.FONT_SIZES = [13, 14.5, 16, 17.5, 19, 21];
GM._cachedQR = null;

/* ===== 颜色与字号计算 ===== */
GM.cellColor = function (r, i) {
  var v = GM.state.winners[r][i];
  if (!v) return null;
  if (r === GM.lastR()) return "#F0AC4A";
  return (GM.state.winners[r + 1][i >> 1] === v) ? "#c498ff" : "#f0f1f8";
};

GM.cellFontSize = function (r) {
  var R = GM.rounds();
  return GM.FONT_SIZES[GM.FONT_SIZES.length - R + r];
};

/* ===== 文本宽度估算与换行 ===== */
GM.estTextWidth = function (str, fs) {
  var w = 0;
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    w += (code > 255) ? fs : fs * 0.55;
  }
  return w;
};

GM.wrapText = function (str, fs, maxW, maxLines) {
  if (!str) return [""];
  var rawLines = String(str).split(/\r\n|\r|\n/);
  var lines = [];
  for (var li = 0; li < rawLines.length; li++) {
    var cur = "";
    var seg = rawLines[li];
    for (var i = 0; i < seg.length; i++) {
      var ch = seg[i];
      if (GM.estTextWidth(cur + ch, fs) > maxW && cur !== "") {
        lines.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    lines.push(cur);
  }
  if (lines.length <= maxLines) return lines;
  var out = lines.slice(0, maxLines);
  var last = out[maxLines - 1];
  while (last.length > 0 && GM.estTextWidth(last + "\u2026", fs) > maxW) {
    last = last.slice(0, -1);
  }
  out[maxLines - 1] = last + "\u2026";
  return out;
};

/* ===== 获取二维码 ===== */
GM.fetchQRBase64 = function (text, cb) {
  if (GM._cachedQR) return cb(GM._cachedQR);
  var url = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&color=ffffff&bgcolor=151d34&data=" + encodeURIComponent(text);
  function toBase64(blob) {
    var reader = new FileReader();
    reader.onloadend = function () { GM._cachedQR = reader.result; cb(GM._cachedQR); };
    reader.readAsDataURL(blob);
  }
  fetch(url).then(function (res) {
    if (!res.ok) throw new Error();
    return res.blob();
  }).then(toBase64).catch(function () {
    var proxyUrl = GM.CORS_PROXY + encodeURIComponent(url);
    fetch(proxyUrl).then(function (res) {
      if (!res.ok) throw new Error();
      return res.blob();
    }).then(toBase64).catch(function () { cb(null); });
  });
};

/* ===== 获取图片 Base64（用于导出图嵌入冠军封面） ===== */
GM._imgCache = {};
GM.fetchImageBase64 = function (url, cb) {
  if (GM._imgCache[url]) return cb(GM._imgCache[url]);
  function toBase64(blob) {
    var reader = new FileReader();
    reader.onloadend = function () { GM._imgCache[url] = reader.result; cb(GM._imgCache[url]); };
    reader.readAsDataURL(blob);
  }
  fetch(url).then(function (res) {
    if (!res.ok) throw new Error();
    return res.blob();
  }).then(toBase64).catch(function () {
    fetch(GM.CORS_PROXY + encodeURIComponent(url)).then(function (res) {
      if (!res.ok) throw new Error();
      return res.blob();
    }).then(toBase64).catch(function () { cb(null); });
  });
};

/* ===== 构建 SVG 对阵图 ===== */
GM.buildExportSvg = function (champCover) {
  var title = GM.state.title || "金曲世界杯";
  var FONT = "Microsoft YaHei, PingFang SC, sans-serif";
  var GRAY = "rgba(255,255,255,.35)", BLACK = "#f0f1f8", PURPLE = "#c498ff", GOLD = "#F0AC4A";

  var N = GM.seeds(), R = GM.rounds(), last = GM.lastR();
  var compact = (N === 64); // 64 位选手时启用紧凑布局：第一列尺寸缩放至 60%
  var padX = 14, padTop = 14, padBottom = 20;
  var titleH = 76;
  var headH = 34, rowH = compact ? 22 : 36;
  var footerH = 100;
  var colW = [compact ? 102 : 170];
  for (var cw = 0; cw < R; cw++) colW.push(cw === last ? 140 : 118);

  var heads = [N + "强"].concat(GM.SIZE_CONFIG[N].roundNames);

  var tableW = 0, colX = [];
  for (var c = 0; c < colW.length; c++) { colX.push(tableW); tableW += colW[c]; }
  var bodyH = headH + N * rowH;
  var W = padX * 2 + tableW;
  var H = padTop + titleH + bodyH + footerH + padBottom;
  var tableTop = padTop + titleH;

  function tx(colIdx) { return padX + colX[colIdx]; }
  function tcx(colIdx) { return padX + colX[colIdx] + colW[colIdx] / 2; }
  function vcenter(y, fs) { return y + fs / 2 - fs * 0.18; }

  var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" font-family="' + FONT + '">';
  s += '<defs><linearGradient id="bgGrad" x1="0" y1="0" x2="0.35" y2="1">' +
    '<stop offset="0" stop-color="#130b20"/>' +
    '<stop offset="0.42" stop-color="#1a1033"/>' +
    '<stop offset="1" stop-color="#0f0a1c"/>' +
    '</linearGradient>' +
    '<filter id="crownShadow" x="-50%" y="-50%" width="200%" height="200%">' +
    '<feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.5"/>' +
    '</filter></defs>';
  s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#bgGrad)"/>';

  s += '<rect x="' + padX + '" y="' + padTop + '" width="' + tableW + '" height="' + titleH +
    '" fill="#1e2038" fill-opacity="0.7" stroke="rgba(255,255,255,.12)" rx="8"/>';
  s += '<text x="' + (padX + tableW / 2) + '" y="' + vcenter(padTop + titleH / 2, 34) +
    '" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">' + GM.esc(title) + "</text>";

  for (var h = 0; h < heads.length; h++) {
    s += '<text x="' + tcx(h) + '" y="' + vcenter(tableTop + headH / 2, 13) +
      '" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">' + GM.esc(heads[h]) + "</text>";
  }
  s += '<line x1="' + padX + '" y1="' + (tableTop + headH) + '" x2="' + (padX + tableW) +
    '" y2="' + (tableTop + headH) + '" stroke="rgba(255,255,255,.16)" stroke-width="1"/>';

  var bodyTop = tableTop + headH;
  var CARD = "rgba(255,255,255,.18)", CONN = "rgba(255,255,255,.35)";
  var GAPX = 10;

  function line(x1, y1, x2, y2) {
    s += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="' + CONN + '" stroke-width="1.2"/>';
  }

  var colLeft = [], colRight = [], colMidY = [];

  var seedCardH = rowH - (compact ? 4 : 6);
  var seedX = tx(0) + 4, seedW = colW[0] - 8;
  var seedRight = seedX + seedW;
  var seedY = [];
  for (var row0 = 0; row0 < N; row0++) {
    seedY.push(bodyTop + row0 * rowH + rowH / 2);
  }

  for (var rr2 = 0; rr2 < R; rr2++) {
    var span2 = 1 << (rr2 + 1);
    var cnt = N / span2;
    colLeft.push([]); colRight.push([]); colMidY.push([]);
    for (var ii2 = 0; ii2 < cnt; ii2++) {
      var cy2 = bodyTop + ii2 * span2 * rowH;
      var ch2 = span2 * rowH;
      colLeft[rr2].push(tx(rr2 + 1) + GAPX);
      colRight[rr2].push(tx(rr2 + 1) + colW[rr2 + 1] - GAPX);
      colMidY[rr2].push(cy2 + ch2 / 2);
    }
  }

  for (var a0 = 0; a0 < colMidY[0].length; a0++) {
    var yT = seedY[2 * a0], yB = seedY[2 * a0 + 1];
    var xIn0 = colLeft[0][a0], mX0 = (seedRight + xIn0) / 2, mY0 = colMidY[0][a0];
    line(seedRight, yT, mX0, yT);
    line(seedRight, yB, mX0, yB);
    line(mX0, yT, mX0, yB);
    line(mX0, mY0, xIn0, mY0);
  }
  for (var rr3 = 1; rr3 < R; rr3++) {
    for (var ii3 = 0; ii3 < colMidY[rr3].length; ii3++) {
      var aY3 = colMidY[rr3 - 1][2 * ii3], bY3 = colMidY[rr3 - 1][2 * ii3 + 1];
      var xOut3 = colRight[rr3 - 1][2 * ii3], xIn3 = colLeft[rr3][ii3];
      var mX3 = (xOut3 + xIn3) / 2, mY3 = colMidY[rr3][ii3];
      line(xOut3, aY3, mX3, aY3);
      line(xOut3, bY3, mX3, bY3);
      line(mX3, aY3, mX3, bY3);
      line(mX3, mY3, xIn3, mY3);
    }
  }

  var seedFs = compact ? 7.5 : 12.5;
  for (var row = 0; row < N; row++) {
    var y = bodyTop + row * rowH + (rowH - seedCardH) / 2;
    s += '<rect x="' + seedX + '" y="' + y + '" width="' + seedW + '" height="' + seedCardH +
      '" rx="4" fill="#ffffff" fill-opacity="0.08" stroke="' + CARD + '"/>';
    var iv = GM.state.inputs[row] || "";
    if (iv) {
      var ivLine = GM.wrapText(iv, seedFs, seedW - 12, 1);
      s += '<text x="' + (seedX + seedW / 2) + '" y="' + vcenter(bodyTop + row * rowH + rowH / 2, seedFs) +
        '" font-size="' + seedFs + '" fill="' + BLACK + '" text-anchor="middle">' + GM.esc(ivLine[0]) + "</text>";
    }
  }

  for (var r = 0; r < R; r++) {
    var span = 1 << (r + 1);
    var count = N / span;
    var fs = GM.cellFontSize(r);
    for (var i = 0; i < count; i++) {
      var cy = bodyTop + i * span * rowH;
      var ch = span * rowH;
      var lineH0 = fs * 1.3;
      var nameLines = GM.state.winners[r][i] ? GM.wrapText(GM.state.winners[r][i], fs, colW[r + 1] - GAPX * 2 - 12, 3).length : 1;
      var estLines = nameLines + ((r === last && GM.state.winners[r][i]) ? 1.6 : 0);
      var cardH = Math.min(Math.max(34, estLines * lineH0 + 8), ch - 6);
      var cardX = tx(r + 1) + GAPX, cardW = colW[r + 1] - GAPX * 2;
      var cardY = cy + ch / 2 - cardH / 2;
      var strokeC = CARD;
      var v = GM.state.winners[r][i];
      var midY = cy + ch / 2;
      var coverMode = (r === last) && !!champCover && !!v;
      if (!coverMode) {
        s += '<rect x="' + cardX + '" y="' + cardY + '" width="' + cardW + '" height="' + cardH +
          '" rx="4" fill="#ffffff" fill-opacity="0.08" stroke="' + strokeC + '"/>';
      }
      if (v) {
        var color = GM.cellColor(r, i);
        var fw = (r === last) ? 800 : (color === PURPLE ? 700 : 600);
        var maxW = cardW - 12;
        var lineH = fs * 1.3;
        var cx = cardX + cardW / 2;
        if (coverMode) {
          // 冠军封面版：封面 + 倾斜金冠 + 金色歌名（无卡片背景与边框）
          var coverSize = 84;
          var coverX = cx - coverSize / 2;
          var nameFs = 18;
          var cNames = GM.wrapText(v, nameFs, colW[r + 1] - 8, 2);
          var cLineH = nameFs * 1.3;
          var gapCN = 12;
          var coverY = midY - (coverSize + gapCN + cNames.length * cLineH) / 2;
          s += '<clipPath id="champCoverClip"><rect x="' + coverX + '" y="' + coverY +
            '" width="' + coverSize + '" height="' + coverSize + '" rx="10"/></clipPath>';
          s += '<image href="' + champCover + '" x="' + coverX + '" y="' + coverY +
            '" width="' + coverSize + '" height="' + coverSize +
            '" preserveAspectRatio="xMidYMid slice" clip-path="url(#champCoverClip)"/>';
          s += '<rect x="' + coverX + '" y="' + coverY + '" width="' + coverSize +
            '" height="' + coverSize + '" rx="10" fill="none" stroke="rgba(240,172,74,.5)" stroke-width="1.5"/>';
          var crownSize = 24;
          var crownX = coverX + coverSize - crownSize + 9;
          var crownY = coverY - 9;
          s += '<g transform="translate(' + crownX + ',' + crownY + ') rotate(30 ' + crownSize / 2 + ' ' + crownSize / 2 +
            ')" filter="url(#crownShadow)"><path fill="#F0AC4A" transform="scale(' + crownSize / 24 +
            ')" d="M12 3l3.2 5.2L21 6l-1.6 9H4.6L3 6l5.8 2.2L12 3zM4.5 17h15v2h-15z"/></g>';
          for (var ln3 = 0; ln3 < cNames.length; ln3++) {
            s += '<text x="' + cx + '" y="' + (coverY + coverSize + gapCN + nameFs * 0.82 + ln3 * cLineH) +
              '" font-size="' + nameFs + '" font-weight="800" fill="' + GOLD +
              '" text-anchor="middle">' + GM.esc(cNames[ln3]) + "</text>";
          }
        } else if (r === last) {
          var nameArr = GM.wrapText(v, fs, maxW, 3);
          var totalH = 26 * 1.1 + nameArr.length * lineH;
          var iconY = midY - totalH / 2 + 26 * 0.82;
          s += '<text x="' + cx + '" y="' + iconY + '" font-size="26" text-anchor="middle">\uD83C\uDFC6</text>';
          for (var ln2 = 0; ln2 < nameArr.length; ln2++) {
            s += '<text x="' + cx + '" y="' + (iconY + 26 * 0.28 + (ln2 + 1) * lineH) +
              '" font-size="' + fs + '" font-weight="800" fill="' + color +
              '" text-anchor="middle">' + GM.esc(nameArr[ln2]) + "</text>";
          }
        } else {
          var linesArr = GM.wrapText(v, fs, maxW, 3);
          var totalH2 = linesArr.length * lineH;
          var firstBaseY = midY - totalH2 / 2 + fs * 0.82;
          for (var ln = 0; ln < linesArr.length; ln++) {
            s += '<text x="' + cx + '" y="' + (firstBaseY + ln * lineH) +
              '" font-size="' + fs + '" font-weight="' + fw + '" fill="' + color +
              '" text-anchor="middle">' + GM.esc(linesArr[ln]) + "</text>";
          }
        }
      } else {
        s += '<text x="' + (cardX + cardW / 2) + '" y="' + vcenter(midY, 11.5) +
          '" font-size="11.5" fill="' + GRAY + '" text-anchor="middle">\u70B9\u51FB\u9009\u62E9</text>';
      }
    }
  }

  var footerY = bodyTop + bodyH;
  s += '<line x1="' + padX + '" y1="' + footerY + '" x2="' + (padX + tableW) + '" y2="' + footerY + '" stroke="rgba(255,255,255,.16)" stroke-width="1"/>';

  var qrSize = 64;
  var groupW = 346;
  var startX = padX + (tableW - groupW) / 2;
  var qrX = startX;
  var qrY = footerY + (footerH - qrSize) / 2;

  var textX = qrX + qrSize + 16;
  s += '<text x="' + textX + '" y="' + vcenter(qrY + qrSize / 2 - 12, 16) + '" font-size="16" font-weight="700" fill="#ffffff" text-anchor="start">\u626B\u7801\u751F\u6210\u4F60\u7684\u4E13\u5C5E\u5BF9\u9635\u56FE</text>';
  s += '<text x="' + textX + '" y="' + vcenter(qrY + qrSize / 2 + 14, 12) + '" font-size="12" fill="' + GRAY + '" text-anchor="start">https://goldensong-worldcup.pages.dev/</text>';

  s += "</svg>";
  return { svg: s, w: W, h: H, qrX: qrX, qrY: qrY, qrSize: qrSize };
};

/* ===== 渲染到 Canvas ===== */
GM.renderToCanvas = function (cb) {
  GM.fetchQRBase64("https://goldensong-worldcup.pages.dev/", function (qrBase64) {
    // 冠军封面：仅导入歌曲（有 API 封面）时嵌入导出图；手动录入或获取失败时按原逻辑生成
    var champ = GM.state.winners[GM.lastR()] && GM.state.winners[GM.lastR()][0];
    var champMeta = champ ? GM.state.meta[champ] : null;
    var coverUrl = (champMeta && champMeta.source !== "manual" && champMeta.artworkUrl100)
      ? champMeta.artworkUrl100.replace("100x100bb", "400x400bb") : null;
    if (!coverUrl) { doRender(null); return; }
    GM.fetchImageBase64(coverUrl, doRender);

    function doRender(champCover) {
      var SCALE = 2;
      var out = GM.buildExportSvg(champCover);
      var svgBlob = new Blob([out.svg], { type: "image/svg+xml;charset=utf-8" });
      var svgUrl = URL.createObjectURL(svgBlob);

      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = out.w * SCALE;
          canvas.height = out.h * SCALE;
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#130b20";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.scale(SCALE, SCALE);
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(svgUrl);

          if (qrBase64) {
            var qrImg = new Image();
            qrImg.onload = function () {
              ctx.drawImage(qrImg, out.qrX, out.qrY, out.qrSize, out.qrSize);
              cb(null, canvas);
            };
            qrImg.onerror = function () {
              cb(null, canvas);
            };
            qrImg.src = qrBase64;
          } else {
            cb(null, canvas);
          }
        } catch (e) {
          URL.revokeObjectURL(svgUrl);
          cb(e);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(svgUrl);
        cb(new Error("图片渲染失败"));
      };
      img.src = svgUrl;
    }
  });
};

/* ===== 下载图片 ===== */
GM.downloadImage = function () {
  GM.toast("正在生成图片…", 60000);
  GM.renderToCanvas(function (err, canvas) {
    if (err) { GM.toast("生成失败：" + err.message); return; }
    canvas.toBlob(function (blob) {
      var a = document.createElement("a");
      var name = (GM.state.title || (GM.seeds() + "强晋级对阵图")).replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
      a.download = name + ".png";
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      GM.toast("已下载 PNG 图片");
    }, "image/png");
  });
};

/* ===== 复制图片 ===== */
GM.copyImage = function () {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    GM.toast("当前浏览器不支持复制图片，请用「下载图片」");
    return;
  }
  GM.toast("正在生成图片…", 60000);
  GM.renderToCanvas(function (err, canvas) {
    if (err) { GM.toast("生成失败：" + err.message); return; }
    canvas.toBlob(function (blob) {
      navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function () {
        GM.toast("已复制到剪贴板，可直接粘贴");
      }, function () {
        GM.toast("复制失败（浏览器权限限制），请用「下载图片」");
      });
    }, "image/png");
  });
};
