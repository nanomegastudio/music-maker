// v2.4 arranging helpers (from the "What composers still do" research, gaps 1-3):
//   1. instrument ranges and a register plan, so accompaniment parts stay under (or above) the melody, not inside it
//   2. voice-led chord voicings: every chord is voiced from the one before (nearest notes, held common tones,
//      a smooth top voice), which gives inversions and open spacing for free
//   3. bass helpers: smooth octave choice, inversions (slash chords) for stepwise bass lines, and an outer-voice check
//      against the melody (no parallel octaves or fifths on the beat)
(function (root) {
  // ---- 1. comfortable ranges per General MIDI program (sounding MIDI notes) -------------------------
  const FAMILY_RANGE = [
    [36, 96], [53, 96], [36, 96], [40, 86], [28, 60], [36, 96], [36, 96], [40, 82],   // piano, chrom. perc, organ, guitar, bass, strings, ensemble, brass
    [44, 84], [60, 96], [36, 96], [36, 91], [36, 96], [48, 86], [36, 84], [36, 96]    // reed, pipe, synth lead, pad, fx, ethnic, percussive, sfx
  ];
  const PROGRAM_RANGE = {
    8: [60, 96], 9: [72, 108], 10: [60, 96], 11: [53, 89], 12: [45, 96], 13: [65, 108], 14: [60, 96], 15: [48, 84],
    19: [36, 96], 21: [53, 89], 22: [60, 84], 23: [53, 89],
    32: [28, 60], 33: [28, 62], 34: [28, 62], 35: [28, 60], 36: [28, 64], 37: [28, 64], 38: [28, 62], 39: [28, 62],
    40: [55, 96], 41: [48, 84], 42: [36, 72], 43: [28, 55], 44: [40, 91], 45: [36, 88], 46: [24, 100], 47: [40, 57],
    48: [36, 96], 49: [36, 91], 50: [36, 96], 51: [36, 96], 52: [48, 79], 53: [48, 79], 54: [48, 84], 55: [40, 84],
    56: [55, 82], 57: [40, 72], 58: [28, 58], 59: [58, 82], 60: [41, 77], 61: [40, 82], 62: [36, 84], 63: [36, 84],
    64: [56, 87], 65: [49, 81], 66: [44, 76], 67: [36, 69], 68: [58, 91], 69: [52, 81], 70: [34, 72], 71: [50, 91],
    72: [74, 103], 73: [60, 96], 74: [60, 96], 75: [60, 96], 76: [60, 89], 77: [55, 84], 78: [60, 96], 79: [60, 84],
    104: [48, 84], 105: [48, 84], 106: [50, 86], 107: [48, 90], 108: [60, 88], 109: [60, 84], 110: [55, 96], 111: [60, 84],
    112: [72, 96], 113: [60, 84], 114: [55, 84]
  };
  function rangeOf(program) {
    const p = Math.max(0, Math.min(127, program | 0));
    const r = PROGRAM_RANGE[p] || FAMILY_RANGE[p >> 3];
    return { lo: r[0], hi: r[1] };
  }
  // move a whole part by octaves so it fits its instrument best (fewest notes outside, then nearest the middle)
  function fitOctaves(notes, program) {
    if (!notes.length) return notes;
    const { lo, hi } = rangeOf(program);
    if (notes.filter(n => n.p < lo || n.p > hi).length <= notes.length * 0.2) return notes;
    let best = 0, bestScore = Infinity;
    for (const k of [0, -12, 12, -24, 24]) {
      const out = notes.filter(n => n.p + k < lo || n.p + k > hi).length;
      const mid = notes.reduce((a, n) => a + n.p + k, 0) / notes.length;
      const sc = out * 10 + Math.abs(mid - (lo + hi) / 2) * 0.05 + Math.abs(k) * 0.01;
      if (sc < bestScore) { bestScore = sc; best = k; }
    }
    if (best) notes.forEach(n => { n.p = Math.max(0, Math.min(127, n.p + best)); });
    return notes;
  }
  // keep single notes inside a range by octaves (for lines that are already in the right area)
  const intoRange = (p, lo, hi) => { while (p < lo) p += 12; while (p > hi && p - 12 >= lo) p -= 12; return p; };

  // the melody's register bar by bar (in home-key pitches), from its top line (octave doublings under it are ignored).
  // low/high are the lowest and highest notes of the 4-bar group a bar belongs to (groups start at section starts),
  // so the accompaniment keeps one register per phrase instead of moving every bar. Groups where the melody rests
  // borrow the nearest sung group of the same section, else the whole melody's.
  function melodyProfile(melody, bars, sections, shiftAt) {
    const top = new Map();
    for (const n of melody || []) if (!top.has(n.s) || top.get(n.s).p < n.p) top.set(n.s, n);
    const line = [...top.values()];
    const lowB = new Array(bars).fill(null), highB = new Array(bars).fill(null);
    for (const n of line) {
      const b0 = Math.max(0, Math.floor(n.s / 16)), b1 = Math.min(bars - 1, Math.floor((n.s + Math.max(1, n.l) - 1) / 16));
      for (let b = b0; b <= b1; b++) {
        const p = n.p - (shiftAt ? shiftAt(b) : 0);
        if (lowB[b] == null || p < lowB[b]) lowB[b] = p;
        if (highB[b] == null || p > highB[b]) highB[b] = p;
      }
    }
    const sungB = lowB.map(x => x != null);
    const secOf = b => sections ? sections.find(s => b >= s.start && b < s.start + s.len) : null;
    // 4-bar groups
    const groups = [];
    for (let b = 0; b < bars;) {
      const s = secOf(b), end = s ? s.start + s.len : bars;
      const e = Math.min(end, b + 4);
      groups.push({ a: b, e, sec: s });
      b = e;
    }
    for (const g of groups) {
      const ls = lowB.slice(g.a, g.e).filter(x => x != null), hs = highB.slice(g.a, g.e).filter(x => x != null);
      g.low = ls.length ? Math.min(...ls) : null; g.high = hs.length ? Math.max(...hs) : null;
    }
    const all = groups.filter(g => g.low != null);
    // sections with no melody at all use the melody's typical register (the median group)
    const med = xs => { const a = xs.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    const gLow = all.length ? med(all.map(g => g.low)) : 67, gHigh = all.length ? med(all.map(g => g.high)) : 79;
    groups.forEach((g, i) => {
      if (g.low != null) return;
      let f = null;
      for (let d = 1; d < groups.length && !f; d++) for (const j of [i - d, i + d]) { const o = groups[j]; if (!f && o && o.low != null && o.sec === g.sec) f = o; }
      g.low = f ? f.low : gLow; g.high = f ? f.high : gHigh;
    });
    const low = new Array(bars), high = new Array(bars);
    for (const g of groups) for (let b = g.a; b < g.e; b++) { low[b] = g.low; high[b] = g.high; }
    return { low, high, sung: sungB, any: all.length > 0 };
  }
  // the pitch sounding in the melody at step t (top note), or null
  function melodyAt(melody, t) {
    let best = null;
    for (const n of melody) if (n.s <= t && n.s + n.l > t && (!best || n.p > best.p)) best = n;
    return best ? best.p : null;
  }

  // ---- 2. voice leading ----------------------------------------------------------------------------
  // all voicings of the pitch classes between lo and hi: close position in every inversion, plus open
  // (drop-2: the second voice from the top dropped an octave) when wanted
  function candidates(pcs, lo, hi, open) {
    const out = [];
    const n = pcs.length;
    for (let inv = 0; inv < n; inv++) {
      const order = pcs.slice(inv).concat(pcs.slice(0, inv));
      for (let base = lo - 12; base <= hi; base++) {
        if (((base % 12) + 12) % 12 !== order[0]) continue;
        const v = [base];
        for (let i = 1; i < n; i++) { let p = v[i - 1] + 1; while (((p % 12) + 12) % 12 !== order[i]) p++; v.push(p); }
        const shapes = [v];
        if (open && n >= 3) { const d = v.slice(); d[n - 2] -= 12; shapes.push(d.sort((a, b) => a - b)); }
        for (const s of shapes) if (s[0] >= lo && s[s.length - 1] <= hi) out.push(s);
      }
    }
    return out;
  }
  // movement between two voicings: each voice to its nearest partner, both ways (works for 3 to 4 voices)
  function motion(a, b) {
    let m = 0;
    for (const p of a) m += Math.min(...b.map(q => Math.abs(p - q)));
    for (const q of b) m += Math.min(...a.map(p => Math.abs(p - q)));
    return m / 2;
  }
  // choose the voicing of a chord that moves least from the previous one, keeps common tones,
  // keeps the top voice smooth and stays near the middle of its lane. Low close intervals sound muddy.
  // opts: { lo, hi, open, center }
  function voiceLead(pcs, prev, opts) {
    let { lo, hi } = opts;
    const uniq = [...new Set(pcs.map(p => ((p % 12) + 12) % 12))];
    if (hi - lo < 9) lo = hi - 9;
    let cands = candidates(uniq, lo, hi, opts.open);
    if (!cands.length) cands = candidates(uniq, lo - 12, hi, false);
    if (!cands.length) return uniq.map(pc => intoRange(pc + 60, lo, hi)).sort((a, b) => a - b);
    const center = opts.center != null ? opts.center : (lo + hi) / 2;
    let best = null, bs = Infinity;
    for (const v of cands) {
      const mid = (v[0] + v[v.length - 1]) / 2;
      let sc = Math.abs(mid - center) * (prev ? 0.1 : 1);
      if (prev && prev.length) {
        sc += motion(v, prev);
        sc -= 1.5 * v.filter(p => prev.includes(p)).length;                 // held common tones
        const top = Math.abs(v[v.length - 1] - prev[prev.length - 1]);
        if (top > 4) sc += (top - 4) * 1.5;                                  // the top voice is a line too
      }
      for (let i = 1; i < v.length; i++) if (v[i] - v[i - 1] <= 4 && v[i - 1] < 46) sc += 3;   // thirds below B♭2 sound muddy
      if (opts.open && v[v.length - 1] - v[0] < 12) sc += 1;                  // open spacing asked for
      if (sc < bs) { bs = sc; best = v; }
    }
    return best;
  }
  // power chord (root, fifth, octave) on the root nearest the previous one, inside the lane
  function voicePower(rootPc, prev, lo, hi) {
    let best = null, bs = Infinity;
    for (let r = lo; r + 12 <= hi; r++) {
      if (((r % 12) + 12) % 12 !== rootPc) continue;
      const sc = prev ? Math.abs(r - prev[0]) : Math.abs(r - (lo + 4));
      if (sc < bs) { bs = sc; best = r; }
    }
    if (best == null) best = intoRange(rootPc + 36, lo, hi);
    return [best, best + 7, best + 12];
  }

  // the lane for chord-type parts in one bar: top voice under the melody's lowest note
  // (minus a small gap), never higher than the instrument allows, at least an octave and a half wide
  function laneUnder(profile, bar, program, gap = 1, floor = 45) {
    const r = rangeOf(program);
    const melLow = profile && profile.any ? profile.low[Math.max(0, Math.min(profile.low.length - 1, bar))] : 67;
    let hi = Math.min(r.hi, melLow - gap);
    let lo = Math.max(r.lo, floor);
    if (hi - lo < 14) lo = Math.max(r.lo, hi - 14);
    if (hi - lo < 9) hi = lo + 14;                         // the instrument can't go under the melody: stay in range
    return { lo, hi };
  }

  // ---- 3. bass helpers -----------------------------------------------------------------------------
  // the octave of a bass pitch class nearest the previous bass note, inside [lo, hi]
  function bassNote(pc, prev, lo, hi) {
    let best = null, bs = Infinity;
    for (let p = lo; p <= hi; p++) {
      if (((p % 12) + 12) % 12 !== pc) continue;
      const sc = prev == null ? Math.abs(p - (lo + 7)) : Math.abs(p - prev) + (p > hi - 4 ? 1 : 0);
      if (sc < bs) { bs = sc; best = p; }
    }
    return best != null ? best : intoRange(pc + 36, lo, hi);
  }
  // parallel perfect intervals between bass and melody: both voices move the same way
  // and the interval class is a unison/octave (0) or a fifth (7) before and after
  function parallelPerfect(b0, m0, b1, m1) {
    if (b0 == null || m0 == null || b1 == null || m1 == null) return false;
    if (b0 === b1 || m0 === m1) return false;
    if (Math.sign(b1 - b0) !== Math.sign(m1 - m0)) return false;
    const i0 = ((m0 - b0) % 12 + 12) % 12, i1 = ((m1 - b1) % 12 + 12) % 12;
    return (i0 === 0 && i1 === 0) || (i0 === 7 && i1 === 7);
  }

  // the bass plan: one bass note per chord (two in a split bar), chosen bar by bar
  //   - the octave nearest the previous bass note (no jump at the B-to-C wrap)
  //   - a first inversion (the chord's third in the bass) when it makes a stepwise line between its neighbours,
  //     e.g. I - V/7 - vi (C - B - A), at the style's rate
  //   - a pedal (one note held under changing chords) where pedalAt(bar) gives a pitch class
  // o: { bars, pcsAt(b, s) -> pitch classes root first, split(b), lo, hi, invRate, r, pedalAt(b) }
  function planBass(o) {
    const slots = [];
    for (let b = 0; b < o.bars; b++) for (const s of o.split(b) ? [0, 8] : [0]) slots.push({ b, s, pcs: o.pcsAt(b, s) });
    let prev = null;
    const plan = [];
    slots.forEach((sl, i) => {
      const ped = o.pedalAt ? o.pedalAt(sl.b) : null;
      const root = sl.pcs[0], third = sl.pcs[1];
      let pc = root, inv = false;
      if (ped != null) pc = ped;
      else if (prev != null && o.invRate > 0 && third != null) {
        const nx = slots[i + 1];
        const nextRoot = nx ? nx.pcs[0] : null;
        const t = bassNote(third, prev, o.lo, o.hi), rt = bassNote(root, prev, o.lo, o.hi);
        const stepIn = Math.abs(t - prev) <= 2 && Math.abs(t - prev) > 0;
        const stepOut = nextRoot != null && (() => { const nn = bassNote(nextRoot, t, o.lo, o.hi); return Math.abs(nn - t) <= 2 && nn !== t; })();
        const rootLeap = Math.abs(rt - prev) >= 3;
        if (stepIn && stepOut && rootLeap && o.r() < o.invRate) { pc = third; inv = true; }
      }
      const p = bassNote(pc, prev, o.lo, o.hi);
      plan.push({ b: sl.b, s: sl.s, p, root, inv, pedal: ped != null, pcs: sl.pcs });
      prev = p;
    });
    const at = (b, s) => { let hit = null; for (const x of plan) { if (x.b === b && x.s <= s) hit = x; if (x.b > b) break; } return hit; };
    return { plan, at };
  }
  // a pattern interval (0 root, 7 fifth, 12 octave, others above the root) turned into a pitch over a plan note:
  // over an inversion or a pedal the "fifth" becomes the chord's root above the bass, so the line stays in the chord
  function patternPitch(x, iv) {
    if (iv === 0) return x.p;
    if (iv === 12) return x.p + 12;
    if (x.pedal) return x.p + (iv === 7 ? 12 : iv);
    if (x.inv) return x.p + ((x.root - x.p) % 12 + 12) % 12;
    return x.p + iv;
  }
  // outer voices: where bass and melody move in parallel octaves or fifths into a strong beat, try the bass note's
  // alternatives (n.alts: other chord tones nearby; on a chord's first beat only the third, i.e. an inversion).
  // Returns { fixed, left }.
  function fixParallels(bassNotes, melody, isStrong) {
    const line = bassNotes.slice().sort((a, b) => a.s - b.s);
    let fixed = 0, left = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], n = line[i];
      if (!isStrong(n.s)) continue;
      const m0 = melodyAt(melody, a.s), m1 = melodyAt(melody, n.s);
      if (!parallelPerfect(a.p, m0, n.p, m1)) continue;
      const alt = (n.alts || []).find(q => Math.abs(q - a.p) <= 7 && !parallelPerfect(a.p, m0, q, m1) && ((m1 - q) % 12 + 12) % 12 !== 0);
      if (alt != null) { n.p = alt; fixed++; } else left++;
    }
    bassNotes.forEach(n => { delete n.alts; });
    return { fixed, left };
  }
  // count parallel perfect intervals between two lines on strong beats (for the status report and tests)
  function countParallels(lower, melody, isStrong) {
    const line = lower.slice().sort((a, b) => a.s - b.s);
    let c = 0;
    for (let i = 1; i < line.length; i++) if (isStrong(line[i].s) && parallelPerfect(line[i - 1].p, melodyAt(melody, line[i - 1].s), line[i].p, melodyAt(melody, line[i].s))) c++;
    return c;
  }

  const api = { planBass, patternPitch, fixParallels, countParallels, rangeOf, fitOctaves, intoRange, melodyProfile, melodyAt, voiceLead, voicePower, laneUnder, bassNote, parallelPerfect, motion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Arrange = api;
})(this);
