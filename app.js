// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("speakup." + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("speakup." + k, JSON.stringify(v)); } catch (_) {} },
};
const FIELDS = ["apiKey", "robotName", "personality", "level", "strictness", "voice", "accent", "model", "modelCustom"];
const defaults = { apiKey: "", robotName: "Bolt", personality: "cheeky", level: "B1", strictness: "normal", voice: "marin", accent: "American", model: "gpt-realtime", modelCustom: "" };
const settings = Object.assign({}, defaults, store.get("settings", {}));

const $ = (id) => document.getElementById(id);
const robotName = () => settings.robotName || "Bolt";

// ---------- robots ----------
const homeRobot = new Robot($("homeRobot"));
const callRobot = new Robot($("callRobot"));
$("homeRobot").onclick = () => homeRobot.setState("happy");

const GREET = {
  cheeky: (n) => `Hi, I'm ${n}. Ready to make my circuits hurt? 😏`,
  kind: (n) => `Hi, I'm ${n}! So happy to see you 🥰`,
  coach: (n) => `${n} here. Less thinking, more talking. 💪`,
};
function updateGreeting() {
  $("homeSay").textContent = settings.apiKey
    ? (GREET[settings.personality] || GREET.cheeky)(robotName())
    : "Hi! First add your OpenAI key in Settings ⚙️";
}

// ---------- navigation ----------
function show(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + name));
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.screen === name));
  if (name === "mistakes") renderMistakes();
}
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => show(b.dataset.screen)));

// ---------- home ----------
let selectedTopic = "surprise";
function renderTopics() {
  const box = $("topicChips");
  box.innerHTML = "";
  TOPICS.forEach((t) => {
    const c = document.createElement("button");
    c.className = "chip" + (t.id === selectedTopic ? " active" : "");
    c.textContent = t.label;
    c.onclick = () => { selectedTopic = t.id; $("customTopic").value = ""; renderTopics(); };
    box.appendChild(c);
  });
}
$("customTopic").oninput = () => { selectedTopic = null; renderTopics(); };

// ---------- settings ----------
function loadSettingsForm() { FIELDS.forEach((k) => ($(k).value = settings[k])); }
$("saveSettings").onclick = () => {
  FIELDS.forEach((k) => (settings[k] = $(k).value.trim()));
  if (!settings.robotName) settings.robotName = "Bolt";
  store.set("settings", settings);
  $("savedHint").textContent = "Saved ✓";
  setTimeout(() => ($("savedHint").textContent = ""), 1500);
  updateGreeting();
};

// ---------- mistakes log ----------
const TYPE_RU = { grammar: "grammar", vocabulary: "vocabulary", phrasing: "phrasing", pronunciation: "pronunciation" };
function fixCard(m) {
  const d = document.createElement("div");
  d.className = "fix";
  d.innerHTML = `<div class="tag"></div><div><span class="was"></span> → <span class="now"></span></div><div class="why"></div>`;
  d.querySelector(".tag").textContent = TYPE_RU[m.type] || m.type || "";
  d.querySelector(".was").textContent = m.original;
  d.querySelector(".now").textContent = m.corrected;
  d.querySelector(".why").textContent = m.explanation || "";
  return d;
}
function renderMistakes() {
  const all = store.get("mistakes", []);
  const list = $("mistakesList");
  list.innerHTML = "";
  $("mistakesMeta").textContent = all.length ? `Total: ${all.length}. Practise them with "🔁 Review my mistakes".` : "";
  if (!all.length) { list.innerHTML = `<div class="empty">Nothing here yet. Talk to the robot and your mistakes will show up here with corrections.</div>`; return; }
  let lastDay = "";
  all.slice().reverse().forEach((m) => {
    const day = new Date(m.date).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    if (day !== lastDay) { const h = document.createElement("div"); h.className = "day"; h.textContent = day; list.appendChild(h); lastDay = day; }
    list.appendChild(fixCard(m));
  });
}
$("clearMistakes").onclick = () => {
  if (confirm("Delete all saved mistakes?")) { store.set("mistakes", []); renderMistakes(); }
};
function recentUniqueMistakes(n) {
  const seen = new Set(), out = [];
  for (const m of store.get("mistakes", []).slice().reverse()) {
    const k = (m.original || "").toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(m); }
    if (out.length >= n) break;
  }
  return out;
}

// ---------- call ----------
let session = null, timerInt = null, startedAt = 0, muted = false;
let sessionMistakes = [], bubbles = {}, topicLabel = "";
let audioCtx = null, botMeter = null, userMeter = null, meterRaf = 0, speaking = false;
let silentFrames = 0;

function setStatus(t) { $("callStatus").textContent = t; }
function scrollDown() { const t = $("transcript"); t.scrollTop = t.scrollHeight; }

function bubble(id, role, text, pending) {
  let el = bubbles[id];
  if (!el) {
    el = document.createElement("div");
    el.className = "msg " + role;
    $("transcript").appendChild(el);
    bubbles[id] = el;
  }
  el.classList.toggle("pending", !!pending);
  el.textContent = text;
  scrollDown();
  return el;
}

function currentTopic() {
  const custom = $("customTopic").value.trim();
  if (custom) return { prompt: custom + " (if it is not in English, translate it)", label: custom };
  const t = TOPICS.find((x) => x.id === selectedTopic) || TOPICS[0];
  return { prompt: t.prompt, label: t.label, review: !!t.review };
}

function meterLoop() {
  if (botMeter && speaking) {
    const v = botMeter.read();
    callRobot.setLevel(v);
    // iOS иногда не отдаёт звук собеседника в анализатор — тогда рот двигается «по-мультяшному»
    silentFrames = v < 0.004 ? silentFrames + 1 : 0;
    callRobot.fakeTalk = silentFrames > 40;
  }
  if (userMeter && !muted) callRobot.setUserLevel(Math.min(1, userMeter.read() * 6));
  meterRaf = requestAnimationFrame(meterLoop);
}

$("startBtn").onclick = startCall;
async function startCall() {
  if (!settings.apiKey) { show("settings"); $("apiKey").focus(); return; }

  // iOS: звук и аудио-анализ нужно «разблокировать» прямо в момент нажатия
  try { $("remoteAudio").play().catch(() => {}); } catch (_) {}
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
  } catch (_) { audioCtx = null; }

  const topic = currentTopic();
  topicLabel = topic.label;
  if (topic.review && !store.get("mistakes", []).length) {
    alert("Your mistakes list is empty — have a normal chat with the robot first.");
    return;
  }
  const instructions = buildInstructions({
    level: settings.level, strictness: settings.strictness, accent: settings.accent,
    personality: settings.personality, name: robotName(),
    topic: topic.prompt, review: topic.review,
    recentMistakes: recentUniqueMistakes(topic.review ? 25 : 15),
  });

  sessionMistakes = []; bubbles = {}; muted = false; speaking = false;
  callRobot.fakeTalk = false;
  $("transcript").innerHTML = "";
  $("muteBtn").classList.remove("off"); $("muteBtn").textContent = "🎙️";
  $("callTimer").textContent = "00:00";
  document.body.classList.add("in-call");
  show("call");
  setStatus("Connecting…"); callRobot.setState("thinking");

  session = new RealtimeSession({
    apiKey: settings.apiKey,
    model: settings.modelCustom || settings.model,
    voice: settings.voice,
    instructions,
    tools: TUTOR_TOOLS,
    audioEl: $("remoteAudio"),
    onEvent: handleEvent,
    onRemoteStream: (stream) => { if (audioCtx) botMeter = new LevelMeter(audioCtx, stream); },
  });

  try {
    await session.connect();
  } catch (e) {
    endCall(false);
    alert(e && e.name === "NotAllowedError" ? "Microphone access is needed: iPhone Settings → Safari → Microphone." : (e.message || String(e)));
    return;
  }

  if (audioCtx && session.stream) userMeter = new LevelMeter(audioCtx, session.stream);
  cancelAnimationFrame(meterRaf); meterLoop();

  startedAt = Date.now();
  timerInt = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    $("callTimer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 500);
  setStatus(`${robotName()} is thinking…`);
  session.send({ type: "response.create" });
}

function handleEvent(ev) {
  switch (ev.type) {
    case "input_audio_buffer.speech_started":
      callRobot.setState("listening"); setStatus("Listening…"); break;
    case "input_audio_buffer.speech_stopped":
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
      speaking = true; silentFrames = 0;
      callRobot.setState("speaking"); setStatus(`${robotName()} is talking`); break;
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      speaking = false; callRobot.setLevel(0);
      callRobot.setState("listening"); setStatus(muted ? "Mic is off" : "Your turn"); break;

    case "response.done":
      handleResponseDone(ev.response); break;

    case "error":
      console.warn("realtime error", ev.error);
      if (ev.error && ev.error.message && !/no active response/i.test(ev.error.message)) setStatus("Error: " + ev.error.message);
      break;
    case "_connection_lost":
      setStatus("Connection lost. Check your internet/VPN."); callRobot.setState("idle"); break;
  }
}

function handleResponseDone(resp) {
  if (!resp || !resp.output) return;
  let hadCall = false, hadMessage = false;
  resp.output.forEach((item) => {
    if (item.type === "message") hadMessage = true;
    if (item.type === "function_call" && item.name === "log_correction") {
      hadCall = true;
      let m = {};
      try { m = JSON.parse(item.arguments || "{}"); } catch (_) {}
      if (m.original && m.corrected) {
        m.date = Date.now(); m.topic = topicLabel;
        sessionMistakes.push(m);
        const all = store.get("mistakes", []); all.push(m); store.set("mistakes", all.slice(-1000));
        $("transcript").appendChild(fixCard(m)); scrollDown();
        callRobot.setState("oops");
      }
      session.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: item.call_id, output: "saved" } });
    }
  });
  if (hadCall && !hadMessage) session.send({ type: "response.create" });
}

$("muteBtn").onclick = () => {
  muted = !muted;
  session && session.setMuted(muted);
  $("muteBtn").classList.toggle("off", muted);
  $("muteBtn").textContent = muted ? "🔇" : "🎙️";
  setStatus(muted ? "Mic is off" : "Your turn");
};

$("topicBtn").onclick = () => {
  if (!session) return;
  session.send({ type: "response.cancel" });
  session.send({
    type: "conversation.item.create",
    item: { type: "message", role: "user", content: [{ type: "input_text", text: "(App note: the learner tapped 'new topic'. Briefly switch to a new, different and interesting topic and ask an engaging opening question.)" }] },
  });
  session.send({ type: "response.create" });
};

$("endBtn").onclick = () => endCall(true);
function endCall(showSummary) {
  clearInterval(timerInt);
  cancelAnimationFrame(meterRaf);
  botMeter = userMeter = null; speaking = false;
  if (session) session.close();
  session = null;
  callRobot.setState("idle");
  document.body.classList.remove("in-call");
  if (!showSummary) { show("home"); return; }

  const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
  $("summaryMeta").textContent = `${mins} min · corrections: ${sessionMistakes.length}`;
  const list = $("summaryList");
  list.innerHTML = "";
  if (!sessionMistakes.length) list.innerHTML = `<div class="empty">No mistakes logged — great job! 🎉</div>`;
  sessionMistakes.forEach((m) => list.appendChild(fixCard(m)));
  show("summary");
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
}
$("summaryDone").onclick = () => { show("home"); homeRobot.setState("happy"); };

// ---------- init ----------
const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
$("installHint").style.display = standalone ? "none" : "";
renderTopics();
loadSettingsForm();
updateGreeting();
