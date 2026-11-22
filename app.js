// ---------- settings ----------
const FIELDS = ["apiKey", "replyLength", "robotName", "personality", "level", "strictness", "voice", "accent", "model", "modelCustom", "maxSpend", "silenceStop", "reportOn"];
const defaults = { apiKey: "", replyLength: "normal", robotName: "Bolt", personality: "cheeky", level: "B1", strictness: "normal", voice: "marin", accent: "American", model: "gpt-realtime-mini", modelCustom: "", maxSpend: "0.5", silenceStop: "45", reportOn: "on" };
const settings = Object.assign({}, defaults, store.get("settings", {}));
if (!settings.v3) { settings.model = "gpt-realtime-mini"; settings.v3 = 1; store.set("settings", settings); } // one-time switch to the cheap model
Notebook.migrate();

const $ = (id) => document.getElementById(id);
const robotName = () => settings.robotName || "Bolt";
const money = (v) => "$" + (v < 0.1 ? v.toFixed(3) : v.toFixed(2));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- robots ----------
const homeRobot = new Robot($("homeRobot"));
const callRobot = new Robot($("callRobot"));
$("homeRobot").onclick = () => homeRobot.setState("happy");

const GREET = {
  cheeky: (n) => `Hi, I'm ${n}. Ready to make my circuits hurt? 😏`,
  kind: (n) => `Hi, I'm ${n}! So happy to see you 🥰`,
  coach: (n) => `${n} here. Less thinking, more talking. 💪`,
};
function updateHome() {
  $("homeSay").textContent = settings.apiKey
    ? (GREET[settings.personality] || GREET.cheeky)(robotName())
    : "Hi! First add your OpenAI key in Settings ⚙️";
  const due = Notebook.targets(99, false).length;
  $("dueHint").textContent = due ? `📒 ${due} item${due > 1 ? "s" : ""} due for review — ${robotName()} will sneak them into the chat.` : "";
}

// ---------- navigation ----------
function show(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + name));
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.screen === name));
  if (name === "notebook") renderNotebook();
  if (name === "progress") renderProgress();
  if (name === "home") updateHome();
}
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => show(b.dataset.screen)));

// ---------- home: topics / missions ----------
let mode = "topics", selectedTopic = "surprise", selectedMission = MISSIONS[0].id;
document.querySelectorAll("#modeSeg button").forEach((b) => (b.onclick = () => {
  mode = b.dataset.mode;
  document.querySelectorAll("#modeSeg button").forEach((x) => x.classList.toggle("active", x === b));
  renderChips();
}));
function renderChips() {
  const box = $("topicChips");
  box.innerHTML = "";
  const list = mode === "topics" ? TOPICS : MISSIONS;
  const sel = mode === "topics" ? selectedTopic : selectedMission;
  $("pickLabel").textContent = mode === "topics" ? "What do you want to talk about?" : "Pick a mission — reach the goal in English:";
  $("customTopic").style.display = mode === "topics" ? "" : "none";
  list.forEach((t) => {
    const c = document.createElement("button");
    c.className = "chip" + (t.id === sel ? " active" : "");
    c.textContent = t.label;
    c.onclick = () => {
      if (mode === "topics") { selectedTopic = t.id; $("customTopic").value = ""; } else selectedMission = t.id;
      renderChips();
    };
    box.appendChild(c);
  });
  if (mode === "missions") {
    const m = MISSIONS.find((x) => x.id === selectedMission);
    const d = document.createElement("div");
    d.className = "hint"; d.style.width = "100%";
    d.innerHTML = `<b>Goal:</b> ${esc(m.goal)}.`;
    box.appendChild(d);
  }
}
$("customTopic").oninput = () => { selectedTopic = null; renderChips(); };

// ---------- settings ----------
function loadSettingsForm() { FIELDS.forEach((k) => ($(k).value = settings[k])); }
$("saveSettings").onclick = () => {
  FIELDS.forEach((k) => (settings[k] = $(k).value.trim()));
  if (!settings.robotName) settings.robotName = "Bolt";
  store.set("settings", settings);
  $("savedHint").textContent = "Saved ✓";
  setTimeout(() => ($("savedHint").textContent = ""), 1500);
  updateHome();
};

// ---------- cards ----------
function fixCard(m) {
  const d = document.createElement("div");
  d.className = "fix";
  d.innerHTML = `<div class="tag">${esc(m.type || "")}</div><div><span class="was">${esc(m.original)}</span> → <span class="now">${esc(m.corrected)}</span></div><div class="why">${esc(m.explanation || "")}</div>`;
  return d;
}
function wordCard(w) {
  const d = document.createElement("div");
  d.className = "word";
  const ex = (w.examples && w.examples[0]) || w.example || "";
  d.innerHTML = `<div class="wtop"><span><span class="ph">${esc(w.phrase)}</span> <span class="ipa">${esc(w.ipa || "")}</span></span><span class="pos">${esc(w.pos || "")}</span></div>
    <div class="def">${esc(w.definition || w.meaning || "")}</div>
    ${ex ? `<div class="ex">${esc(ex)}</div>` : ""}
    ${w.synonyms && w.synonyms.length ? `<div class="syn">≈ ${esc(w.synonyms.join(", "))}</div>` : ""}`;
  return d;
}
function srsMeta(it) {
  const m = document.createElement("div");
  m.className = "meta";
  const dots = "●".repeat(it.stage || 0) + "○".repeat(Math.max(0, INTERVALS.length - (it.stage || 0)));
  let when;
  if (it.status === "mastered") when = "mastered ✓";
  else {
    const days = Math.ceil((it.due - Date.now()) / DAY);
    when = days <= 0 ? "due now" : `next review in ${days} day${days > 1 ? "s" : ""}`;
  }
  m.innerHTML = `<span><span class="dots">${dots}</span> · ${when}${it.hits > 1 ? ` · made ${it.hits}×` : ""}</span><button>delete</button>`;
  m.querySelector("button").onclick = () => { Notebook.remove(it.id); renderNotebook(); };
  return m;
}

// ---------- notebook ----------
let nbTab = "mistake";
document.querySelectorAll("#nbSeg button").forEach((b) => (b.onclick = () => {
  nbTab = b.dataset.nb;
  document.querySelectorAll("#nbSeg button").forEach((x) => x.classList.toggle("active", x === b));
  renderNotebook();
}));
function renderNotebook() {
  const all = Notebook.all();
  const active = all.filter((x) => x.status === "active");
  const due = Notebook.targets(999, false).length;
  $("nbMeta").textContent = `${active.length} active · ${due} due now · ${all.length - active.length} mastered. Each item comes back in 1, 3, 7 and 14 days until you nail it.`;
  const dueWords = all.filter((x) => x.kind === "word" && x.status === "active" && x.due <= Date.now()).length;
  $("wordTools").style.display = nbTab === "word" ? "" : "none";
  $("studyBtn").textContent = dueWords ? `📇 Study cards (${dueWords} due)` : "📇 Study cards (practise all)";
  const list = $("nbList");
  list.innerHTML = "";
  const items = all.filter((x) => (nbTab === "mastered" ? x.status === "mastered" : x.status === "active" && x.kind === nbTab))
    .sort((a, b) => (nbTab === "mastered" ? b.date - a.date : a.due - b.due));
  if (!items.length) {
    list.innerHTML = `<div class="empty">${nbTab === "word" ? "No words yet. Add your own above, or they\u2019ll come from your session reports." : nbTab === "mastered" ? "Nothing mastered yet — keep practising!" : "Nothing here yet. Talk to the robot and your mistakes will show up here."}</div>`;
    return;
  }
  items.forEach((it) => {
    const c = it.kind === "word" ? wordCard(it) : fixCard(it);
    c.appendChild(srsMeta(it));
    list.appendChild(c);
  });
}

// ---------- add a word ----------
$("addWordBtn").onclick = async () => {
  const phrase = $("newWord").value.trim();
  if (!phrase) return;
  if (!settings.apiKey) { show("settings"); return; }
  $("addWordBtn").disabled = true;
  $("addWordHint").textContent = "Making a card…";
  try {
    const card = await makeCard({ apiKey: settings.apiKey, phrase, level: settings.level });
    const it = Notebook.addWord(card);
    $("newWord").value = "";
    $("addWordHint").textContent = it ? `Added “${card.phrase}” ✓` : `“${card.phrase}” is already in your cards.`;
    // count it in this month's spend
    if (card._cost) Sessions.add({ date: Date.now(), minutes: 0, cost: card._cost, kind: "card" });
    renderNotebook();
  } catch (e) { $("addWordHint").textContent = "Couldn't make the card: " + e.message; }
  $("addWordBtn").disabled = false;
};
$("newWord").onkeydown = (e) => { if (e.key === "Enter") $("addWordBtn").click(); };

// ---------- flashcard study ----------
let deck = [], deckPos = 0, deckDueOnly = true;
$("studyBtn").onclick = () => {
  const words = Notebook.all().filter((x) => x.kind === "word" && x.status === "active");
  const due = words.filter((x) => x.due <= Date.now());
  deckDueOnly = due.length > 0;
  deck = (deckDueOnly ? due : words).sort(() => Math.random() - 0.5).slice(0, 20);
  if (!deck.length) { alert("No cards yet — add a word or have a session first."); return; }
  deckPos = 0;
  document.body.classList.add("in-call");
  show("study");
  showCard();
};
function showCard() {
  const w = deck[deckPos];
  if (!w) { endStudy(); return; }
  $("studyCount").textContent = `${deckPos + 1} / ${deck.length}${deckDueOnly ? "" : " · extra practice"}`;
  $("flash").classList.remove("flipped");
  $("fPhrase").textContent = w.phrase;
  $("fIpa").textContent = w.ipa || "";
  $("fPos").textContent = w.pos || "";
  const exs = (w.examples && w.examples.length ? w.examples : w.example ? [w.example] : []);
  $("fBack").innerHTML = `<div>${esc(w.definition || w.meaning || "")}</div>${exs.map((e) => `<div class="ex">${esc(e)}</div>`).join("")}
    ${w.synonyms && w.synonyms.length ? `<div class="syn">Similar: ${esc(w.synonyms.join(", "))}</div>` : ""}
    ${w.note ? `<div class="nt">💡 ${esc(w.note)}</div>` : ""}`;
}
$("flash").onclick = () => $("flash").classList.add("flipped");
function answerCard(ok) {
  const w = deck[deckPos];
  if (deckDueOnly || !ok) Notebook.practiced(w.id, ok); // extra practice only counts failures
  if (!ok) deck.push(w); // see it again at the end of this round
  deckPos++;
  showCard();
}
$("againBtn").onclick = () => answerCard(false);
$("gotBtn").onclick = () => answerCard(true);
$("sayBtn").onclick = () => {
  const w = deck[deckPos]; if (!w || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(w.phrase + (($("flash").classList.contains("flipped") && w.examples && w.examples[0]) ? ". " + w.examples[0] : ""));
  u.lang = settings.accent === "British" ? "en-GB" : "en-US"; u.rate = 0.9;
  speechSynthesis.speak(u);
};
function endStudy() {
  document.body.classList.remove("in-call");
  show("notebook");
}
$("studyClose").onclick = endStudy;

// ---------- progress ----------
function renderProgress() {
  const ssAll = Sessions.all();
  const ss = ssAll.filter((s) => s.kind !== "card");
  const mins = ss.reduce((a, s) => a + (s.minutes || 0), 0);
  const month = new Date().toISOString().slice(0, 7);
  const spentMonth = ssAll.filter((s) => new Date(s.date).toISOString().slice(0, 7) === month).reduce((a, s) => a + (s.cost || 0), 0);
  const nb = Notebook.all();
  const talk = ss.slice(-10).reduce((a, s) => [a[0] + (s.userWords || 0), a[1] + (s.robotWords || 0)], [0, 0]);
  const share = talk[0] + talk[1] ? Math.round((talk[0] / (talk[0] + talk[1])) * 100) : 0;
  const st = [
    [Sessions.streak() + " 🔥", "day streak"],
    [Math.round(mins) + " min", "total practice"],
    [ss.length, "sessions"],
    [share + "%", "you talk (aim for 60%+)"],
    [nb.filter((x) => x.status === "mastered").length + " / " + nb.length, "items mastered"],
    [money(spentMonth), "spent this month"],
  ];
  $("stats").innerHTML = st.map(([v, k]) => `<div class="stat"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`).join("");

  const recent = ss.filter((s) => s.minutes >= 1).slice(-14);
  const vals = recent.map((s) => (s.mistakes || 0) / s.minutes);
  const max = Math.max(0.5, ...vals);
  $("mpmChart").innerHTML = vals.length
    ? vals.map((v) => `<div style="height:${Math.max(3, (v / max) * 100)}%" title="${v.toFixed(2)}"></div>`).join("")
    : `<div class="hint" style="background:none">Have a few 1+ minute sessions to see the trend.</div>`;

  const lv = ss.filter((s) => s.level).slice(-10);
  $("levels").innerHTML = lv.length ? lv.map((s) => `<span>${new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: <b>${esc(s.level)}</b></span>`).join("") : `<span>Reports will estimate your level.</span>`;

  const mem = Memory.all();
  const ml = $("memList");
  ml.innerHTML = mem.length ? "" : `<div class="hint">Nothing yet. The robot learns about you from session reports.</div>`;
  mem.forEach((f, i) => {
    const d = document.createElement("div");
    d.className = "mem";
    d.innerHTML = `<span>${esc(f)}</span><button>✕</button>`;
    d.querySelector("button").onclick = () => { Memory.remove(i); renderProgress(); };
    ml.appendChild(d);
  });
}
$("memClear").onclick = () => { if (confirm("Make the robot forget everything about you?")) { Memory.clear(); renderProgress(); } };

// ---------- call state ----------
let session = null, timerInt = null, watchInt = null, startedAt = 0, muted = false;
let sessionMistakes = [], bubbles = {}, transcript = new Map(), current = null;
let audioCtx = null, botMeter = null, userMeter = null, meterRaf = 0, speaking = false, silentFrames = 0;
let cost = 0, userSpeechMs = 0, speechStart = 0, lastActivity = 0, wrapping = false, hiddenSince = 0;

function setStatus(t) { $("callStatus").textContent = t; }
function scrollDown() { const t = $("transcript"); t.scrollTop = t.scrollHeight; }
function bubble(id, role, text, pending) {
  let el = bubbles[id];
  if (!el) { el = document.createElement("div"); el.className = "msg " + role; $("transcript").appendChild(el); bubbles[id] = el; }
  el.classList.toggle("pending", !!pending);
  el.textContent = text;
  if (!pending) transcript.set(id, { role, text });
  else if (!transcript.has(id)) transcript.set(id, { role, text: "" });
  scrollDown();
}
function note(text, cls) {
  const d = document.createElement("div");
  d.className = "practiced " + (cls || "");
  d.textContent = text;
  $("transcript").appendChild(d); scrollDown();
}

function updateCost() {
  const total = cost + (userSpeechMs / 60000) * TRANSCRIBE_PER_MIN;
  $("callCost").textContent = money(total);
  const lim = parseFloat(settings.maxSpend) || 0;
  const bar = $("budgetBar");
  if (lim) {
    const p = Math.min(1, total / lim);
    bar.style.width = p * 100 + "%";
    bar.style.background = p > 0.85 ? "var(--bad)" : p > 0.6 ? "#ffc94d" : "var(--good)";
    if (p >= 1 && !wrapping) wrapUp("budget");
  } else bar.style.width = "0";
  return total;
}

function sendNote(text) {
  session.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
  session.send({ type: "response.create" });
}
function wrapUp(reason) {
  if (!session || wrapping) return;
  wrapping = true;
  if (reason === "silence") { endCall(true); return; }
  setStatus("Budget reached — wrapping up");
  session.send({ type: "response.cancel" });
  sendNote("(App note: the session budget is used up. Say a very short in-character goodbye in ONE sentence. No question.)");
  setTimeout(() => { if (session) endCall(true); }, 9000);
}

function meterLoop() {
  if (botMeter && speaking) {
    const v = botMeter.read();
    callRobot.setLevel(v);
    silentFrames = v < 0.004 ? silentFrames + 1 : 0;
    callRobot.fakeTalk = silentFrames > 40;
  }
  if (userMeter && !muted) callRobot.setUserLevel(Math.min(1, userMeter.read() * 6));
  meterRaf = requestAnimationFrame(meterLoop);
}

function currentChoice() {
  if (mode === "missions") {
    const m = MISSIONS.find((x) => x.id === selectedMission);
    return { label: m.label, mission: m };
  }
  const custom = $("customTopic").value.trim();
  if (custom) return { prompt: custom + " (if it is not in English, translate it)", label: custom };
  const t = TOPICS.find((x) => x.id === selectedTopic) || TOPICS[0];
  return { prompt: t.prompt, label: t.label, review: !!t.review };
}

// ---------- start ----------
$("startBtn").onclick = startCall;
async function startCall() {
  if (!settings.apiKey) { show("settings"); $("apiKey").focus(); return; }
  try { $("remoteAudio").play().catch(() => {}); } catch (_) {}
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (_) { audioCtx = null; }

  const choice = currentChoice();
  const targets = Notebook.targets(choice.review ? 8 : 4, !!choice.review);
  if (choice.review && !targets.length) { alert("Your notebook is empty — have a normal chat first."); return; }
  current = choice;

  const instructions = buildInstructions({
    level: settings.level, strictness: settings.strictness, accent: settings.accent,
    personality: settings.personality, name: robotName(),
    topic: choice.prompt, review: choice.review, mission: choice.mission,
    targets, memory: Memory.all(), replyLength: settings.replyLength,
  });

  sessionMistakes = []; bubbles = {}; transcript = new Map();
  muted = false; speaking = false; wrapping = false; cost = 0; userSpeechMs = 0; hiddenSince = 0;
  callRobot.fakeTalk = false;
  $("transcript").innerHTML = "";
  $("muteBtn").classList.remove("off"); $("muteBtn").textContent = "🎙️";
  $("callTimer").textContent = "00:00"; updateCost();
  $("missionBanner").style.display = choice.mission ? "block" : "none";
  $("missionBanner").innerHTML = choice.mission ? `🎯 <b>${esc(choice.mission.label)}</b><br>${esc(choice.mission.goal)}` : "";
  $("topicBtn").textContent = choice.mission ? "💡" : "🔀";
  $("topicLbl").textContent = choice.mission ? "Hint" : "New topic";
  document.body.classList.add("in-call");
  show("call");
  setStatus("Connecting…"); callRobot.setState("thinking");

  const model = settings.modelCustom || settings.model;
  session = new RealtimeSession({
    apiKey: settings.apiKey, model, voice: settings.voice, instructions, tools: TUTOR_TOOLS,
    audioEl: $("remoteAudio"), onEvent: handleEvent,
    onRemoteStream: (stream) => { if (audioCtx) botMeter = new LevelMeter(audioCtx, stream); },
  });
  session.modelName = model;

  try { await session.connect(); }
  catch (e) {
    session && session.close(); session = null;
    document.body.classList.remove("in-call"); show("home");
    alert(e && e.name === "NotAllowedError" ? "Microphone access is needed: iPhone Settings → Safari → Microphone." : (e.message || String(e)));
    return;
  }

  if (audioCtx && session.stream) userMeter = new LevelMeter(audioCtx, session.stream);
  cancelAnimationFrame(meterRaf); meterLoop();

  startedAt = lastActivity = Date.now();
  timerInt = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    $("callTimer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 500);
  // auto-stop: long silence, or the app left in the background
  watchInt = setInterval(() => {
    const lim = parseInt(settings.silenceStop, 10) || 0;
    if (lim && !speaking && !wrapping && Date.now() - lastActivity > lim * 1000) wrapUp("silence");
    if (hiddenSince && Date.now() - hiddenSince > 20000) endCall(true);
  }, 2000);
  setStatus(`${robotName()} is thinking…`);
  session.send({ type: "response.create" });
}

document.addEventListener("visibilitychange", () => { hiddenSince = document.hidden && session ? Date.now() : 0; });

// ---------- realtime events ----------
function handleEvent(ev) {
  switch (ev.type) {
    case "input_audio_buffer.speech_started":
      speechStart = Date.now(); lastActivity = Date.now();
      callRobot.setState("listening"); setStatus("Listening…"); break;
    case "input_audio_buffer.speech_stopped":
      if (speechStart) userSpeechMs += Date.now() - speechStart; speechStart = 0; lastActivity = Date.now();
      updateCost();
      callRobot.setState("thinking"); setStatus(`${robotName()} is thinking…`); break;
    case "input_audio_buffer.committed":
      bubble(ev.item_id, "user", "…", true); break;
    case "conversation.item.input_audio_transcription.completed":
      bubble(ev.item_id, "user", (ev.transcript || "").trim() || "(didn't catch that)"); break;

    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta": {
      const el = bubbles[ev.item_id];
      bubble(ev.item_id, "tutor", (el ? el.textContent : "") + (ev.delta || ""));
      break;
    }
    case "output_audio_buffer.started":
      speaking = true; silentFrames = 0; lastActivity = Date.now();
      callRobot.setState("speaking"); setStatus(`${robotName()} is talking`); break;
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      speaking = false; callRobot.setLevel(0); lastActivity = Date.now();
      if (wrapping) { setTimeout(() => session && endCall(true), 300); break; }
      callRobot.setState("listening"); setStatus(muted ? "Mic is off" : "Your turn"); break;

    case "response.done":
      if (session && ev.response && ev.response.usage) { cost += usageCost(session.modelName, ev.response.usage); updateCost(); }
      handleResponseDone(ev.response); break;

    case "error":
      console.warn("realtime error", ev.error);
      if (ev.error && ev.error.message && !/no active response|cancel/i.test(ev.error.message)) setStatus("Error: " + ev.error.message);
      break;
    case "_connection_lost":
      setStatus("Connection lost. Check your internet/VPN."); callRobot.setState("idle"); break;
  }
}

function handleResponseDone(resp) {
  if (!resp || !resp.output || !session) return;
  let hadCall = false, hadMessage = false;
  resp.output.forEach((item) => {
    if (item.type === "message") hadMessage = true;
    if (item.type !== "function_call") return;
    hadCall = true;
    let a = {};
    try { a = JSON.parse(item.arguments || "{}"); } catch (_) {}
    let out = "ok";
    if (item.name === "log_correction" && a.original && a.corrected) {
      Notebook.addMistake(a);
      sessionMistakes.push(a);
      $("transcript").appendChild(fixCard(a)); scrollDown();
      callRobot.setState("oops");
      out = "saved";
    } else if (item.name === "mark_practiced" && a.id) {
      const it = Notebook.practiced(a.id, !!a.success);
      if (it) {
        const label = it.kind === "word" ? it.phrase : it.corrected;
        if (a.success) { note(`✓ practised: ${label}${it.status === "mastered" ? " — mastered! 🎉" : ""}`); callRobot.setState("happy"); }
        else note(`↺ again: ${label}`, "fail");
      }
      out = it ? "updated" : "unknown id";
    }
    session.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: item.call_id, output: out } });
  });
  if (hadCall && !hadMessage && !wrapping) session.send({ type: "response.create" });
}

$("muteBtn").onclick = () => {
  muted = !muted;
  session && session.setMuted(muted);
  $("muteBtn").classList.toggle("off", muted);
  $("muteBtn").textContent = muted ? "🔇" : "🎙️";
  setStatus(muted ? "Mic is off" : "Your turn");
  lastActivity = Date.now();
};

$("topicBtn").onclick = () => {
  if (!session || wrapping) return;
  session.send({ type: "response.cancel" });
  sendNote(current && current.mission
    ? "(App note: the learner tapped 'hint'. Briefly step out of the role and give ONE short hint about what to say next, with an example phrase. Then continue the role-play.)"
    : "(App note: the learner tapped 'new topic'. Briefly switch to a new, different and interesting topic and ask an engaging opening question.)");
  lastActivity = Date.now();
};

// ---------- end + report ----------
$("endBtn").onclick = () => endCall(true);
function endCall(showSummary) {
  if (!session && !startedAt) return;
  clearInterval(timerInt); clearInterval(watchInt);
  cancelAnimationFrame(meterRaf);
  botMeter = userMeter = null; speaking = false;
  if (session) session.close();
  session = null;
  callRobot.setState("idle");
  document.body.classList.remove("in-call");
  if (!showSummary || !startedAt) { show("home"); return; }

  const minutes = (Date.now() - startedAt) / 60000;
  const total = cost + (userSpeechMs / 60000) * TRANSCRIBE_PER_MIN;
  const lines = [...transcript.values()].filter((t) => t.text && t.text !== "…");
  const words = (role) => lines.filter((l) => l.role === role).reduce((a, l) => a + l.text.split(/\s+/).length, 0);
  const rec = {
    date: Date.now(), minutes, cost: total, mistakes: sessionMistakes.length,
    userWords: words("user"), robotWords: words("tutor"), topic: current && current.label,
  };
  if (minutes > 0.3) Sessions.add(rec);
  startedAt = 0;

  $("summaryMeta").textContent = `${Math.max(1, Math.round(minutes))} min · ${money(total)} · corrections: ${sessionMistakes.length}`;
  const list = $("summaryList");
  list.innerHTML = "";
  $("sumMistakesLbl").style.display = sessionMistakes.length ? "" : "none";
  sessionMistakes.forEach((m) => list.appendChild(fixCard(m)));
  show("summary");
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));

  const box = $("reportBox");
  const userTurns = lines.filter((l) => l.role === "user").length;
  if (settings.reportOn !== "on" || userTurns < 2) {
    box.innerHTML = userTurns < 2 ? `<div class="rep"><div class="row">Talk a bit longer next time to get a full report 🙂</div></div>` : "";
    return;
  }
  box.innerHTML = `<div class="loading">${esc(robotName())} is writing your report</div>`;
  makeReport({ apiKey: settings.apiKey, transcript: lines, level: settings.level, mission: current && current.mission })
    .then((r) => {
      (r.new_words || []).forEach((w) => Notebook.addWord(w));
      Memory.add(r.facts);
      const ss = Sessions.all(); const last = ss[ss.length - 1];
      if (last && last.date === rec.date) {
        last.level = r.level; last.cost = (last.cost || 0) + (r._cost || 0);
        if (r.mission && r.mission.applicable) last.missionSuccess = r.mission.success;
        store.set("sessions", ss);
      }
      $("summaryMeta").textContent = `${Math.max(1, Math.round(minutes))} min · ${money(total + (r._cost || 0))} · corrections: ${sessionMistakes.length}`;
      box.innerHTML = renderReport(r);
    })
    .catch((e) => { box.innerHTML = `<div class="rep"><div class="row">Couldn't make the report: ${esc(e.message)}</div></div>`; });
}

function renderReport(r) {
  const sec = (title, body) => (body ? `<div class="rep"><h3>${title}</h3>${body}</div>` : "");
  let h = `<div class="rep"><div style="display:flex;gap:12px;align-items:center"><div class="lvl">${esc(r.level)}</div><div class="row">${esc(r.summary)}</div></div><div class="tip">${esc(r.level_note)}</div></div>`;
  if (r.mission && r.mission.applicable)
    h += sec("🎯 Mission", `<div class="row"><span class="${r.mission.success ? "ok" : "bad"}">${r.mission.success ? "COMPLETE" : "FAILED"}</span> — ${esc(r.mission.feedback)}</div>`);
  h += sec("🔍 Your main patterns", (r.patterns || []).map((p) =>
    `<div class="item"><div class="row"><b>${esc(p.title)}</b></div><div class="tip">${esc(p.tip)}</div>${(p.examples || []).map((e) => `<div class="row"><span class="you">${esc(e.you)}</span> → <span class="better">${esc(e.better)}</span></div>`).join("")}</div>`).join(""));
  h += sec("✨ Say it like a native", (r.upgrades || []).map((u) => `<div class="item"><div class="row you">${esc(u.you)}</div><div class="row better">${esc(u.native)}</div></div>`).join(""));
  h += sec("📚 New words → added to your flashcards", (r.new_words || []).map((w) => `<div class="item"><div class="row"><b>${esc(w.phrase)}</b> <span class="tip">${esc(w.ipa || "")}</span></div><div class="row">${esc(w.definition || w.meaning || "")}</div><div class="tip">${esc((w.examples && w.examples[0]) || w.example || "")}</div></div>`).join(""));
  h += sec("🏠 Homework", `<div class="row">${esc(r.homework)}</div>`);
  return h;
}
$("summaryDone").onclick = () => { show("home"); homeRobot.setState("happy"); };

// ---------- init ----------
const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
$("installHint").style.display = standalone ? "none" : "";
renderChips();
loadSettingsForm();
updateHome();
