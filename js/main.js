/* ===== main.js — 入口文件：事件监听与初始化 ===== */
var GM = window.GM = window.GM || {};

(function () {
  "use strict";

  /* ===== 自定义确认弹窗 ===== */
  var confirmMask = document.getElementById("confirmMask");
  var confirmMsg = document.getElementById("confirmMsg");
  var confirmOk = document.getElementById("confirmOk");
  var confirmCancel = document.getElementById("confirmCancel");
  var confirmCb = null;

  function showConfirm(msg, onOk, danger) {
    confirmMsg.textContent = msg;
    confirmCb = onOk;
    confirmOk.className = "ok" + (danger ? " danger" : "");
    confirmMask.classList.add("show");
  }
  function hideConfirm() {
    confirmMask.classList.remove("show");
    confirmCb = null;
  }
  confirmOk.addEventListener("click", function () {
    var cb = confirmCb;
    hideConfirm();
    if (cb) cb();
  });
  confirmCancel.addEventListener("click", hideConfirm);
  confirmMask.addEventListener("click", function (e) {
    if (e.target === confirmMask) hideConfirm();
  });

  /* ===== 对阵选择弹窗 ===== */
  var vsMask = document.getElementById("vsMask");
  var vsTitle = document.getElementById("vsTitle");
  var vsClear = document.getElementById("vsClear");
  var vsContinuous = document.getElementById("vsContinuous");
  var vsHint = document.getElementById("vsHint");
  var vsR = 0, vsI = 0;
  var isPicking = false;
  var vsTimerInterval = null;
  var vsTimerSeconds = 0;

  function formatTime(seconds) {
    if (seconds >= 5999) return "99:59";
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }

  function getMatchNumber(targetR, targetI) {
    var num = 1;
    for (var r = 0; r <= targetR; r++) {
      for (var i = 0; i < GM.state.winners[r].length; i++) {
        if (r === targetR && i === targetI) return num;
        num++;
      }
    }
    return num;
  }

  function updateVsScreen() {
    var screenEl = document.getElementById("vsPlayerScreen");
    if (screenEl) {
      var matchNum = getMatchNumber(vsR, vsI);
      var total = GM.totalMatches();
      screenEl.innerHTML = "TRACK " + matchNum + "/" + total + "&nbsp;&nbsp;&nbsp;" + formatTime(vsTimerSeconds);
    }
  }

  function startVsTimer() {
    stopVsTimer();
    vsTimerSeconds = 0;
    updateVsScreen();
    vsTimerInterval = setInterval(function () {
      vsTimerSeconds++;
      updateVsScreen();
    }, 1000);
  }

  function stopVsTimer() {
    if (vsTimerInterval) {
      clearInterval(vsTimerInterval);
      vsTimerInterval = null;
    }
  }

  function closePopup() {
    vsMask.classList.remove("show");
    stopVsTimer();
  }

  function findNextMatch(fromR, fromI) {
    var R = GM.rounds();
    for (var r = fromR; r < R; r++) {
      var start = (r === fromR) ? fromI + 1 : 0;
      for (var i = start; i < GM.state.winners[r].length; i++) {
        if (GM.state.winners[r][i] === null) return { r: r, i: i };
      }
    }
    return null;
  }

  function findFirstUnplayedMatch() {
    for (var r = 0; r < GM.rounds(); r++) {
      for (var i = 0; i < GM.state.winners[r].length; i++) {
        if (GM.state.winners[r][i] === null) return { r: r, i: i };
      }
    }
    return null;
  }

  function updateVsProgress() {
    var done = 0, TM = GM.totalMatches();
    for (var rr = 0; rr < GM.rounds(); rr++) {
      for (var ii = 0; ii < GM.state.winners[rr].length; ii++) {
        if (GM.state.winners[rr][ii]) done++;
      }
    }
    var fill = document.getElementById("vsProgressFill");
    if (fill) fill.style.width = (done / TM * 100).toFixed(1) + "%";
  }

  function renderVsCards() {
    var cur = GM.state.winners[vsR][vsI];
    var src = GM.getSources(vsR, vsI);
    var locked = (cur !== null);

    function setCard(suffix, value) {
      var empty = !value;
      var disabled = locked || empty;
      var cardEl = document.getElementById("vsCard" + suffix);
      var nameEl = document.getElementById("vsName" + suffix);
      var coverEl = document.getElementById("vsCover" + suffix);

      cardEl.className = "vs-card" + (disabled ? " disabled" : "") + ((value && value === cur) ? " picked" : "");
      nameEl.textContent = empty ? "（暂无）" : value;
      if (value) cardEl.title = value;

      if (empty || !GM.state.meta[value] || GM.state.meta[value].source === 'manual' || !GM.state.meta[value].artworkUrl100) {
        coverEl.innerHTML = '<span class="emoji">🎵</span>';
      } else {
        var hdUrl = GM.state.meta[value].artworkUrl100.replace('100x100bb', '400x400bb');
        coverEl.innerHTML = '<img src="' + hdUrl + '" alt="cover" onerror="this.parentElement.innerHTML=\'<span class=\\\'emoji\\\'>🎵</span>\';">';
      }
    }
    setCard('A', src[0]);
    setCard('B', src[1]);

    vsClear.className = "vs-clear" + (locked ? "" : " disabled");
    vsHint.textContent = locked
      ? "该场已选定，点「清空本场」可重置（连带重置后续晋级）。"
      : ((!src[0] || !src[1]) ? "灰色候选暂未确定，待前一轮决出后即可选择。" : "点击任意一位选手即判定为本场胜者。");
  }

  function openPopup(r, i, cellEl) {
    vsR = r; vsI = i;
    isPicking = false;
    var roundNames = GM.SIZE_CONFIG[GM.seeds()].roundNames;
    vsTitle.textContent = (r === GM.lastR()) ? "决赛" : (roundNames[r] + " · 第" + (i + 1) + "场");
    renderVsCards();
    updateVsProgress();
    vsMask.classList.add("show");
    startVsTimer();
  }

  function pickWinner(value, cardEl) {
    if (!value || isPicking) return;
    if (GM.state.winners[vsR][vsI] !== null) return;
    isPicking = true;
    cardEl.classList.add("picked");

    setTimeout(function () {
      GM.state.winners[vsR][vsI] = value;
      updateVsProgress();
      GM.save(); GM.render();

      var isFinal = (vsR === GM.lastR());

      if (vsContinuous.checked && !isFinal) {
        var nxt = findNextMatch(vsR, vsI);
        if (nxt) {
          vsR = nxt.r; vsI = nxt.i;
          var roundNames = GM.SIZE_CONFIG[GM.seeds()].roundNames;
          vsTitle.textContent = (nxt.r === GM.lastR()) ? "决赛" : (roundNames[nxt.r] + " · 第" + (nxt.i + 1) + "场");
          renderVsCards();
          updateVsScreen();
          isPicking = false;
          return;
        }
      }

      isPicking = false;
      if (isFinal) {
        var vsBoxEl = document.querySelector("#vsMask .vs-box");
        vsBoxEl.style.display = "none";
        vsMask.style.pointerEvents = "none";
        setTimeout(function () {
          showResultModal();
          vsMask.classList.remove("show");
          vsBoxEl.style.display = "";
          vsMask.style.pointerEvents = "";
          stopVsTimer();
        }, 300);
      } else {
        closePopup();
        if (vsContinuous.checked) GM.toast("已全部对阵完毕");
      }
    }, 300);
  }

  document.getElementById("vsCardA").addEventListener("click", function () { pickWinner(GM.getSources(vsR, vsI)[0], document.getElementById("vsCardA")); });
  document.getElementById("vsCardB").addEventListener("click", function () { pickWinner(GM.getSources(vsR, vsI)[1], document.getElementById("vsCardB")); });
  vsClear.addEventListener("click", function () {
    if (GM.state.winners[vsR][vsI] === null) return;
    GM.clearNode(vsR, vsI);
    GM.save(); GM.render();
    renderVsCards();
    updateVsProgress();
  });
  document.getElementById("vsClose").addEventListener("click", closePopup);
  vsMask.addEventListener("click", function (e) { if (e.target === vsMask) closePopup(); });

  /* ===== 比赛结果弹窗与回顾 ===== */
  var resMask = document.getElementById("resultMask");
  document.getElementById("fabReview").addEventListener("click", showResultModal);
  document.getElementById("resultClose").addEventListener("click", function () { resMask.classList.remove("show"); });
  resMask.addEventListener("click", function (e) { if (e.target === resMask) resMask.classList.remove("show"); });

  var imgMask = document.getElementById("imgMask");
  var previewImg = document.getElementById("previewImg");
  document.getElementById("imgClose").addEventListener("click", function () { imgMask.classList.remove("show"); });
  imgMask.addEventListener("click", function (e) { if (e.target === imgMask) imgMask.classList.remove("show"); });

  document.getElementById("btnResShare").addEventListener("click", function () {
    resMask.classList.remove("show");
    GM.toast("正在生成高清对阵图，请稍候…", 60000);
    GM.renderToCanvas(function (err, canvas) {
      if (err) { GM.toast("生成失败：" + err.message); return; }
      try {
        var dataUrl = canvas.toDataURL("image/png");
        previewImg.src = dataUrl;
        GM.hideToast();
        imgMask.classList.add("show");
      } catch (e) {
        GM.toast("生成图片数据失败：" + e.message);
      }
    });
  });

  function showResultModal() {
    var champ = GM.state.winners[GM.lastR()][0];
    if (!champ) return;
    var final_0 = GM.state.winners[GM.lastR() - 1][0];
    var final_1 = GM.state.winners[GM.lastR() - 1][1];
    var runnerUp = (final_0 === champ) ? final_1 : final_0;
    var s0 = GM.state.winners[GM.lastR() - 2][0];
    var s1 = GM.state.winners[GM.lastR() - 2][1];
    var s2 = GM.state.winners[GM.lastR() - 2][2];
    var s3 = GM.state.winners[GM.lastR() - 2][3];
    var semis = [s0, s1, s2, s3];
    var top4 = [];
    for (var i = 0; i < semis.length; i++) {
      if (semis[i] && semis[i] !== final_0 && semis[i] !== final_1) top4.push(semis[i]);
    }

    document.getElementById("resChampName").textContent = champ;
    document.getElementById("resRunnerUp").textContent = runnerUp || "未知";
    document.getElementById("resTop4_1").textContent = top4[0] || "未知";
    document.getElementById("resTop4_2").textContent = top4[1] || "未知";

    var roadHtml = "";
    var curChamp = champ;
    var curIdx = 0;
    var roadData = [];

    for (var r = GM.lastR(); r >= 0; r--) {
      var srcs = GM.getSources(r, curIdx);
      var isSrc0 = (srcs[0] === curChamp);
      var opp = isSrc0 ? srcs[1] : srcs[0];
      var rName = GM.SIZE_CONFIG[GM.seeds()].roundNames[r];
      if (r === GM.lastR()) rName = "决赛";
      roadData.unshift({ rName: rName, opp: opp });
      curIdx = isSrc0 ? 2 * curIdx : 2 * curIdx + 1;
    }

    for (var j = 0; j < roadData.length; j++) {
      roadHtml += '<div class="road-item">' +
        '<span class="road-r">' + GM.esc(roadData[j].rName) + '</span>' +
        '<span class="road-vs">vs</span>' +
        '<span class="road-opp">' + GM.esc(roadData[j].opp || '（轮空）') + '</span>' +
        '</div>';
    }
    document.getElementById("resRoadList").innerHTML = roadHtml;
    resMask.classList.add("show");
  }

  /* ===== 全局事件 ===== */
  GM.tbody.addEventListener("click", function (e) {
    var cell = e.target.closest ? e.target.closest("td.node") : null;
    if (!cell) return;
    var r = +cell.getAttribute("data-r");
    var i = +cell.getAttribute("data-i");
    openPopup(r, i, cell);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePopup(); });
  window.addEventListener("resize", function () {
    if (document.getElementById("viewBracket").style.display === "block") GM.drawConnectors();
  });
  document.getElementById("titleInput").addEventListener("input", function (e) {
    GM.state.title = e.target.value;
    GM.save();
  });

  /* ===== 批量录入弹窗 ===== */
  var batchMask = document.getElementById("batchMask");
  var batchArea = document.getElementById("batchArea");
  var batchCount = document.getElementById("batchCount");

  function parseBatchText(text) {
    var lines = String(text).split(/\r\n|\r|\n/);
    var items = [];
    for (var i = 0; i < lines.length; i++) {
      var v = lines[i].replace(/^\s+|\s+$/g, "");
      if (!v) continue;
      items.push(v.slice(0, 30));
      if (items.length >= GM.seeds()) break;
    }
    return items;
  }
  function updateBatchCount() {
    var n = parseBatchText(batchArea.value).length;
    batchCount.textContent = "已识别 " + n + " 项" + (n > 0 ? "（将填入第 1~" + n + " 项）" : "");
  }
  function openBatchModal() {
    var existing = [];
    for (var i = 0; i < GM.seeds(); i++) existing.push(GM.state.inputs[i] || "");
    batchArea.value = existing.join("\n");
    updateBatchCount();
    batchMask.classList.add("show");
    batchArea.focus();
  }
  function closeBatchModal() { batchMask.classList.remove("show"); }

  function applyBatch() {
    batchArea.blur();
    var items = parseBatchText(batchArea.value);
    var arr = new Array(GM.seeds()).fill("");
    for (var i = 0; i < items.length; i++) {
      arr[i] = items[i];
      if (items[i]) {
        if (!GM.state.meta[items[i]]) GM.state.meta[items[i]] = {};
        GM.state.meta[items[i]].source = 'manual';
      }
    }
    GM.state.inputs = arr;
    GM.state.covers = [];
    GM.state.avgColor = null;
    GM.state.allFetchedSongs = []; // 手动批量录入时清空缓存歌曲
    GM.clearAllWinners();
    var inputs = GM.tbody.querySelectorAll("input[data-idx]");
    for (var k = 0; k < inputs.length; k++) inputs[k].value = GM.state.inputs[k];
    GM.save(); GM.render();
    closeBatchModal();
    GM.toast("已应用批量录入");
  }

  document.getElementById("btnOpenBatchFromArtist").addEventListener("click", function () {
    closeArtistModal();
    openBatchModal();
  });
  document.getElementById("btnMore").addEventListener("click", function () {
    var tb = document.querySelector(".toolbar");
    tb.classList.toggle("expanded");
    this.textContent = tb.classList.contains("expanded") ? "收起 ▴" : "更多 ▾";
  });
  document.getElementById("batchClose").addEventListener("click", closeBatchModal);
  document.getElementById("btnBatchApply").addEventListener("click", applyBatch);
  batchArea.addEventListener("input", updateBatchCount);
  batchMask.addEventListener("click", function (e) { if (e.target === batchMask) closeBatchModal(); });
  document.getElementById("btnBatchDemo").addEventListener("click", function () {
    batchArea.value = GM.DEMO.join("\n");
    updateBatchCount();
    batchArea.focus();
  });

  /* ===== 视图1：快速开始逻辑 ===== */
  var qsSearchInput = document.getElementById("qsSearchInput");
  var qsSizeSelect = document.getElementById("qsSizeSelect");
  var qsSearchBtn = document.getElementById("qsSearchBtn");
  var qsSearchBox = document.getElementById("qsSearchBox");

  function doQuickFetch() {
    var name = qsSearchInput.value.replace(/^\s+|\s+$/g, "");
    if (!name) { GM.toast("请输入歌手名称"); qsSearchInput.focus(); return; }
    qsSearchInput.blur();
    var sz = parseInt(qsSizeSelect.value);
    if (sz !== GM.state.size) setSize(sz);

    qsSearchInput.disabled = true;
    qsSizeSelect.disabled = true;
    qsSearchBtn.disabled = true;
    qsSearchBox.classList.add("loading");

    function resetLoading() {
      qsSearchInput.disabled = false;
      qsSizeSelect.disabled = false;
      qsSearchBtn.disabled = false;
      qsSearchBox.classList.remove("loading");
    }

    GM.coreFetchArtist(name, function (res) {
      resetLoading();
      
      GM.state.allFetchedSongs = res.songs; 
      var arr = new Array(GM.seeds()).fill("");
      for (var i = 0; i < Math.min(res.songs.length, GM.seeds()); i++) {
        arr[i] = res.songs[i];
      }
      GM.state.inputs = arr;
      GM.state.title = name;
      document.getElementById("titleInput").value = name;
      GM.state.covers = GM.extractCoversFromApiRes(res);
      GM.state.avgColor = null;
      for (var k in res.metaData) GM.state.meta[k] = res.metaData[k];

      GM.clearAllWinners();
      var inputs = GM.tbody.querySelectorAll("input[data-idx]");
      for (var q = 0; q < inputs.length; q++) inputs[q].value = GM.state.inputs[q];
      GM.save(); GM.render();
      GM.toast("已生成对决列表，点击上方「自选歌曲」换歌", 2500);
    }, function (errMsg) {
      resetLoading();
      document.getElementById("artistInput").value = name;
      openArtistModal();
      setArtistStatus(errMsg, "err");
    });
  }

  qsSearchBtn.addEventListener("click", doQuickFetch);
  qsSearchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); doQuickFetch(); }
  });
  document.getElementById("qsArtistPicks").addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".artist-pick") : null;
    if (!btn) return;
    qsSearchInput.value = btn.getAttribute("data-name");
    doQuickFetch();
  });

  function executeReset() {
    GM.state.inputs = new Array(GM.seeds()).fill("");
    GM.state.covers = [];
    GM.state.avgColor = null;
    GM.state.allFetchedSongs = [];
    GM.state.title = "金曲世界杯";
    document.getElementById("titleInput").value = GM.state.title;
    GM.clearAllWinners();
    var inputs = GM.tbody.querySelectorAll("input[data-idx]");
    for (var k = 0; k < inputs.length; k++) inputs[k].value = "";
    qsSearchInput.value = "";
    GM.save(); GM.render();
  }
  document.getElementById("qsBtnReset1").addEventListener("click", executeReset);
  document.getElementById("qsBtnReset2").addEventListener("click", executeReset);

  document.getElementById("qsBtnStartMatch").addEventListener("click", function () {
    var nxt = findFirstUnplayedMatch();
    if (nxt) openPopup(nxt.r, nxt.i, null);
  });
  document.getElementById("qsBtnRestart").addEventListener("click", function () {
    GM.clearAllWinners();
    GM.save(); GM.render();
    var nxt = findFirstUnplayedMatch();
    if (nxt) openPopup(nxt.r, nxt.i, null);
  });
  document.getElementById("qsBtnViewResult").addEventListener("click", showResultModal);

  /* ===== 视图2：歌手导入弹窗 ===== */
  var artistMask = document.getElementById("artistMask");
  var artistInput = document.getElementById("artistInput");
  var artistStatus = document.getElementById("artistStatus");
  var btnFetchArtist = document.getElementById("btnFetchArtist");

  function openArtistModal() {
    artistStatus.textContent = "";
    artistStatus.className = "artist-status";
    artistMask.classList.add("show");
    artistInput.focus();
  }
  function closeArtistModal() { artistMask.classList.remove("show"); }
  function setArtistStatus(msg, type) {
    artistStatus.textContent = msg;
    artistStatus.className = "artist-status" + (type ? " " + type : "");
  }

  function fetchArtistSongsOld() {
    var name = artistInput.value.replace(/^\s+|\s+$/g, "");
    if (!name) { setArtistStatus("请输入歌手名字", "err"); artistInput.focus(); return; }

    btnFetchArtist.disabled = true;
    setArtistStatus("正在获取「" + name + "」的热门歌曲…");

    GM.coreFetchArtist(name, function (res) {
      btnFetchArtist.disabled = false;
      setArtistStatus("已获取，正在导入…", "ok");
      setTimeout(function () {
        GM.state.allFetchedSongs = res.songs;
        var arr = new Array(GM.seeds()).fill("");
        for (var i = 0; i < Math.min(res.songs.length, GM.seeds()); i++) {
          arr[i] = res.songs[i];
        }
        GM.state.inputs = arr;
        GM.state.title = name;
        document.getElementById("titleInput").value = name;
        GM.state.covers = GM.extractCoversFromApiRes(res);
        GM.state.avgColor = null;
        for (var k in res.metaData) GM.state.meta[k] = res.metaData[k];

        GM.clearAllWinners();
        var inputs = GM.tbody.querySelectorAll("input[data-idx]");
        for (var q = 0; q < inputs.length; q++) inputs[q].value = GM.state.inputs[q];
        GM.save(); GM.render();
        closeArtistModal();
        GM.toast("已生成对决列表，点击上方「自选歌曲」换歌");
      }, 350);
    }, function (err) {
      btnFetchArtist.disabled = false;
      setArtistStatus(err, "err");
    });
  }
  document.getElementById("btnImportArtist").addEventListener("click", openArtistModal);
  document.getElementById("artistClose").addEventListener("click", closeArtistModal);
  btnFetchArtist.addEventListener("click", fetchArtistSongsOld);
  document.getElementById("artistPicksOld").addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".artist-pick") : null;
    if (!btn) return;
    artistInput.value = btn.getAttribute("data-name");
    fetchArtistSongsOld();
  });
  artistInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); fetchArtistSongsOld(); }
  });
  artistMask.addEventListener("click", function (e) {
    if (e.target === artistMask) closeArtistModal();
  });


  /* ===== V2.3.2 自选歌曲完整分组交互优化逻辑 ===== */
  var selectMask = document.getElementById("selectMask");
  var selectBody = document.getElementById("selectBody");
  var selectSearchInput = document.getElementById("selectSearchInput");
  var selectSearchClear = document.getElementById("selectSearchClear");
  var selectSizeDropdown = document.getElementById("selectSizeDropdown");
  var selectSortDropdown = document.getElementById("selectSortDropdown");
  var selectBtnClear = document.getElementById("selectBtnClear");
  var selectBtnSubmit = document.getElementById("selectBtnSubmit");
  
  var currentSelectSize = GM.seeds();
  var tempSelectedSongs = [];

  function openSelectModal() {
    if (!GM.state.allFetchedSongs || GM.state.allFetchedSongs.length === 0) {
      GM.toast("当前未缓存该歌手更多歌曲，请重新搜索并导入");
      return;
    }
    currentSelectSize = GM.seeds();
    selectSizeDropdown.value = currentSelectSize;
    selectSortDropdown.value = "default";
    selectSearchInput.value = "";
    selectSearchClear.style.display = "none";
    tempSelectedSongs = GM.state.inputs.filter(function(s) { return s.trim() !== ""; });
    
    renderSelectList();
    selectMask.classList.add("show");
  }

  function renderSelectList() {
    var kw = selectSearchInput.value.trim().toLowerCase();
    var sortType = selectSortDropdown.value; 
    var rawSongs = GM.state.allFetchedSongs || [];
    var listToRender = [];
    
    // 构建含排序因子的列表
    for (var i = 0; i < rawSongs.length; i++) {
      var s = rawSongs[i];
      if (kw && s.toLowerCase().indexOf(kw) === -1) continue;
      
      var meta = GM.state.meta[s] || {};
      var year = meta.releaseDate ? meta.releaseDate.substring(0, 4) : "未知";
      var sortYear = year === "未知" ? 9999 : parseInt(year);
      
      listToRender.push({
        name: s,
        year: year,
        sortYear: sortYear,
        originalIndex: i
      });
    }
    
    // 排序处理
    if (sortType === "asc") {
      listToRender.sort(function(a, b) {
        if (a.sortYear !== b.sortYear) return a.sortYear - b.sortYear;
        return a.originalIndex - b.originalIndex;
      });
    } else if (sortType === "desc") {
      listToRender.sort(function(a, b) {
        if (a.sortYear !== b.sortYear) {
          if (a.sortYear === 9999) return 1; // 未知年份始终垫底
          if (b.sortYear === 9999) return -1;
          return b.sortYear - a.sortYear;
        }
        return a.originalIndex - b.originalIndex;
      });
    }
    
    var html = "";
    var currentYear = null;
    
    for (var j = 0; j < listToRender.length; j++) {
      var item = listToRender[j];
      
      // 年代分组标题逻辑
      if (sortType !== "default" && item.year !== currentYear) {
         currentYear = item.year;
         html += '<div class="sel-year-header">' + currentYear + (currentYear !== "未知" ? " 年" : "年份") + '</div>';
      }
      
      var isSelected = tempSelectedSongs.indexOf(item.name) !== -1;
      var cls = "select-card" + (isSelected ? " selected" : "");
      
      // 2.3.2 优化：使用 sel-card-bottom 容器强制保证 年代字段 和 勾选项在底部两端对齐
      html += '<div class="' + cls + '" data-song="' + GM.esc(item.name) + '">';
      html += '<div class="sel-name" title="' + GM.esc(item.name) + '">' + GM.esc(item.name) + '</div>';
      html += '<div class="sel-card-bottom">';
      html += '<div class="sel-year">' + item.year + '</div>';
      html += '<div class="sel-check">✓</div>';
      html += '</div>';
      html += '</div>';
    }
    
    selectBody.innerHTML = html || '<div style="color: rgba(255,255,255,0.4); text-align: center; grid-column: 1/-1; padding-top: 40px;">暂无匹配歌曲</div>';
    
    if (tempSelectedSongs.length < currentSelectSize) {
      selectBtnSubmit.disabled = true;
      selectBtnSubmit.textContent = "已选 " + tempSelectedSongs.length + " / " + currentSelectSize;
    } else {
      selectBtnSubmit.disabled = false;
      selectBtnSubmit.textContent = "确认";
    }
  }

  selectBody.addEventListener("click", function(e) {
    var card = e.target.closest(".select-card");
    if (!card) return;
    var s = card.getAttribute("data-song");
    var idx = tempSelectedSongs.indexOf(s);
    
    if (idx !== -1) {
      tempSelectedSongs.splice(idx, 1);
    } else {
      if (tempSelectedSongs.length >= currentSelectSize) {
        GM.toast("最多选择 " + currentSelectSize + " 个");
        return;
      }
      tempSelectedSongs.push(s);
    }
    renderSelectList();
  });

  selectSizeDropdown.addEventListener("change", function(e) {
    currentSelectSize = parseInt(e.target.value);
    tempSelectedSongs = [];
    var songs = GM.state.allFetchedSongs || [];
    for (var i = 0; i < Math.min(songs.length, currentSelectSize); i++) {
      tempSelectedSongs.push(songs[i]);
    }
    GM.toast("选手数量已切换为 " + currentSelectSize + " 个");
    renderSelectList();
  });
  
  selectSortDropdown.addEventListener("change", renderSelectList);
  
  selectBtnClear.addEventListener("click", function() {
    tempSelectedSongs = [];
    renderSelectList();
  });

  selectSearchInput.addEventListener("input", function() {
    selectSearchClear.style.display = this.value ? "block" : "none";
    renderSelectList();
  });
  selectSearchClear.addEventListener("click", function() {
    selectSearchInput.value = "";
    this.style.display = "none";
    renderSelectList();
  });

  document.getElementById("selectBtnRand").addEventListener("click", function() {
    var songs = (GM.state.allFetchedSongs || []).slice();
    for (var k = songs.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = songs[k]; songs[k] = songs[j]; songs[j] = tmp;
    }
    tempSelectedSongs = songs.slice(0, currentSelectSize);
    GM.toast("已随机抽取 " + currentSelectSize + " 项");
    renderSelectList();
  });

  selectBtnSubmit.addEventListener("click", function() {
    if (tempSelectedSongs.length < currentSelectSize) return;

    if (GM.state.size !== currentSelectSize) {
      GM.state.size = currentSelectSize;
      GM.state.winners = GM.makeWinners(currentSelectSize);
      GM.buildTable();
      document.getElementById("sizeSelect").value = currentSelectSize;
      document.getElementById("qsSizeSelect").value = currentSelectSize;
    }

    var arr = new Array(currentSelectSize).fill("");
    for (var i = 0; i < tempSelectedSongs.length; i++) arr[i] = tempSelectedSongs[i];
    
    GM.state.inputs = arr;
    GM.clearAllWinners(); 
    
    var inputs = GM.tbody.querySelectorAll("input[data-idx]");
    for (var q = 0; q < inputs.length; q++) {
      if (inputs[q]) inputs[q].value = GM.state.inputs[q];
    }
    
    GM.save();
    GM.render();
    selectMask.classList.remove("show");
    GM.toast("自选歌曲已应用成功");
  });

  document.getElementById("selectClose").addEventListener("click", function() { selectMask.classList.remove("show"); });
  selectMask.addEventListener("click", function(e) { if (e.target === selectMask) selectMask.classList.remove("show"); });
  document.getElementById("qsBtnCustomSelect").addEventListener("click", openSelectModal);


  /* ===== 视图切换与全局初始化 ===== */
  document.getElementById("btnViewToggle").addEventListener("click", function () {
    GM.switchTab(!GM.isQuickView);
  });

  function executeShuffle() {
    var filled = [];
    for (var i = 0; i < GM.seeds(); i++) {
      var v = (GM.state.inputs[i] || "").replace(/^\s+|\s+$/g, "");
      if (v) filled.push(GM.state.inputs[i]);
    }
    if (filled.length === 0) {
      GM.toast("还没有填写任何选项");
      return;
    }
    var arr = filled.slice();
    for (var k = arr.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = arr[k]; arr[k] = arr[j]; arr[j] = tmp;
    }
    var next = new Array(GM.seeds()).fill("");
    for (var m = 0; m < arr.length && m < GM.seeds(); m++) next[m] = arr[m];
    GM.state.inputs = next;
    GM.clearAllWinners();
    var inputs = GM.tbody.querySelectorAll("input[data-idx]");
    for (var q = 0; q < inputs.length; q++) inputs[q].value = GM.state.inputs[q];
    GM.save(); GM.render();
    GM.toast("已随机分组");
  }
  document.getElementById("qsBtnShuffle").addEventListener("click", executeShuffle);
  document.getElementById("btnShuffleOrig").addEventListener("click", executeShuffle);

  document.getElementById("btnResetWinners").addEventListener("click", function () {
    showConfirm("将清空所有已选出的胜者（保留 " + GM.seeds() + " 个选项），确定吗？", function () {
      GM.clearAllWinners();
      GM.save(); GM.render();
    }, true);
  });
  document.getElementById("btnClearAll").addEventListener("click", function () {
    showConfirm("将清空全部选项与对阵结果，确定吗？", function () { executeReset(); }, true);
  });

  document.getElementById("btnDownloadImg").addEventListener("click", GM.downloadImage);
  document.getElementById("btnCopyImg").addEventListener("click", GM.copyImage);

  function syncSizeSeg() {
    document.getElementById("sizeSelect").value = GM.state.size;
    document.getElementById("qsSizeSelect").value = GM.state.size;
  }
  function setSize(n) {
    GM.state.size = n;
    GM.state.inputs = new Array(n).fill("");
    GM.state.winners = GM.makeWinners(n);
    GM.state.covers = [];
    GM.state.allFetchedSongs = []; 
    GM.state.avgColor = null;
    GM.state.title = "金曲世界杯";
    document.getElementById("titleInput").value = GM.state.title;
    GM.buildTable();
    syncSizeSeg();
    GM.render();
    GM.save();
  }
  function handleSizeChange(n) {
    if (n === GM.state.size) return;
    setSize(n);
    GM.toast("已切换为 " + n + " 强，并清空所有数据");
  }
  document.getElementById("sizeSelect").addEventListener("change", function (e) { handleSizeChange(+e.target.value); });
  document.getElementById("qsSizeSelect").addEventListener("change", function (e) { handleSizeChange(+e.target.value); });

  /* ===== 启动 ===== */
  try {
    for (var lk = 0; lk < GM.LS_KEY_LEGACY.length; lk++) {
      if (localStorage.getItem(GM.LS_KEY_LEGACY[lk]) !== null) localStorage.removeItem(GM.LS_KEY_LEGACY[lk]);
    }
  } catch (e) {}
  GM.load();
  if (!GM.SIZE_CONFIG[GM.state.size]) GM.state.size = 64;

  GM.buildTable();
  syncSizeSeg();
  GM.switchTab(true);
  GM.render();
})();