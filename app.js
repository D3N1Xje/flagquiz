"use strict";
/* FlagQuiz — denní výzva, webová verze (48h test sdílecí smyčky).
   Algoritmus sady je ZRCADLEM Unity verze (docs/plans/2026-08-16-denni-vyzva-plan.md
   + kaskáda z docs/plans/2026-08-17-distraktory-plan.md): stejný seed => stejná
   sada, stejné nabídky, stejné pořadí. Neměnit bez změny obou stran. */

// ---------- jazyk ----------
const CS = /^(cs|sk)/i.test(navigator.language || "");
const T = CS ? {
  sub: "denní výzva · 10 vlajek",
  play: "HRÁT",
  question: "Která země má tuto vlajku?",
  share: "SDÍLET",
  copied: "ZKOPÍROVÁNO",
  tomorrow: "Nová sada o půlnoci. Stejných 10 vlajek dnes hádá celý svět.",
  introNote: "Jeden pokus denně. Stejných 10 vlajek pro celý svět.",
  streak: n => "série " + n,
  scoreOf: (c, n) => c + " z " + n,
  inTime: s => "za " + s + " s",
  shareTitle: "FlagQuiz — denní výzva",
  challengeName: "denní výzva",
  shareLine: (c, n, s, st) => c + "/" + n + " za " + s + " s, série " + st,
} : {
  sub: "daily challenge · 10 flags",
  play: "PLAY",
  question: "Which country has this flag?",
  share: "SHARE",
  copied: "COPIED",
  tomorrow: "New set at midnight. The whole world guesses the same 10 flags today.",
  introNote: "One attempt per day. The same 10 flags for the whole world.",
  streak: n => "streak " + n,
  scoreOf: (c, n) => c + " of " + n,
  inTime: s => "in " + s + " s",
  shareTitle: "FlagQuiz — daily challenge",
  challengeName: "daily challenge",
  shareLine: (c, n, s, st) => c + "/" + n + " in " + s + " s, streak " + st,
};

// ---------- deterministická náhoda (zrcadlo Unity DailyChallenge.Rng) ----------
function makeRng(seed) {
  let state = seed >>> 0;
  return function (maxExclusive) {
    state = (state + 0x9E3779B9) >>> 0;
    let z = state;
    z = (z ^ (z >>> 16)) >>> 0;
    z = Math.imul(z, 0x85EBCA6B) >>> 0;
    z = (z ^ (z >>> 13)) >>> 0;
    z = Math.imul(z, 0xC2B2AE35) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    return z % maxExclusive;
  };
}

function shuffle(list, rng) {          // Fisher-Yates, zrcadlo Unity Shuffle
  for (let i = list.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    const t = list[i]; list[i] = list[j]; list[j] = t;
  }
  return list;
}

function takeInto(acc, shuffled) {     // zrcadlo Unity TakeInto (3 distraktory)
  for (const f of shuffled) {
    if (acc.length >= 3) return;
    if (!acc.includes(f)) acc.push(f);
  }
}

// ---------- sada dne (zrcadlo DailyChallenge.BuildRound po úkolu 12) ----------
const ROUND_SIZE = 10, EASY = 6, MEDIUM = 3, HARD = 1;

function todaySeed(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function dayString(d) {
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
}

function buildRound(pool, seed) {
  const rng = makeRng(seed);
  const easy = shuffle(pool.filter(q => q.d === 1), rng);
  const medium = shuffle(pool.filter(q => q.d === 2), rng);
  const hard = shuffle(pool.filter(q => q.d === 3), rng);

  const picked = easy.slice(0, EASY).concat(medium.slice(0, MEDIUM), hard.slice(0, HARD));
  const inRound = new Set(picked.map(q => q.i));

  return picked.map(q => {
    const candidates = pool.filter(o => o.i !== q.i && !inRound.has(o.i));
    const distractors = [];
    if (q.g) takeInto(distractors, shuffle(candidates.filter(o => o.g === q.g), rng));
    takeInto(distractors, shuffle(candidates.filter(o => o.r === q.r && o.d === q.d), rng));
    takeInto(distractors, shuffle(candidates.filter(o => o.d === q.d), rng));
    takeInto(distractors, shuffle(candidates.slice(), rng));
    const options = distractors.slice(0, 3);
    options.splice(rng(options.length + 1), 0, q);
    return { q, options };
  });
}

// ---------- stav (localStorage) ----------
const store = {
  get date() { return localStorage.getItem("fq_date") || ""; },
  get streak() { return parseInt(localStorage.getItem("fq_streak") || "0", 10); },
  get result() { return localStorage.getItem("fq_result") || ""; },
  save(correct, seconds, squares) {
    const today = dayString(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    const streak = (this.date === dayString(y)) ? this.streak + 1 : 1;
    localStorage.setItem("fq_date", today);
    localStorage.setItem("fq_streak", String(streak));
    localStorage.setItem("fq_result", correct + ";" + seconds + ";" + squares);
  },
  playedToday() { return this.date === dayString(new Date()); },
  currentStreak() {
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (this.date !== dayString(new Date()) && this.date !== dayString(y)) return 0;
    return this.streak;
  },
};

// ---------- analytika ----------
// hits.sh: pocitadlo bez registrace, jeden citac na cestu. DEV rezim a
// localhost se nepocitaji, at si testovani nespini cisla. Ad-blockery
// mohou pingy blokovat -> cisla ber jako spodni odhad.
const DEV = new URLSearchParams(location.search).has("dev") || location.hostname === "localhost";

function track(path) {
  if (DEV) return;
  const key = path.replace("/", "");
  fetch("https://hits.sh/d3n1xje.github.io/flagquiz/" + key + ".svg",
        { mode: "no-cors", cache: "no-store" }).catch(() => {});
  if (window.goatcounter && window.goatcounter.count) {
    window.goatcounter.count({ path: path, title: path, event: true });
  }
}

// ---------- UI ----------
const $ = id => document.getElementById(id);
const name = q => (CS ? q.c : q.e);
let round = [], index = 0, correctCount = 0, outcome = [], locked = false;
let startedAt = 0, timerHandle = 0;

function show(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.remove("on");
  $(id).classList.add("on");
}

function fmtDate(d) {
  return CS ? d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear()
            : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function startRound() {
  round = buildRound(COUNTRIES, todaySeed(new Date()));
  for (const item of round) { const img = new Image(); img.src = "flags/" + item.q.i + ".png"; }
  index = 0; correctCount = 0; outcome = []; locked = false;
  startedAt = Date.now();
  timerHandle = setInterval(() => { $("g-timer").textContent = Math.floor((Date.now() - startedAt) / 1000); }, 250);
  track("/start");
  showQuestion();
  show("s-game");
}

function showQuestion() {
  const item = round[index];
  $("g-flag").src = "flags/" + item.q.i + ".png";
  $("g-progress").textContent = (index + 1) + "/" + round.length;
  const box = $("g-answers");
  box.innerHTML = "";
  item.options.forEach(opt => {
    const b = document.createElement("button");
    b.className = "btn btn-outline";
    b.textContent = name(opt);
    b.onclick = () => answer(b, opt, item);
    box.appendChild(b);
  });
}

function answer(btn, opt, item) {
  if (locked) return;
  const good = opt.i === item.q.i;
  outcome.push(good);
  if (good) {
    correctCount++;
    next();
    return;
  }
  locked = true;
  if (navigator.vibrate) navigator.vibrate(80);
  btn.classList.add("shake");
  for (const b of $("g-answers").children) {
    if (b.textContent === name(item.q)) b.classList.add("correct");
  }
  setTimeout(() => { locked = false; next(); }, 500);
}

function next() {
  index++;
  if (index >= round.length) { endRound(); return; }
  showQuestion();
}

function endRound() {
  clearInterval(timerHandle);
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  const squares = outcome.map(o => (o ? "1" : "0")).join("");
  store.save(correctCount, seconds, squares);
  track("/finish");
  renderResult(correctCount, seconds, squares);
}

function renderResult(correct, seconds, squares) {
  $("r-date").textContent = "FLAGQUIZ · " + fmtDate(new Date());
  $("r-score").textContent = T.scoreOf(correct, ROUND_SIZE);
  $("r-time").textContent = T.inTime(seconds);
  $("r-squares").textContent = [...squares].map(c => (c === "1" ? "✅" : "❌")).join("");
  $("r-streak").textContent = T.streak(store.currentStreak());
  show("s-result");
}

function shareText() {
  const parts = store.result.split(";");
  const d = new Date();
  const date = CS ? d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear()
                  : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const boxes = [...(parts[2] || "")].map(c => (c === "1" ? "✅" : "❌")).join("");
  return "FlagQuiz — " + T.challengeName + " " + date + "\n"
       + T.shareLine(parts[0], ROUND_SIZE, parts[1], store.currentStreak()) + "\n"
       + boxes + "\n" + location.origin + location.pathname;
}

async function share() {
  track("/share");
  const text = shareText();
  if (navigator.share) {
    try { await navigator.share({ text: text }); return; } catch (e) { /* zruseno -> schranka */ }
  }
  try { await navigator.clipboard.writeText(text); } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
  }
  const btn = $("btn-share");
  btn.textContent = T.copied;
  setTimeout(() => { btn.textContent = T.share; }, 1200);
}

// ---------- start ----------
function init() {
  if (new URLSearchParams(location.search).has("dev")) {
    localStorage.removeItem("fq_date");
    localStorage.removeItem("fq_streak");
    localStorage.removeItem("fq_result");
  }
  track("/view");

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    const map = { "sub": T.sub, "play": T.play, "question": T.question, "share": T.share,
                  "tomorrow": T.tomorrow, "intro-note": T.introNote };
    el.textContent = map[k];
  });
  document.documentElement.lang = CS ? "cs" : "en";
  $("intro-date").textContent = fmtDate(new Date());

  const y = new Date(); y.setDate(y.getDate() - 1);
  if (store.date === dayString(y)) {
    const key = "fq_return_" + dayString(new Date());
    if (!localStorage.getItem(key)) { localStorage.setItem(key, "1"); track("/return"); }
  }

  const streak = store.currentStreak();
  if (streak > 0) {
    $("intro-streak").style.display = "block";
    $("intro-streak-text").textContent = T.streak(streak);
  }

  $("btn-play").onclick = startRound;
  $("btn-share").onclick = share;

  if (store.playedToday()) {
    const p = store.result.split(";");
    renderResult(parseInt(p[0], 10) || 0, parseInt(p[1], 10) || 0, p[2] || "");
  } else {
    show("s-intro");
  }
}

init();
