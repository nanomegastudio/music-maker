// Song form: plan a whole song as sections (from the "How songs repeat" research notes)
//   - a layout with bar counts per style (verse/pre/chorus/bridge, AABA, build & drop, ternary)
//   - its own chords and energy level per section (thin verses, full choruses, builds with a speeding-up snare roll)
//   - each section's melody is written once; a return is an exact copy with exactly one change
//   - a typed phrase sits where the title goes (chorus / A / drop); verses use a variation of it
(function (root) {
  const NODE = typeof module !== 'undefined' && module.exports;
  const Melody = NODE ? require('./melody.js') : root.Melody;

  const FORMS = {
    'Pop': 'I4 V16 P8 C8 V16 P8 C8 B8 C8 C8 O4',
    'Rock': 'I4 A8 A8 B8 A8 S8 B8 A8 O4',
    'Lo-fi': 'I4 A8 A8 B8 A8 B8 A8 O4',
    'Electronic': 'I16 K16 U8 D16 K16 U8 D16 O16',
    'Ambient': 'I8 A16 B16 A16 O8'
  };
  // structure templates (from the song-form research); 'style' = the style's own layout
  const BLUES = [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4];
  const TEMPLATES = {
    'verse-chorus': { name: 'Verse–chorus', form: 'I4 V16 C8 V16 C8 C8 O4' },
    'pop': { name: 'Verse–pre–chorus–bridge (pop)', form: 'I4 V16 P8 C8 V16 P8 C8 B8 C8 C8 O4' },
    'chorus-first': { name: 'Chorus first (hook up front)', form: 'C8 V16 C8 V16 C8 B8 C8 O4' },
    'aaba': { name: 'AABA 32-bar (standard)', form: 'I4 A8 A8 B8 A8 O4' },
    'aaba-solo': { name: 'AABA with a solo', form: 'I4 A8 A8 B8 A8 S8 B8 A8 O4' },
    'blues': { name: '12-bar blues', form: 'I4 A12 A12 A12 S12 A12 O4', verse: BLUES, names: { A: 'Blues chorus' } },
    'edm': { name: 'EDM build and drop', form: 'I16 K16 U8 D16 K16 U8 D16 O16' },
    'hiphop': { name: 'Hip-hop verse and hook', form: 'I4 C8 V16 C8 V16 C8 V16 C8 O4', names: { C: 'Hook' } },
    'ternary': { name: 'Ternary (A B A)', form: 'I8 A16 B16 A16 O8', names: { B: 'B' } },
    'rondo': { name: 'Rondo (A B A C A)', form: 'I4 A8 B8 A8 S8 A8 O4', names: { B: 'B', S: 'C' } },
    'strophic': { name: 'Strophic (verse, verse, verse…)', form: 'I4 V16 V16 V16 V16 O4' },
    'game-loop': { name: 'Seamless game loop (A B A B, no intro or outro)', form: 'A8 B8 A8 B8', loop: true, names: { A: 'Loop A', B: 'Loop B' } },
    'game-loop-long': { name: 'Long game loop (A B A C)', form: 'A8 B8 A8 S8', loop: true, names: { A: 'Loop A', B: 'Loop B', S: 'Loop C' } },
    'stinger': { name: 'Short stinger (4 bars, ends)', form: 'A4', names: { A: 'Stinger' } }
  };
  const templateOf = gen => gen.structure && TEMPLATES[gen.structure] ? TEMPLATES[gen.structure] : null;
  // a seamless loop: the last bar leads straight back into the first
  const isLoop = (gen, H) => { const t = templateOf(gen) || styleForm(gen, H).tpl; return !!(t && t.loop); };
  // scale a loop's sections to exactly `target` bars (whole bars, each at least 1; short loops drop the last sections)
  function fitLoop(spec, target) {
    if (target < spec.length) spec.splice(target);
    const sum = spec.reduce((a, s) => a + s.len, 0);
    const exact = spec.map(s => s.len * target / sum);
    // prefer even lengths (2- and 4-bar phrases) when there is room
    const unit = target >= spec.length * 2 ? 2 : 1;
    spec.forEach((s, i) => { s.len = Math.max(1, Math.floor(exact[i] / unit) * unit); });
    let left = target - spec.reduce((a, s) => a + s.len, 0);
    // hand out what is left, biggest shortfall first (hook sections first on a tie)
    const order = spec.map((s, i) => i).sort((a, b) => (exact[b] - spec[b].len) - (exact[a] - spec[a].len) || a - b);
    for (let k = 0; left > 0; k++) { const i = order[k % order.length]; const add = Math.min(left, unit); spec[i].len += add; left -= add; }
    return spec;
  }
  // the style's own layout: its form string, or one of the templates
  function styleForm(gen, H) {
    const st = (H && H.STYLES[gen.style]) || {};
    if (st.template && TEMPLATES[st.template]) return { tpl: TEMPLATES[st.template], form: TEMPLATES[st.template].form, name: TEMPLATES[st.template].name };
    const form = st.form || FORMS[gen.style] || FORMS['Pop'];
    return { tpl: null, form, name: st.formName || FORM_NAMES[gen.style] || 'verse–chorus' };
  }

  const FORM_NAMES = { 'Pop': 'verse–chorus–bridge', 'Rock': 'AABA with a solo', 'Lo-fi': 'AABA', 'Electronic': 'build and drop', 'Ambient': 'ternary (A B A)' };

  const SECTION = {
    I: { name: 'Intro', energy: 1, color: '#5e6257' },
    V: { name: 'Verse', energy: 2, color: '#3a63d6' },
    P: { name: 'Pre-chorus', energy: 3, color: '#c99a22' },
    C: { name: 'Chorus', energy: 4, color: '#e2452a' },
    B: { name: 'Bridge', energy: 2, color: '#1f9a86' },
    S: { name: 'Solo', energy: 4, color: '#8a5cc9' },
    O: { name: 'Outro', energy: 1, color: '#5e6257' },
    K: { name: 'Break', energy: 2, color: '#3a63d6' },
    U: { name: 'Build', energy: 3, color: '#c99a22' },
    D: { name: 'Drop', energy: 5, color: '#e2452a' },
    A: { name: 'A', energy: 3, color: '#e2452a' },
    L: { name: 'Interlude', energy: 3, color: '#b0569a' }
  };
  const HOOK_TYPES = ['C', 'D', 'A'];   // sections that carry the title / hook
  const CHANGE_NAMES = {
    ending: 'new ending', ornament: 'passing notes in the tail', layer: 'octave doubling added',
    dropout: 'drums and bass drop out for the first half', keyup: 'key change, up a whole step',
    reharm: 'same tune, new chords under it', handoff: 'lead instrument takes the tune for 4 bars',
    rest: 'melody rests for 4 bars, the band carries it', newhalf: 'same start, new second half'
  };
  // v2.3 key plans: none, the final-chorus lift, or every chorus a minor third up (set up by the new key's V)
  const KEY_PLANS = { auto: 'Auto (by style)', none: 'None', lift: 'Last chorus up a step', chorus3: 'Choruses up a minor third' };

  // chord progressions per section job (scale degrees, 0 = I); v2.3 adds choruses that start on the home chord
  const CHORUS = { major: [[3, 4, 0, 5], [5, 3, 0, 4], [3, 0, 4, 5], [5, 4, 3, 4], [3, 4, 5, 0], [0, 3, 5, 4], [0, 4, 3, 4], [0, 5, 3, 4], [0, 2, 3, 4]], minor: [[5, 6, 0, 0], [3, 5, 6, 0], [5, 2, 6, 0], [5, 6, 2, 4], [0, 5, 6, 4], [0, 3, 6, 5], [0, 6, 5, 4]] };
  const PRE = { major: [[3, 3, 4, 4], [1, 3, 4, 4], [5, 3, 1, 4]], minor: [[3, 3, 4, 4], [5, 6, 3, 4], [5, 5, 6, 6]] };
  const BRIDGE = { major: [[3, 5, 3, 4], [5, 3, 1, 4], [1, 5, 3, 4]], minor: [[3, 5, 3, 4], [5, 2, 3, 4], [3, 6, 5, 4]] };

  // ---------------------------------------------------------------------------
  // v2.3 harmony per section ("Keeping songs fresh"): instead of one 4-chord loop, each section gets a plan of
  // 4-bar groups where the middle groups swap a chord for one of the same job, the last group steers to the next
  // section (pre-chorus and bridge land on V), a chord pace per section (slow verses, pre-choruses that speed up
  // to two chords a bar, chorus turnarounds), and now and then a colour chord (borrowed iv, bVII, bVI or a
  // secondary dominant on the half bar before its target).
  // ---------------------------------------------------------------------------
  const isDim = (d, minor) => d === (minor ? 1 : 6);
  // a chord that shares two notes with d (a third above or below)
  function swapFor(d, minor, r) {
    if (typeof d !== 'number') return d;
    const opts = [(d + 5) % 7, (d + 2) % 7].filter(x => !isDim(x, minor));
    return opts.length ? r.pick(opts) : d;
  }
  const plainOf = c => Array.isArray(c) ? c[0] : c;
  function tile(prog, len) { const out = []; for (let i = 0; i < len; i++) out.push(prog[i % prog.length]); return out; }
  const collapse = c => Array.isArray(c) && c.length === 2 && c[0] === c[1] ? c[0] : c;

  function sectionProg(base, type, len, ctx) {
    const { r, minor, st, next } = ctx;
    if (!base || base.length !== 4 || len < 4) return base.slice();
    const job = type === 'P' || type === 'U' ? 'pre' : type === 'B' ? 'bridge' : ['C', 'D', 'L', 'O'].includes(type) ? 'hook' : 'verse';
    const span = Math.min(len, 16);
    const slow = job === 'verse' && !st.edm && span >= 8 && r.chance(st.calm ? 0.6 : 0.35);
    const groupLen = slow ? 8 : 4;
    const groups = Math.max(1, Math.floor(span / groupLen));
    const out = [];
    for (let g = 0; g < groups; g++) {
      let grp = base.slice();
      const last = g === groups - 1;
      // a middle (odd) group: swap one chord, not the first
      if (g % 2 === 1 && !last || (groups > 2 && last && r.chance(0.4))) {
        const i = 1 + Math.floor(r() * 3);
        for (let t = 0; t < 4; t++) { const s = swapFor(base[i], minor, r); if (s !== grp[i - 1] && s !== grp[i + 1]) { grp[i] = s; break; } }
      }
      // the last group steers into what comes next
      if (last) {
        if (job === 'pre') { grp[2] = r.pick([3, 1].filter(x => !isDim(x, minor))); grp[3] = 4; }
        else if (job === 'bridge') grp[3] = 4;
        else if (groups > 1 && next && (next === 'C' || next === 'D' || next === 'P') && job === 'verse' && r.chance(0.5)) grp[3] = 4;
        else if (groups > 1 && job === 'hook' && next && next !== 'O' && r.chance(0.6)) { grp[2] = r.pick([3, 1].filter(x => !isDim(x, minor))); grp[3] = 4; }
      }
      if (slow) grp = grp.flatMap(c => [c, c]);
      out.push(...grp);
    }
    // pace: the pre-chorus speeds up to two chords a bar in its second half
    // (the first half's chords, twice as fast, then a step to V)
    if (job === 'pre' && out.length >= 8) {
      const h = out.length / 2, first = out.slice(0, h).map(plainOf);
      for (let j = 0; h + j < out.length - 1; j++) {
        let a = first[(2 * j) % first.length], b = first[(2 * j + 1) % first.length];
        if (2 * j + 1 >= first.length) { a = swapFor(a, minor, r); b = r.pick([1, 3].filter(x => !isDim(x, minor) && x !== a)); }
        out[h + j] = collapse([a, b]);
      }
    }
    // chorus turnaround: the last bar of a group may hold two chords
    if (job === 'hook' && !st.calm) {
      for (let i = 3; i < out.length; i += 4) if (r.chance(0.35) && typeof out[i] === 'number') out[i] = collapse([out[i], out[i] === 4 ? 3 : 4]);
    }
    // colour chords, at the style's rate
    const rate = st.colour != null ? st.colour : st.edm ? 0.25 : st.calm ? 0.3 : 0.5;
    if (out.length >= 8 && r.chance(rate)) {
      const from = Math.floor(out.length / 2), to = out.length - (job === 'pre' || job === 'bridge' ? 2 : 1);
      const spots = [];
      for (let i = from; i <= to; i++) if (typeof out[i] === 'number') spots.push(i);
      if (spots.length) {
        const i = r.pick(spots), d = out[i], nextC = i + 1 < out.length ? plainOf(out[i + 1]) : null;
        const choices = [];
        if (!minor && d === 3) choices.push('iv');
        if (!minor && d === 4 && i < out.length - 1) choices.push('b7');
        if (!minor && d === 5) choices.push('b6');
        if (minor && d === 4) choices.push('V');
        if (minor && d === 3) choices.push('IV');
        if (typeof nextC === 'number' && [1, 3, 4, 5].includes(nextC) && !isDim(nextC, minor) && nextC !== d) choices.push('sec');
        if (choices.length) {
          const c = r.pick(choices);
          out[i] = c === 'sec' ? [d, 'V/' + nextC] : c;
        }
      }
    }
    // Lydian lift in a bridge: the major II chord ("soaring" in film and game themes)
    if (job === 'bridge' && !minor && out.length >= 4 && r.chance(rate * 0.5)) { const i = out.indexOf(1); if (i >= 0 && i < out.length - 1) out[i] = 'II'; }
    return out;
  }
  // a chorus return over new chords: swap some chords for ones of the same job (the tune still fits)
  function reharmonise(prog, minor, r) {
    const out = prog.map(c => Array.isArray(c) ? c.slice() : c);
    let changed = 0;
    for (let i = 1; i < out.length; i++) {
      if (typeof out[i] !== 'number' || out[i] === 4) continue;
      if (r.chance(0.45)) { const s = swapFor(out[i], minor, r); if (s !== out[i]) { out[i] = s; changed++; } }
    }
    if (!changed) { const i = out.findIndex((c, k) => k > 0 && typeof c === 'number' && c !== 4); if (i > 0) out[i] = swapFor(out[i], minor, r); }
    return out;
  }
  // set one bar of a section's chords (the plan is tiled to the section's length first)
  function setBar(sec, local, cell) { if (sec.prog.length < sec.len) sec.prog = tile(sec.prog, sec.len); sec.prog[local] = cell; }

  // ---------------------------------------------------------------------------
  // Plan: sections with start, length, energy, chords and the one change of each return
  // ---------------------------------------------------------------------------
  function plan(gen, r, H) {
    const own = styleForm(gen, H);
    const tpl = templateOf(gen) || own.tpl;
    const st = H.STYLES[gen.style] || {};
    const spec = (templateOf(gen) ? templateOf(gen).form : own.form).split(' ').map(x => ({ type: x[0], len: +x.slice(1) }));
    // with an interlude lead in the band: an instrumental interlude after the second hook section
    // a seamless loop with a set length: no interlude, sections scaled to fill exactly that many bars
    if (gen.fitBars > 0) fitLoop(spec, Math.round(gen.fitBars));          // the user's own Bars setting
    else if (tpl && tpl.loop && gen.loopBars > 0) fitLoop(spec, Math.round(gen.loopBars));
    else if (gen.interlude) {
      const hooks = spec.map((s, i) => HOOK_TYPES.includes(s.type) ? i : -1).filter(i => i >= 0);
      if (hooks.length >= 2 && hooks[1] < spec.length - 1) spec.splice(hooks[1] + 1, 0, { type: 'L', len: 8 });
    }
    const mode = H.isMinorish(gen.scale) ? 'minor' : 'major';
    const same = (a, b) => a.join() === b.join();
    const verse = tpl && tpl.verse && !(gen.progType && gen.progType !== 'auto') ? tpl.verse.slice() : gen.progression;
    const chorus = gen.progType && gen.progType !== 'auto' ? verse.slice() : r.pick(CHORUS[mode].filter(p => !same(p, verse)));
    const pre = r.pick(PRE[mode]);
    const bridge = r.pick(BRIDGE[mode]);
    const progFor = { I: verse, V: verse, A: verse, K: verse, S: verse, C: chorus, D: chorus, O: chorus, L: chorus, P: pre, U: pre, B: bridge };
    const counts = {};
    spec.forEach(s => counts[s.type] = (counts[s.type] || 0) + 1);
    const seen = {};
    let start = 0, prevChange = null;
    const minor = mode === 'minor';
    const locked = !!(gen.progType && gen.progType !== 'auto');
    const st0 = st;
    // key plan
    let keyPlan = gen.keyPlan && KEY_PLANS[gen.keyPlan] ? gen.keyPlan : 'auto';
    const hasChorus = spec.some(s => s.type === 'C' || s.type === 'D');
    if (keyPlan === 'auto') keyPlan = st.keyChange && !(tpl && tpl.loop) ? (hasChorus && r.chance(0.2) ? 'chorus3' : r.chance(0.55) ? 'lift' : 'none') : 'none';
    if (keyPlan === 'chorus3' && (!hasChorus || (tpl && tpl.loop))) keyPlan = tpl && tpl.loop ? 'none' : 'lift';
    const sections = spec.map((s, i) => {
      const n = seen[s.type] = (seen[s.type] || 0) + 1;
      const info = SECTION[s.type];
      let energy = info.energy;
      if (st.edm && (s.type === 'I' || s.type === 'O')) energy = 3;  // EDM intros/outros are beat-only
      const final = n === counts[s.type] && counts[s.type] > 1;
      if (final && HOOK_TYPES.includes(s.type) && !(tpl && tpl.loop)) energy = 5;   // a loop stays level so its end meets its start
      if (st.calm) energy = Math.min(energy, s.type === 'I' || s.type === 'O' ? 1 : 3);
      // a return of a hook section is an exact copy with one change
      let change = null;
      if (HOOK_TYPES.includes(s.type) && n > 1) {
        const next = spec[i + 1];
        if (next && next.type === s.type) change = 'dropout';                      // breakdown before the last chorus
        else if (tpl && tpl.loop) change = r.pick(['ornament', 'layer'].filter(c => c !== prevChange));
        else if (final) change = keyPlan === 'lift' ? 'keyup' : r.pick(['layer', 'reharm']);
        else change = r.pick(['ending', 'ornament', 'layer', 'reharm', gen.interlude ? 'handoff' : 'rest'].filter(c => c !== prevChange && !(c === 'rest' && st.calm)));
        prevChange = change;
      }
      const base = (tpl && tpl.names && tpl.names[s.type]) || null;
      const name = (base || info.name) + (!base && info.name === 'A' ? (counts.A > 1 ? n : '') : counts[s.type] > 1 ? ' ' + n : '');
      const sec = { type: s.type, start, len: s.len, n, name, base, energy, change, prog: progFor[s.type].slice(), color: info.color };
      start += s.len;
      return sec;
    });
    // v2.3: each section's chords as a varied plan (written once per section type and length, so returns match)
    const progCache = {};
    sections.forEach((sec, i) => {
      const lockedHere = (locked && !['P', 'U', 'B'].includes(sec.type)) || (tpl && tpl.verse && sec.prog.length !== 4);
      if (lockedHere) return;
      const next = sections[i + 1] ? sections[i + 1].type : null;
      const k = sec.type + sec.len + '>' + (next || '');
      if (!progCache[k]) progCache[k] = sectionProg(sec.prog, sec.type, sec.len, { r, minor, st: st0, next });
      sec.prog = progCache[k].map(c => Array.isArray(c) ? c.slice() : c);
      if (sec.change === 'reharm') sec.prog = reharmonise(sec.prog, minor, r);
    });
    // v2.3 key plan: choruses (and an outro that follows one) a minor third up; the bar before each move plays the
    // new key's V (bVII of the home key), and the next section simply starts back home
    if (keyPlan === 'chorus3') {
      sections.forEach((sec, i) => {
        const prev = sections[i - 1];
        if (sec.type === 'C' || sec.type === 'D' || (sec.type === 'O' && prev && prev.shift)) sec.shift = 3;
      });
      sections.forEach((sec, i) => {
        const next = sections[i + 1];
        if (sec.shift || !next || !next.shift) return;
        setBar(sec, sec.len - 1, 'b7');
      });
      sections.forEach(sec => { if (sec.change === 'keyup') sec.change = 'layer'; });
    }
    sections.keyPlan = keyPlan;
    return sections;
  }

  // semitones a bar is moved by the key plan (a section's own shift, plus the last-chorus lift from there on)
  function keyShiftAt(gen, bar) {
    if (!gen.sections) return 0;
    const sec = sectionAt(gen.sections, bar);
    let k = sec && sec.shift ? sec.shift : 0;
    const up = gen.sections.find(s => s.change === 'keyup');
    if (up && bar >= up.start) k += 2;
    return k;
  }

  // chords for a section added by hand: copy a section of the same type, otherwise pick for its job
  function progressionFor(gen, type, r, isMinor) {
    const same = (gen.sections || []).find(s => s.type === type);
    if (same) return same.prog.slice();
    const mode = isMinor ? 'minor' : 'major';
    if (type === 'C' || type === 'D' || type === 'L') { const c = (gen.sections || []).find(s => s.type === 'C' || s.type === 'D'); return c ? c.prog.slice() : r.pick(CHORUS[mode]).slice(); }
    if (type === 'P' || type === 'U') return r.pick(PRE[mode]).slice();
    if (type === 'B') return r.pick(BRIDGE[mode]).slice();
    return (gen.progression || [0, 4, 5, 3]).slice();
  }

  const total = sections => sections.reduce((a, s) => a + s.len, 0);
  const sectionAt = (sections, bar) => sections.find(s => bar >= s.start && bar < s.start + s.len) || null;

  // degree of the chord in a bar (outros end on I)
  function degreeAt(gen, bar) {
    const sec = sectionAt(gen.sections, bar) || gen.sections[gen.sections.length - 1];
    if (sec.type === 'O' && bar === sec.start + sec.len - 1) return 0;
    const local = Math.max(0, bar - sec.start);
    return sec.prog[local % sec.prog.length];
  }

  // ---------------------------------------------------------------------------
  // Arrangement by energy
  // ---------------------------------------------------------------------------
  function drums(gen, r, H) {
    const st = H.STYLES[gen.style] || H.STYLES['Pop'];
    const notes = [];
    const add = (p, s, v) => notes.push({ p, s, l: 1, v: Math.max(20, Math.min(127, Math.round(v))) });
    const looping = isLoop(gen, H);
    gen.sections.forEach((sec, si) => {
      const E = sec.energy, next = gen.sections[si + 1] || (looping ? gen.sections[0] : null);
      const build = sec.type === 'P' || sec.type === 'U';
      const rollBars = sec.type === 'U' ? sec.len : build ? Math.min(2, sec.len) : 0;
      for (let bi = 0; bi < sec.len; bi++) {
        const b = sec.start + bi, base = b * 16, lastBar = bi === sec.len - 1;
        const dropHalf = sec.change === 'dropout' && bi < sec.len / 2;
        if (dropHalf) { for (let s = 0; s < 16; s += 4) add(42, base + s, H.humanVel(r, 50, 6)); continue; }
        if (st.calm && E <= 1) { if (bi % 2 === 0) add(81, base + 8, 60); continue; }
        for (const [key, pat] of Object.entries(st.drums)) {
          const p = +key;
          const isKick = p === 35 || p === 36, isHat = [42, 44, 46, 51, 54, 69, 70, 82].includes(p);
          if (E <= 1 && !isHat) continue;                                 // intro/outro: hats only
          if (sec.type === 'K' && isKick) continue;                       // break: no kick
          if (sec.type === 'U' && lastBar && isKick) continue;            // last bar of a build: kick out before the drop
          for (let s = 0; s < 16; s++) {
            let c = pat[s];
            if (E <= 1 && s % 4) continue;
            if (E === 2 && isHat && s % 4) continue;                        // verse: thinner hats
            if (E >= 5 && isHat && c === '.' && s % 2) c = 'o';            // last chorus: busier hats
            if (c === '.') continue;
            let v = c === 'x' ? 104 : 62;
            if (E <= 2) v -= 16; if (E >= 5) v += 6;
            add(p, base + s, H.humanVel(r, v, 8));
          }
        }
        if (bi === 0 && (b > 0 || looping) && E >= 3 && st.crash !== false && !st.calm) add(49, base, 104);                // crash on the downbeat of a big section
        if (E >= 4 && bi % 2 === 1 && !st.drums[46] && st.crash !== false && !st.calm) add(46, base + 14, 70);
        // build: snare roll that speeds up (quarters -> eighths -> sixteenths) and gets louder
        if (rollBars && bi >= sec.len - rollBars) {
          const k = bi - (sec.len - rollBars);
          const third = k / rollBars;
          const step = rollBars === 1 ? 2 : third < 1 / 3 ? 4 : third < 2 / 3 ? 2 : 1;
          for (let s = 0; s < 16; s += step) {
            const t = (k * 16 + s) / (rollBars * 16);
            add(38, base + s, 58 + 64 * t);
          }
        }
        // fill into a section of equal or more energy
        const fillKind = st.fill || 'toms';
        if (lastBar && !build && next && next.energy >= E && E >= 2 && !st.calm && fillKind !== 'none') {
          add(38, base + 12, 100);
          (Array.isArray(fillKind) ? fillKind : fillKind === 'snare' ? [38, 38, 38] : [50, 47, 45]).forEach((tom, i) => add(tom, base + 13 + i, H.humanVel(r, 96, 8)));
        }
      }
    });
    return notes;
  }

  // v2.4 (gap 3): the bass is planned from the chords and checked against the melody.
  //   - octaves follow the line (nearest to the previous note), in the bass instrument's range
  //   - first inversions where they make a stepwise bass line, at the style's rate
  //   - pedal points: a held tonic in intros and outros, a held dominant under builds and some pre-choruses
  //   - a walk-up into a section of equal or more energy
  //   - no parallel octaves or fifths with the melody on the beat
  // ctx: { melodyHome: the melody in home-key pitches (or none), program }
  function bass(gen, r, H, ctx = {}) {
    const A = H.Arrange;
    const st = H.STYLES[gen.style] || H.STYLES['Pop'];
    const notes = [];
    const total_ = total(gen.sections);
    const rg = A.rangeOf(ctx.program != null ? ctx.program : 33);
    const lo = Math.max(rg.lo, 31), hi = Math.min(rg.hi, lo + 21);
    const pcsAt = (b, s = 0) => H.chordPCs(gen.key, gen.scale, H.chordAtStep(degreeAt(gen, b), s), false);
    const split = b => Array.isArray(degreeAt(gen, b));
    const invRate = H.invRate(gen);
    const tonic = ((gen.key % 12) + 12) % 12, dominant = (tonic + 7) % 12;
    const pedalFriendly = st.edm || st.calm || ['Classical', 'Cinematic', 'Gospel', 'Ambient', 'Synthwave', 'Menu / title theme', 'Sci-fi space', 'Dungeon / cave', 'Horror ambience'].includes(gen.style);
    const pedals = new Map();
    gen.sections.forEach(sec => {
      if (st.walk || st.power || sec.change === 'reharm' || sec.len < 4) return;
      let pc = null;
      if ((sec.type === 'I' || sec.type === 'O') && r.chance(pedalFriendly ? 0.6 : 0.2)) pc = tonic;
      else if (sec.type === 'U' && r.chance(0.6)) pc = st.edm && r.chance(0.5) ? tonic : dominant;
      else if (sec.type === 'P' && r.chance(pedalFriendly ? 0.4 : 0.2)) pc = dominant;
      if (pc == null) return;
      // the outro's last bar and the pre-chorus's last bar return to the real chord
      for (let b = sec.start; b < sec.start + sec.len - (sec.type === 'O' || sec.type === 'P' ? 1 : 0); b++) pedals.set(b, pc);
    });
    const { at, plan: bplan } = A.planBass({ bars: total_, pcsAt, split, lo, hi, invRate, r, pedalAt: b => pedals.has(b) ? pedals.get(b) : null });
    let walks = 0;
    const melody = ctx.melodyHome || [];
    const scalePcs = H.scalePcs(gen);
    gen.sections.forEach((sec, si) => {
      const E = sec.energy, next = gen.sections[si + 1];
      for (let bi = 0; bi < sec.len; bi++) {
        const b = sec.start + bi;
        if (E <= 1) continue;
        if (sec.change === 'dropout' && bi < sec.len / 2) continue;
        if (sec.type === 'U' && bi === sec.len - 1) continue;              // silence before the drop
        const pattern = E === 2 ? (sec.type === 'K' && !split(b) ? [[0, 16, 0]] : [[0, 8, 0], [8, 8, 0]]) : st.bass;
        const bar = [];
        pattern.forEach(([s, l, iv], i) => {
          const x = at(b, s);
          let p = A.patternPitch(x, iv);
          if (split(b) && s < 8 && s + l > 8) l = 8 - s;
          // approach note into the next chord's bass (whatever it is: root, inversion or pedal)
          if (E >= 3 && i === pattern.length - 1 && pattern.length > 2 && !x.pedal && r.chance(st.walk ? 0.85 : 0.25)) {
            const nx = at(b + 1, 0);
            if (nx) p = nx.p + (r.chance(0.5) ? -1 : 2);
          }
          const onset = s === x.s;
          const alts = onset ? (x.inv || x.pedal ? [] : [A.bassNote(x.pcs[1], x.p, lo, hi + 5)]) : x.pcs.map(pc => A.bassNote(pc, p, lo, hi + 12)).filter(q => q !== p);
          bar.push({ p, s: b * 16 + s, l, v: H.humanVel(r, (s % 4 === 0 ? 100 : 86) - (E === 2 ? 12 : 0) + (E >= 5 ? 6 : 0), 6), alts: invRate > 0 || !onset ? alts : [] });
        });
        // walk-up into the next section (scale steps up to its first bass note)
        const lastBar = bi === sec.len - 1;
        if (lastBar && next && next.energy >= E && E >= 2 && !st.edm && !st.calm && !st.walk && sec.type !== 'U' && !pedals.has(b) && r.chance(0.55)) {
          const nx = at(b + 1, 0);
          if (nx) {
            const target = nx.p + keyShiftAt(gen, b + 1) - keyShiftAt(gen, b);
            const pool = [];
            for (let q = lo - 12; q <= hi + 12; q++) if (scalePcs.includes(((q % 12) + 12) % 12)) pool.push(q);
            let ti = pool.findIndex(q => q >= target); if (ti < 0) ti = pool.length - 1;
            const fast = (H.STYLES[gen.style] || {}).bpm < 135;
            const steps = fast ? [8, 10, 12, 14] : [8, 12];
            const up = ti - steps.length >= 0 && pool[ti - steps.length] >= lo - 2;
            const walk = steps.map((s, k) => pool[Math.max(0, Math.min(pool.length - 1, up ? ti - steps.length + k : ti + steps.length - k))]);
            for (let k = bar.length - 1; k >= 0; k--) if (bar[k].s - b * 16 >= 8) bar.splice(k, 1);
            bar.forEach(n => { if (n.s - b * 16 < 8 && n.s - b * 16 + n.l > 8) n.l = 8 - (n.s - b * 16); });
            walks++;
            steps.forEach((s, k) => bar.push({ p: walk[k], s: b * 16 + s, l: steps.length === 4 ? 2 : 4, v: H.humanVel(r, 90 + k * 3, 4) }));
          }
        }
        notes.push(...bar);
      }
    });
    const rep = A.fixParallels(notes, melody, t => t % 8 === 0);
    if (ctx.report) Object.assign(ctx.report, { bassParallelsFixed: rep.fixed, bassParallelsLeft: rep.left, pedalBars: pedals.size, inversions: bplan.filter(x => x.inv).length, walkUps: walks });
    return notes;
  }

  // v2.4 (gaps 1 and 2): chords are voice-led from the previous chord (nearest notes, common tones held, smooth top
  // voice, inversions as they fall out), in a lane under the melody's lowest note in that bar and inside the
  // instrument's range. Big sections spread the voicing open; the fullest add the bottom note an octave down.
  function chords(gen, r, H, ctx = {}) {
    const A = H.Arrange;
    const st = H.STYLES[gen.style] || H.STYLES['Pop'];
    const notes = [];
    const program = ctx.program != null ? ctx.program : 0;
    const rg = A.rangeOf(program);
    const prof = A.melodyProfile(ctx.melodyHome || [], total(gen.sections), gen.sections, null);
    let prev = null;
    gen.sections.forEach(sec => {
      const E = sec.energy;
      for (let bi = 0; bi < sec.len; bi++) {
        const b = sec.start + bi;
        const cell = degreeAt(gen, b), two = Array.isArray(cell) && cell.length > 1;
        const lane = A.laneUnder(prof, b, program, 1, st.power ? 40 : 45);
        const voices = {};
        const voice = s => {
          const k = two && s >= 8 ? 1 : 0;
          if (voices[k]) return voices[k];
          const pcs = H.chordPCs(gen.key, gen.scale, H.chordAtStep(cell, s), st.sevenths);
          let pitches;
          if (st.power) pitches = A.voicePower(pcs[0], prev, Math.max(rg.lo, 40), Math.min(lane.hi, 66));
          else pitches = A.voiceLead(pcs, prev, { lo: lane.lo, hi: lane.hi, open: E >= 4, center: lane.hi - 7 });
          prev = pitches;
          let out = pitches;
          if (E >= 5 && !st.power && pitches[0] - 12 >= Math.max(rg.lo, 40)) out = [pitches[0] - 12].concat(pitches);   // fullest: double the bottom
          return (voices[k] = out);
        };
        let rhythm = E <= 1 ? [[0, 16]] : st.chordRhythm;
        // two chords in the bar: every hit belongs to one half, and the second chord gets a hit on beat 3
        if (two) {
          rhythm = rhythm.map(([s, l]) => [s, s < 8 ? Math.min(l, 8 - s) : l]);
          if (!rhythm.some(([s]) => s === 8)) {
            const after = rhythm.filter(([s]) => s > 8).map(([s]) => s);
            rhythm = rhythm.concat([[8, after.length ? Math.min(...after) - 8 : 8]]).sort((a, c) => a[0] - c[0]);
          }
        }
        const base = E <= 1 ? 55 : E === 2 ? 62 : E === 3 ? 70 : 76;
        for (const [s, l] of rhythm) for (const p of voice(s)) notes.push({ p, s: b * 16 + s, l, v: H.humanVel(r, base + (s % 4 === 0 ? 6 : 0), 5) });
      }
    });
    return notes;
  }

  // the hook riff only plays in the hook sections, intro and outro
  function riffFilter(gen, notes) {
    return notes.filter(n => { const sec = sectionAt(gen.sections, Math.floor(n.s / 16)); return sec && ['I', 'O', 'C', 'D', 'A', 'L'].includes(sec.type); });
  }

  // key changes: the final-chorus lift (everything pitched from that section on moves up) and sections in another key
  function keyUp(gen, notes) {
    if (!gen.sections.some(s => s.change === 'keyup' || s.shift)) return notes;
    return notes.map(n => { const k = keyShiftAt(gen, Math.floor(n.s / 16)); return k ? Object.assign({}, n, { p: Math.max(0, Math.min(127, n.p + k)) }) : n; });
  }

  // ---------------------------------------------------------------------------
  // Melody per section
  // ---------------------------------------------------------------------------
  const KIND = { V: 'verse', K: 'break', P: 'pre', U: 'pre', C: 'hook', D: 'hook', A: 'hook', B: 'bridge', S: 'solo', I: 'none', O: 'outro', L: 'none' };

  function melody(gen, r, H) {
    const M = Melody._;
    const st = H.STYLES[gen.style] || H.STYLES['Pop'];
    const h = H.harmony(gen);
    const form = gen.form && gen.form !== 'auto' ? gen.form : r.pick(['sentence', 'period', 'call']);
    const leap = typeof gen.leap === 'number' ? gen.leap : 0.35;
    // v2.3: every section job gets its own 2-bar idea; they are related by rhythm, not copies of the hook
    const hookCell = gen.hookMotif ? M.copy(gen.hookMotif) : Melody.makeMotif(st, r, leap);
    const hook = M.makeIdea(st, r, leap, hookCell);
    const verseOp = r.pick(['sequenceDown', 'rhythmShift', 'changeEnding']);
    const verseM = gen.hookMotif ? M.makeIdea(st, r, leap, M.VARY[verseOp](M.copy(hookCell), r)) : M.makeIdea(st, r, leap);
    // the verse's second 8 bars: a new idea that keeps only the first bar's rhythm
    const verse2M = (() => {
      const c = Melody.makeMotif(st, r, leap);
      c.rhythm = verseM.rhythm.filter(([s]) => s < 16).map(x => x.slice());
      c.moves = c.rhythm.map((_, i) => i === 0 ? 0 : r.pick([-2, -1, 1, 2, 0, 3, -3]));
      return M.makeIdea(st, r, leap, c);
    })();
    const bridgeM = M.makeIdea(st, r, leap, M.VARY.invert(Melody.makeMotif(st, r, leap)));
    bridgeM.text = null; bridgeM.phrase = false;
    const preM = Melody.makeMotif(st, r, leap);                     // its own short cell, sequenced upward
    const soloM = Object.assign(M.VARY.ornament(M.VARY.invert(M.copy(hook))), { text: null, phrase: false, idea: true });   // hook rhythm, new pitches
    const shiftH = start => ({ key: h.key, scale: h.scale, leap: h.leap, chordAt: (b, s) => h.chordAt(b + start, s) });
    const newKinds = marks => marks.forEach(k => { if (k.kind === 'motif' || k.kind === 'vary' || k.kind === 'frag') { k.kind = 'new'; k.phrase = false; k.label = k.label.replace(/^Idea/, 'Second idea').replace(/^Call/, 'Second call').replace(/^Motif/, 'New cell'); } });

    // one section of melody in local bars 0..len-1
    function write(kind, m, hs, len, rr) {
      const pool = M.makePool(hs, 60, 84);
      let anchor = M.nearestIdx(pool, 67 + (hs.key % 12 > 6 ? hs.key - 12 : hs.key));
      if (kind === 'bridge') anchor = M.clampIdx(pool, anchor - 2);
      if (kind === 'hook' || kind === 'solo') anchor = M.clampIdx(pool, anchor + (kind === 'solo' ? 4 : 2));
      const out = [], marks = [];
      const vel = (st.melodyVel || 90) + (kind === 'hook' ? 6 : kind === 'solo' ? 8 : 0);
      let b = 0, p = 0;
      // 8-bar phrases on 2-bar ideas (the pre-chorus keeps short rising 4-bar steps)
      if (kind !== 'pre') {
        while (b + 8 <= len) {
          const last = b + 8 > len - 4;
          let f = form, mm = m, second = false;
          if (kind === 'hook') f = p % 2 === 0 ? 'period' : (form === 'period' ? 'sentence' : form);
          if (kind === 'verse' && p % 2 === 1) { mm = verse2M; second = true; }
          const o = { vel, open: kind === 'bridge' || !last, cells: st.cells };
          const res = M.buildPhrase8(f, mm, pool, hs, b, anchor, rr, o, st);
          if (second) newKinds(res.marks);
          out.push(...res.notes); marks.push(...res.marks);
          anchor = res.end; b += 8; p++;
        }
      }
      // what is left in 4-bar phrases on the idea's first bar
      const cell = { rhythm: m.rhythm.filter(([s]) => s < 16), moves: m.moves.slice(0, m.rhythm.filter(([s]) => s < 16).length), shift: 0, text: m.text ? m.text.slice(0, m.rhythm.filter(([s]) => s < 16).length) : null, phrase: !!m.phrase };
      for (; b + 4 <= len; b += 4, p++) {
        const lastP = b + 4 > len - 4;
        let f = form, mm = cell;
        const o = { vel, open: !lastP, cells: st.cells };
        // pre-chorus: its cell, then a fresh cell a step higher (it climbs without saying the same thing twice)
        if (kind === 'pre') { f = 'sentence'; mm = Object.assign(p % 2 ? M.freshCell(st, rr, leap) : M.copy(cell), { shift: p + 1 }); o.open = true; }
        if (kind === 'bridge') o.open = true;
        const res = M.buildPhrase(f, mm, pool, hs, b, anchor, rr, o);
        if (kind === 'pre' && p % 2) newKinds(res.marks);
        out.push(...res.notes); marks.push(...res.marks);
        anchor = res.end;
      }
      for (; b < len; b++) out.push(...M.realize(M.VARY.changeEnding(cell, rr), pool, hs, b, anchor, rr, { vel: st.melodyVel || 90 }).notes);
      return { notes: Melody.limitLeaps(out.filter(n => n.s < len * 16).map(n => Object.assign(n, { l: Math.min(n.l, len * 16 - n.s) })), hs), marks };
    }
    // best of several candidates
    function best(kind, m, hs, len) {
      let top = null;
      for (let i = 0; i < 10; i++) {
        const c = write(kind, m, hs, len, H.rng(Math.floor(r() * 4294967296)));
        const sc = Melody.scoreMelody(c.notes, hs, len).total;
        if (!top || sc > top.sc) top = Object.assign(c, { sc });
      }
      secScores.push([top.sc, len]);
      return top;
    }
    const secScores = [];
    const clone = x => ({ notes: x.notes.map(n => Object.assign({}, n)), marks: x.marks.map(k => Object.assign({}, k)) });
    // strong-beat notes that clash with the chord under them move to the nearest chord tone
    function fitChords(x, hs, len) {
      for (const n of x.notes) {
        if (n.s % 8 !== 0) continue;
        const pcs = hs.chordAt(Math.floor(n.s / 16), n.s % 16);
        if (pcs.includes(n.p % 12)) continue;
        let bestP = n.p, bd = 99;
        for (let d = -2; d <= 2; d++) if (pcs.includes(((n.p + d) % 12 + 12) % 12) && Math.abs(d) < bd) { bd = Math.abs(d); bestP = n.p + d; }
        n.p = bestP;
      }
      return x;
    }

    // the one change of a return
    function applyChange(sec, x, hs) {
      const len = sec.len;
      const pool = M.makePool(hs, 36, 96);
      if (sec.change === 'ending') {
        const lastBar = (len - 1) * 16;
        const keep = x.notes.filter(n => n.s < lastBar);
        const prev = keep.length ? keep[keep.length - 1] : x.notes[0];
        const cad = M.cadence(M.makePool(hs, 60, 84), hs, len - 1, M.nearestIdx(M.makePool(hs, 60, 84), prev.p), r, { vel: (st.melodyVel || 90) + 4, open: false, cells: st.cells });
        x.notes = Melody.limitLeaps(keep.concat(cad.notes), hs);
      } else if (sec.change === 'ornament') {
        const tail = (len - 2) * 16, add = [];
        const ns = x.notes.slice().sort((a, b) => a.s - b.s);
        for (let i = 0; i < ns.length - 1; i++) {
          const a = ns[i], b = ns[i + 1];
          if (a.s < tail || a.l < 2 || b.s - a.s < 2) continue;
          const ia = M.nearestIdx(pool, a.p), ib = M.nearestIdx(pool, b.p);
          if (Math.abs(ib - ia) !== 2) continue;
          const half = Math.floor(a.l / 2);
          add.push({ p: pool[(ia + ib) / 2], s: a.s + half, l: a.l - half, v: Math.max(20, a.v - 10) });
          a.l = half;
        }
        x.notes = x.notes.concat(add);
      } else if (sec.change === 'layer') {
        x.notes = x.notes.concat(x.notes.filter(n => n.p - 12 >= 48).map(n => ({ p: n.p - 12, s: n.s, l: n.l, v: Math.round(n.v * 0.7) })));
      } else if (sec.change === 'reharm') {
        fitChords(x, hs, len);
      } else if (sec.change === 'rest' || sec.change === 'handoff') {
        // the voice drops out for the first 4 bars (with a lead in the band, it plays them instead)
        x.notes = x.notes.filter(n => n.s >= Math.min(4, len - 1) * 16);
      }
      return x;
    }
    // no two passes identical: small timing-free velocity drift on every return (Uematsu's "fluctuations")
    const drift = x => { x.notes.forEach(n => { n.v = Math.max(20, Math.min(127, n.v + Math.round((r() * 2 - 1) * 6))); }); return x; };

    const cache = {};
    const notes = [], marks = [];
    let hookSec = null;
    gen.sections.forEach(sec => {
      const kind = KIND[sec.type];
      const hs = shiftH(sec.start);
      let x = null, label = '';
      if (kind === 'none') return;
      if (kind === 'outro') {
        // tag: the last line of the hook section, then silence
        if (hookSec && cache[hookSec.type]) {
          const src = cache[hookSec.type];
          const from = Math.max(0, hookSec.len - 2) * 16;
          x = { notes: src.notes.filter(n => n.s >= from).map(n => Object.assign({}, n, { s: n.s - from })).filter(n => n.s < sec.len * 16), marks: [] };
          label = 'tag: last line of the ' + (hookSec.type === 'A' ? 'A section' : SECTION[hookSec.type].name.toLowerCase());
        } else return;
      } else if (kind === 'break') {
        // the hook's head, stated quietly once, then its rhythm on new notes halfway
        x = { notes: [], marks: [] };
        const pool = M.makePool(hs, 60, 84);
        const res = M.realize(M.head(hook), pool, hs, 0, M.nearestIdx(pool, 72), r, { vel: (st.melodyVel || 90) - 24 });
        x.notes.push(...res.notes); x.marks.push({ bar: 0, kind: 'frag', label: 'Hook head, quiet', phrase: !!hook.phrase });
        if (sec.len >= 12) {
          const half = Math.floor(sec.len / 2);
          const res2 = M.realize(M.VARY.invert(M.head(hook)), pool, hs, half, res.end, r, { vel: (st.melodyVel || 90) - 28 });
          x.notes.push(...res2.notes); x.marks.push({ bar: half, kind: 'new', label: 'Hook rhythm, turned upside down' });
        }
        label = 'hook fragments';
      } else if (kind === 'solo') {
        x = best('solo', soloM, hs, sec.len);
        label = 'hook rhythm, new notes, higher';
      } else {
        const key = sec.type + sec.len;
        const m = kind === 'hook' ? hook : kind === 'bridge' ? bridgeM : kind === 'pre' ? preM : verseM;
        if (!cache[key]) { cache[key] = best(kind, m, hs, sec.len); x = clone(cache[key]); if (kind === 'hook') { hookSec = sec; cache[sec.type] = cache[key]; } }
        else {
          x = drift(clone(cache[key]));
          if (kind === 'verse' && sec.len >= 8) {
            // a returning verse keeps its first half and gets a new second half (new words, new notes)
            const half = Math.floor(sec.len / 2 / 4) * 4 || 4;
            const fresh = best(kind, m, hs, sec.len);
            x.notes = x.notes.filter(n => n.s < half * 16).concat(fresh.notes.filter(n => n.s >= half * 16).map(n => Object.assign({}, n)));
            x.marks = x.marks.filter(k => k.bar < half).concat(fresh.marks.filter(k => k.bar >= half).map(k => Object.assign({}, k)));
            x.notes = Melody.limitLeaps(x.notes, hs);
            label = CHANGE_NAMES.newhalf;
          } else if (sec.change) { x = applyChange(sec, x, hs); label = CHANGE_NAMES[sec.change]; }
          else label = kind === 'verse' ? 'same music' : 'exact repeat';
          x.marks.forEach(k => { if (sec.change === 'ending' && k.bar === sec.len - 1) k.label = 'New ending'; });
        }
        if (kind === 'hook' && !label && gen.hookMotif) label = 'your phrase as the title';
        if (kind === 'verse' && !label && gen.hookMotif) label = 'phrase varied: ' + M.OP_NAMES[verseOp];
        if (kind === 'bridge' && !label) label = 'new contrasting idea';
        if (kind === 'pre' && !label) label = 'its own cell, rising';
      }
      fitChords(x, hs, sec.len);
      x.notes.forEach(n => { n.s += sec.start * 16; notes.push(n); });
      if (!x.marks.length) x.marks.push({ bar: 0, kind: kind === 'outro' ? 'cad' : 'vary', label: label });
      x.marks.forEach((k, i) => marks.push(Object.assign(k, { bar: k.bar + sec.start }, i === 0 ? { section: sec.name + (label ? ' (' + label + ')' : '') } : {})));
    });
    // section joins: move a whole section an octave if that makes the step into it smaller, then keep every jump within the leap setting
    const max = Melody.maxLeap(leap);
    let prevLast = null;
    gen.sections.forEach(sec => {
      const inSec = notes.filter(n => n.s >= sec.start * 16 && n.s < (sec.start + sec.len) * 16).sort((a, b) => a.s - b.s || b.p - a.p);
      if (!inSec.length) return;
      if (prevLast != null) {
        const d = inSec[0].p - prevLast;
        if (Math.abs(d) > max) {
          const k = -12 * Math.sign(d);
          const tops = inSec.filter(n => !inSec.some(o => o.s === n.s && o.p > n.p));
          const lo = Math.min(...tops.map(n => n.p)) + k, hi = Math.max(...tops.map(n => n.p)) + k;
          if (Math.abs(d + k) < Math.abs(d) && lo >= 55 && hi <= 88) inSec.forEach(n => n.p += k);
        }
      }
      const last = inSec.reduce((a, n) => n.s > a.s || (n.s === a.s && n.p > a.p) ? n : a, inSec[0]);
      prevLast = last.p;
    });
    Melody.limitLeaps(notes, h);
    const totalBars = total(gen.sections);
    const score = Melody.scoreMelody(notes, h, totalBars);
    // v2.3: the song's score is the length-weighted mean of its sections' scores (repeats are meant to repeat)
    if (secScores.length) { const w = secScores.reduce((a, [, l]) => a + l, 0); score.total = secScores.reduce((a, [s, l]) => a + s * l, 0) / w; }
    // how much of the sung melody states one of the ideas (2-bar ideas cover two bars)
    const motifBars = new Set();
    marks.forEach(k => { if (k.kind === 'motif' || k.kind === 'vary' || k.kind === 'frag') { motifBars.add(k.bar); if (/^(Idea|Call: idea|Call again)/.test(k.label)) motifBars.add(k.bar + 1); } });
    const sung = new Set(notes.filter(n => n.s < totalBars * 16).map(n => Math.floor(n.s / 16)));
    const motifShare = sung.size ? [...motifBars].filter(b => sung.has(b)).length / sung.size : 0;
    return { notes: notes.filter(n => n.s < totalBars * 16), marks, form, score, motifShare };
  }

  function describe(gen, bpm, H) {
    const bars = total(gen.sections);
    const secs = Math.round(bars * 4 * 60 / bpm);
    const tpl = templateOf(gen);
    const kp = gen.sections.some(s => s.shift) ? ' · choruses a minor third up' : gen.sections.some(s => s.change === 'keyup') ? ' · last chorus up a step' : '';
    return `${tpl ? tpl.name : styleForm(gen, H).name}: ` + gen.sections.map(s => `${s.name} ${s.len}`).join(' · ') + ` (${bars} bars, ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}${kp})`;
  }

  const api = { FORMS, styleForm, isLoop, fitLoop, TEMPLATES, SECTION, CHANGE_NAMES, plan, progressionFor, total, sectionAt, degreeAt, drums, bass, chords, melody, riffFilter, keyUp, keyShiftAt, KEY_PLANS, describe };
  if (NODE) module.exports = api;
  else root.SongForm = api;
})(this);
