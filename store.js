// Local storage: settings, notebook (mistakes + words) with spaced repetition, sessions, memory.
const store = {
  get(k, d) { try { const v = localStorage.getItem("speakup." + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("speakup." + k, JSON.stringify(v)); } catch (_) {} },
};

const DAY = 86400000;
const INTERVALS = [1, 3, 7, 14]; // days between reviews; after the last one the item is mastered
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z' ]/g, "").replace(/\s+/g, " ").trim();
const uid = (p) => p + Math.random().toString(36).slice(2, 7);

const Notebook = {
  // ---- migration from v1 (plain list of mistakes)
  migrate() {
    const items = store.get("notebook", null);
    if (items) return;
    const old = store.get("mistakes", []);
    const now = Date.now();
    store.set("notebook", old.map((m) => ({
      id: uid("m"), kind: "mistake", original: m.original, corrected: m.corrected,
      explanation: m.explanation, type: m.type, date: m.date || now,
      stage: 0, due: (m.date || now) + DAY, hits: 1, status: "active",
    })));
  },
  all() { return store.get("notebook", []); },
  save(items) { store.set("notebook", items.slice(-1500)); },

  addMistake(m) {
    const items = this.all();
    const key = norm(m.original);
    const ex = items.find((x) => x.kind === "mistake" && norm(x.original) === key);
    const now = Date.now();
    if (ex) {
      // the same mistake again: back to the start of the schedule
      Object.assign(ex, { corrected: m.corrected, explanation: m.explanation, stage: 0, due: now + DAY, status: "active", hits: (ex.hits || 1) + 1, date: now });
      this.save(items); return ex;
    }
    const it = { id: uid("m"), kind: "mistake", original: m.original, corrected: m.corrected, explanation: m.explanation, type: m.type, date: now, stage: 0, due: now + DAY, hits: 1, status: "active" };
    items.push(it); this.save(items); return it;
  },

  addWord(w) {
    const items = this.all();
    if (items.some((x) => x.kind === "word" && norm(x.phrase) === norm(w.phrase))) return null;
    const now = Date.now();
    const it = { id: uid("w"), kind: "word", phrase: w.phrase, pos: w.pos, ipa: w.ipa, definition: w.definition || w.meaning, examples: w.examples || (w.example ? [w.example] : []), synonyms: w.synonyms || [], note: w.note || "", date: now, stage: 0, due: now + DAY, status: "active" };
    items.push(it); this.save(items); return it;
  },

  practiced(id, success) {
    const items = this.all();
    const it = items.find((x) => x.id === id);
    if (!it) return null;
    const now = Date.now();
    if (success) {
      it.stage = (it.stage || 0) + 1;
      if (it.stage >= INTERVALS.length) { it.status = "mastered"; it.due = Infinity; }
      else it.due = now + INTERVALS[it.stage] * DAY;
    } else { it.stage = 0; it.due = now + DAY; }
    it.lastPracticed = now;
    this.save(items); return it;
  },

  // items to weave into today's conversation: overdue first, then the oldest active ones
  targets(n, review) {
    const now = Date.now();
    const active = this.all().filter((x) => x.status === "active");
    const due = active.filter((x) => x.due <= now).sort((a, b) => a.due - b.due);
    if (review) {
      const rest = active.filter((x) => x.due > now).sort((a, b) => b.date - a.date);
      return due.concat(rest).slice(0, n);
    }
    return due.slice(0, n);
  },
  remove(id) { this.save(this.all().filter((x) => x.id !== id)); },
};

const Sessions = {
  all() { return store.get("sessions", []); },
  add(s) { const a = this.all(); a.push(s); store.set("sessions", a.slice(-500)); },
  streak() {
    const days = new Set(this.all().filter((s) => s.kind !== "card").map((s) => new Date(s.date).toDateString()));
    let n = 0, d = new Date();
    if (!days.has(d.toDateString())) d = new Date(Date.now() - DAY); // streak survives until the day ends
    while (days.has(d.toDateString())) { n++; d = new Date(d.getTime() - DAY); }
    return n;
  },
};

const Memory = {
  all() { return store.get("memory", []); },
  add(facts) {
    const cur = this.all();
    const keys = new Set(cur.map(norm));
    (facts || []).forEach((f) => { if (f && !keys.has(norm(f))) { cur.push(f); keys.add(norm(f)); } });
    store.set("memory", cur.slice(-40));
  },
  remove(i) { const a = this.all(); a.splice(i, 1); store.set("memory", a); },
  clear() { store.set("memory", []); },
};

window.store = store; window.Notebook = Notebook; window.Sessions = Sessions; window.Memory = Memory;
