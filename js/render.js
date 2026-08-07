/* ===== render.js — DOM 渲染与更新逻辑 ===== */
var GM = window.GM = window.GM || {};

GM.isQuickView = true;
GM._toastTimer = null;

/* ===== Toast 提示 ===== */
GM.toast = function (msg, ms) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  if (GM._toastTimer) clearTimeout(GM._toastTimer);
  GM._toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 1000);
};

GM.hideToast = function () {
  if (GM._toastTimer) clearTimeout(GM._toastTimer);
  document.getElementById("toast").classList.remove("show");
};

/* ===== DOM 引用 ===== */
GM.tbody = document.getElementById("tbody");

/* ===== 构建对阵表格 ===== */
GM.buildTable = function () {
  var N = GM.seeds(), R = GM.rounds(), last = GM.lastR();
  var headHtml = "<tr><th>" + N + "强（填写选项）</th>";
  for (var hn = 0; hn < R; hn++) {
    headHtml += "<th>" + GM.esc(GM.SIZE_CONFIG[N].roundNames[hn]) + "</th>";
  }
  headHtml += "</tr>";
  document.getElementById("thead").innerHTML = headHtml;
  var colHtml = '<col class="c0">';
  for (var cn = 0; cn < R; cn++) colHtml += (cn === last ? '<col class="cc">' : '<col class="cw">');
  document.getElementById("colgroup").innerHTML = colHtml;

  var html = "";
  for (var row = 0; row < N; row++) {
    html += "<tr>";
    html += '<td class="seed-cell"><div class="seed-wrap">' +
      '<span class="seed-idx">' + (row + 1) + "</span>" +
      '<input maxlength="30" data-idx="' + row + '" placeholder="选项' + (row + 1) + '">' +
      "</div></td>";
    for (var r = 0; r < R; r++) {
      var span = 1 << (r + 1);
      if (row % span === 0) {
        var idx = row / span;
        html += '<td class="node' + (r === last ? " champion" : "") + '" rowspan="' + span +
          '" data-r="' + r + '" data-i="' + idx + '"></td>';
      }
    }
    html += "</tr>";
  }
  GM.tbody.innerHTML = html;

  var inputs = GM.tbody.querySelectorAll("input[data-idx]");
  for (var k = 0; k < inputs.length; k++) {
    inputs[k].addEventListener("input", GM.onSeedInput);

    inputs[k].addEventListener("focus", function (e) {
      if (e.target.readOnly) return; // 大乱斗锁定项不产生手动 meta
      var v = e.target.value.slice(0, 30);
      if (v) {
        if (!GM.state.meta[v]) GM.state.meta[v] = {};
        GM.state.meta[v].source = 'manual';
      }
    });

    inputs[k].addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var cur = +this.getAttribute("data-idx");
        if (cur < N - 1) {
          var next = GM.tbody.querySelector('input[data-idx="' + (cur + 1) + '"]');
          if (next) { next.focus(); next.select(); }
        } else {
          this.blur();
        }
      }
    });
  }
  GM.syncSeedInputs();
  document.getElementById("titleInput").value = GM.state.title;
};

/* ===== 种子输入框同步：大乱斗 trackId 项显示翻译名并锁定为只读 ===== */
GM.syncSeedInputs = function () {
  var inputs = GM.tbody.querySelectorAll("input[data-idx]");
  for (var q = 0; q < inputs.length; q++) {
    var raw = GM.state.inputs[q] || "";
    var m = raw && GM.state.meta[raw];
    if (m && m.trackId && m.trackName) {
      inputs[q].value = GM.getDisplayName(raw);
      inputs[q].readOnly = true;
      inputs[q].classList.add("locked");
      inputs[q].title = GM.getDisplayName(raw);
    } else {
      inputs[q].value = raw;
      inputs[q].readOnly = false;
      inputs[q].classList.remove("locked");
      inputs[q].removeAttribute("title");
    }
  }
};

/* ===== 核心渲染函数 ===== */
GM.render = function () {
  var last = GM.lastR();
  var cells = GM.tbody.querySelectorAll("td.node");
  for (var c = 0; c < cells.length; c++) {
    var cell = cells[c];
    var r = +cell.getAttribute("data-r");
    var i = +cell.getAttribute("data-i");
    var v = GM.state.winners[r][i];
    var dv = GM.getDisplayName(v);
    var inner = "";
    if (v) {
      cell.classList.add("filled");
      if (r === last) {
        inner = '<span class="champ-icon">🏆</span>' +
          '<span class="name champ champ-name" title="' + GM.esc(dv) + '">' + GM.esc(dv) + "</span>";
      } else {
        var advanced = GM.state.winners[r + 1][i >> 1] === v;
        var cls = advanced ? "name winner" : "name";
        inner = '<span class="' + cls + '" title="' + GM.esc(dv) + '">' + GM.esc(dv) + "</span>";
      }
    } else {
      cell.classList.remove("filled");
      inner = '<span class="placeholder">点击选择 ▾</span>';
    }
    cell.innerHTML = '<div class="node-card">' + inner + "</div>";
  }

  var done = 0, R = GM.rounds(), TM = GM.totalMatches();
  for (var rr = 0; rr < R; rr++) {
    for (var ii = 0; ii < GM.state.winners[rr].length; ii++) {
      if (GM.state.winners[rr][ii]) done++;
    }
  }

  document.getElementById("progressText").textContent =
    "已决出 " + done + " / " + TM + " 场" + (done === TM ? " · 🎉 冠军诞生！" : "");
  document.getElementById("progressFill").style.width = (done / TM * 100).toFixed(1) + "%";

  GM.renderQuickStart(done, TM);
  GM.renderHeaderCovers();

  var fab = document.getElementById("fabReview");
  var isBracketActive = document.getElementById("viewBracket").style.display === "block";
  if (done === TM && isBracketActive) {
    fab.classList.add("show");
  } else {
    fab.classList.remove("show");
  }

  if (isBracketActive) {
    GM.drawConnectors();
  }
};

/* ===== 快速开始视图渲染 ===== */
GM.renderQuickStart = function (done, TM) {
  var qs1 = document.getElementById("qsState1");
  var qs2 = document.getElementById("qsState2");
  var pageEl = document.querySelector(".page");

  if (GM.isInputsEmpty()) {
    // 初始状态：添加一体化模式（隐藏 header，移除边框）
    document.documentElement.classList.remove("has-saved-state");
    if (pageEl) pageEl.classList.add("qs-initial-mode");
    qs1.style.display = "flex";
    qs2.style.display = "none";
    document.getElementById("qsActionsWrap").style.display = "none";
  } else {
    // 有内容状态：移除一体化模式（恢复 header 与边框）
    document.documentElement.classList.remove("has-saved-state");
    if (pageEl) pageEl.classList.remove("qs-initial-mode");
    qs1.style.display = "none";
    qs2.style.display = "flex";

    if (GM.isQuickView) {
      document.getElementById("qsActionsWrap").style.display = "block";
    }
    
    // ===== V2.3.6: 判断是否要隐藏“自选歌曲”按钮 =====
    var qsBtnCustomSelect = document.getElementById("qsBtnCustomSelect");
    if (qsBtnCustomSelect) {
      if (!GM.state.allFetchedSongs || GM.state.allFetchedSongs.length === 0) {
        qsBtnCustomSelect.style.display = "none";
      } else {
        qsBtnCustomSelect.style.display = "";
      }
    }

    document.getElementById("qsProgressText").textContent = "共 " + GM.seeds() + " 位选手，已决出 " + done + " / " + TM + " 场";
    document.getElementById("qsProgressFill2").style.width = (done / TM * 100).toFixed(1) + "%";

    var champ = null, runnerUp = null;
    if (done === TM && TM > 0) {
      champ = GM.state.winners[GM.lastR()][0];
      if (GM.lastR() >= 1) {
        var f0 = GM.state.winners[GM.lastR() - 1][0];
        var f1 = GM.state.winners[GM.lastR() - 1][1];
        runnerUp = (f0 === champ) ? f1 : f0;
      }
    }

    var listHtml = "";
    var N = GM.seeds();
    for (var i = 0; i < N; i += 4) {
      listHtml += '<div class="qs-group-card">';
      for (var j = 0; j < 4; j++) {
        if (i + j >= N) break;
        var num = (i + j + 1).toString().padStart(2, '0');
        var val = GM.state.inputs[i + j].trim() || "（未知）";
        var dVal = (val === "（未知）") ? val : GM.getDisplayName(val, false); // 对阵列表仅显示歌曲名

        var displayNum = num + ".";
        var isEmoji = false;
        if (champ && val === champ && val !== "（未知）") {
          displayNum = "🏆";
          isEmoji = true;
        } else if (runnerUp && val === runnerUp && val !== "（未知）") {
          displayNum = "🥈";
          isEmoji = true;
        }

        var clsName = isEmoji ? "qs-item-idx emoji" : "qs-item-idx";
        listHtml += '<div class="qs-item-line"><span class="' + clsName + '">' + displayNum + '</span><span class="qs-item-name" title="' + GM.esc(dVal) + '">' + GM.esc(dVal) + '</span></div>';
      }
      listHtml += '</div>';
    }
    document.getElementById("qsPlayerList").innerHTML = listHtml;

    if (done === TM) {
      document.getElementById("qsActionsState2").style.display = "none";
      document.getElementById("qsActionsState3").style.display = "flex";
    } else {
      document.getElementById("qsActionsState2").style.display = "flex";
      document.getElementById("qsActionsState3").style.display = "none";
    }
  }
};

/* ===== 视图切换 ===== */
GM.switchTab = function (isQuick) {
  GM.isQuickView = isQuick;
  var viewQuickStart = document.getElementById("viewQuickStart");
  var viewBracket = document.getElementById("viewBracket");
  var iconHome = document.getElementById("iconHome");
  var iconBracket = document.getElementById("iconBracket");

  if (isQuick) {
    viewQuickStart.style.display = "flex";
    viewBracket.style.display = "none";
    document.getElementById("fabReview").classList.remove("show");
    iconHome.style.display = "none";
    iconBracket.style.display = "block";

    if (!GM.isInputsEmpty()) {
      document.getElementById("qsActionsWrap").style.display = "block";
    }
  } else {
    viewQuickStart.style.display = "none";
    viewBracket.style.display = "block";
    document.getElementById("qsActionsWrap").style.display = "none";
    iconHome.style.display = "block";
    iconBracket.style.display = "none";
    GM.render();
  }
};

/* ===== 种子输入处理 ===== */
GM.onSeedInput = function (e) {
  if (e.target.readOnly) return; // 大乱斗锁定项不可编辑
  var k = +e.target.getAttribute("data-idx");
  var v = e.target.value.slice(0, 30);
  if (v !== e.target.value) e.target.value = v;
  GM.state.inputs[k] = v;

  if (!GM.state.meta[v]) GM.state.meta[v] = {};
  GM.state.meta[v].source = 'manual';

  var nodeIdx = k >> 1;
  if (GM.state.winners[0][nodeIdx] !== null) {
    GM.clearNode(0, nodeIdx);
  }
  GM.save();
  GM.render();
};

/* ===== SVG 连线绘制 ===== */
GM.drawConnectors = function () {
  var svg = document.getElementById("connectorSvg");
  var wrap = document.getElementById("bracketWrap");
  if (!wrap || svg.offsetParent === null) return;

  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");

  var wrapRect = wrap.getBoundingClientRect();
  var W = wrap.scrollWidth, H = wrap.scrollHeight;

  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);

  var colRight = [], colLeft = [], colCenterY = [];
  var PAD = 10;
  for (var r = 0; r < GM.rounds(); r++) {
    colRight.push([]); colLeft.push([]); colCenterY.push([]);
    var cells = GM.tbody.querySelectorAll('td.node[data-r="' + r + '"]');
    for (var i = 0; i < cells.length; i++) {
      var rect = cells[i].getBoundingClientRect();
      var left = rect.left - wrapRect.left + PAD;
      var right = rect.right - wrapRect.left - PAD;
      colLeft[r].push(left);
      colRight[r].push(right);
      colCenterY[r].push(rect.top - wrapRect.top + rect.height / 2);
    }
  }
  var seedRows = GM.tbody.querySelectorAll("td.seed-cell");
  var seedRight = [], seedY = [];
  for (var s = 0; s < seedRows.length; s++) {
    var sr = seedRows[s].getBoundingClientRect();
    seedRight.push(sr.right - wrapRect.left - 4);
    seedY.push(sr.top - wrapRect.top + sr.height / 2);
  }

  var stroke = "rgba(255,255,255,.35)";
  var html = "";
  function line(x1, y1, x2, y2) {
    html += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="' + stroke + '" stroke-width="1.2"/>';
  }

  for (var i0 = 0; i0 < colCenterY[0].length; i0++) {
    var yTop = seedY[2 * i0], yBot = seedY[2 * i0 + 1];
    var xIn = colLeft[0][i0];
    var xOut0 = seedRight[2 * i0];
    var midX = (xOut0 + xIn) / 2;
    var yMid = colCenterY[0][i0];
    line(xOut0, yTop, midX, yTop);
    line(xOut0, yBot, midX, yBot);
    line(midX, yTop, midX, yBot);
    line(midX, yMid, xIn, yMid);
  }
  for (var r = 1; r < GM.rounds(); r++) {
    for (var i = 0; i < colCenterY[r].length; i++) {
      var aY = colCenterY[r - 1][2 * i];
      var bY = colCenterY[r - 1][2 * i + 1];
      var xOut = colRight[r - 1][2 * i];
      var xIn2 = colLeft[r][i];
      var mX = (xOut + xIn2) / 2;
      var mY = colCenterY[r][i];
      line(xOut, aY, mX, aY);
      line(xOut, bY, mX, bY);
      line(mX, aY, mX, bY);
      line(mX, mY, xIn2, mY);
    }
  }
  svg.innerHTML = html;
};