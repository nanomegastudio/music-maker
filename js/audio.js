// Sound engines: sampled General MIDI instruments, built-in synth, or external MIDI output
(function (root) {
  const SOUNDFONT_URL = id => `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${id}-mp3.js`;
  const NOTE_IDX = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };

  // Synth timbre per GM family (program >> 3)
  const FAMILY = [
    /* piano   */ { osc: ['triangle', 'sine'], det: 3, a: 0.004, d: 0.9, s: 0.15, r: 0.35, cut: 8, pluck: true },
    /* chrom   */ { osc: ['sine', 'sine'], det: 0, ratio2: 4, a: 0.002, d: 0.7, s: 0.0, r: 0.6, cut: 12, pluck: true },
    /* organ   */ { osc: ['sine', 'square'], det: 2, ratio2: 2, a: 0.01, d: 0.1, s: 0.85, r: 0.08, cut: 6 },
    /* guitar  */ { osc: ['sawtooth', 'triangle'], det: 4, a: 0.003, d: 0.6, s: 0.1, r: 0.25, cut: 5, pluck: true },
    /* bass    */ { osc: ['sawtooth', 'sine'], det: 0, ratio2: 0.5, a: 0.005, d: 0.4, s: 0.6, r: 0.12, cut: 4 },
    /* strings */ { osc: ['sawtooth', 'sawtooth'], det: 7, a: 0.12, d: 0.3, s: 0.8, r: 0.4, cut: 5 },
    /* ensemb. */ { osc: ['sawtooth', 'sawtooth'], det: 9, a: 0.18, d: 0.4, s: 0.85, r: 0.6, cut: 4 },
    /* brass   */ { osc: ['sawtooth', 'square'], det: 4, a: 0.05, d: 0.2, s: 0.75, r: 0.15, cut: 6 },
    /* reed    */ { osc: ['square', 'triangle'], det: 3, a: 0.04, d: 0.2, s: 0.75, r: 0.12, cut: 4 },
    /* pipe    */ { osc: ['sine', 'triangle'], det: 2, a: 0.05, d: 0.2, s: 0.8, r: 0.15, cut: 8 },
    /* lead    */ { osc: ['square', 'sawtooth'], det: 6, a: 0.005, d: 0.2, s: 0.7, r: 0.1, cut: 8 },
    /* pad     */ { osc: ['sawtooth', 'triangle'], det: 12, a: 0.6, d: 0.8, s: 0.8, r: 1.2, cut: 3 },
    /* fx      */ { osc: ['triangle', 'sine'], det: 15, ratio2: 1.5, a: 0.3, d: 1, s: 0.6, r: 1.5, cut: 6 },
    /* ethnic  */ { osc: ['sawtooth', 'triangle'], det: 3, a: 0.003, d: 0.5, s: 0.05, r: 0.3, cut: 6, pluck: true },
    /* percuss */ { osc: ['sine', 'triangle'], det: 0, ratio2: 2.7, a: 0.002, d: 0.35, s: 0, r: 0.2, cut: 10, pluck: true },
    /* sfx     */ { osc: ['sawtooth', 'square'], det: 25, a: 0.05, d: 0.5, s: 0.5, r: 0.5, cut: 3 }
  ];

  // v2.3 master equalizer: five bands between the mix and the limiter
  const EQ_BANDS = [
    { f: 80, type: 'lowshelf', name: 'Bass', label: '80 Hz' },
    { f: 250, type: 'peaking', q: 1.0, name: 'Low mids', label: '250 Hz' },
    { f: 1000, type: 'peaking', q: 1.0, name: 'Mids', label: '1 kHz' },
    { f: 3500, type: 'peaking', q: 1.0, name: 'Presence', label: '3.5 kHz' },
    { f: 10000, type: 'highshelf', name: 'Air', label: '10 kHz' }
  ];
  const EQ_PRESETS = {
    flat: { name: 'Flat', g: [0, 0, 0, 0, 0] },
    bass: { name: 'Bass boost', g: [6, 2, 0, 0, 0] },
    warm: { name: 'Warm', g: [3, 2, 0, -2, -4] },
    bright: { name: 'Bright', g: [0, -1, 0, 3, 5] },
    vocal: { name: 'Melody forward', g: [-2, -2, 2, 4, 1] },
    smile: { name: 'Loudness (V shape)', g: [5, 0, -3, 1, 5] },
    lofi: { name: 'Lo-fi radio', g: [-10, 2, 4, 0, -12] },
    phone: { name: 'Small speakers', g: [-6, -2, 2, 3, 0] },
    nomud: { name: 'Clear the mud', g: [1, -5, 0, 1, 2] }
  };

  class AudioEngine {
    constructor() {
      this.mode = 'sampled';          // 'sampled' | 'synth' | 'midi'
      this.samples = {};              // program -> {status, buffers: Map(pitch -> AudioBuffer)}
      this.buses = new Map();         // trackId -> {gain, pan}
      this.midiAccess = null;
      this.midiOut = null;
      this.onStatus = () => {};
      this.reverbAmount = 0.18;
      this.eqGains = [0, 0, 0, 0, 0];
      this.eqOn = true;
    }

    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      // equalizer chain: master -> bands -> limiter -> out
      this.eq = EQ_BANDS.map((b, i) => {
        const f = ctx.createBiquadFilter();
        f.type = b.type; f.frequency.value = b.f;
        if (b.q) f.Q.value = b.q;
        f.gain.value = this.eqOn ? this.eqGains[i] : 0;
        return f;
      });
      this.eq.reduce((a, f) => { a.connect(f); return f; }, this.master).connect(comp).connect(ctx.destination);
      // reverb
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._impulse(2.2);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = this.reverbAmount;
      this.reverbSend.connect(this.reverb).connect(this.master);
      // shared noise for drums
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const ch = nb.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      this.noise = nb;
      return ctx;
    }

    get now() { return this.ensure().currentTime; }

    _impulse(sec) {
      const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      return buf;
    }

    setReverb(v) { this.reverbAmount = v; if (this.reverbSend) this.reverbSend.gain.value = v; }

    // ---- equalizer -----------------------------------------------------------
    _eqApply() {
      if (!this.eq) return;
      const t = this.ctx.currentTime;
      this.eq.forEach((f, i) => f.gain.setTargetAtTime(this.eqOn ? this.eqGains[i] : 0, t, 0.02));
    }
    setEq(i, db) { this.eqGains[i] = Math.max(-12, Math.min(12, +db || 0)); this._eqApply(); }
    setEqAll(gains) { gains.forEach((g, i) => { if (i < 5) this.eqGains[i] = Math.max(-12, Math.min(12, +g || 0)); }); this._eqApply(); }
    setEqOn(on) { this.eqOn = !!on; this._eqApply(); }
    // the curve the whole EQ draws, in dB, at the given frequencies (works before sound starts, too)
    eqResponse(freqs) {
      const out = new Float32Array(freqs.length);
      const ctx = this.ctx || (this._eqCtx = this._eqCtx || new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100));
      const fq = new Float32Array(freqs), mag = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
      EQ_BANDS.forEach((b, i) => {
        const f = ctx.createBiquadFilter();
        f.type = b.type; f.frequency.value = b.f; if (b.q) f.Q.value = b.q; f.gain.value = this.eqOn ? this.eqGains[i] : 0;
        f.getFrequencyResponse(fq, mag, ph);
        for (let k = 0; k < out.length; k++) out[k] += 20 * Math.log10(Math.max(1e-6, mag[k]));
      });
      return out;
    }

    bus(track) {
      this.ensure();
      let b = this.buses.get(track.id);
      if (!b) {
        const gain = this.ctx.createGain();
        const pan = this.ctx.createStereoPanner();
        gain.connect(pan);
        pan.connect(this.master);
        pan.connect(this.reverbSend);
        b = { gain, pan };
        this.buses.set(track.id, b);
      }
      b.gain.gain.value = track.volume;
      b.pan.pan.value = track.pan || 0;
      return b;
    }

    // ---- sample loading ----------------------------------------------------
    loadProgram(program) {
      if (this.mode !== 'sampled') return Promise.resolve();
      const existing = this.samples[program];
      if (existing) return existing.promise;
      const id = GM.GM_IDS[program];
      const entry = { status: 'loading', buffers: new Map() };
      this.samples[program] = entry;
      this.onStatus();
      entry.promise = new Promise(resolve => {
        const done = ok => { entry.status = ok ? 'ready' : 'error'; this.onStatus(); resolve(); };
        const s = document.createElement('script');
        s.src = SOUNDFONT_URL(id);
        s.onerror = () => done(false);
        s.onload = async () => {
          try {
            const font = window.MIDI && MIDI.Soundfont && MIDI.Soundfont[id];
            if (!font) return done(false);
            const ctx = this.ensure();
            await Promise.all(Object.entries(font).map(async ([name, url]) => {
              const m = /^([A-G]b?)(-?\d)$/.exec(name);
              if (!m) return;
              const pitch = (+m[2] + 1) * 12 + NOTE_IDX[m[1]];
              const bin = atob(url.slice(url.indexOf(',') + 1));
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              try { entry.buffers.set(pitch, await ctx.decodeAudioData(bytes.buffer)); } catch (e) { /* skip bad sample */ }
            }));
            delete MIDI.Soundfont[id]; // free the base64 copy
            done(entry.buffers.size > 0);
          } catch (e) { done(false); }
        };
        document.head.appendChild(s);
      });
      return entry.promise;
    }

    loadingCount() { return Object.values(this.samples).filter(s => s.status === 'loading').length; }
    failedCount() { return Object.values(this.samples).filter(s => s.status === 'error').length; }

    // ---- MIDI output ---------------------------------------------------------
    async requestMidi() {
      if (!navigator.requestMIDIAccess) throw new Error('This browser has no Web MIDI support. Use Chrome or Edge.');
      if (!this.midiAccess) this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      return this.midiAccess;
    }
    midiOutputs() { return this.midiAccess ? [...this.midiAccess.outputs.values()] : []; }
    midiInputs() { return this.midiAccess ? [...this.midiAccess.inputs.values()] : []; }

    // time conversion: AudioContext time -> performance.now() ms (for MIDI timestamps)
    _ts(when) { return performance.now() + Math.max(0, when - this.ctx.currentTime) * 1000; }

    midiSetup(tracks, channels) {
      if (!this.midiOut) return;
      tracks.forEach((t, i) => {
        const ch = channels[i];
        if (!t.drum) this.midiOut.send([0xc0 | ch, t.program & 127]);
        this.midiOut.send([0xb0 | ch, 7, Math.round(t.volume * 127)]);
        this.midiOut.send([0xb0 | ch, 10, Math.round(((t.pan || 0) + 1) * 63.5)]);
      });
    }

    // ---- playing notes ---------------------------------------------------------
    // dur = seconds, or null to hold until the returned stop() is called
    play(track, channel, p, v, when, dur) {
      const ctx = this.ensure();
      when = Math.max(when, ctx.currentTime);
      if (this.mode === 'midi' && this.midiOut) {
        const out = this.midiOut, ch = channel;
        out.send([0x90 | ch, p, v], this._ts(when));
        const stop = t => out.send([0x80 | ch, p, 0], this._ts(t == null ? ctx.currentTime : t));
        if (dur != null) stop(when + dur);
        return { stop };
      }
      const dest = this.bus(track).gain;
      if (track.drum) { this._drum(dest, p, v, when); return { stop() {} }; }
      const s = this.mode === 'sampled' && this.samples[track.program];
      if (s && s.status === 'ready') return this._sample(dest, s.buffers, p, v, when, dur);
      return this._synth(dest, track.program, p, v, when, dur);
    }

    allNotesOff() {
      if (this.midiOut) for (let ch = 0; ch < 16; ch++) {
        this.midiOut.send([0xb0 | ch, 123, 0]);
        this.midiOut.send([0xb0 | ch, 120, 0]);
      }
    }

    _sample(dest, buffers, p, v, when, dur) {
      const ctx = this.ctx;
      let best = null, bd = 1e9;
      for (const k of buffers.keys()) { const d = Math.abs(k - p); if (d < bd) { bd = d; best = k; } }
      const src = ctx.createBufferSource();
      src.buffer = buffers.get(best);
      src.playbackRate.value = Math.pow(2, (p - best) / 12);
      const g = ctx.createGain();
      const peak = Math.pow(v / 127, 1.4) * 0.9;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(peak, when + 0.004);
      src.connect(g).connect(dest);
      src.start(when);
      const stop = t => {
        t = Math.max(t == null ? ctx.currentTime : t, when + 0.01);
        g.gain.setTargetAtTime(0, t, 0.07);
        src.stop(t + 0.6);
      };
      if (dur != null) stop(when + dur);
      return { stop };
    }

    _synth(dest, program, p, v, when, dur) {
      const ctx = this.ctx, P = FAMILY[program >> 3];
      const f = 440 * Math.pow(2, (p - 69) / 12);
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = Math.min(18000, f * P.cut + 300);
      filt.Q.value = 0.8;
      const peak = Math.pow(v / 127, 1.5) * 0.22;
      const oscs = P.osc.map((type, i) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * (i === 1 && P.ratio2 ? P.ratio2 : 1);
        o.detune.value = i === 0 ? -P.det : P.det;
        const og = ctx.createGain();
        og.gain.value = i === 0 ? 0.6 : 0.4;
        o.connect(og).connect(filt);
        o.start(when);
        return o;
      });
      filt.connect(g).connect(dest);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(peak, when + P.a);
      g.gain.setTargetAtTime(peak * P.s, when + P.a, P.d / 3);
      if (P.pluck) {
        filt.frequency.setValueAtTime(Math.min(18000, f * P.cut * 2 + 500), when);
        filt.frequency.setTargetAtTime(Math.min(18000, f * 2 + 200), when, P.d / 2);
      }
      const stop = t => {
        t = Math.max(t == null ? ctx.currentTime : t, when + P.a);
        g.gain.setTargetAtTime(0, t, P.r / 3);
        oscs.forEach(o => o.stop(t + P.r * 2 + 0.05));
      };
      if (dur != null) stop(when + dur);
      return { stop };
    }

    // ---- synthesized GM drum kit ----------------------------------------------------
    _drum(dest, p, v, when) {
      const ctx = this.ctx, amp = Math.pow(v / 127, 1.3);
      const env = (node, peak, decay, attack = 0.001) => {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(peak * amp, when + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
        node.connect(g).connect(dest);
        return g;
      };
      const noise = (type, freq, peak, decay, q = 0.7) => {
        const n = ctx.createBufferSource(); n.buffer = this.noise;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        n.connect(f); env(f, peak, decay);
        n.start(when); n.stop(when + decay + 0.05);
      };
      const tone = (type, f0, f1, peak, decay, sweep = 0.08) => {
        const o = ctx.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, when);
        if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, when + sweep);
        env(o, peak, decay);
        o.start(when); o.stop(when + decay + 0.05);
      };
      const TOMS = { 41: 80, 43: 95, 45: 110, 47: 130, 48: 150, 50: 175, 60: 400, 61: 300, 62: 330, 63: 330, 64: 250, 65: 300, 66: 220 };
      switch (p) {
        case 35: case 36:
          tone('sine', 160, 42, 1.0, 0.42, 0.12); tone('triangle', 900, 120, 0.25, 0.03, 0.02); break;
        case 38: case 40:
          tone('triangle', 220, 160, 0.5, 0.11); noise('highpass', 1200, 0.55, 0.2); break;
        case 39:
          [0, 0.011, 0.022].forEach(dt => { const w = when + dt; const n = ctx.createBufferSource(); n.buffer = this.noise;
            const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.2;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.7 * amp, w); g.gain.exponentialRampToValueAtTime(0.0001, w + (dt > 0.02 ? 0.22 : 0.01));
            n.connect(f).connect(g).connect(dest); n.start(w); n.stop(w + 0.3); });
          break;
        case 37: case 75: case 76: case 77:
          tone('square', p === 37 ? 1700 : p === 77 ? 800 : 1200, p === 37 ? 1700 : 900, 0.3, 0.04); break;
        case 42: case 44: noise('highpass', 7500, 0.35, p === 44 ? 0.03 : 0.05); break;
        case 46: noise('highpass', 7000, 0.3, 0.35); break;
        case 49: case 52: case 55: case 57: noise('highpass', 5000, 0.35, p === 55 ? 0.6 : 1.4); break;
        case 51: case 53: case 59: noise('bandpass', 9000, 0.22, 0.7, 0.5); tone('sine', 5200, 5200, 0.05, 0.6); break;
        case 56: tone('square', 540, 540, 0.18, 0.25); tone('square', 800, 800, 0.15, 0.25); break;
        case 54: case 69: case 70: noise('highpass', 6000, 0.3, p === 54 ? 0.15 : 0.07); break;
        case 80: case 81: tone('sine', 2600, 2600, 0.25, p === 81 ? 1.0 : 0.1); tone('sine', 6500, 6500, 0.08, p === 81 ? 0.8 : 0.08); break;
        default:
          if (TOMS[p]) { tone('sine', TOMS[p] * 1.6, TOMS[p], 0.8, 0.35, 0.1); break; }
          tone('triangle', 200 + (p - 30) * 25, 180 + (p - 30) * 20, 0.4, 0.12);
      }
    }
  }

  root.AudioEngine = AudioEngine;
  AudioEngine.EQ_BANDS = EQ_BANDS;
  AudioEngine.EQ_PRESETS = EQ_PRESETS;
})(this);
