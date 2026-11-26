// Melody engine, based on the "Where melodies come from" research notes:
//   A. phrase -> riff (syllable stress -> rhythm, speech contour -> pitch, looped)
//   B. riff -> vocal melody (answer in the riff's rests, or keep its rhythm and re-pitch to the chords)
//   C. motif development (sentence / period / call & response, variation toolkit, verse A A' / chorus B B')
//   D. generate many candidates and keep the one that best fits "what the ear expects"
(function (root) {
  const GM = (typeof module !== 'undefined' && module.exports) ? require('./gm.js') : root.GM;

  // ===========================================================================
  // Shared helpers
  // ===========================================================================
  // h = harmony helper from the generator: { key, scale, chordAt(bar) -> pitch classes (root first) }
  function makePool(h, lo, hi) {
    const sc = GM.SCALES[h.scale];
    const pool = [];
    for (let p = lo; p <= hi; p++) if (sc.includes(((p - h.key) % 12 + 12) % 12)) pool.push(p);
    return pool;
  }
  const nearestIdx = (pool, p) => { let bi = 0; pool.forEach((q, i) => { if (Math.abs(q - p) < Math.abs(pool[bi] - p)) bi = i; }); return bi; };
  function snapIdx(pool, idx, pcs, reach = 3) {
    for (const d of [0, 1, -1, 2, -2, 3, -3].filter(d => Math.abs(d) <= reach)) {
      const j = idx + d;
      if (j >= 0 && j < pool.length && pcs.includes(pool[j] % 12)) return j;
    }
    return idx;
  }
  const clampIdx = (pool, i) => Math.max(0, Math.min(pool.length - 1, i));
  const vel = (r, base, spread = 8) => Math.max(20, Math.min(127, Math.round(base + (r() * 2 - 1) * spread)));
  // the degree that sits on scale step k above the key (wraps), used for open/closed cadences
  const degreePc = (h, k) => { const sc = GM.SCALES[h.scale]; return (h.key + sc[k % sc.length]) % 12; };

  // ===========================================================================
  // A. Phrase -> riff
  // ===========================================================================
  const FUNCTION_WORDS = new Set(('a an the and or but nor so yet of to in on at by for with from up as into onto ' +
    'is am are was were be been being do does did have has had i you he she it we they me him her us them ' +
    'my your his its our their this that these those not if then than there can could will would shall should ' +
    'may might must just im youre its were theyre dont cant wont oh yeah').split(' '));
  const QUESTION_WORDS = new Set('what who where when why how which whose'.split(' '));
  const STRESS_PREFIX = /^(a|be|de|re|un|in|ex|for|to|em|en|im|com|con|pro|dis|mis|sur|sup|pre)(?=[^aeiouy])/;

  // Split one word into syllables (spelling heuristic, good enough for song setting)
  function syllabify(word) {
    const w = word.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '');
    if (!w) return [];
    const groups = [];
    const re = /[aeiouy]+/g; let m;
    while ((m = re.exec(w))) groups.push([m.index, m.index + m[0].length]);
    if (!groups.length) return [word];
    // silent endings: final "e" (not "le"), "-ed" not after t/d, "-es" not after sibilants
    const last = groups[groups.length - 1];
    if (groups.length > 1) {
      const tail = w.slice(last[0]);
      const before = w.slice(0, last[0]);
      if ((tail === 'e' && !/[^aeiouy]le$/.test(w)) ||
          (tail === 'ed' && !/[td]$/.test(before)) ||
          (tail === 'es' && !/(s|x|z|ch|sh|ge|ce)$/.test(before))) groups.pop();
    }
    if (groups.length === 1) return [word];
    // cut between vowel groups: one consonant goes right, two or more split after the first
    const cuts = [];
    for (let i = 0; i < groups.length - 1; i++) {
      const a = groups[i][1], b = groups[i + 1][0];
      const n = b - a;
      cuts.push(n <= 1 ? a : a + 1);
    }
    const out = [];
    let start = 0;
    // map cut positions in cleaned word onto the original (letters only keep order)
    const letters = [...word].map((c, i) => [c, i]).filter(([c]) => /[a-z]/i.test(c));
    for (const c of cuts) {
      const origCut = letters[c] ? letters[c][1] : word.length;
      out.push(word.slice(start, origCut)); start = origCut;
    }
    out.push(word.slice(start));
    return out.filter(s => s.length);
  }

  // Which syllable of a content word carries the main stress
  function wordStress(w, n) {
    const lw = w.toLowerCase().replace(/[^a-z]/g, '');
    if (n === 1) return 0;
    if (/(tion|sion|cian|ic|ial|ian|ious|eous)s?$/.test(lw)) return Math.max(0, n - 2);
    if (/(ity|ical|ogy|graphy)$/.test(lw) && n >= 3) return n - 3;
    if (/(ee|eer|ese|ique|oon)$/.test(lw)) return n - 1;
    if (STRESS_PREFIX.test(lw) && n <= 3) return 1;
    return 0;
  }

  // phrase -> [{text, stress (0..2), word, wordIndex, isKey}] + mode
  function analyzePhrase(text) {
    const words = (text.match(/[A-Za-z']+/g) || []).slice(0, 24);
    const trimmed = text.trim();
    const mode = /\?\s*$/.test(trimmed) ? 'question' : /!\s*$/.test(trimmed) ? 'exclaim' : 'statement';
    const syl = [];
    words.forEach((w, wi) => {
      const parts = syllabify(w);
      const lw = w.toLowerCase().replace(/[^a-z]/g, '');
      const fn = FUNCTION_WORDS.has(lw);
      const qw = QUESTION_WORDS.has(lw) && wi === 0;
      const st = (fn && !qw) ? -1 : wordStress(w, parts.length);
      parts.forEach((p, i) => syl.push({ text: p, stress: i === st ? 2 : 0, word: lw, wordIndex: wi, content: !fn || qw }));
    });
    if (!syl.length) return { syl, mode };
    // stress clash: a stressed one-syllable word squeezed between two stresses gets demoted ("go LAST night" -> "go last NIGHT")
    for (let i = 1; i < syl.length - 1; i++) {
      if (syl[i].stress && syl[i - 1].stress && syl[i + 1].stress) syl[i].stress = 0;
    }
    // long runs of unstressed syllables: promote every other one to a light beat
    let run = 0;
    for (let i = 0; i < syl.length; i++) {
      if (syl[i].stress) { run = 0; continue; }
      run++;
      if (run === 3) { syl[i - 1].stress = 1; run = 1; }
    }
    if (!syl.some(s => s.stress)) syl[0].stress = 2;
    // key word = longest content word (ties -> later one); it gets the melodic high point
    let key = -1, best = 0;
    syl.forEach(s => { if (s.content && s.word.length >= best) { best = s.word.length; key = s.wordIndex; } });
    syl.forEach(s => s.isKey = s.wordIndex === key && s.stress === 2);
    return { syl, mode };
  }

  // Lay the syllables on a 16th-note grid: stresses on beats, unstressed syllables in between,
  // a pickup before the downbeat, and a long final note (phrase-final lengthening).
  function phraseRhythm(syl, r, forceUnit) {
    const firstStress = syl.findIndex(s => s.stress);
    const pickup = syl.slice(0, firstStress);
    const feet = [];
    for (let i = firstStress; i < syl.length; i++) {
      if (syl[i].stress || !feet.length) feet.push([i]); else feet[feet.length - 1].push(i);
    }
    const unit = forceUnit || (feet.length > 8 ? 2 : 4); // long phrases move twice as fast
    const lilt = r.chance(0.5);                         // 2-syllable feet: long-short or even
    const out = new Array(syl.length);
    let t = 0;
    feet.forEach((foot, fi) => {
      const n = foot.length;
      let durs;
      if (unit === 4) durs = n === 1 ? [4] : n === 2 ? (lilt ? [3, 1] : [2, 2]) : n === 3 ? [2, 1, 1] : n === 4 ? [1, 1, 1, 1] : foot.map(() => 1);
      else durs = n === 1 ? [2] : foot.map(() => 1);
      foot.forEach((si, k) => { out[si] = { s: t, l: durs[k] }; t += durs[k]; });
      if (fi < feet.length - 1 && unit === 4 && n > 4) t = Math.ceil(t / 4) * 4;
    });
    const pickLen = pickup.length <= 2 ? 2 : 1;
    pickup.forEach((_, i) => { out[i] = { s: -(pickup.length - i) * pickLen, l: pickLen }; });
    const pickupSteps = pickup.length * pickLen;
    // riff length in bars; final note stretches toward the bar line (max 8 steps), leaving a breath
    const bars = Math.max(1, Math.min(4, Math.ceil((t + pickupSteps + 2) / 16)));
    const lastI = syl.length - 1;
    const room = bars * 16 - pickupSteps - out[lastI].s;
    out[lastI].l = Math.max(out[lastI].l, Math.min(8, room - 1));
    return { rhythm: out, bars, pickupSteps };
  }

  // Speech-like contour in scale steps: stressed higher, key word highest, gentle downward drift,
  // fall at the end of statements, rise at the end of questions.
  function phraseContour(syl, mode, r) {
    const n = syl.length;
    return syl.map((s, i) => {
      let c = -i * (2.5 / Math.max(1, n - 1));
      if (s.stress === 2) c += 2; else if (s.stress === 1) c += 1;
      if (s.isKey) c += 1.5;
      if (!s.stress && r.chance(0.3)) c += r.chance(0.5) ? 1 : -1;
      if (i === n - 1) {
        if (mode === 'question') c = Math.max(c, 0) + 4;
        else if (mode === 'exclaim') c += 2;
        else c = -3;
      }
      return Math.round(c);
    });
  }

  // Phrase -> looped riff notes over the whole song.
  // opts: { lo, hi } register; returns { notes, bars (riff length), motif (for the chorus) }
  function phraseToRiff(text, h, songBars, r, opts = {}) {
    const { syl, mode } = analyzePhrase(text);
    if (!syl.length) return { notes: [], bars: 1, motif: null, info: null };
    const { rhythm, bars: L, pickupSteps } = phraseRhythm(syl, r);
    const contour = phraseContour(syl, mode, r);
    const pool = makePool(h, opts.lo || 55, opts.hi || 81);
    const home = nearestIdx(pool, (opts.center || 67) + ((h.key % 12) > 6 ? h.key - 12 : h.key) % 12);
    const notes = [];
    const reps = Math.max(1, Math.floor(songBars / L));
    for (let rep = 0; rep < reps; rep++) {
      const base = rep * L * 16;
      const lastOfGroup = rep % 4 === 3 || rep === reps - 1;
      syl.forEach((s, i) => {
        let start = base + rhythm[i].s;
        if (start < 0) start += songBars * 16;            // the very first pickup wraps to the end of the loop
        const bar = Math.floor(start / 16) % songBars;
        const pcs = h.chordAt(bar);
        let idx = clampIdx(pool, home + contour[i]);
        const strong = start % 4 === 0 && s.stress;
        if (i === syl.length - 1) {
          // statements land on the tonic; questions stay open on a chord tone (on the 4th repeat statements resolve harder)
          idx = mode === 'statement' || (lastOfGroup && mode !== 'question') ? snapIdx(pool, idx, [h.key % 12]) : snapIdx(pool, idx, pcs);
        } else if (strong) idx = snapIdx(pool, idx, pcs, 2);   // re-pitch stressed notes to the chord of each repeat
        notes.push({ p: pool[idx], s: start, l: Math.min(rhythm[i].l, songBars * 16 - start), v: vel(r, s.stress === 2 ? 108 : s.stress ? 92 : 74, 6), t: s.text });
      });
    }
    return {
      notes: notes.filter(n => n.s < songBars * 16 && n.l >= 1), bars: L,
      info: { mode, syllables: syl.map(s => (s.stress === 2 ? s.text.toUpperCase() : s.text)).join(' · '), pickupSteps }
    };
  }

  // The phrase as a one-bar motif for the melody engine: its stress rhythm, its speech contour (in scale steps)
  // and its syllables. Long phrases are sped up to fit the bar; anything still left over is cut.
  function phraseMotif(text, r) {
    const { syl, mode } = analyzePhrase(text);
    if (syl.length < 2) return null;
    let lay = phraseRhythm(syl, r);
    const fits = x => x.rhythm.every((n, i) => n.s + x.pickupSteps < 16 || i === syl.length - 1);
    if (!fits(lay)) lay = phraseRhythm(syl, r, 2);
    const contour = phraseContour(syl, mode, r);
    const items = syl.map((s, i) => ({ s: lay.rhythm[i].s + lay.pickupSteps, l: lay.rhythm[i].l, c: contour[i], t: s.text }))
      .filter(x => x.s < 16).slice(0, 10);
    if (items.length < 2) return null;
    return {
      rhythm: items.map(x => [x.s, Math.max(1, Math.min(x.l, 16 - x.s))]),
      moves: items.map((x, i) => i ? x.c - items[i - 1].c : 0),
      text: items.map(x => x.t),
      phrase: true, shift: 0,
      info: { mode, syllables: syl.map(s => (s.stress === 2 ? s.text.toUpperCase() : s.text)).join(' · '), used: items.length, total: syl.length }
    };
  }

  // ===========================================================================
  // C. Motif development engine
  // ===========================================================================
  // leap (0..1) = how far the melody may jump: 0 moves only up and down the scale, 1 allows octave leaps
  const leapOf = h => h && typeof h.leap === 'number' ? Math.max(0, Math.min(1, h.leap)) : 0.35;
  const maxLeap = leap => 2 + Math.round(leap * 10);                 // largest interval in semitones
  function stepMove(r, leap = 0.35) {
    const x = r();
    const pSame = 0.2, pStep = 0.62 - 0.22 * leap, pThird = 0.85 - 0.12 * leap;
    if (x < pSame) return 0;
    if (x < pStep) return r.chance(0.5) ? 1 : -1;
    if (x < pThird || leap < 0.15) return r.chance(0.5) ? 2 : -2;
    if (leap > 0.7 && r.chance(leap - 0.6)) return r.pick([5, -5, 6, -6, 7, -7]);
    return r.pick([3, -3, 4, -4]);
  }

  // keep every interval within the leap setting: first try the same note an octave nearer,
  // otherwise the nearest scale note in reach (a chord tone on strong beats)
  function limitLeaps(notes, h, leap) {
    leap = typeof leap === 'number' ? leap : leapOf(h);
    const max = maxLeap(leap);
    const pool = makePool(h, 48, 91);
    // group by onset: the top note is the line, other notes at that onset (doublings) move with it
    const groups = new Map();
    for (const n of notes) { if (!groups.has(n.s)) groups.set(n.s, []); groups.get(n.s).push(n); }
    const onsets = [...groups.keys()].sort((a, b) => a - b);
    let prev = null;
    for (const s of onsets) {
      const grp = groups.get(s);
      const n = grp.reduce((a, x) => x.p > a.p ? x : a, grp[0]);
      if (prev && Math.abs(n.p - prev.p) > max) {
        const d = n.p - prev.p;
        let to = null;
        const alt = n.p - 12 * Math.sign(d) * Math.ceil((Math.abs(d) - max) / 12);
        if (Math.abs(alt - prev.p) <= max && alt >= 55 && alt <= 88) to = alt;
        else {
          const pcs = h.chordAt(Math.floor(n.s / 16), n.s % 16);
          let bs = Infinity;
          for (const q of pool) {
            if (Math.abs(q - prev.p) > max) continue;
            const sc = Math.abs(q - n.p) + (n.s % 8 === 0 && !pcs.includes(q % 12) ? 3 : 0) + (q === prev.p ? 2 : 0);
            if (sc < bs) { bs = sc; to = q; }
          }
        }
        if (to != null) { const k = to - n.p; grp.forEach(x => { x.p = Math.max(0, Math.min(127, x.p + k)); }); }
      }
      prev = n;
    }
    return notes;
  }

  // v2.5: "Melody arpeggios" (0..1): how often a melody cell is a broken chord (it outlines the chord's notes
  // in thirds instead of moving by step). Set per song from the generator.
  let ARP = 0;
  const setArp = x => { ARP = Math.max(0, Math.min(1, +x || 0)); };
  const ARP_CELLS = [[[0, 2], [2, 2], [4, 2], [6, 2]], [[0, 2], [2, 2], [4, 4]], [[0, 1], [1, 1], [2, 2], [4, 4]], [[0, 3], [3, 3], [6, 2]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4]]];
  function arpMotif(r) {
    const rhythm = r.pick(ARP_CELLS).map(x => x.slice());
    const dir = r.chance(0.65) ? 1 : -1;
    // up (or down) the chord, sometimes turning back at the top
    const moves = rhythm.map((_, i) => i === 0 ? 0 : (i === rhythm.length - 1 && r.chance(0.4) ? -2 * dir : 2 * dir));
    return { rhythm, moves, arp: true };
  }
  // a 2-4 note seed inside one bar: rhythm cells from the style, moves in scale steps
  function makeMotif(st, r, leap) {
    if (ARP > 0 && r() < ARP * 0.8) return arpMotif(r);
    let rhythm = [];
    let tries = 0;
    while (rhythm.length < 2 && tries++ < 10) {
      rhythm = [];
      const c1 = r.pick(st.cells).filter(([s]) => s < 8);
      c1.forEach(([s, l]) => rhythm.push([s, l]));
      if (r.chance(0.55) || rhythm.length < 2) r.pick(st.cells).forEach(([s, l]) => rhythm.push([8 + s, Math.min(l, 8 - s)]));
    }
    if (rhythm.length < 2) rhythm = [[0, 4], [4, 4]];
    rhythm = rhythm.slice(0, 4);
    const moves = rhythm.map((_, i) => i === 0 ? 0 : stepMove(r, leap));
    return { rhythm, moves };
  }

  // v2.3: a 2-bar basic idea (6-10 notes). Bar 1 is the motif cell (or a given one, e.g. a typed phrase),
  // bar 2 a contrasting cell that arrives on a longer note, so the repeating unit is longer and heard less often.
  function makeIdea(st, r, leap, base) {
    const a = base ? copy(base) : makeMotif(st, r, leap);
    const aLen = Math.max(...a.rhythm.map(([s, l]) => s + l));
    if (aLen > 16) return a;                                          // already two bars long
    const sig = a.rhythm.map(x => x[0]).join();
    let cell = [];
    for (let t = 0; t < 6 && (!cell.length || cell.map(x => x[0]).join() === sig); t++) cell = (ARP > 0 && r() < ARP * 0.6 ? arpMotif(r).rhythm : r.pick(st.cells)).filter(([s]) => s < 8).map(x => x.slice());
    if (!cell.length) cell = [[0, 4], [4, 4]];
    cell = cell.slice(0, 3).map(([s, l]) => [16 + s, Math.min(l, 8 - s)]);
    cell.push([24, r.chance(0.6) ? 8 : 6]);                           // the long arrival note
    const rhythm = a.rhythm.concat(cell);
    const moves = a.arp ? a.moves.concat(cell.map((_, i) => i === 0 ? -2 : (r.chance(0.5) ? 2 : -2)))
      : a.moves.concat(cell.map((_, i) => i === 0 ? stepMove(r, leap) || (r.chance(0.5) ? 1 : -1) : stepMove(r, leap)));
    const text = a.text ? a.text.concat(cell.map(() => null)) : null;
    return { rhythm, moves, shift: a.shift || 0, text, phrase: !!a.phrase, idea: true, arp: !!a.arp };
  }
  // fresh material for one bar: a new cell, optionally keeping the rhythm of a bar of the idea (development)
  function freshCell(st, r, leap, rhythmOf) {
    const m = makeMotif(st, r, leap);
    if (rhythmOf && rhythmOf.length >= 2 && r.chance(0.5)) { m.rhythm = rhythmOf.map(x => x.slice()); m.moves = m.rhythm.map((_, i) => i === 0 ? 0 : stepMove(r, leap)); }
    return m;
  }
  // the rhythm of one bar of a motif (k = 0 or 1), moved to start at 0
  const barRhythm = (m, k) => m.rhythm.filter(([s]) => s >= k * 16 && s < k * 16 + 16).map(([s, l]) => [s - k * 16, l]);

  const copy = m => ({ rhythm: m.rhythm.map(x => x.slice()), moves: m.moves.slice(), shift: m.shift || 0, text: m.text ? m.text.slice() : null, phrase: !!m.phrase, arp: !!m.arp });
  const span = m => Math.max(...m.rhythm.map(([s, l]) => s + l));

  // the variation toolkit
  const VARY = {
    transposeToChord: m => copy(m),                                         // realized by re-anchoring on the new chord
    sequenceUp: m => Object.assign(copy(m), { shift: 1 }),
    sequenceDown: m => Object.assign(copy(m), { shift: -1 }),
    changeEnding: (m, r) => { const c = copy(m); const k = c.moves.length - 1; if (k > 0) c.moves[k] = c.moves[k] + r.pick([-2, -1, 1, 2]); return c; },
    rhythmShift: m => { const c = copy(m); if (span(c) <= 14) c.rhythm = c.rhythm.map(([s, l]) => [s + 2, l]); return c; },
    augment: m => { const c = copy(m); if (span(c) <= 8) c.rhythm = c.rhythm.map(([s, l]) => [s * 2, l * 2]); return c; },
    diminish: m => { const c = copy(m); c.rhythm = c.rhythm.map(([s, l]) => [Math.floor(s / 2), Math.max(1, Math.floor(l / 2))]); return c; },
    ornament: m => {
      // passing notes: split a note and step through the gap of a following third
      const c = { rhythm: [], moves: [], shift: m.shift || 0, text: m.text ? [] : null, phrase: !!m.phrase };
      let carry = 0;
      m.rhythm.forEach(([s, l], i) => {
        const move = m.moves[i] - carry;
        carry = 0;
        const next = m.moves[i + 1];
        const syl = m.text ? m.text[i] : null;
        if (next && Math.abs(next) === 2 && l >= 2) {
          const h = Math.floor(l / 2);
          c.rhythm.push([s, h], [s + h, l - h]);
          c.moves.push(move, Math.sign(next));
          if (c.text) c.text.push(syl, '');   // the passing note is sung on the same syllable
          carry = Math.sign(next);
        } else { c.rhythm.push([s, l]); c.moves.push(move); if (c.text) c.text.push(syl); }
      });
      return c;
    },
    widen: m => { const c = copy(m); const k = c.moves.findIndex((x, i) => i && Math.abs(x) >= 2); if (k > 0) c.moves[k] += Math.sign(c.moves[k]); return c; },
    // v2.5: the same rhythm as a broken chord (long notes split into eighths, moving through the chord's notes)
    arpeggiate: m => {
      const c = copy(m); c.arp = true;
      const rh = [], tx = c.text ? [] : null;
      c.rhythm.forEach(([s, l], i) => { if (l >= 4 && l % 2 === 0 && rh.length < 8) { for (let k = 0; k < l; k += 2) { rh.push([s + k, 2]); if (tx) tx.push(k ? '' : c.text[i]); } } else { rh.push([s, l]); if (tx) tx.push(c.text[i]); } });
      const dir = (m.moves.reduce((a, x) => a + x, 0) >= 0) ? 1 : -1;
      c.rhythm = rh; c.text = tx; c.moves = rh.map((_, i) => i ? 2 * dir : 0);
      return c;
    },
    invert: m => { const c = copy(m); c.moves = c.moves.map(x => -x); return c; }
  };
  const VARY_WEIGHTS = [['transposeToChord', 3], ['sequenceUp', 2], ['sequenceDown', 2], ['changeEnding', 3], ['rhythmShift', 1],
    ['augment', 1], ['diminish', 1], ['ornament', 2], ['widen', 1], ['invert', 0.5]];
  function vary(m, r) {
    const weights = VARY_WEIGHTS.concat(ARP > 0 ? [['arpeggiate', ARP * 4]] : []);
    const total = weights.reduce((a, [, w]) => a + w, 0);
    let x = r() * total;
    for (const [name, w] of weights) { if ((x -= w) < 0) return { motif: VARY[name](m, r), op: name }; }
    return { motif: copy(m), op: 'transposeToChord' };
  }
  const head = m => ({ rhythm: m.rhythm.slice(0, 2), moves: m.moves.slice(0, 2), shift: 0, text: m.text ? m.text.slice(0, 2) : null, phrase: !!m.phrase });
  const OP_NAMES = { transposeToChord: 'moved to the new chord', sequenceUp: 'sequence, a step up', sequenceDown: 'sequence, a step down',
    changeEnding: 'new ending', rhythmShift: 'shifted rhythm', augment: 'slower (augmented)', diminish: 'faster (diminished)',
    ornament: 'passing notes added', widen: 'wider leap', invert: 'inverted', arpeggiate: 'broken chord (arpeggio)' };

  // Place a motif in one bar. anchor = pool index the line is coming from.
  function realize(m, pool, h, bar, anchor, r, opts = {}) {
    // the chord under each note (a motif may span two bars, a bar may hold two chords)
    const pcsAt = s => h.chordAt(bar + Math.floor(s / 16), s % 16);
    // transpose to chord: start on the chord tone nearest to where the line is
    let idx = clampIdx(pool, snapIdx(pool, anchor + (m.shift || 0), pcsAt(m.rhythm.length ? m.rhythm[0][0] : 0)) + (opts.offset || 0));
    const notes = [];
    m.rhythm.forEach(([s, l], i) => {
      if (i > 0) idx = clampIdx(pool, idx + m.moves[i]);
      // gap fill: pull back toward the middle of the range after drifting to an edge
      if (idx < 2) idx += 2; if (idx > pool.length - 3) idx -= 2;
      if (s % 8 === 0 && i > 0) idx = snapIdx(pool, idx, pcsAt(s), 1);
      else if (m.arp && i > 0) idx = snapIdx(pool, idx, pcsAt(s), 1);       // a broken chord stays on the chord's notes
      const n = { p: pool[idx], s: bar * 16 + s, l, v: vel(r, opts.vel + (s % 8 === 0 ? 8 : 0)) };
      if (m.text && m.text[i]) n.t = m.text[i];
      notes.push(n);
    });
    return { notes, end: idx };
  }

  // Cadence bar: step toward the target scale degree and hold it (phrase-final lengthening)
  function cadence(pool, h, bar, anchor, r, opts) {
    // v2.5: the goal note is chosen with the chord it lands on (the held note starts around beat 3):
    // a closed ending takes the home note if that chord has it, else the chord's root; an open one the 5th or 2nd
    // degree if the chord has one, else any chord tone (no more "lands home" over a chord without the home note)
    const pcs = h.chordAt(bar, 8);
    const want = opts.open ? [degreePc(h, 4), degreePc(h, 1)] : [h.key % 12];
    let goals = want.filter(pc => pcs.includes(pc));
    if (!goals.length) goals = opts.open ? pcs.slice() : [pcs[0]];
    const inPool = pc => pool.some(p => p % 12 === pc);
    goals = goals.filter(inPool);
    if (!goals.length) goals = opts.open ? [degreePc(h, 4)] : [h.key % 12];
    const targetPc = opts.open && goals.length > 1 ? r.pick(goals) : goals[0];
    let target = anchor;
    for (let d = 0; d < 7; d++) {
      if (pool[clampIdx(pool, anchor - d)] % 12 === targetPc) { target = clampIdx(pool, anchor - d); break; }
      if (pool[clampIdx(pool, anchor + d)] % 12 === targetPc) { target = clampIdx(pool, anchor + d); break; }
    }
    const dir = target >= anchor ? -1 : 1; // approach from the other side
    // v2.3: more cadence shapes; the style's own rhythm cells lead into the held note too
    const shapes = [[[0, 4], [4, 4], [8, 8]], [[0, 2], [2, 2], [4, 12]], [[0, 6], [6, 2], [8, 8]], [[0, 8], [8, 8]], [[2, 2], [4, 4], [8, 8]], [[0, 3], [3, 3], [6, 10]]];
    if (opts.cells && opts.cells.length) { const c = r.pick(opts.cells).filter(([s]) => s < 8).map(([s, l]) => [s, Math.min(l, 8 - s)]); if (c.length) shapes.push(c.concat([[8, 8]])); }
    let rh = r.pick(shapes);
    const notes = rh.map(([s, l], i) => {
      const k = rh.length - 1 - i;
      return { p: pool[clampIdx(pool, target + dir * k)], s: bar * 16 + s, l, v: vel(r, opts.vel + (i === rh.length - 1 ? 4 : 0)) };
    });
    // appoggiatura: the step above the goal lands on the beat and resolves down (Sloboda's "tears" device)
    const last = notes[notes.length - 1];
    if (!opts.open && last.l >= 8 && opts.appoggiatura !== false && r.chance(0.3) && target + 1 < pool.length) {
      const half = Math.floor(last.l / 2);
      notes.splice(notes.length - 1, 0, { p: pool[target + 1], s: last.s, l: half, v: vel(r, opts.vel + 8) });
      last.s += half; last.l -= half; last.v = Math.max(20, last.v - 8);
    }
    return { notes, end: target };
  }

  // Continuation: the motif's head, fragmented and sequenced (twice in one bar, stepping down)
  function fragments(m, pool, h, bar, anchor, r, opts) {
    const f = head(m);
    const len = Math.max(...f.rhythm.map(([s, l]) => s + l));
    const scale = len > 8 ? 8 / len : 1;
    const fr = { rhythm: f.rhythm.map(([s, l]) => [Math.floor((s - f.rhythm[0][0]) * scale), Math.max(1, Math.floor(l * scale))]), moves: f.moves, shift: 0, text: f.text, phrase: f.phrase };
    const a = realize(fr, pool, h, bar, anchor, r, opts);
    const step = r.chance(0.7) ? -1 : 1;
    const fr2 = Object.assign(copy(fr), { rhythm: fr.rhythm.map(([s, l]) => [s + 8, l]) });
    const b = realize(fr2, pool, h, bar, clampIdx(pool, a.notes[0] ? nearestIdx(pool, a.notes[0].p) + step : anchor), r, opts);
    return { notes: a.notes.concat(b.notes), end: b.end };
  }

  // One 4-bar phrase in a given form
  // marks: what each bar is, so the editor can show where the motif appears
  // kind: motif | vary | frag | resp | cad
  function buildPhrase(form, m, pool, h, startBar, anchor, r, opts) {
    const out = [];
    const ops = [];
    const marks = [];
    let cur = anchor;
    const add = res => { out.push(...res.notes); cur = res.end; };
    const B = i => startBar + i;
    const mark = (i, kind, label) => marks.push({ bar: B(i), kind, label, phrase: !!m.phrase && kind !== 'cad' && kind !== 'resp' });
    const cadLabel = open => open ? 'Cadence, left open' : 'Cadence, lands home';
    if (form === 'sentence') {          // a  a'  fragments  cadence
      add(realize(m, pool, h, B(0), cur, r, opts)); mark(0, 'motif', 'Motif');
      const v = vary(m, r); ops.push(v.op);
      add(realize(v.motif, pool, h, B(1), cur, r, opts)); mark(1, 'vary', 'Motif varied: ' + OP_NAMES[v.op]);
      add(fragments(m, pool, h, B(2), cur, r, opts)); mark(2, 'frag', 'Motif head, fragmented');
      add(cadence(pool, h, B(3), cur, r, Object.assign({}, opts, { open: opts.open }))); mark(3, 'cad', cadLabel(opts.open));
    } else if (form === 'period') {     // a  x(open)  a  y(closed)
      const a0 = realize(m, pool, h, B(0), cur, r, opts); add(a0); mark(0, 'motif', 'Motif (question)');
      add(cadence(pool, h, B(1), cur, r, Object.assign({}, opts, { open: true }))); mark(1, 'cad', 'Question ends open');
      add(realize(m, pool, h, B(2), nearestIdx(pool, a0.notes[0].p), r, opts)); mark(2, 'motif', 'Motif again (answer)');
      add(cadence(pool, h, B(3), cur, r, Object.assign({}, opts, { open: !!opts.open }))); mark(3, 'cad', cadLabel(!!opts.open));
      ops.push('question/answer');
    } else {                             // call & response: motif, answer in another register, motif, closing answer
      const resp = VARY.invert(m);
      resp.text = null;
      const reg = r.chance(0.5) ? -3 : 3;
      add(realize(m, pool, h, B(0), cur, r, opts)); mark(0, 'motif', 'Call: motif');
      add(realize(Object.assign(resp, { shift: reg }), pool, h, B(1), cur, r, Object.assign({}, opts, { vel: opts.vel - 10 }))); mark(1, 'resp', 'Response: motif upside down');
      add(realize(VARY.changeEnding(m, r), pool, h, B(2), cur, r, opts)); mark(2, 'vary', 'Call again, new ending');
      add(cadence(pool, h, B(3), cur, r, Object.assign({}, opts, { open: !!opts.open }))); mark(3, 'cad', cadLabel(!!opts.open));
      ops.push('call/response');
    }
    return { notes: out, end: cur, ops, marks };
  }

  // v2.3: an 8-bar phrase built on a 2-bar idea. The idea is heard in about half the bars of the phrase,
  // the rest is new material (contrast, continuation), so it no longer returns every other bar.
  //   period:   idea | contrast (open)       | idea varied | new continuation, cadence
  //   sentence: idea | idea varied (sequence)| head fragmented, new continuation, cadence
  //   call:     call | response (inverted, another register) | call varied | new closing, cadence
  const IDEA_OPS = ['transposeToChord', 'sequenceUp', 'sequenceDown', 'changeEnding', 'ornament', 'widen'];
  function buildPhrase8(form, m, pool, h, startBar, anchor, r, opts, st) {
    const out = [], ops = [], marks = [];
    let cur = anchor;
    const leap = leapOf(h);
    const cells = st && st.cells && st.cells.length ? st.cells : [[[0, 4], [4, 4]]];
    const S = Object.assign({ cells }, st || {});
    const add = res => { out.push(...res.notes); cur = res.end; };
    const B = i => startBar + i;
    const mark = (i, kind, label) => marks.push({ bar: B(i), kind, label, phrase: !!m.phrase && (kind === 'motif' || kind === 'vary' || kind === 'frag') });
    const cadOpts = open => Object.assign({}, opts, { open, cells });
    const cadLabel = open => open ? 'Cadence, left open' : 'Cadence, lands home';
    const idea = m.idea ? m : makeIdea(S, r, leap, m);
    const varyIdea = () => { const op = ARP > 0 && r() < ARP * 0.5 ? 'arpeggiate' : r.pick(IDEA_OPS); ops.push(op); return { motif: VARY[op](copy(idea), r), op }; };
    if (form === 'sentence') {
      const a0 = realize(idea, pool, h, B(0), cur, r, opts); add(a0); mark(0, 'motif', 'Idea');
      const op = r.pick(['sequenceUp', 'sequenceDown', 'transposeToChord', 'changeEnding']); ops.push(op);
      add(realize(VARY[op](copy(idea), r), pool, h, B(2), cur, r, opts)); mark(2, 'vary', 'Idea again: ' + OP_NAMES[op]);
      add(fragments(idea, pool, h, B(4), cur, r, opts)); mark(4, 'frag', 'Idea head, fragmented');
      add(realize(freshCell(S, r, leap, barRhythm(idea, 1)), pool, h, B(5), cur, r, opts)); mark(5, 'new', 'Continuation: new notes');
      add(realize(freshCell(S, r, leap), pool, h, B(6), cur, r, opts)); mark(6, 'new', 'Continuation: new notes');
      add(cadence(pool, h, B(7), cur, r, cadOpts(!!opts.open))); mark(7, 'cad', cadLabel(!!opts.open));
    } else if (form === 'call') {
      add(realize(idea, pool, h, B(0), cur, r, opts)); mark(0, 'motif', 'Call: idea');
      const resp = Object.assign(VARY.invert(freshCell(S, r, leap, barRhythm(idea, 0))), { shift: r.chance(0.5) ? -3 : 3, text: null });
      add(realize(resp, pool, h, B(2), cur, r, Object.assign({}, opts, { vel: opts.vel - 10 }))); mark(2, 'resp', 'Response: another register');
      add(cadence(pool, h, B(3), cur, r, cadOpts(true))); mark(3, 'cad', 'Response ends open');
      const v = varyIdea(); add(realize(v.motif, pool, h, B(4), cur, r, opts)); mark(4, 'vary', 'Call again: ' + OP_NAMES[v.op]);
      add(realize(freshCell(S, r, leap), pool, h, B(6), cur, r, opts)); mark(6, 'new', 'Closing line: new notes');
      add(cadence(pool, h, B(7), cur, r, cadOpts(!!opts.open))); mark(7, 'cad', cadLabel(!!opts.open));
      ops.push('call/response');
    } else {
      const a0 = realize(idea, pool, h, B(0), cur, r, opts); add(a0); mark(0, 'motif', 'Idea (question)');
      add(realize(freshCell(S, r, leap), pool, h, B(2), cur, r, opts)); mark(2, 'new', 'Contrast: new notes');
      add(cadence(pool, h, B(3), cur, r, cadOpts(true))); mark(3, 'cad', 'Question ends open');
      const v = varyIdea(); add(realize(v.motif, pool, h, B(4), a0.notes.length ? nearestIdx(pool, a0.notes[0].p) : cur, r, opts)); mark(4, 'vary', 'Idea again (answer): ' + OP_NAMES[v.op]);
      add(realize(freshCell(S, r, leap, barRhythm(idea, 0)), pool, h, B(6), cur, r, opts)); mark(6, 'new', 'Continuation: new notes');
      add(cadence(pool, h, B(7), cur, r, cadOpts(!!opts.open))); mark(7, 'cad', cadLabel(!!opts.open));
      ops.push('question/answer');
    }
    return { notes: out, end: cur, ops, marks };
  }

  // A whole melody: verse A A', chorus B B' (chorus motif = phrase riff when one is given)
  function composeMelody(h, st, bars, r, opts = {}) {
    if (h && typeof h.arp === 'number') setArp(h.arp);
    const pool = makePool(h, 60, 84);
    const forms = ['sentence', 'period', 'call'];
    const form = opts.form && opts.form !== 'auto' ? opts.form : r.pick(forms);
    // with a phrase, the phrase IS the motif: the verse states it, the chorus develops it
    const hook = opts.hookMotif;
    const A = hook ? copy(hook) : makeMotif(st, r, leapOf(h));
    let chorusOp = null, Bm;
    if (hook) {
      chorusOp = r.pick(['sequenceUp', 'rhythmShift', 'augment', 'changeEnding', 'ornament']);
      Bm = VARY[chorusOp](copy(hook), r);
    } else Bm = makeMotif(st, r, leapOf(h));
    // v2.3: 8 bars or more: 8-bar phrases on 2-bar ideas (verse idea, then the chorus idea)
    if (bars >= 8) {
      const blocks = Math.floor(bars / 8);
      const ideaA = makeIdea(st, r, leapOf(h), A), ideaB = makeIdea(st, r, leapOf(h), Bm);
      const plan8 = blocks === 1 ? ['A'] : blocks === 2 ? (hook ? ['A', 'B'] : ['A', "A'"]) : blocks === 3 ? ['A', 'B', "A'"] : ['A', "A'", 'B', "B'"];
      const notes = [], marks = [], ops = [];
      let anchor = nearestIdx(pool, 67 + (h.key % 12 > 6 ? h.key - 12 : h.key));
      for (let p = 0; p < blocks; p++) {
        const sec = plan8[p % plan8.length];
        const isB = sec[0] === 'B';
        let m = isB ? ideaB : ideaA, secOp = isB ? chorusOp : null;
        if (sec.endsWith("'")) { const op = r.pick(IDEA_OPS); m = Object.assign(VARY[op](copy(m), r), { idea: true }); ops.push(op); secOp = op; }
        const f = sec.endsWith("'") && form === 'period' ? 'sentence' : form;
        const res = buildPhrase8(f, m, pool, h, p * 8, isB ? clampIdx(pool, anchor + 2) : anchor, r,
          { vel: (st.melodyVel || 90) + (isB ? 6 : 0), open: p < blocks - 1 && p % 2 === 0 }, st);
        notes.push(...res.notes); ops.push(...res.ops);
        const secName = (isB ? 'Chorus ' : 'Verse ') + sec.replace("'", '′');
        res.marks.forEach((mk, i) => marks.push(Object.assign(mk, i === 0 ? { section: secName + (secOp ? ' (' + OP_NAMES[secOp] + ')' : '') } : {})));
        anchor = res.end;
      }
      for (let b = blocks * 8; b + 4 <= bars; b += 4) {
        const res = buildPhrase(form, A, pool, h, b, anchor, r, { vel: st.melodyVel || 90, open: false });
        notes.push(...res.notes); marks.push(...res.marks); anchor = res.end;
      }
      for (let b = Math.floor(bars / 4) * 4; b < bars; b++) {
        notes.push(...realize(VARY.changeEnding(A, r), pool, h, b, anchor, r, { vel: st.melodyVel || 90 }).notes);
        marks.push({ bar: b, kind: 'vary', label: 'Motif, new ending', phrase: !!A.phrase });
      }
      const out = notes.filter(n => n.s < bars * 16).map(n => Object.assign(n, { l: Math.min(n.l, bars * 16 - n.s) }));
      const lim = limitLeaps(out, h);
      treatNonChordTones(lim, h);
      return { notes: lim, form, ops, marks: marks.filter(mk => mk.bar < bars) };
    }
    const phrases = Math.max(1, Math.floor(bars / 4));
    let plan;
    if (phrases === 1) plan = ['A'];
    else if (phrases === 2) plan = hook ? ['A', 'B'] : ['A', "A'"];
    else plan = ['A', "A'", 'B', "B'"];
    const notes = [];
    const marks = [];
    let anchor = nearestIdx(pool, 67 + (h.key % 12 > 6 ? h.key - 12 : h.key));
    const ops = [];
    for (let p = 0; p < phrases; p++) {
      const sec = plan[p % plan.length];
      const isB = sec[0] === 'B';
      let m = isB ? Bm : A;
      let secOp = isB ? chorusOp : null;
      if (sec.endsWith("'")) { const v = vary(m, r); m = v.motif; ops.push(v.op); secOp = v.op; }
      // chorus sits a little higher; the last phrase of a pair closes on the tonic, the first may stay open
      const startAnchor = isB ? clampIdx(pool, anchor + 2) : anchor;
      const res = buildPhrase(isB && form === 'call' ? 'sentence' : form, m, pool, h, p * 4, startAnchor, r,
        { vel: (st.melodyVel || 90) + (isB ? 6 : 0), open: p % 2 === 0 && p < phrases - 1 });
      notes.push(...res.notes); ops.push(...res.ops);
      const secName = (isB ? 'Chorus ' : 'Verse ') + sec.replace("'", '′');
      res.marks.forEach((mk, i) => marks.push(Object.assign(mk, i === 0 ? { section: secName + (secOp ? ' (' + OP_NAMES[secOp] + ')' : '') } : {})));
      anchor = res.end;
    }
    // leftover bars (bars not divisible by 4): repeat the motif with a varied ending
    for (let b = phrases * 4; b < bars; b++) {
      notes.push(...realize(VARY.changeEnding(A, r), pool, h, b, anchor, r, { vel: st.melodyVel || 90 }).notes);
      marks.push({ bar: b, kind: 'vary', label: 'Motif, new ending', phrase: !!A.phrase });
    }
    const out = notes.filter(n => n.s < bars * 16).map(n => Object.assign(n, { l: Math.min(n.l, bars * 16 - n.s) }));
    const lim = limitLeaps(out, h);
    treatNonChordTones(lim, h);
    return { notes: lim, form, ops, marks: marks.filter(mk => mk.bar < bars) };
  }

  // ===========================================================================
  // v2.5 (gap 4): notes off the chord, treated the way composers use them
  // ===========================================================================
  // Every melody note that is not in the chord under it must be one of the known non-chord tones, or it is moved
  // to the nearest chord tone (preferring one a step from the note before):
  //   passing (step in, step on in the same direction), neighbour (step away and back), appoggiatura or suspension
  //   (on the beat, held over or leapt to, resolving by step to a chord tone, at most a half note), anticipation
  //   (a short note that repeats into the next chord), escape tone (a short note stepped into, left by leap).
  // Long notes off the beat count as strong. Over colour chords the chord's own altered note replaces the scale
  // note a semitone from it (an A over a borrowed iv in C becomes A♭).
  function treatNonChordTones(notes, h) {
    const sc = GM.SCALES[h.scale] || GM.SCALES['Major'];
    const inScale = pc => sc.includes(((pc - h.key) % 12 + 12) % 12);
    const byS = new Map();
    for (const n of notes) { if (!byS.has(n.s)) byS.set(n.s, []); byS.get(n.s).push(n); }
    const line = [...byS.values()].map(g => g.reduce((a, x) => x.p > a.p ? x : a, g[0])).sort((a, b) => a.s - b.s);
    const move = (n, d) => { for (const x of byS.get(n.s)) if (x === n || (n.p - x.p) % 12 === 0) x.p = Math.max(0, Math.min(127, x.p + d)); };
    const pc = p => ((p % 12) + 12) % 12;
    const pcsAt = n => h.chordAt(Math.floor(n.s / 16), n.s % 16);
    let colour = 0, fixed = 0, kept = 0;
    for (let i = 0; i < line.length; i++) {
      const n = line[i], prev = line[i - 1], next = line[i + 1];
      const pcs = pcsAt(n);
      if (pcs.includes(pc(n.p))) continue;
      // colour chord: its altered note replaces the clashing scale note
      const alt = pcs.find(c => !inScale(c) && [1, 11].includes(((c - pc(n.p)) % 12 + 12) % 12));
      if (alt != null) { const d = ((alt - pc(n.p) + 6) % 12 + 12) % 12 - 6; move(n, d); colour++; continue; }
      const strong = n.s % 4 === 0 || n.l >= 6;
      const step = (a, b) => a && b && Math.abs(a.p - b.p) >= 1 && Math.abs(a.p - b.p) <= 2;
      const ct = x => x && pcsAt(x).includes(pc(x.p));
      const gapNext = next ? next.s - (n.s + n.l) : 99;
      let ok = false;
      if (!strong && n.l <= 4 && step(prev, n) && step(n, next) && Math.sign(n.p - prev.p) === Math.sign(next.p - n.p)) ok = true;   // passing
      else if (!strong && n.l <= 4 && step(prev, n) && next && next.p === prev.p) ok = true;                                          // neighbour
      else if (n.l <= 8 && step(n, next) && ct(next) && gapNext <= 1 && (next.p < n.p || n.s % 8 === 0)) ok = true;                // appoggiatura / suspension
      else if (n.l <= 2 && next && next.p === n.p && ct(next)) ok = true;                                                            // anticipation
      else if (n.l <= 2 && !strong && step(prev, n) && ct(prev)) ok = true;                                                          // escape tone
      if (ok) { kept++; continue; }
      // repair: the nearest chord tone, a step from the previous note if possible
      let best = null, bs = Infinity;
      for (let d = -4; d <= 4; d++) {
        if (!d || !pcs.includes(pc(n.p + d))) continue;
        const sc2 = Math.abs(d) + (prev && Math.abs(n.p + d - prev.p) <= 2 ? -0.5 : 0) + (prev && Math.abs(n.p + d - prev.p) > 7 ? 3 : 0);
        if (sc2 < bs) { bs = sc2; best = d; }
      }
      if (best != null) { move(n, best); fixed++; }
    }
    return { colour, fixed, kept };
  }

  // ===========================================================================
  // D. Score candidates with "what the ear expects"
  // ===========================================================================
  function scoreMelody(notes, h, bars) {
    const ns = notes.slice().sort((a, b) => a.s - b.s);
    if (ns.length < 3) return { total: 0, parts: {} };
    const iv = [];
    for (let i = 1; i < ns.length; i++) iv.push(ns[i].p - ns[i - 1].p);
    const steps = iv.filter(x => Math.abs(x) <= 2).length / iv.length;
    // leaps (a 4th or more) that turn back afterwards
    let leaps = 0, reversed = 0;
    for (let i = 0; i < iv.length - 1; i++) if (Math.abs(iv[i]) >= 5) { leaps++; if (Math.sign(iv[i + 1]) === -Math.sign(iv[i])) reversed++; }
    const gapFill = leaps ? reversed / leaps : 1;
    // arch: in each 4-bar phrase the high point falls in the middle half
    let arches = 0, phrases = 0;
    for (let b = 0; b < bars; b += 4) {
      const ph = ns.filter(n => n.s >= b * 16 && n.s < (b + 4) * 16);
      if (ph.length < 3) continue;
      phrases++;
      const top = ph.reduce((a, n) => n.p > a.p ? n : a, ph[0]);
      const pos = (top.s - b * 16) / 64;
      if (pos >= 0.2 && pos <= 0.8) arches++;
    }
    const arch = phrases ? arches / phrases : 0.5;
    const lo = Math.min(...ns.map(n => n.p)), hi = Math.max(...ns.map(n => n.p));
    const rangeS = hi - lo;
    const range = rangeS >= 8 && rangeS <= 14 ? 1 : rangeS < 8 ? Math.max(0, 1 - (8 - rangeS) / 6) : Math.max(0, 1 - (rangeS - 14) / 8);
    const strong = ns.filter(n => n.s % 8 === 0);
    const chordTones = strong.length ? strong.filter(n => h.chordAt(Math.floor(n.s / 16) % bars, n.s % 16).includes(n.p % 12)).length / strong.length : 0.5;
    const ending = ns[ns.length - 1].p % 12 === h.key % 12 ? 1 : 0;
    // rhythm reuse: bars that share their rhythm with another bar
    const sigs = [];
    for (let b = 0; b < bars; b++) sigs.push(ns.filter(n => Math.floor(n.s / 16) === b).map(n => n.s % 16).join(','));
    const reuseShare = sigs.filter((s, i) => s && sigs.some((t, j) => j !== i && t === s)).length / Math.max(1, sigs.filter(Boolean).length);
    // v2.3: some rhythm reuse makes a tune hang together, too much makes it a loop: aim for about half the bars
    const reuse = 1 - Math.min(1, Math.abs(reuseShare - 0.5) * 3);
    // the most common bar shape (rhythm + intervals) should not fill more than about a quarter of the bars
    const shapes = {};
    let sung = 0;
    for (let b = 0; b < bars; b++) {
      const bn = ns.filter(n => Math.floor(n.s / 16) === b);
      if (!bn.length) continue;
      sung++;
      const k = bn.map((n, i) => (n.s % 16) + ':' + (i ? n.p - bn[i - 1].p : 0)).join(',');
      shapes[k] = (shapes[k] || 0) + 1;
    }
    const topShare = sung ? Math.max(0, ...Object.values(shapes)) / sung : 0;
    const dominance = Math.max(0, topShare - 0.25);
    // one clear peak: the highest note sounds once (or twice) rather than all over
    const peakCount = ns.filter(n => n.p === hi).length;
    const peak = peakCount <= 2 ? 1 : peakCount <= 4 ? 0.5 : 0;
    // monotony: same pitch more than 3 times in a row
    let runs = 0, run = 1;
    for (let i = 1; i < ns.length; i++) { if (ns[i].p === ns[i - 1].p) { if (++run === 4) runs++; } else run = 1; }
    // the leap setting decides how stepwise the ear expects the line to be
    const leap = leapOf(h), stepTarget = Math.max(0.2, 0.86 - 0.4 * leap - 0.45 * ARP);
    const stepsScore = 1 - Math.min(1, Math.abs(steps - stepTarget) * 2.5);
    const tooFar = iv.filter(x => Math.abs(x) > maxLeap(leap)).length / iv.length;
    const parts = { steps: stepsScore, gapFill, arch, range, chordTones, ending, reuse, peak, dominance: 1 - dominance };
    const total = (stepsScore * 2 + gapFill * 1.5 + arch * 1.5 + range * 1 + chordTones * 2 + ending * 1.5 + reuse * 0.75 + peak * 0.5) / 10.75 - runs * 0.05 - tooFar * 0.5 - dominance * 0.8;
    return { total: Math.max(0, total), parts };
  }

  function bestMelody(h, st, bars, r, opts = {}, candidates = 24) {
    let best = null;
    for (let i = 0; i < candidates; i++) {
      const sub = opts.rng(Math.floor(r() * 4294967296));
      const c = composeMelody(h, st, bars, sub, opts);
      const sc = scoreMelody(c.notes, h, bars);
      if (!best || sc.total > best.score.total) best = Object.assign(c, { score: sc });
    }
    best.candidates = candidates;
    return best;
  }

  // ===========================================================================
  // B. Riff -> vocal melody
  // ===========================================================================
  // top note of each onset (a riff may contain chords)
  function lineOf(notes) {
    const by = new Map();
    for (const n of notes) if (!by.has(n.s) || by.get(n.s).p < n.p) by.set(n.s, n);
    return [...by.values()].sort((a, b) => a.s - b.s);
  }

  // Re-pitch: keep the riff's rhythm and contour, move its notes onto each bar's chord tones
  function repitch(riff, h, bars, r) {
    const line = lineOf(riff);
    if (!line.length) return [];
    const avg = line.reduce((a, n) => a + n.p, 0) / line.length;
    const center = avg < 64 ? 72 : avg > 76 ? 67 : 70;          // sing it in a vocal register
    const pool = makePool(h, center - 12, center + 12);
    const src = makePool(h, 0, 127);
    let idx = nearestIdx(pool, center);
    let prevSrc = null;
    return line.map(n => {
      const si = nearestIdx(src, n.p);
      if (prevSrc !== null) idx = clampIdx(pool, idx + (si - prevSrc));
      prevSrc = si;
      if (idx < 2) idx += 2; if (idx > pool.length - 3) idx -= 2;
      const bar = Math.floor(n.s / 16) % bars;
      if (n.s % 4 === 0) idx = snapIdx(pool, idx, h.chordAt(bar, n.s % 16), 2);
      return { p: pool[idx], s: n.s, l: n.l, v: n.v, t: n.t };
    });
  }

  // Answer: fill the riff's rests with short responses in another register, ending on chord tones
  function answer(riff, h, st, bars, r) {
    const total = bars * 16;
    const busy = new Array(total).fill(false);
    // rests count as room to answer, and so do long held notes after their first beat
    for (const n of riff) for (let s = n.s; s < Math.min(total, n.s + (n.l >= 6 ? 2 : n.l)); s++) busy[s] = true;
    const line = lineOf(riff);
    const avg = line.length ? line.reduce((a, n) => a + n.p, 0) / line.length : 64;
    const pool = avg >= 66 ? makePool(h, 48, 70) : makePool(h, 62, 81);
    // the response borrows the riff's contour, inverted
    const src = makePool(h, 0, 127);
    const riffMoves = [];
    for (let i = 1; i < line.length; i++) riffMoves.push(-(nearestIdx(src, line[i].p) - nearestIdx(src, line[i - 1].p)));
    if (!riffMoves.length) riffMoves.push(1, 1, -2);
    // collect gaps of 3+ steps
    const gaps = [];
    for (let s = 0; s < total;) {
      if (busy[s]) { s++; continue; }
      let e = s; while (e < total && !busy[e]) e++;
      if (e - s >= 3) gaps.push([s, e]);
      s = e;
    }
    const notes = [];
    let idx = Math.floor(pool.length / 2), mi = 0;
    for (const [s0, e0] of gaps) {
      for (let s = s0; s < e0;) {
        const left = e0 - s;
        const l = left >= 8 ? r.pick([2, 2, 4]) : left >= 4 ? r.pick([1, 2, 2]) : left;
        const isLast = s + l >= e0 || e0 - (s + l) < 2;
        const bar = Math.floor(s / 16) % bars;
        if (notes.length) idx = clampIdx(pool, idx + Math.max(-2, Math.min(2, riffMoves[mi++ % riffMoves.length])));
        if (idx < 2) idx += 2; if (idx > pool.length - 3) idx -= 2;
        if (isLast || s % 4 === 0) idx = snapIdx(pool, idx, h.chordAt(bar, s % 16), 2);
        notes.push({ p: pool[idx], s, l: isLast ? e0 - s : l, v: vel(r, (st.melodyVel || 90) - 6) });
        if (isLast) break;
        s += l;
      }
    }
    return notes;
  }

  const api = { setArp, treatNonChordTones, analyzePhrase, syllabify, phraseToRiff, phraseMotif, composeMelody, bestMelody, scoreMelody, repitch, answer, makeMotif, VARY, limitLeaps, maxLeap,
    _: { makePool, nearestIdx, clampIdx, snapIdx, buildPhrase, buildPhrase8, makeIdea, freshCell, cadence, realize, copy, head, vary, VARY, OP_NAMES, IDEA_OPS } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Melody = api;
})(this);
