/* ===== state.js — 全局状态管理与本地存储 ===== */
var GM = window.GM = window.GM || {};

GM.LS_KEY = "bracket_state_v5"; // 升级缓存版本
GM.LS_KEY_LEGACY = ["bracket_state_v4", "bracket_state_v3", "bracket64_state_v2", "bracket64_state_v1"];

GM.SIZE_CONFIG = {
  64: { seeds: 64, roundNames: ["32强", "16强", "8强", "1/4决赛", "半决赛", "决赛"] },
  32: { seeds: 32, roundNames: ["16强", "8强", "1/4决赛", "半决赛", "决赛"] },
  16: { seeds: 16, roundNames: ["8强", "1/4决赛", "半决赛", "决赛"] }
};

/* 批量录入「填充示例」歌单（孙燕姿 64 首） */
GM.DEMO = ["180度","E-Lover","Honey Honey","Stefanie","The Moment","爱情证书","爱情字典","安宁",
  "半句再见","比较幸福","不是真的爱我","彩虹金刚","当冬夜渐暖","第一天","风筝","风衣",
  "咕叽咕叽","害怕","和平","很好","坏天气","开始懂了","克卜勒","了解",
  "另一张脸","绿光","没有人的方向","明天晴天","逆光","浓眉毛","飘着","平日快乐",
  "任性","日落","尚好的青春","神奇","逃亡","天黑黑","天使的指纹","同类",
  "完美的一天","我不爱","我不难过","我的爱","我怀念的","我要的幸福","我也很想他","相信",
  "需要你","漩涡","眼泪成诗","样子","一样的夏天","银泰","隐形人","永远",
  "愚人的国度","雨还是不停地落下","雨天","遇见","直来直往","祝你开心","超快感","奔"];

GM.makeWinners = function (seeds) {
  var arr = [];
  for (var n = seeds >> 1; n >= 1; n >>= 1) arr.push(new Array(n).fill(null));
  return arr;
};

/* ===== 歌曲大乱斗默认状态 ===== */
GM.makeDefaultBrawl = function () {
  return {
    active: false,      // 是否已通过大乱斗生成对阵（模式锁死标记）
    picking: false,     // 是否处于挑歌阶段（断点恢复依据）
    size: 64,           // 赛制（64/32/16）
    artists: [],        // 待选歌手 [{ artistId, artistName }]（2~10 个）
    pool: {},           // 歌池 { artistId: [trackId, ...] }（按热门排序）
    selected: []        // 已勾选的 trackId 数组
  };
};

GM.state = {
  size: 64,
  title: "金曲世界杯",
  inputs: new Array(64).fill(""),
  winners: GM.makeWinners(64),
  meta: {},
  covers: [],
  avgColor: null,
  allFetchedSongs: [], // V2.3 新增：用于缓存获取到的 200 首完整歌单
  brawl: GM.makeDefaultBrawl() // V3.0 新增：歌曲大乱斗专用状态
};

/* ===== 状态查询函数 ===== */
GM.seeds = function () { return GM.state.size; };
GM.rounds = function () { return GM.state.winners.length; };
GM.lastR = function () { return GM.state.winners.length - 1; };
GM.totalMatches = function () { return GM.state.size - 1; };

GM.isInputsEmpty = function () {
  for (var i = 0; i < GM.state.inputs.length; i++) {
    if (GM.state.inputs[i].trim() !== "") return false;
  }
  return true;
};

/* ===== 工具函数 ===== */
GM.esc = function (s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

/* ===== V3.1 大乱斗随机分组：完全随机洗牌 + 冲突解决（Random Shuffle with Conflict Resolution） =====
 * 目标：首轮对阵尽量避免同歌手内战，同时保留完全随机性让歌手间对阵组合多样化。
 * 仅用于【歌曲大乱斗】模式；单歌手模式继续走普通 Fisher-Yates 洗牌。
 * 流程：
 *   1. Fisher-Yates 彻底洗牌（多样性基础）；
 *   2. 逐对检测同歌手冲突，随机寻找「安全替补」交换（不引发新冲突）；
 *   3. 多轮迭代扫尾（默认 5 遍），毫秒级开销；
 *   4. 极端情况（如多数歌曲同属一个歌手）自然降级，保留理论最低内战率。
 */
GM.shuffleBrawl = function (arr, passes) {
  var a = arr.slice();
  var n = a.length;
  if (n < 2) return a;

  function artistKey(v) {
    var m = GM.state.meta[v];
    // 优先用 artistId，缺失时退回 artistName；无信息返回 null（不参与冲突判定）
    if (m && m.artistId) return "i" + m.artistId;
    if (m && m.artistName) return "n" + m.artistName;
    return null;
  }

  // 1. 彻底的随机洗牌
  for (var k = n - 1; k > 0; k--) {
    var j = Math.floor(Math.random() * (k + 1));
    var t = a[k]; a[k] = a[j]; a[j] = t;
  }

  // 预计算每首歌的歌手标识，避免迭代中反复查 meta
  var keys = new Array(n);
  for (var i = 0; i < n; i++) keys[i] = artistKey(a[i]);

  // 2 & 3. 冲突检测与贪心置换，多轮迭代扫尾
  var P = passes || 5;
  for (var p = 0; p < P; p++) {
    var anyConflict = false;
    for (var g = 0; g + 1 < n; g += 2) {
      var kA = keys[g], kB = keys[g + 1];
      if (kA === null || kB === null || kA !== kB) continue;
      anyConflict = true;

      // 随机起点扫描其余对局，寻找安全替补
      var total = n - 2;
      if (total <= 0) break;
      var start = Math.floor(Math.random() * total);
      var found = false;
      for (var c = 0; c < total && !found; c++) {
        var idx = (start + c) % total;
        if (idx >= g) idx += 2; // 跳过当前冲突对局本身
        var partner = idx ^ 1;
        var candKey = keys[idx];
        if (candKey === null || candKey === kA) continue; // 条件1：替补不能是同歌手
        // 条件2：把冲突方换入替补原对局后不能产生新内战
        if (keys[partner] !== null && keys[partner] === kA) continue;

        // 安全交换：a[idx] 进入冲突局替代 a[g]，a[g] 进入替补原局
        var tmpSong = a[idx], tmpKey = keys[idx];
        a[idx] = a[g]; keys[idx] = keys[g];
        a[g] = tmpSong; keys[g] = tmpKey;
        found = true;
      }
      // 找不到安全替补则保留内战（鸽巢原理下的理论最优降级）
    }
    if (!anyConflict) break; // 已无冲突，提前结束
  }

  return a;
};

/* ===== 显示名转义层：将 trackId 翻译为「歌曲名 (歌手名)」 ===== */
/* withArtist === false 时仅返回歌曲名（用于对阵列表、导出图片等紧凑场景） */
GM.getDisplayName = function (val, withArtist) {
  if (!val) return val;
  var m = GM.state.meta[val];
  if (m && m.trackId && m.trackName) {
    if (withArtist === false) return m.trackName;
    return m.artistName ? (m.trackName + " (" + m.artistName + ")") : m.trackName;
  }
  return val;
};

/* ===== 本地存储 ===== */
GM.save = function () {
  try { localStorage.setItem(GM.LS_KEY, JSON.stringify(GM.state)); } catch (e) {}
};

GM.load = function () {
  try {
    var raw = localStorage.getItem(GM.LS_KEY);
    if (!raw) raw = localStorage.getItem("bracket_state_v4");
    if (!raw) return;

    var s = JSON.parse(raw);
    if (s && GM.SIZE_CONFIG[s.size] && Array.isArray(s.inputs) &&
        s.inputs.length === s.size && Array.isArray(s.winners)) {
      GM.state.size = s.size;
      GM.state.title = (typeof s.title === "string" && s.title !== "") ? s.title : "金曲世界杯";
      GM.state.inputs = s.inputs.map(function (v) { return typeof v === "string" ? v : ""; });
      GM.state.meta = s.meta || {};
      GM.state.covers = s.covers || [];
      GM.state.avgColor = s.avgColor || null;
      GM.state.allFetchedSongs = s.allFetchedSongs || []; // 恢复缓存的 200 首

      // V3.0：恢复大乱斗状态（逐项校验，脏数据自动回退默认）
      var b = s.brawl;
      var db = GM.makeDefaultBrawl();
      if (b && typeof b === "object") {
        db.active = !!b.active;
        db.picking = !!b.picking;
        if (GM.SIZE_CONFIG[b.size]) db.size = b.size;
        if (Array.isArray(b.artists)) {
          for (var ai = 0; ai < b.artists.length && db.artists.length < 10; ai++) {
            var a = b.artists[ai];
            if (a && a.artistId && a.artistName) {
              db.artists.push({ artistId: String(a.artistId), artistName: String(a.artistName) });
            }
          }
        }
        if (b.pool && typeof b.pool === "object") {
          for (var pid in b.pool) {
            if (Array.isArray(b.pool[pid])) {
              db.pool[pid] = b.pool[pid].map(function (v) { return String(v); });
            }
          }
        }
        if (Array.isArray(b.selected)) {
          db.selected = b.selected.map(function (v) { return String(v); });
        }
      }
      GM.state.brawl = db;
      
      var expect = GM.makeWinners(s.size);
      GM.state.winners = expect.map(function (arr, r) {
        if (Array.isArray(s.winners[r])) {
          for (var i = 0; i < arr.length; i++) {
            var v = s.winners[r][i];
            arr[i] = (typeof v === "string" && v) ? v : null;
          }
        }
        return arr;
      });
    }
  } catch (e) {}
};

/* ===== 对阵数据操作 ===== */
GM.getSources = function (r, i) {
  if (r === 0) return [GM.state.inputs[2 * i], GM.state.inputs[2 * i + 1]];
  return [GM.state.winners[r - 1][2 * i], GM.state.winners[r - 1][2 * i + 1]];
};

GM.clearNode = function (r, i) {
  GM.state.winners[r][i] = null;
  if (r < GM.lastR()) {
    var p = i >> 1;
    if (GM.state.winners[r + 1][p] !== null) GM.clearNode(r + 1, p);
  }
};

GM.clearAllWinners = function () {
  for (var r = 0; r < GM.rounds(); r++) GM.state.winners[r].fill(null);
};