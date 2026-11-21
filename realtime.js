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

window.RealtimeSession = RealtimeSession;
