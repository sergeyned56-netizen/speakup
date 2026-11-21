// Анимированный робот-персонаж (SVG). Состояния: idle, listening, thinking, speaking, oops, happy.
class Robot {
  constructor(el) {
    this.el = el;
    const u = "rb" + Math.random().toString(36).slice(2, 7);
    el.innerHTML = `
<svg viewBox="0 0 200 230" class="robot-svg" aria-label="robot">
  <defs>
    <linearGradient id="${u}-rb-head" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f6fb"/><stop offset="1" stop-color="#c9d0de"/>
    </linearGradient>
    <linearGradient id="${u}-rb-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e3e8f2"/><stop offset="1" stop-color="#aeb7c8"/>
    </linearGradient>
    <radialGradient id="${u}-rb-glow"><stop offset="0" stop-color="#7fe3ff" stop-opacity=".9"/><stop offset="1" stop-color="#7fe3ff" stop-opacity="0"/></radialGradient>
  </defs>
  <g class="rb-float">
    <!-- антенна -->
    <line x1="100" y1="34" x2="100" y2="14" stroke="#aeb7c8" stroke-width="4" stroke-linecap="round"/>
    <circle class="rb-antenna-glow" cx="100" cy="10" r="14" fill="url(#${u}-rb-glow)"/>
    <circle class="rb-antenna" cx="100" cy="10" r="7"/>
    <!-- уши -->
    <rect x="16" y="72" width="18" height="46" rx="9" fill="#aeb7c8"/>
    <rect x="166" y="72" width="18" height="46" rx="9" fill="#aeb7c8"/>
    <!-- тело -->
    <g class="rb-body">
      <rect x="62" y="158" width="76" height="56" rx="22" fill="url(#${u}-rb-body)"/>
      <circle class="rb-heart" cx="100" cy="184" r="8"/>
    </g>
    <!-- голова -->
    <rect x="28" y="32" width="144" height="128" rx="40" fill="url(#${u}-rb-head)"/>
    <rect class="rb-screen" x="44" y="50" width="112" height="90" rx="28"/>
    <!-- щёки -->
    <ellipse class="rb-cheek" cx="62" cy="114" rx="9" ry="5"/>
    <ellipse class="rb-cheek" cx="138" cy="114" rx="9" ry="5"/>
    <!-- брови -->
    <rect class="rb-brow rb-brow-l" x="62" y="64" width="20" height="4" rx="2"/>
    <rect class="rb-brow rb-brow-r" x="118" y="64" width="20" height="4" rx="2"/>
    <!-- глаза -->
    <g class="rb-eyes">
      <g class="rb-eye rb-eye-l"><ellipse cx="78" cy="90" rx="11" ry="13"/><path d="M67 93 Q78 80 89 93" class="rb-happy"/></g>
      <g class="rb-eye rb-eye-r"><ellipse cx="122" cy="90" rx="11" ry="13"/><path d="M111 93 Q122 80 133 93" class="rb-happy"/></g>
    </g>
    <!-- рот -->
    <rect class="rb-mouth" x="87" y="116" width="26" height="4" rx="2"/>
  </g>
</svg>`;
    this.svg = el.querySelector("svg");
    this.mouth = el.querySelector(".rb-mouth");
    this.eyes = el.querySelector(".rb-eyes");
    this.state = "idle";
    this.level = 0;          // громкость голоса робота 0..1
    this.userLevel = 0;      // громкость пользователя 0..1
    this.fakeTalk = false;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    this._scheduleBlink();
    this.setState("idle");
  }

  setState(s) {
    // «упс» и «радость» — короткие эмоции, после них возвращаемся к прошлому состоянию
    if (s === "oops" || s === "happy") {
      clearTimeout(this._emoT);
      const back = this.state === "oops" || this.state === "happy" ? this._base : this.state;
      this._base = back;
      this._apply(s);
      this._emoT = setTimeout(() => this._apply(this._base), 1600);
      return;
    }
    this._base = s;
    if (this.state === "oops" || this.state === "happy") return; // эмоция доиграет и вернёт базу
    this._apply(s);
  }
  _apply(s) {
    this.state = s;
    this.el.dataset.state = s;
  }

  setLevel(v) { this.level = v; }
  setUserLevel(v) { this.userLevel = v; }

  _scheduleBlink() {
    setTimeout(() => {
      this.el.classList.add("blink");
      setTimeout(() => this.el.classList.remove("blink"), 140);
      this._scheduleBlink();
    }, 2200 + Math.random() * 3000);
  }

  _loop(t) {
    let h = 4, w = 26;
    const st = this.state;
    if (st === "speaking") {
      let v = this.level;
      if (this.fakeTalk) v = 0.35 + 0.35 * Math.abs(Math.sin(t / 90)) * Math.abs(Math.sin(t / 233));
      h = 4 + Math.min(1, v * 2.2) * 20;
      w = 26 - Math.min(1, v * 2) * 6;
    } else if (st === "oops") { h = 12; w = 12; }
    else if (st === "happy") { h = 10; w = 34; }
    else if (st === "thinking") { h = 4; w = 16; }
    this.mouth.setAttribute("height", h.toFixed(1));
    this.mouth.setAttribute("width", w.toFixed(1));
    this.mouth.setAttribute("x", (100 - w / 2).toFixed(1));
    this.mouth.setAttribute("y", (118 - h / 2).toFixed(1));
    this.mouth.setAttribute("rx", Math.min(h, w) / 2);

    // взгляд: слушает — смотрит на тебя и «кивает» в такт; думает — смотрит вверх-вбок
    let ex = 0, ey = 0;
    if (st === "thinking") { ex = 6; ey = -6; }
    else if (st === "listening") { ey = -this.userLevel * 6; ex = Math.sin(t / 900) * 2; }
    else if (st === "idle") { ex = Math.sin(t / 1700) * 5; ey = Math.cos(t / 2300) * 2; }
    this.eyes.setAttribute("transform", `translate(${ex.toFixed(1)} ${ey.toFixed(1)})`);
    requestAnimationFrame(this._loop);
  }
}

// Измеритель громкости аудиопотока (для рта робота и реакции на твой голос).
class LevelMeter {
  constructor(ctx, stream) {
    this.an = ctx.createAnalyser();
    this.an.fftSize = 512;
    this.buf = new Uint8Array(this.an.fftSize);
    try { ctx.createMediaStreamSource(stream).connect(this.an); } catch (_) {}
  }
  read() {
    this.an.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) { const x = (this.buf[i] - 128) / 128; sum += x * x; }
    return Math.sqrt(sum / this.buf.length);
  }
}

window.Robot = Robot;
window.LevelMeter = LevelMeter;
