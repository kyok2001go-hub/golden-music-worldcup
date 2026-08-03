/* ===== main.js — 入口文件：事件监听与初始化 ===== */
var GM = window.GM = window.GM || {};

(function () {
  "use strict";
  
  window._isSharedLink = false; 

  var originalRender = GM.render;
  GM.render = function () {
    if (originalRender) originalRender();
    var btnToggle = document.getElementById("btnViewToggle");
    if (btnToggle) {
      if (window._isSharedLink || GM.isInputsEmpty()) {
        btnToggle.style.display = "none";
      } else {
        btnToggle.style.display = "flex";
      }
    }
  };

  GM.switchTab = function (isQuick) {
    GM.isQuickView = isQuick;
    var viewQuickStart = document.getElementById("viewQuickStart");
    var viewBracket = document.getElementById("viewBracket");
    var qsActionsWrap = document.getElementById("qsActionsWrap");
    var fabReview = document.getElementById("fabReview");

    if (isQuick) {
      if (viewQuickStart) viewQuickStart.style.display = "flex";
      if (viewBracket) viewBracket.style.display = "none";
      if (fabReview) fabReview.classList.remove("show");
      if (!GM.isInputsEmpty() && qsActionsWrap) {
        qsActionsWrap.style.display = "block";
      }
    } else {
      if (viewQuickStart) viewQuickStart.style.display = "none";
      if (viewBracket) viewBracket.style.display = "block";
      if (qsActionsWrap) qsActionsWrap.style.display = "none";
      GM.render();
    }
  };

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

  /* ===== 试听控制逻辑 ===== */
  GM.currentAudio = null;
  GM.currentSourceCd = null;
  GM.flyingCd = null;

  GM.stopPreview = function() {
    if (GM.currentAudio) {
      GM.currentAudio.pause();
      GM.currentAudio = null;
    }
    if (GM.currentSourceCd) {
      GM.currentSourceCd.style.opacity = '';
      GM.currentSourceCd = null;
    }
    if (GM.flyingCd) {
      GM.flyingCd.remove();
      GM.flyingCd = null;
    }
    var playingBtns = document.querySelectorAll('.btn-preview.playing');
    for(var i=0; i<playingBtns.length; i++) {
      playingBtns[i].classList.remove('playing');
      playingBtns[i].innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    }
  };

  var vsCardsContainer = document.querySelector('.vs-cards');
  if (vsCardsContainer) {
    vsCardsContainer.addEventListener('click', function(e) {
      var btn = e.target.closest('.btn-preview');
      if (btn) {
        e.stopPropagation(); 
        var val = btn.getAttribute('data-val');
        var suffix = btn.getAttribute('data-suffix');
        
        if (btn.classList.contains('playing')) {
          GM.stopPreview();
        } else {
          GM.playPreview(val, suffix, btn);
        }
      }
    });
  }

  GM.playPreview = function(value, suffix, btn) {
    var url = GM.state.meta[value] && GM.state.meta[value].previewUrl;
    if (!url) return;

    GM.stopPreview(); 

    GM.currentAudio = new Audio(url);
    var playPromise = GM.currentAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(function(error) {
        console.warn("Audio play prevented:", error);
        GM.stopPreview();
      });
    }

    btn.classList.add('playing');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>'; 
    GM.currentAudio.onended = GM.stopPreview;

    var sourceCd = document.querySelector('#vsCard' + suffix + ' .vs-card-cd-disc');
    var playerBody = document.querySelector('.cd-player-wrapper .main-body');
    var targetForScale = document.querySelector('.cd-player-wrapper .cd-positioner');
    var boxEl = document.querySelector('.vs-box'); 
    
    if (!sourceCd || !playerBody || !boxEl) return;

    GM.currentSourceCd = sourceCd;
    var rectSrc = sourceCd.getBoundingClientRect();
    var rectDst = playerBody.getBoundingClientRect(); 
    var boxRect = boxEl.getBoundingClientRect(); 

    var flying = sourceCd.cloneNode(true);
    GM.flyingCd = flying;
    
    var startLeft = rectSrc.left - boxRect.left + boxEl.scrollLeft;
    var startTop = rectSrc.top - boxRect.top + boxEl.scrollTop;

    flying.style.position = 'absolute'; 
    flying.style.left = startLeft + 'px';
    flying.style.top = startTop + 'px';
    flying.style.margin = '0';
    flying.style.transform = 'none'; 
    flying.style.zIndex = '15'; 
    flying.style.transition = 'none';
    boxEl.appendChild(flying); 

    sourceCd.style.opacity = '0'; 

    var centerLeft = window.innerWidth / 2 - boxRect.left - (rectSrc.width / 2) + boxEl.scrollLeft;
    var centerTop = window.innerHeight / 2 - boxRect.top - (rectSrc.height / 2) + boxEl.scrollTop;
    
    var dstLeft = rectDst.left - boxRect.left + (rectDst.width / 2) - (rectSrc.width / 2) + boxEl.scrollLeft;
    var dstTop = rectDst.top - boxRect.top + (rectDst.height / 2) - (rectSrc.height / 2) + boxEl.scrollTop;
    var scaleTarget = targetForScale ? (targetForScale.getBoundingClientRect().width / rectSrc.width) : 0.5;

    var deltaCenterX = centerLeft - startLeft;
    var deltaCenterY = centerTop - startTop;
    var deltaDstX = dstLeft - startLeft;
    var deltaDstY = dstTop - startTop;

    var keyframes = [
      { transform: 'translate(0px, 0px) scale(1)' },
      { transform: 'translate(' + deltaCenterX + 'px, ' + deltaCenterY + 'px) scale(1.2)', offset: 0.35 },
      { transform: 'translate(' + deltaCenterX + 'px, ' + deltaCenterY + 'px) scale(1.2)', offset: 0.65 },
      { transform: 'translate(' + deltaDstX + 'px, ' + deltaDstY + 'px) scale(' + scaleTarget + ')' }
    ];

    var anim = flying.animate(keyframes, {
      duration: 1500,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
      fill: 'forwards'
    });

    anim.onfinish = function() {
      flying.style.opacity = '0'; 
    };
  };

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
    var trackEl = document.getElementById("vsPlayerTrack");
    var timerEl = document.getElementById("vsPlayerTimer");
    if (trackEl && timerEl) {
      var matchNum = getMatchNumber(vsR, vsI);
      var total = GM.totalMatches();
      trackEl.textContent = matchNum + "/" + total;
      timerEl.textContent = formatTime(vsTimerSeconds);
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
    GM.stopPreview(); 
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
        var html = '<img src="' + hdUrl + '" alt="cover" onerror="this.parentElement.innerHTML=\'<span class=\\\'emoji\\\'>🎵</span>\';">';
        
        if (GM.state.meta[value].previewUrl) {
          html += '<div class="btn-preview" data-val="' + GM.esc(value) + '" data-suffix="' + suffix + '" title="试听片段">' +
                  '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
                  '</div>';
        }
        coverEl.innerHTML = html;
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
    
    GM.stopPreview(); 

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

  document.getElementById("vsCardA").addEventListener("click", function (e) { 
    if(e.target.closest('.btn-preview')) return; 
    pickWinner(GM.getSources(vsR, vsI)[0], document.getElementById("vsCardA")); 
  });
  document.getElementById("vsCardB").addEventListener("click", function (e) { 
    if(e.target.closest('.btn-preview')) return; 
    pickWinner(GM.getSources(vsR, vsI)[1], document.getElementById("vsCardB")); 
  });

  vsClear.addEventListener("click", function () {
    if (GM.state.winners[vsR][vsI] === null) return;
    GM.clearNode(vsR, vsI);
    GM.save(); GM.render();
    renderVsCards();
    updateVsProgress();
    GM.stopPreview(); 
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

    var champNameEl = document.getElementById("resChampName");
    champNameEl.textContent = champ;

    // 冠军封面：仅导入歌曲（有 API 封面）时展示；手动录入或封面加载失败时保持原有展示
    var coverBox = document.getElementById("resChampCoverBox");
    var coverImg = document.getElementById("resChampCover");
    var champIcon = document.getElementById("resChampIcon");
    var champMeta = GM.state.meta[champ];
    coverBox.style.display = "none";
    champIcon.style.display = "";
    champNameEl.classList.remove("with-cover");
    coverImg.removeAttribute("src");
    if (champMeta && champMeta.source !== "manual" && champMeta.artworkUrl100) {
      coverImg.onload = function () {
        coverBox.style.display = "inline-block";
        champIcon.style.display = "none";
        champNameEl.classList.add("with-cover");
      };
      coverImg.onerror = function () {
        coverBox.style.display = "none";
        champIcon.style.display = "";
        champNameEl.classList.remove("with-cover");
      };
      coverImg.src = champMeta.artworkUrl100.replace("100x100bb", "400x400bb");
    }

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
    playConfetti();
  }

  /* ===== 冠军彩带喷发动画：两侧下方向上方中间喷发，自然落下消失 ===== */
  function playConfetti() {
    var old = document.getElementById("confettiCanvas");
    if (old) old.parentNode.removeChild(old);

    var canvas = document.createElement("canvas");
    canvas.id = "confettiCanvas";
    canvas.className = "confetti-canvas";
    document.body.appendChild(canvas);

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    var COLORS = ["#F0AC4A", "#c498ff", "#ffd93d", "#ff6b9d", "#5bd8ff", "#7ee787", "#ffffff"];
    var GRAV = 1500;      // 重力加速度 px/s^2
    var EMIT_MS = 100;    // 喷发时长（极短爆发）
    var MAX_MS = 3000;    // 动画总时长上限
    var particles = [];
    var start = performance.now();
    var prev = start;

    function emit(side) {
      var fromLeft = (side === "left");
      for (var k = 0; k < 18; k++) {
        // 竖直初速：可上升至屏幕上中部区域
        var vy = -(0.85 + Math.random() * 0.5) * Math.sqrt(2 * GRAV * H * 0.7);
        // 水平初速：按到达顶点时间推算，使彩带向屏幕中轴汇聚
        var tPeak = -vy / GRAV;
        var vx = (W * 0.5 * (0.45 + Math.random() * 0.55)) / tPeak;
        particles.push({
          x: fromLeft ? -8 : W + 8,
          y: H * (0.98 + (Math.random() - 0.5) * 0.3),
          vx: fromLeft ? vx : -vx,
          vy: vy,
          w: 5 + Math.random() * 5,
          h: 8 + Math.random() * 7,
          circle: Math.random() < 0.25,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          angle: Math.random() * Math.PI,
          vAngle: (Math.random() - 0.5) * 14,
          sway: 20 + Math.random() * 45,
          phase: Math.random() * 1000,
          age: 0,
          ttl: 2200 + Math.random() * 700
        });
      }
    }

    function frame(now) {
      var elapsed = now - start;
      var dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;

      if (elapsed < EMIT_MS) { emit("left"); emit("right"); }

      ctx.clearRect(0, 0, W, H);
      var alive = false;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.age += dt * 1000;
        if (p.age >= p.ttl || p.y > H + 40) continue;
        alive = true;
        p.vy += GRAV * dt;
        p.vx *= (1 - 0.15 * dt);
        p.x += (p.vx + Math.sin((p.age + p.phase) * 0.012) * p.sway) * dt;
        p.y += p.vy * dt;
        p.angle += p.vAngle * dt;
        ctx.save();
        ctx.globalAlpha = p.age > p.ttl - 500 ? Math.max(0, (p.ttl - p.age) / 500) : 1;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        if (p.circle) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }

      if (elapsed < MAX_MS && (elapsed < EMIT_MS || alive)) {
        requestAnimationFrame(frame);
      } else if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }
    requestAnimationFrame(frame);
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

  var DEMO_SONGS = ["180度","E-Lover","Honey Honey","Stefanie","The Moment","爱情证书","爱情字典","安宁",
    "半句再见","比较幸福","不是真的爱我","彩虹金刚","当冬夜渐暖","第一天","风筝","风衣",
    "咕叽咕叽","害怕","和平","很好","坏天气","开始懂了","克卜勒","了解",
    "另一张脸","绿光","没有人的方向","明天晴天","逆光","浓眉毛","飘着","平日快乐",
    "任性","日落","尚好的青春","神奇","逃亡","天黑黑","天使的指纹","同类",
    "完美的一天","我不爱","我不难过","我的爱","我怀念的","我要的幸福","我也很想他","相信",
    "需要你","漩涡","眼泪成诗","样子","一样的夏天","银泰","隐形人","永远",
    "愚人的国度","雨还是不停地落下","雨天","遇见","直来直往","祝你开心","超快感","奔"];

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
    GM.state.allFetchedSongs = [];
    
    window._isSharedLink = false;
    
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
    var size = GM.seeds();
    batchArea.value = DEMO_SONGS.slice(0, size).join("\n");
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

      window._isSharedLink = false;
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
    window._isSharedLink = false;
    GM.clearAllWinners();
    var inputs = GM.tbody.querySelectorAll("input[data-idx]");
    for (var k = 0; k < inputs.length; k++) inputs[k].value = "";
    qsSearchInput.value = "";
    GM.save(); GM.render();
  }
  document.getElementById("qsBtnReset1").addEventListener("click", executeReset);
  document.getElementById("qsBtnReset2").addEventListener("click", executeReset);

  // ===== 分享弹窗及剪贴板逻辑 (KV + Functions 架构) =====
  var currentShareText = "";
  var shareModalMask = document.getElementById("shareModalMask");
  var shareModalBtn = document.getElementById("shareModalBtn");
  var shareModalClose = document.getElementById("shareModalClose");

  function closeShareModal() {
    if (shareModalMask) shareModalMask.classList.remove("show");
  }
  
  if (shareModalClose) shareModalClose.addEventListener("click", closeShareModal);
  if (shareModalMask) {
    shareModalMask.addEventListener("click", function (e) {
      if (e.target === shareModalMask) closeShareModal();
    });
  }

  if (shareModalBtn) {
    shareModalBtn.addEventListener("click", function () {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(currentShareText).then(function () {
          closeShareModal();
          GM.toast("已复制本局短链接，快发给朋友来玩吧~", 2500);
        }).catch(function () {
          fallbackCopy(currentShareText);
        });
      } else {
        fallbackCopy(currentShareText);
      }
    });
  }

  function fallbackCopy(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      var successful = document.execCommand('copy');
      closeShareModal();
      if (successful) {
        GM.toast("已复制本局短链接，快发给朋友来玩吧~", 2500);
      } else {
        prompt("请手动复制以下分享文案：", text);
      }
    } catch (err) {
      closeShareModal();
      prompt("请手动复制以下分享文案：", text);
    }
    document.body.removeChild(textArea);
  }

  function handleShare() {
    var topCovers = (GM.state.covers || []).slice(0, 3);
    var shareMeta = {};
    var currentInputs = GM.state.inputs || [];
    for (var j = 0; j < currentInputs.length; j++) {
      var song = currentInputs[j];
      if (song && GM.state.meta[song] && GM.state.meta[song].source !== 'manual' && GM.state.meta[song].artworkUrl100) {
        // 【核心修复 1】：分享时把试听链接(previewUrl)一起打包进去
        shareMeta[song] = {
            a: GM.state.meta[song].artworkUrl100,
            p: GM.state.meta[song].previewUrl || ""
        };
      }
    }
    
    var shareData = {
      s: GM.state.size,
      t: GM.state.title,
      i: GM.state.inputs,
      c: topCovers,
      m: shareMeta
    };
    
    GM.toast("正在生成专属对战链接，请稍候...", 10000);

    fetch('/api/share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(shareData)
    })
    .then(function(res) {
      if (!res.ok) throw new Error("HTTP error " + res.status);
      return res.json();
    })
    .then(function(data) {
      if (data.error) throw new Error(data.error);

      var shareUrl = window.location.origin + window.location.pathname + "?id=" + data.id;
      var currentTitle = GM.state.title || "金曲世界杯";
      currentShareText = "我在玩【" + currentTitle + "】的歌曲世界杯，这一局你会怎么选？快来跟我一起试试~ " + shareUrl;
      
      GM.hideToast();
      if (shareModalMask) {
         shareModalMask.classList.add("show");
      }
    })
    .catch(function(err) {
      GM.toast("生成分享链接失败，请稍后重试", 2500);
      console.error("Share error:", err);
    });
  }

  var qsBtnShare1 = document.getElementById("qsBtnShare1");
  if (qsBtnShare1) qsBtnShare1.addEventListener("click", handleShare);
  var qsBtnShare2 = document.getElementById("qsBtnShare2");
  if (qsBtnShare2) qsBtnShare2.addEventListener("click", handleShare);
  
  // ================================

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

        window._isSharedLink = false;
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
    
    for (var i = 0; i < rawSongs.length; i++) {
      var s = rawSongs[i];
      if (kw && s.toLowerCase().indexOf(kw) === -1) continue;
      var meta = GM.state.meta[s] || {};
      var year = meta.releaseDate ? meta.releaseDate.substring(0, 4) : "未知";
      var sortYear = year === "未知" ? 9999 : parseInt(year);
      listToRender.push({ name: s, year: year, sortYear: sortYear, originalIndex: i });
    }
    
    if (sortType === "asc") {
      listToRender.sort(function(a, b) {
        if (a.sortYear !== b.sortYear) return a.sortYear - b.sortYear;
        return a.originalIndex - b.originalIndex;
      });
    } else if (sortType === "desc") {
      listToRender.sort(function(a, b) {
        if (a.sortYear !== b.sortYear) {
          if (a.sortYear === 9999) return 1; 
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
      if (sortType !== "default" && item.year !== currentYear) {
         currentYear = item.year;
         html += '<div class="sel-year-header">' + currentYear + (currentYear !== "未知" ? " 年" : "年份") + '</div>';
      }
      var isSelected = tempSelectedSongs.indexOf(item.name) !== -1;
      var cls = "select-card" + (isSelected ? " selected" : "");
      
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
    for (var i = 0; i < Math.min(songs.length, currentSelectSize); i++) tempSelectedSongs.push(songs[i]);
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
      syncSizeSeg();
    }
    var arr = new Array(currentSelectSize).fill("");
    for (var i = 0; i < tempSelectedSongs.length; i++) arr[i] = tempSelectedSongs[i];
    GM.state.inputs = arr;
    
    window._isSharedLink = false;
    GM.clearAllWinners(); 
    var inputs = GM.tbody.querySelectorAll("input[data-idx]");
    for (var q = 0; q < inputs.length; q++) {
      if (inputs[q]) inputs[q].value = GM.state.inputs[q];
    }
    GM.save(); GM.render();
    selectMask.classList.remove("show");
    GM.toast("自选歌曲已应用成功");
  });

  document.getElementById("selectClose").addEventListener("click", function() { selectMask.classList.remove("show"); });
  selectMask.addEventListener("click", function(e) { if (e.target === selectMask) selectMask.classList.remove("show"); });
  document.getElementById("qsBtnCustomSelect").addEventListener("click", openSelectModal);

  /* ===== 视图切换、顶部菜单与全局初始化 ===== */
  var topMoreMenu = document.getElementById("topMoreMenu");
  var topMoreMask = document.getElementById("topMoreMask");

  function closeTopMenu() {
    if (topMoreMenu) topMoreMenu.classList.remove("show");
    if (topMoreMask) topMoreMask.classList.remove("show");
  }

  var btnViewToggle = document.getElementById("btnViewToggle");
  if (btnViewToggle) {
    btnViewToggle.addEventListener("click", function () {
      var menuItemChangeCover = document.getElementById("menuItemChangeCover");
      if (menuItemChangeCover) {
        var hasApiCovers = false;
        var currentInputs = GM.state.inputs || [];
        for (var i = 0; i < currentInputs.length; i++) {
          var song = currentInputs[i];
          if (song && GM.state.meta[song] && GM.state.meta[song].source === 'api' && GM.state.meta[song].artworkUrl100) {
            hasApiCovers = true;
            break;
          }
        }
        menuItemChangeCover.style.display = hasApiCovers ? "flex" : "none";
      }

      if (topMoreMenu) topMoreMenu.classList.add("show");
      if (topMoreMask) topMoreMask.classList.add("show");
    });
  }

  if (topMoreMask) topMoreMask.addEventListener("click", closeTopMenu);

  var menuItemList = document.getElementById("menuItemList");
  if (menuItemList) {
    menuItemList.addEventListener("click", function() {
      closeTopMenu();
      GM.switchTab(true);
      GM.render(); 
    });
  }

  var menuItemBracket = document.getElementById("menuItemBracket");
  if (menuItemBracket) {
    menuItemBracket.addEventListener("click", function() {
      closeTopMenu();
      GM.switchTab(false);
      GM.render();
    });
  }

  var menuItemShare = document.getElementById("menuItemShare");
  if (menuItemShare) {
    menuItemShare.addEventListener("click", function() {
      closeTopMenu();
      if (typeof handleShare === "function") handleShare();
    });
  }

  var menuItemChangeCover = document.getElementById("menuItemChangeCover");
  if (menuItemChangeCover) {
    menuItemChangeCover.addEventListener("click", function() {
      closeTopMenu();
      
      var validCovers = [];
      var currentInputs = GM.state.inputs || [];
      for (var i = 0; i < currentInputs.length; i++) {
        var song = currentInputs[i];
        if (song && GM.state.meta[song] && GM.state.meta[song].source === 'api' && GM.state.meta[song].artworkUrl100) {
          var url = GM.state.meta[song].artworkUrl100.replace('100x100bb', '600x600bb');
          if (validCovers.indexOf(url) === -1) {
            validCovers.push(url);
          }
        }
      }

      if (validCovers.length === 0) {
        GM.toast("当前没有可用的歌曲封面");
        return;
      }

      for (var k = validCovers.length - 1; k > 0; k--) {
        var j = Math.floor(Math.random() * (k + 1));
        var tmp = validCovers[k];
        validCovers[k] = validCovers[j];
        validCovers[j] = tmp;
      }

      GM.state.covers = validCovers.slice(0, 3);
      GM.state.avgColor = null;
      GM.save();
      
      if (typeof GM.renderHeaderCovers === "function") {
        GM.renderHeaderCovers();
      }
      GM.toast("已更换封面与主题色");
    });
  }

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

  function initApp() {
    GM.buildTable();
    syncSizeSeg();
    GM.switchTab(true);
    GM.render();
  }

  try {
    for (var lk = 0; lk < GM.LS_KEY_LEGACY.length; lk++) {
      if (localStorage.getItem(GM.LS_KEY_LEGACY[lk]) !== null) localStorage.removeItem(GM.LS_KEY_LEGACY[lk]);
    }
  } catch (e) {}
  
  GM.load();
  if (!GM.SIZE_CONFIG[GM.state.size]) GM.state.size = 64;

  var params = new URLSearchParams(window.location.search);
  var shareId = params.get("id"); 

  if (shareId) {
    GM.toast("正在加载好友分享的对阵列表...", 60000);
    fetch('/api/share?id=' + shareId)
      .then(function(res) {
        if (!res.ok) throw new Error("网络请求失败");
        return res.json();
      })
      .then(function(parsedData) {
        if (parsedData && parsedData.i && Array.isArray(parsedData.i)) {
           GM.state.size = parsedData.s || 64;
           GM.state.title = parsedData.t || "好友分享的金曲世界杯";
           GM.state.inputs = parsedData.i;
           
           GM.state.covers = parsedData.c || [];
           GM.state.avgColor = null; 
           GM.state.allFetchedSongs = []; 
           GM.state.winners = GM.makeWinners(GM.state.size);
           
           // 【核心修复 2】：解析时也要兼容读取试听链接
           GM.state.meta = {};
           if (parsedData.m) {
             for (var songKey in parsedData.m) {
               var mData = parsedData.m[songKey];
               if (typeof mData === 'string') {
                 // 兼容旧版纯封面分享链接
                 GM.state.meta[songKey] = {
                   artworkUrl100: mData,
                   source: 'api'
                 };
               } else {
                 // 新版本：包含图片与试听链接
                 GM.state.meta[songKey] = {
                   artworkUrl100: mData.a || "",
                   previewUrl: mData.p || "",
                   source: 'api'
                 };
               }
             }
           }
           
           document.getElementById("titleInput").value = GM.state.title;
           window._isSharedLink = true;
           window.history.replaceState({}, document.title, window.location.pathname);
           
           // 解析完成后，这个覆盖了的 meta 会被保存到本地缓存
           GM.save(); 
           initApp();
           GM.toast("已加载好友分享的对阵列表！", 2500);
        } else {
           throw new Error("Invalid Format");
        }
      })
      .catch(function(e) {
        console.error("解析分享链接失败:", e);
        GM.toast("分享链接已失效或短码错误", 2500);
        window._isSharedLink = false;
        initApp(); 
      });
  } else {
    initApp();
  }

})();