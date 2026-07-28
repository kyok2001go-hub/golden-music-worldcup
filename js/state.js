/* ===== state.js — 全局状态管理与本地存储 ===== */
var GM = window.GM = window.GM || {};

GM.LS_KEY = "bracket_state_v4";
GM.LS_KEY_LEGACY = ["bracket_state_v3", "bracket64_state_v2", "bracket64_state_v1"];

GM.SIZE_CONFIG = {
  64: { seeds: 64, roundNames: ["32强", "16强", "8强", "1/4决赛", "半决赛", "决赛"] },
  32: { seeds: 32, roundNames: ["16强", "8强", "1/4决赛", "半决赛", "决赛"] },
  16: { seeds: 16, roundNames: ["8强", "1/4决赛", "半决赛", "决赛"] }
};

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

GM.state = {
  size: 64,
  title: "金曲世界杯",
  inputs: new Array(64).fill(""),
  winners: GM.makeWinners(64),
  meta: {},
  covers: [],
  avgColor: null
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

/* ===== 本地存储 ===== */
GM.save = function () {
  try { localStorage.setItem(GM.LS_KEY, JSON.stringify(GM.state)); } catch (e) {}
};

GM.load = function () {
  try {
    var raw = localStorage.getItem(GM.LS_KEY);
    if (!raw) raw = localStorage.getItem("bracket_state_v3");
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
