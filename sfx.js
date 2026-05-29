// sfx.js — Popcard's sound + celebration layer (the Duolingo dopamine hit).
//
// All sounds are SYNTHESIZED with the Web Audio API — zero asset files to load
// or host. Confetti is a tiny self-contained canvas burst, no library.
//
// Public API (window.PopcardSfx):
//   flip()      — soft tick when a card flips
//   correct()   — bright rising ding
//   wrong()     — gentle low buzz (never harsh — we don't punish learners)
//   complete()  — short ascending fanfare (session/lesson finished)
//   crown()     — sparkly arpeggio (crown level up)
//   levelup()   — alias for crown
//   confetti(opts) — celebratory burst (opts.intensity 'normal'|'big')
//   celebrate() — confetti + complete() together
//   isMuted() / setMuted(bool) / toggleMuted()
//
// Respects a persisted mute pref (localStorage 'popcardMuted'). Audio context
// is created lazily on first sound (browsers require a user gesture first —
// which is always true here since sounds fire on taps).

(function () {
  const MUTE_KEY = 'popcardMuted';
  let ctx = null;

  function muted() {
    try { return localStorage.getItem(MUTE_KEY) === 'true'; } catch { return false; }
  }
  function setMuted(v) {
    try { localStorage.setItem(MUTE_KEY, String(!!v)); } catch {}
  }

  function ac() {
    if (muted()) return null;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  }

  // Play a single tone. freq Hz, dur seconds, type wave, gain peak, when offset.
  function tone(freq, dur, { type = 'sine', gain = 0.18, when = 0, glideTo = null } = {}) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    // Quick attack, smooth decay — keeps it soft, never clicky.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function chord(freqs, dur, opts) {
    freqs.forEach((f) => tone(f, dur, opts));
  }

  const SFX = {
    flip() { tone(420, 0.07, { type: 'triangle', gain: 0.07 }); },
    tick() { tone(660, 0.05, { type: 'square', gain: 0.05 }); },
    correct() {
      // Two-note rising ding, bright and satisfying.
      tone(660, 0.11, { type: 'sine', gain: 0.16 });
      tone(990, 0.16, { type: 'sine', gain: 0.16, when: 0.09 });
    },
    wrong() {
      // Gentle downward — feedback, not punishment.
      tone(300, 0.18, { type: 'sine', gain: 0.12, glideTo: 200 });
    },
    complete() {
      // Ascending major arpeggio C–E–G–C.
      const seq = [523.25, 659.25, 783.99, 1046.5];
      seq.forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.16, when: i * 0.1 }));
    },
    crown() {
      // Sparkly: a quick high arpeggio + a shimmer chord.
      const seq = [784, 988, 1318, 1568];
      seq.forEach((f, i) => tone(f, 0.16, { type: 'sine', gain: 0.13, when: i * 0.07 }));
      chord([523, 659, 784], 0.5, { type: 'sine', gain: 0.08, when: 0.3 });
    },
    levelup() { SFX.crown(); },
    isMuted: muted,
    setMuted,
    toggleMuted() { const v = !muted(); setMuted(v); return v; },
    confetti,
    celebrate(opts) { SFX.complete(); confetti(opts); },
  };

  // ---------- Confetti (self-contained canvas burst) ----------
  const COLORS = ['#6E3DEA', '#8B5CF6', '#2BC489', '#FFD338', '#1F8DDB', '#DB1F7E', '#DB6A1F'];
  function confetti(opts) {
    opts = opts || {};
    if (typeof document === 'undefined') return;
    // Respect reduced-motion: skip the animation entirely.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2000;';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const cx = canvas.getContext('2d');

    const count = opts.intensity === 'big' ? 160 : 90;
    const originX = canvas.width / 2;
    const originY = opts.intensity === 'big' ? canvas.height * 0.4 : canvas.height * 0.5;
    const parts = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (i % 3);
      const speed = 6 + (i % 7) * 1.7;
      parts.push({
        x: originX, y: originY,
        vx: Math.cos(angle) * speed * (0.5 + (i % 5) / 5),
        vy: Math.sin(angle) * speed - 4,
        size: 5 + (i % 4) * 2,
        color: COLORS[i % COLORS.length],
        rot: i, vr: (i % 2 ? 1 : -1) * 0.2,
        life: 1,
      });
    }

    let frame = 0;
    const maxFrames = 130;
    function draw() {
      cx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of parts) {
        p.vy += 0.28;          // gravity
        p.vx *= 0.99;
        p.x += p.vx; p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - frame / maxFrames);
        if (p.y < canvas.height + 20 && p.life > 0) alive = true;
        cx.save();
        cx.globalAlpha = p.life;
        cx.translate(p.x, p.y);
        cx.rotate(p.rot);
        cx.fillStyle = p.color;
        cx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        cx.restore();
      }
      frame++;
      if (alive && frame < maxFrames) requestAnimationFrame(draw);
      else canvas.remove();
    }
    requestAnimationFrame(draw);
  }

  window.PopcardSfx = SFX;
})();
