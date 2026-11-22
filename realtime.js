// Подключение к OpenAI Realtime API по WebRTC.
class RealtimeSession {
  constructor({ apiKey, model, voice, instructions, tools, audioEl, onEvent, onRemoteStream }) {
    Object.assign(this, { apiKey, model, voice, instructions, tools, audioEl, onEvent, onRemoteStream });
    this.pc = null;
    this.dc = null;
    this.stream = null;
  }

  async getClientSecret() {
    const body = {
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: this.model,
        instructions: this.instructions,
        tools: this.tools,
        tool_choice: "auto",
        max_output_tokens: 1500,
        // keep the context small: old turns are dropped instead of being re-read (and paid for) every turn
        truncation: { type: "retention_ratio", retention_ratio: 0.7, token_limits: { post_instructions: 9000 } },
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
            turn_detection: { type: "semantic_vad", eagerness: "low" },
            noise_reduction: { type: "near_field" },
          },
          output: { voice: this.voice },
        },
      },
    };
    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(explainError(r.status, text));
    const data = JSON.parse(text);
    return data.value || (data.client_secret && data.client_secret.value);
  }

  async connect() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    const key = await this.getClientSecret();

    this.pc = new RTCPeerConnection();
    this.pc.ontrack = (e) => {
      this.audioEl.srcObject = e.streams[0];
      this.audioEl.play().catch(() => {});
      if (this.onRemoteStream) this.onRemoteStream(e.streams[0]);
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc && this.pc.connectionState;
      if (s === "failed" || s === "disconnected") this.onEvent({ type: "_connection_lost" });
    };
    this.stream.getTracks().forEach((t) => this.pc.addTrack(t, this.stream));

    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.onmessage = (e) => {
      try { this.onEvent(JSON.parse(e.data)); } catch (_) {}
    };
    const opened = new Promise((res) => (this.dc.onopen = res));

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const r = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/sdp" },
      body: offer.sdp,
    });
    const answer = await r.text();
    if (!r.ok) throw new Error(explainError(r.status, answer));
    await this.pc.setRemoteDescription({ type: "answer", sdp: answer });
    await opened;
  }

  send(evt) {
    if (this.dc && this.dc.readyState === "open") this.dc.send(JSON.stringify(evt));
  }

  setMuted(muted) {
    if (this.stream) this.stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  close() {
    try { this.dc && this.dc.close(); } catch (_) {}
    try { this.pc && this.pc.close(); } catch (_) {}
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.pc = this.dc = this.stream = null;
  }
}

function explainError(status, text) {
  let msg = text;
  try { msg = JSON.parse(text).error.message; } catch (_) {}
  if (status === 401) return "Invalid API key. Check it in Settings.";
  if (status === 403 && /country|region|territory/i.test(msg)) return "OpenAI is not available in your region — turn on a VPN.";
  if (status === 429) return "Rate limit or no credit on your OpenAI balance: " + msg;
  return `Error ${status}: ${msg}`;
}

// $ per 1M tokens: text [in, cached, out], audio [in, cached, out]
const RT_PRICES = {
  "gpt-realtime-mini": { text: [0.6, 0.06, 2.4], audio: [10, 0.3, 20] },
  "gpt-realtime": { text: [4, 0.4, 16], audio: [32, 0.4, 64] },
};
function usageCost(model, u) {
  if (!u) return 0;
  const p = RT_PRICES[model] || (/mini/.test(model) ? RT_PRICES["gpt-realtime-mini"] : RT_PRICES["gpt-realtime"]);
  const i = u.input_token_details || {}, o = u.output_token_details || {};
  const c = i.cached_tokens_details || {};
  const tIn = i.text_tokens || 0, aIn = i.audio_tokens || 0;
  const tC = c.text_tokens || 0, aC = c.audio_tokens || 0;
  return ((tIn - tC) * p.text[0] + tC * p.text[1] + (o.text_tokens || 0) * p.text[2] +
          (aIn - aC) * p.audio[0] + aC * p.audio[1] + (o.audio_tokens || 0) * p.audio[2]) / 1e6;
}
const TRANSCRIBE_PER_MIN = 0.003; // gpt-4o-mini-transcribe

window.RealtimeSession = RealtimeSession;
window.usageCost = usageCost;
window.TRANSCRIBE_PER_MIN = TRANSCRIBE_PER_MIN;
