// v2.5 performance layer (from the "What composers still do" research, gaps 6, 9 and 11):
// the same notes, played the way musicians play them.
//   - dynamics: phrases swell toward their high note and relax into the cadence; pre-choruses and builds grow,
//     outros fade, syncopated notes are accented
//   - articulation: sustaining instruments play legato, plucked and struck ones re-articulate repeated notes,
//     slow piano parts are held as if with the sustain pedal
//   - timing feel: a small offset per note (n.d, in steps): laid-back backbeat and bass in groove styles,
//     loose hats, a human melody, strummed guitar chords (down-strokes low to high, up-strokes high to low)
//   - a ritardando at the end of songs that end (not loops)
(function (root) {
  const fam = p => (p | 0) >> 3;
  // instruments that hold a note as long as it is played (bowed, blown, sung, organ, synth leads and pads)
  const sustaining = p => [2, 5, 6, 7, 8, 9, 10, 11].includes(fam(p)) && ![45, 46, 47, 55].includes(p);
  // plucked or struck: the sound decays by itself
  const plucked = p => [0, 1, 3].includes(fam(p)) || [45, 46, 104, 105, 106, 107, 108].includes(p);
  const clampV = v => Math.max(20, Math.min(127, Math.round(v)));

  // phrase arcs: velocity rises to the highest note of each group of bars and falls after it
  function phraseDynamics(notes, groupBars = 4, amount = 10, groups = null) {
    if (!notes.length) return notes;
    const byGroup = new Map();
    for (const n of notes) {
      const g = groups ? groups(Math.floor(n.s / 16)) : Math.floor(n.s / 16 / groupBars) * groupBars;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(n);
    }
    for (const ns of byGroup.values()) {
      const a = Math.min(...ns.map(n => n.s)), e = Math.max(...ns.map(n => n.s + n.l));
      const top = ns.reduce((x, n) => n.p > x.p ? n : x, ns[0]);
      const tp = Math.max(0.15, Math.min(0.85, (top.s - a) / Math.max(1, e - a)));
      for (const n of ns) {
        const t = (n.s - a) / Math.max(1, e - a);
        const shape = t <= tp ? t / tp : (1 - t) / (1 - tp);   // 0 at the edges, 1 at the high point
        n.v = clampV(n.v + amount * (shape - 0.5));
      }
    }
    return notes;
  }
  // section shapes: crescendo through pre-choruses and builds, fade in outros, a little more in the last chorus
  function sectionDynamics(notes, sections, opts = {}) {
    if (!sections) return notes;
    for (const n of notes) {
      const b = Math.floor(n.s / 16);
      const sec = sections.find(s => b >= s.start && b < s.start + s.len);
      if (!sec) continue;
      const t = (n.s - sec.start * 16) / Math.max(1, sec.len * 16);
      if (sec.type === 'P' || sec.type === 'U') n.v = clampV(n.v - 8 + 18 * t);
      else if (sec.type === 'O' && !opts.loop) n.v = clampV(n.v - 26 * t);
      else if (sec.energy >= 5) n.v = clampV(n.v + 4);
    }
    return notes;
  }
  // notes starting off the beat and held over it are pushed a little harder
  function accentSyncopation(notes) {
    for (const n of notes) if (n.s % 4 === 2 && n.l >= 3) n.v = clampV(n.v + 6);
    return notes;
  }

  // articulation for a single line (melody, lead, counter-melody)
  function articulateLine(notes, program) {
    const line = notes.slice().sort((a, b) => a.s - b.s || b.p - a.p);
    for (let i = 0; i < line.length - 1; i++) {
      const n = line[i];
      let j = i + 1; while (j < line.length && line[j].s === n.s) j++;
      const next = line[j];
      if (!next) break;
      const gap = next.s - (n.s + n.l);
      if (sustaining(program) && gap > 0 && gap <= 2) n.l += gap;                  // legato: join short gaps
      else if (plucked(program) && gap <= 0 && next.p === n.p && n.l >= 3) n.l -= 1; // re-articulate a repeated note
    }
    return notes;
  }
  // slow piano and keys: hold each chord until the next one, as with the sustain pedal
  function pedal(notes, program, style) {
    if (fam(program) !== 0 || !style || style.edm || style.power || (style.bpm || 120) >= 110) return notes;
    const onsets = [...new Set(notes.map(n => n.s))].sort((a, b) => a - b);
    const nextOn = new Map(onsets.map((s, i) => [s, onsets[i + 1]]));
    for (const n of notes) { const nx = nextOn.get(n.s); if (nx != null && nx - n.s <= 16) n.l = Math.max(n.l, nx - n.s); }
    return notes;
  }

  // timing feel: offsets in steps (a sixteenth = 1)
  const LAID_BACK = ['Hip-hop', 'Lo-fi', 'R&B / Soul', 'Gospel', 'Funk', 'Reggae', 'Afrobeats', 'Bossa nova', 'Jazz', 'Blues'];
  function feel(notes, role, styleName, style, r, program) {
    const tight = style && style.edm;
    const back = LAID_BACK.includes(styleName);
    for (const n of notes) {
      let d = 0;
      if (role === 'drums') {
        if ([38, 39, 40, 37].includes(n.p) && back && n.s % 4 === 0) d = 0.08;           // the backbeat sits back
        else if ([42, 44, 46, 51, 54, 70, 82].includes(n.p) && !tight) d = (r() * 2 - 1) * 0.04;
      } else if (role === 'bass') d = back ? 0.05 : tight ? 0 : (r() * 2 - 1) * 0.02;
      else if (role === 'melody' || role === 'lead' || role === 'counter' || role === 'harmony') d = tight ? 0 : (r() * 2 - 1) * 0.04 + (back ? 0.03 : 0);
      if (d) n.d = Math.round(d * 1000) / 1000;
    }
    return notes;
  }
  // strummed guitar: the notes of a chord hit spread out; on-beat hits are down-strokes (low to high, full),
  // off-beat hits up-strokes (high to low, softer, only the top strings)
  function strum(notes, program, r) {
    if (fam(program) !== 3) return notes;
    const by = new Map();
    for (const n of notes) { if (!by.has(n.s)) by.set(n.s, []); by.get(n.s).push(n); }
    const drop = new Set();
    for (const [s, hit] of by) {
      if (hit.length < 2) continue;
      hit.sort((a, b) => a.p - b.p);
      const up = s % 4 === 2;
      const order = up ? hit.slice().reverse() : hit;
      if (up && hit.length >= 4) drop.add(hit[0]);                                    // up-strokes miss the low string
      const spread = 0.05 + r() * 0.02;
      order.forEach((n, i) => { n.d = Math.round(i * spread * 1000) / 1000; if (up) n.v = clampV(n.v - 10); });
    }
    return drop.size ? notes.filter(n => !drop.has(n)) : notes;
  }

  // a ritardando over the last two bars of a song that ends: [{ s, f }]
  function ritardando(bars, opts = {}) {
    if (opts.loop || bars < 4) return null;
    const out = [];
    const startBar = bars - (opts.stinger ? 1 : 2);
    const beats = (bars - startBar) * 4;
    for (let k = 1; k <= beats; k++) out.push({ s: startBar * 16 + (k - 1) * 4, f: Math.round((1 - 0.22 * Math.pow(k / beats, 1.4)) * 1000) / 1000 });
    return out;
  }

  const api = { sustaining, plucked, phraseDynamics, sectionDynamics, accentSyncopation, articulateLine, pedal, feel, strum, ritardando };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Perform = api;
})(this);
