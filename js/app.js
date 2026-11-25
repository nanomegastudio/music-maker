// MIDI Music Maker - UI, piano roll, sequencer
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#f78c6b', '#83e377', '#ff8fab', '#7aa2ff', '#e0c3fc'];
  const TOP = 108, BOTTOM = 21;                 // piano roll range (A0..C8)
  const RULER = 42, LANE = 24;        // ruler: section lane on top, chord lane under it
  const STORAGE_KEY = 'midi-music-maker-song-v1';

  const engine = new AudioEngine();
  let song = null;
  let selTrackId = null;
  let nextId = 1;
  let undoStack = [], redoStack = [];

  // view state
  const view = { scrollX: 0, scrollY: 0, stepW: 22, rowH: 14, drumRowH: 24, follow: true };
  let selection = new Set();      // selected note objects of current track
  let playing = false, playStart = 0;
  let needsDraw = true;
  let octave = 3;

  // =========================================================================
  // Song model
  // =========================================================================
  function newTrack(opts = {}) {
    const id = nextId++;
    return Object.assign({
      id, name: opts.drum ? 'Drums' : 'Track ' + id, program: 0, drum: false, volume: 0.8, pan: 0,
      mute: false, solo: false, color: COLORS[(id - 1) % COLORS.length], role: null, notes: []
    }, opts, { id });
  }

  function emptySong() {
    return {
      name: 'Untitled', bpm: 120, bars: 8, beatsPerBar: 4, stepsPerBeat: 4, swing: 0, gen: null,
      tracks: [newTrack({ name: 'Piano', program: 0 }), newTrack({ name: 'Drums', drum: true })]
    };
  }

  // BPM / Bars / Swing in the top bar: 'auto' lets the style decide on Generate; once you set one it is kept
  const keep = { bpm: false, bars: false, swing: false };
  const KEEP_TIPS = {
    bpm: ['Auto: Generate uses the style\'s tempo. Click to keep your BPM instead.', 'Kept: Generate uses your BPM. Click to let the style choose again.'],
    bars: ['Auto: Generate uses the structure\'s length. Click to keep your bar count instead.', 'Kept: Generate builds the song to exactly this many bars (sections are scaled to fit). Click to let the structure decide again.'],
    swing: ['Auto: Generate uses the style\'s swing. Click to keep your swing instead.', 'Kept: Generate uses your swing. Click to let the style choose again.']
  };
  function setKeep(k, on) {
    keep[k] = !!on;
    const b = document.querySelector(`button.keep[data-keep="${k}"]`);
    if (!b) return;
    b.classList.toggle('on', keep[k]);
    b.textContent = keep[k] ? '🔒 kept' : 'auto';
    b.title = KEEP_TIPS[k][keep[k] ? 1 : 0];
  }

  // the loop length box: only shown when Length is Loop
  const loopBarsValue = () => Math.max(1, Math.min(256, Math.round(+$('inLoopBars').value) || 8));
  const loopBarsShown = () => $('selLength').value === 'loop';
  function showLoopBars() {
    const on = loopBarsShown();
    $('loopBarsLabel').style.display = on ? '' : 'none';
    $('loopBarsLabel').title = 'How many bars the loop is. Every part is written to repeat seamlessly over exactly this many bars.';
  }

  function generatedSong(seed) {
    const style = $('selStyle').value, key = +$('selKey').value, scale = $('selScale').value;
    const full = $('selLength').value === 'full';
    const kb = keep.bars ? Math.max(1, Math.min(256, Math.round(+$('inBars').value) || 8)) : 0;
    const bars = loopBarsValue();   // a loop is as long as the Loop bars box (top-bar Bars edits copy into it)
    const phrase = $('inPhrase').value.trim(), form = $('selForm').value;
    const keepOff = song && song.drumOff ? song.drumOff.slice() : [];
    const g = Generator.generateSong({ key, scale, style, bars, seed, phrase, form, hookTrack: $('chkHook').checked, full, leap: leapValue(), drumOff: keepOff, structure: $('selStructure').value, instruments: +$('inInstruments').value || 4, progression: $('selProg').value, pack: $('selPack').value, loopBars: loopBarsShown() ? loopBarsValue() : 0, fitBars: full && kb ? kb : 0, keyPlan: $('selKeyPlan').value });
    nextId = 1;
    const name = `${style} in ${GM.NOTE_NAMES[key]} ${scale.toLowerCase()}`;
    return {
      name, bpm: keep.bpm ? Math.max(30, Math.min(300, +$('inBpm').value || g.bpm)) : g.bpm, bars: g.bars, beatsPerBar: 4, stepsPerBeat: 4,
      swing: keep.swing ? +$('inSwing').value || 0 : g.swing, gen: g.gen, drumOff: keepOff,
      tracks: g.tracks.map(t => newTrack(Object.assign(t, t.role === 'riff' ? { name: 'Hook: ' + (phrase.length > 22 ? phrase.slice(0, 21) + '…' : phrase) } : {}, { volume: ROLE_VOL[t.role] || 0.8 })))
    };
  }

  const ROLE_VOL = { chords: 0.6, melody: 0.85, riff: 0.65, drums: 0.8, bass: 0.8, harmony: 0.55, counter: 0.6, pad: 0.45, arp: 0.5, lead: 0.7 };
  const FOLLOWERS = ['harmony', 'counter', 'lead'];      // parts written from the melody
  const melodyCtx = () => { const m = song.tracks.find(t => t.role === 'melody'); return { melody: m ? m.notes : [] }; };
  // when the melody changes, the parts that follow it are rewritten to match
  function refreshFollowers(gen) {
    let n = 0;
    song.tracks.forEach(t => {
      if (!FOLLOWERS.includes(t.role)) return;
      t.notes = applySectionOctaves(t, Generator.generatePart(t.role, gen, song.bars, (Date.now() ^ (t.id * 7919)) >>> 0, melodyCtx()));
      n++;
    });
    return n;
  }

  const songSteps = () => song.bars * 16;
  const curTrack = () => song.tracks.find(t => t.id === selTrackId) || song.tracks[0];

  function snapshot() { return JSON.stringify(song); }
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 150) undoStack.shift();
    redoStack = [];
  }
  function restore(json) {
    song = JSON.parse(json);
    nextId = Math.max(0, ...song.tracks.map(t => t.id)) + 1;
    if (!song.tracks.some(t => t.id === selTrackId)) selTrackId = song.tracks[0] && song.tracks[0].id;
    selection.clear();
    if (song.gen && $('selPack')) $('selPack').value = song.gen.pack && Generator.PACKS[song.gen.pack] ? song.gen.pack : 'auto';
    syncAll();
  }
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); status('Undone.'); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); status('Redone.'); }

  let saveTimer = null;
  function changed(opts = {}) {
    indexDirty = true;
    needsDraw = true;
    if (opts.tracks) renderTracks(); else updatePreviews();
    clearTimeout(saveTimer);
    if (!opts.quiet) markDirty();
    saveTimer = setTimeout(persistSession, 400);
  }

  // =========================================================================
  // Status / helpers
  // =========================================================================
  let statusTimer = null;
  function status(msg, sticky) {
    $('status').textContent = msg;
    clearTimeout(statusTimer);
    if (!sticky) statusTimer = setTimeout(engineStatus, 5000);
  }
  function engineStatus() {
    let msg;
    if (engine.mode === 'midi') msg = engine.midiOut ? `Sending to MIDI device: ${engine.midiOut.name}` : 'No MIDI output selected.';
    else if (engine.mode === 'synth') msg = 'Built-in synth (works offline).';
    else {
      const l = engine.loadingCount(), f = engine.failedCount();
      msg = l ? `Loading ${l} instrument sample set${l > 1 ? 's' : ''}…` :
        f ? `Couldn't download ${f} instrument${f > 1 ? 's' : ''} (offline?). Using the built-in synth for those.` :
          'Sampled General MIDI instruments ready.';
    }
    $('status').textContent = msg;
  }
  engine.onStatus = () => { engineStatus(); renderLoadingBadges(); };

  function download(name, data, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const safeName = s => (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Untitled';
  const audible = t => !t.mute && (!song.tracks.some(x => x.solo) || t.solo);

  // =========================================================================
  // Track panel
  // =========================================================================
  function instrumentOptions(selected) {
    let html = '';
    GM.GM_FAMILIES.forEach((fam, fi) => {
      html += `<optgroup label="${fam}">`;
      for (let i = fi * 8; i < fi * 8 + 8; i++) html += `<option value="${i}"${i === selected ? ' selected' : ''}>${i + 1} ${GM.GM_NAMES[i]}</option>`;
      html += '</optgroup>';
    });
    return html;
  }

  function renderTracks() {
    const list = $('trackList');
    list.innerHTML = '';
    for (const t of song.tracks) {
      const el = document.createElement('div');
      el.className = 'track' + (t.id === selTrackId ? ' sel' : '');
      el.style.setProperty('--c', t.color);
      el.dataset.id = t.id;
      el.innerHTML = `
        <div class="row">
          <input class="name" value="${t.name.replace(/"/g, '&quot;')}" spellcheck="false">
          <button class="sm dice" title="Generate a new ${t.drum ? 'beat' : t.role === 'riff' ? 'hook from your phrase' : (t.role || 'melody')} for this track">🎲</button>
          <button class="sm m${t.mute ? ' on' : ''}" title="Mute">M</button>
          <button class="sm s${t.solo ? ' on' : ''}" title="Solo">S</button>
          <button class="sm del" title="Delete track">✕</button>
        </div>
        <div class="row">
          ${t.drum ? '<span class="kit">🥁 Drum kit (GM channel 10)</span><button class="sm dsounds" title="Choose which drum sounds the generator may use">Sounds…</button>' : `<select class="inst">${instrumentOptions(t.program)}</select>`}
          <span class="loading"></span>
        </div>
        <div class="row">
          <span title="Volume">🔊</span><input class="vol" type="range" min="0" max="1" step="0.01" value="${t.volume}">
          <span title="Pan">↔</span><input class="pan" type="range" min="-1" max="1" step="0.05" value="${t.pan || 0}" style="width:60px">
        </div>
        <canvas class="preview" width="280" height="26"></canvas>`;
      const q = s => el.querySelector(s);
      el.addEventListener('mousedown', e => { if (!/^(INPUT|SELECT|BUTTON|OPTION)$/.test(e.target.tagName)) selectTrack(t.id); });
      el.addEventListener('focusin', () => { if (selTrackId !== t.id) selectTrack(t.id, true); });
      q('.name').addEventListener('change', e => { pushUndo(); t.name = e.target.value || 'Track'; changed(); updateEditorTitle(); });
      q('.name').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });
      q('.m').addEventListener('click', () => { t.mute = !t.mute; changed({ tracks: true }); });
      q('.s').addEventListener('click', () => { t.solo = !t.solo; changed({ tracks: true }); });
      q('.del').addEventListener('click', e => { e.stopPropagation(); deleteTrack(t.id); });
      q('.dice').addEventListener('click', e => { e.stopPropagation(); regeneratePart(t); });
      if (q('.dsounds')) q('.dsounds').addEventListener('click', e => { e.stopPropagation(); openDrumSounds(); });
      q('.vol').addEventListener('input', e => { t.volume = +e.target.value; engine.bus(t); midiMix(); changed(); });
      q('.pan').addEventListener('input', e => { t.pan = +e.target.value; engine.bus(t); midiMix(); changed(); });
      q('.pan').addEventListener('dblclick', e => { t.pan = 0; e.target.value = 0; engine.bus(t); changed(); });
      const inst = q('.inst');
      if (inst) inst.addEventListener('change', e => {
        pushUndo();
        t.program = +e.target.value;
        engine.loadProgram(t.program);
        midiMix();
        changed();
        engine.play(t, channelOf(t), 60, 100, engine.now, 0.5);
      });
      list.appendChild(el);
    }
    updatePreviews();
    renderLoadingBadges();
    updateEditorTitle();
  }

  function renderLoadingBadges() {
    document.querySelectorAll('.track').forEach(el => {
      const t = song.tracks.find(x => x.id === +el.dataset.id);
      if (!t) return;
      const s = !t.drum && engine.mode === 'sampled' && engine.samples[t.program];
      el.querySelector('.loading').textContent = s ? (s.status === 'loading' ? 'loading…' : s.status === 'error' ? 'synth' : '') : '';
    });
  }

  function updatePreviews() {
    document.querySelectorAll('.track').forEach(el => {
      const t = song.tracks.find(x => x.id === +el.dataset.id);
      const c = el.querySelector('canvas.preview');
      if (!t || !c) return;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      if (!t.notes.length) return;
      let lo = 127, hi = 0;
      for (const n of t.notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
      const range = Math.max(12, hi - lo + 1), steps = songSteps();
      g.fillStyle = t.color;
      g.globalAlpha = t.mute ? 0.3 : 0.9;
      for (const n of t.notes) {
        if (n.s >= steps) continue;
        const x = n.s / steps * c.width, w = Math.max(1, n.l / steps * c.width - 0.5);
        const y = (1 - (n.p - lo + 1) / range) * (c.height - 3) + 1;
        g.fillRect(x, y, w, 2);
      }
    });
  }

  function selectTrack(id, keepFocus) {
    if (selTrackId === id) return;
    selTrackId = id;
    selection.clear();
    document.querySelectorAll('.track').forEach(el => el.classList.toggle('sel', +el.dataset.id === id));
    updateEditorTitle();
    scrollToNotes();
    needsDraw = true;
    if ($('selSecScope').value === 'track') renderSections();
    if (!keepFocus && document.activeElement) document.activeElement.blur();
  }

  function updateEditorTitle() {
    const t = curTrack();
    if (!t) return;
    $('edTitle').textContent = t.drum ? `🥁 ${t.name} – drum sequencer` : `🎹 ${t.name} – ${GM.GM_NAMES[t.program]}`;
    $('edTitle').style.color = t.color;
    // drum tracks get the drum sounds button right in the editor bar
    $('btnEdDrumSounds').style.display = t.drum ? '' : 'none';
    ['btnAnswer', 'btnRepitch'].forEach(id => { $(id).style.display = t.drum ? 'none' : ''; });
  }

  function addTrack(drum) {
    pushUndo();
    const t = drum ? newTrack({ drum: true, name: 'Drums' }) : newTrack({ program: 0 });
    song.tracks.push(t);
    selTrackId = t.id;
    if (!drum) engine.loadProgram(t.program);
    changed({ tracks: true });
    scrollToNotes();
  }

  function deleteTrack(id) {
    pushUndo();
    song.tracks = song.tracks.filter(t => t.id !== id);
    if (!song.tracks.length) song.tracks.push(newTrack({ name: 'Piano' }));
    if (selTrackId === id) selTrackId = song.tracks[0].id;
    selection.clear();
    changed({ tracks: true });
    status('Track deleted. Ctrl+Z brings it back.');
  }

  function currentGen() {
    const key = +$('selKey').value, scale = $('selScale').value, style = $('selStyle').value;
    const form = $('selForm').value;
    const g = song.gen;
    const leap = leapValue(), drumOff = (song.drumOff || []).slice();
    if (g && g.key === key && g.scale === scale) return Object.assign({}, g, { style, form, leap, drumOff });
    return Object.assign(Generator.makeGen({ key, scale, style, form, leap, seed: Date.now() }), { drumOff }, g ? { phrase: g.phrase, hookMotif: g.hookMotif, sections: g.sections } : {});
  }

  const FORM_NAMES = { sentence: 'sentence', period: 'period (question/answer)', call: 'call & response' };
  function melodyReport() {
    const m = Generator.lastInfo.melody;
    if (!m) return '';
    const p = m.score.parts;
    return `Melody${m.fromPhrase ? ' built from your phrase' : ''}: ${FORM_NAMES[m.form] || m.form}, best of ${m.candidates} candidates${m.sections ? ' per section' : ''} (score ${Math.round(m.score.total * 100)}/100: ` +
      `${Math.round(p.chordTones * 100)}% chord tones on strong beats, ${p.arch >= 0.5 ? 'arch-shaped' : 'flat'} phrases, ${p.ending ? 'ends home' : 'ends open'}` +
      `${typeof m.motifShare === 'number' ? `, ideas in ${Math.round(m.motifShare * 100)}% of sung bars` : ''}).`;
  }
  function riffReport() {
    const i = Generator.lastInfo.riff || Generator.lastInfo.phrase;
    if (!i) return '';
    const cut = i.used && i.used < i.total ? ` Only the first ${i.used} of ${i.total} syllables fit in the one-bar motif.` : '';
    return `Phrase: ${i.syllables} (${i.mode === 'question' ? 'question, so it ends high' : i.mode === 'exclaim' ? 'exclamation, ends high' : 'statement, falls home'}).${cut}`;
  }

  // A. the phrase becomes the melody's core motif (and optionally a looping hook track)
  function makeHook() {
    const text = $('inPhrase').value.trim();
    if (!text) { status('Type a phrase first, for example “Where did you go last night?”'); $('inPhrase').focus(); return; }
    const gen = Object.assign(currentGen(), {});
    if (!Generator.usePhrase(gen, text, Date.now() >>> 0)) { status('That phrase is too short to make a motif. Try a few words.'); return; }
    pushUndo();
    song.gen = gen;
    // rebuild the melody from the phrase
    let mel = song.tracks.find(x => x.role === 'melody');
    if (!mel) {
      mel = newTrack({ name: 'Melody', role: 'melody', program: Generator.programFor('melody', gen), volume: 0.85 });
      song.tracks.push(mel);
      if (engine.mode === 'sampled') engine.loadProgram(mel.program);
    }
    mel.notes = applySectionOctaves(mel, Generator.generatePart('melody', gen, song.bars, (Date.now() ^ 0x5bd1) >>> 0));
    mel.marks = Generator.lastInfo.melody && Generator.lastInfo.melody.marks;
    refreshFollowers(gen);
    // optional looping hook track
    if ($('chkHook').checked) {
      let t = song.tracks.find(x => x.role === 'riff');
      if (!t) {
        t = newTrack({ role: 'riff', program: Generator.programFor('riff', gen), volume: 0.6 });
        song.tracks.splice(song.tracks.indexOf(mel), 0, t);
      }
      t.name = 'Hook: ' + (text.length > 22 ? text.slice(0, 21) + '…' : text);
      t.notes = applySectionOctaves(t, Generator.generatePart('riff', gen, song.bars, Date.now() >>> 0));
      if (engine.mode === 'sampled') engine.loadProgram(t.program);
    }
    selTrackId = mel.id;
    selection.clear();
    changed({ tracks: true });
    scrollToNotes();
    $('phraseInfo').textContent = riffReport();
    status(`${melodyReport()} The strip above the notes shows where the phrase appears.`, true);
  }

  // B. riff -> vocal melody
  function deriveFrom(mode) {
    const src = curTrack();
    if (src.drum || !src.notes.length) { status('Select an instrument track with notes first.'); return; }
    pushUndo();
    const gen = song.gen = currentGen();
    const seed = Date.now() >>> 0;
    const notes = mode === 'answer' ? Generator.answerRiff(src.notes, gen, song.bars, seed) : Generator.repitchRiff(src.notes, gen, song.bars, seed);
    if (!notes.length) { undoStack.pop(); status('This track leaves no room to answer. Try Re-pitch, or shorten some notes.'); return; }
    const t = newTrack({
      name: (mode === 'answer' ? 'Answer to ' : 'Vocal from ') + src.name, program: 53, volume: 0.75, role: null, notes
    });
    song.tracks.splice(song.tracks.indexOf(src) + 1, 0, t);
    if (engine.mode === 'sampled') engine.loadProgram(t.program);
    selTrackId = t.id;
    selection.clear();
    changed({ tracks: true });
    scrollToNotes();
    status(mode === 'answer' ? `Added “${t.name}”: it plays in the gaps, in another register (call and response).`
      : `Added “${t.name}”: same rhythm, notes moved onto each bar's chord.`);
  }

  function regeneratePart(t) {
    pushUndo();
    const gen = song.gen = currentGen();
    const role = t.drum ? 'drums' : (t.role || 'melody');
    if (role === 'riff' && !gen.phrase) gen.phrase = $('inPhrase').value.trim() || null;
    t.notes = applySectionOctaves(t, Generator.generatePart(role, gen, song.bars, (Date.now() ^ (t.id * 7919)) >>> 0, melodyCtx()));
    t.marks = role === 'melody' && Generator.lastInfo.melody ? Generator.lastInfo.melody.marks : undefined;
    const followed = role === 'melody' ? refreshFollowers(gen) : 0;
    selection.clear();
    selectTrack(t.id);
    changed();
    const extra = role === 'melody' ? ' ' + melodyReport() : role === 'riff' ? ' ' + riffReport() : '';
    const roleName = role === 'riff' ? 'hook' : (Generator.ROLE_NAMES_X[role] || role).toLowerCase();
    status(`New ${roleName} for “${t.name}”.${followed ? ` The ${followed} part${followed === 1 ? '' : 's'} that follow the melody were rewritten to match.` : ''}${extra} Ctrl+Z to undo.`, !!extra);
  }

  // =========================================================================
  // Channels & MIDI device
  // =========================================================================
  function channelOf(t) {
    const chs = MidiFile.assignChannels(song.tracks);
    return chs[song.tracks.indexOf(t)] ?? 0;
  }
  function midiMix() {
    if (engine.mode === 'midi') engine.midiSetup(song.tracks, MidiFile.assignChannels(song.tracks));
  }

  async function connectMidi() {
    try {
      await engine.requestMidi();
    } catch (e) {
      status('MIDI not available: ' + e.message, true);
      $('selEngine').value = engine.mode;
      return;
    }
    fillEngineSelect();
    engine.midiInputs().forEach(inp => { inp.onmidimessage = onMidiIn; });
    engine.midiAccess.onstatechange = () => {
      fillEngineSelect();
      engine.midiInputs().forEach(inp => { inp.onmidimessage = onMidiIn; });
    };
    const outs = engine.midiOutputs();
    const ins = engine.midiInputs();
    if (outs.length) {
      const pref = outs.find(o => /GS Wavetable/i.test(o.name)) || outs[0];
      setEngine('midi:' + pref.id);
    } else {
      $('selEngine').value = engine.mode;
      status('No MIDI output devices found.' + (ins.length ? ` MIDI keyboard connected: ${ins.map(i => i.name).join(', ')}.` : ''), true);
    }
    if (ins.length) status(`MIDI keyboard connected: ${ins.map(i => i.name).join(', ')}. Play it to hear the selected track.`);
  }

  function fillEngineSelect() {
    const sel = $('selEngine');
    [...sel.querySelectorAll('option[value^="midi:"]')].forEach(o => o.remove());
    const connect = sel.querySelector('option[value="midi-connect"]');
    engine.midiOutputs().forEach(o => {
      const opt = document.createElement('option');
      opt.value = 'midi:' + o.id;
      opt.textContent = 'MIDI out: ' + o.name;
      sel.insertBefore(opt, connect);
    });
    connect.textContent = engine.midiAccess ? 'Refresh MIDI devices…' : 'Connect MIDI devices…';
    sel.value = engine.mode === 'midi' && engine.midiOut ? 'midi:' + engine.midiOut.id : engine.mode;
  }

  function setEngine(value) {
    stopAllSound();
    if (value === 'midi-connect') { connectMidi(); return; }
    if (value.startsWith('midi:')) {
      const id = value.slice(5);
      engine.midiOut = engine.midiOutputs().find(o => o.id === id) || null;
      engine.mode = 'midi';
      midiMix();
    } else {
      engine.mode = value;
      if (value === 'sampled') song.tracks.forEach(t => { if (!t.drum) engine.loadProgram(t.program); });
    }
    $('selEngine').value = value;
    try { localStorage.setItem(STORAGE_KEY + '-engine', value.startsWith('midi') ? 'sampled' : value); } catch (e) { }
    engineStatus();
    renderLoadingBadges();
  }

  // =========================================================================
  // Live playing (computer keyboard / MIDI keyboard) + recording
  // =========================================================================
  const KEYMAP = {
    z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12, l: 13, '.': 14, ';': 15, '/': 16,
    q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23, i: 24, 9: 25, o: 26, 0: 27, p: 28
  };
  const DRUM_KEYS = [36, 38, 42, 46, 39, 37, 45, 47, 50, 49, 51, 56, 54, 41, 43, 48, 70];
  const held = new Map();   // id -> {voice, p, startStep}
  let recording = false;

  function liveOn(id, p, v) {
    if (held.has(id)) return;
    const t = curTrack();
    engine.ensure();
    const voice = engine.play(t, channelOf(t), p, v, engine.now, null);
    let startStep = null;
    if (recording && playing) {
      const snap = +$('selSnap').value;
      startStep = Math.round(posStep() / snap) * snap % songSteps();
    }
    held.set(id, { voice, p, v, startStep, track: t });
  }
  function liveOff(id) {
    const h = held.get(id);
    if (!h) return;
    held.delete(id);
    h.voice.stop();
    if (h.startStep != null && song.tracks.includes(h.track)) {
      const snap = Math.min(+$('selSnap').value, 4);
      let end = Math.round(posStep() / snap) * snap;
      if (end < h.startStep) end += songSteps();
      const l = h.track.drum ? 1 : Math.max(snap, end - h.startStep);
      if (!recordedUndo) { pushUndo(); recordedUndo = true; }
      h.track.notes.push({ p: h.p, s: h.startStep, l, v: h.v });
      changed();
    }
  }
  let recordedUndo = false;

  function onMidiIn(msg) {
    const [st, d1, d2] = msg.data;
    const type = st & 0xf0;
    const t = curTrack();
    if (type === 0x90 && d2 > 0) liveOn('midi' + d1, d1, d2);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) liveOff('midi' + d1);
    else if (type === 0xb0 && engine.mode === 'midi' && engine.midiOut) engine.midiOut.send([0xb0 | channelOf(t), d1, d2]);
  }

  function stopAllSound() {
    for (const id of [...held.keys()]) liveOff(id);
    engine.allNotesOff();
  }

  // =========================================================================
  // Sequencer
  // =========================================================================
  let index = [], indexDirty = true;
  let timer = null, nextStepTime = 0, curStep = 0;
  const queue = [];   // {step, time} of scheduled steps, for the playhead

  function buildIndex() {
    index = Array.from({ length: songSteps() }, () => []);
    for (const t of song.tracks) for (const n of t.notes) if (n.s >= 0 && n.s < index.length) index[n.s].push([t, n]);
    indexDirty = false;
  }
  const stepDur = () => 60 / song.bpm / song.stepsPerBeat;

  function play() {
    if (playing) return;
    engine.ensure();
    if (engine.mode === 'sampled') song.tracks.forEach(t => { if (!t.drum) engine.loadProgram(t.program); });
    midiMix();
    buildIndex();
    playing = true;
    recordedUndo = false;
    curStep = playStart % songSteps();
    nextStepTime = engine.now + 0.08;
    queue.length = 0;
    timer = setInterval(schedule, 20);
    schedule();
    $('btnPlay').classList.add('playing');
    $('btnPlay').textContent = '❚❚';
  }

  function stop(rewind) {
    if (!playing) { if (rewind) { playStart = 0; view.scrollX = 0; needsDraw = true; updatePosition(0); } return; }
    playing = false;
    clearInterval(timer);
    stopAllSound();
    $('btnPlay').classList.remove('playing');
    $('btnPlay').textContent = '▶';
    if (rewind) { playStart = 0; view.scrollX = 0; }
    updatePosition(playStart);
    needsDraw = true;
  }

  function schedule() {
    const ctx = engine.ctx;
    while (nextStepTime < ctx.currentTime + 0.12) {
      if (indexDirty) buildIndex();
      const sd = stepDur();
      const swingOff = curStep % 2 === 1 ? (song.swing || 0) * sd : 0;
      const t = nextStepTime + swingOff;
      for (const [track, n] of index[curStep] || []) {
        if (!audible(track)) continue;
        const dur = track.drum ? 0.1 : Math.max(0.03, n.l * sd - 0.01);
        engine.play(track, channelOf(track), n.p, n.v, t, dur);
      }
      queue.push({ step: curStep, time: nextStepTime });
      if (queue.length > 64) queue.shift();
      nextStepTime += sd;
      curStep++;
      if (curStep >= songSteps()) {
        if ($('btnLoop').classList.contains('on')) curStep = 0;
        else { const endAt = nextStepTime; setTimeout(() => { if (playing && engine.now >= endAt - 0.05) stop(true); }, (endAt - ctx.currentTime) * 1000 + 300); clearInterval(timer); break; }
      }
    }
  }

  // current playhead position in (fractional) steps
  function posStep() {
    if (!playing || !engine.ctx) return playStart;
    const now = engine.ctx.currentTime;
    let cur = null;
    for (const q of queue) if (q.time <= now) cur = q;
    if (!cur) return playStart;
    return cur.step + Math.min(1, (now - cur.time) / stepDur());
  }

  function updatePosition(step) {
    const bar = Math.floor(step / 16) + 1, beat = Math.floor((step % 16) / 4) + 1, six = Math.floor(step % 4) + 1;
    $('position').textContent = `${bar}.${beat}.${six}`;
  }

  // =========================================================================
  // Piano roll / drum grid
  // =========================================================================
  const canvas = $('roll');
  const g2 = canvas.getContext('2d');
  let W = 0, H = 0;

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    clampScroll();
    needsDraw = true;
  }

  const keyW = () => curTrack().drum ? 120 : 56;
  const rowH = () => curTrack().drum ? view.drumRowH : view.rowH;
  function drumRows(t) {
    const rows = GM.DEFAULT_DRUM_ROWS.slice();
    const extra = [...new Set(t.notes.map(n => n.p))].filter(p => !rows.includes(p)).sort((a, b) => b - a);
    return extra.concat(rows);
  }
  function rows() {
    const t = curTrack();
    if (t.drum) return drumRows(t);
    const r = [];
    for (let p = TOP; p >= BOTTOM; p--) r.push(p);
    return r;
  }
  function rowOfPitch(p) { return rows().indexOf(p); }
  function contentH() { return rows().length * rowH(); }
  function contentW() { return songSteps() * view.stepW; }

  function clampScroll() {
    view.scrollX = Math.max(0, Math.min(view.scrollX, Math.max(0, contentW() - (W - keyW()) + 40)));
    view.scrollY = Math.max(0, Math.min(view.scrollY, Math.max(0, contentH() - (H - RULER))));
  }

  function scrollToNotes() {
    const t = curTrack();
    if (!t) return;
    if (t.drum) { view.scrollY = 0; }
    else {
      const ps = t.notes.map(n => n.p);
      const mid = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : 62;
      view.scrollY = (TOP - mid) * view.rowH - (H - RULER) / 2;
    }
    clampScroll();
    needsDraw = true;
  }

  const isBlack = p => [1, 3, 6, 8, 10].includes(p % 12);
  function scaleSet() {
    const key = +$('selKey').value, sc = GM.SCALES[$('selScale').value];
    return new Set(sc.map(x => (x + key) % 12));
  }

  function draw() {
    const t = curTrack();
    if (!t || !W) return;
    const KW = keyW(), RH = rowH(), SW = view.stepW, rs = rows();
    const sx = view.scrollX, sy = view.scrollY;
    const steps = songSteps();
    const inScale = scaleSet();
    const g = g2;
    g.clearRect(0, 0, W, H);

    // rows
    g.save();
    g.beginPath(); g.rect(KW, RULER, W - KW, H - RULER); g.clip();
    const r0 = Math.max(0, Math.floor(sy / RH)), r1 = Math.min(rs.length - 1, Math.ceil((sy + H - RULER) / RH));
    for (let r = r0; r <= r1; r++) {
      const p = rs[r], y = RULER + r * RH - sy;
      if (t.drum) g.fillStyle = r % 2 ? '#1a1d25' : '#1e212a';
      else g.fillStyle = isBlack(p) ? '#171a21' : (inScale.has(p % 12) ? '#232838' : '#1d2029');
      g.fillRect(KW, y, W - KW, RH);
      if (!t.drum && p % 12 === 0) { g.fillStyle = '#343a4d'; g.fillRect(KW, y + RH - 1, W - KW, 1); }
    }
    // vertical grid
    const s0 = Math.max(0, Math.floor(sx / SW)), s1 = Math.min(steps, Math.ceil((sx + W - KW) / SW));
    for (let s = s0; s <= s1; s++) {
      const x = KW + s * SW - sx;
      g.fillStyle = s % 16 === 0 ? '#4a5168' : s % 4 === 0 ? '#2f3445' : '#22262f';
      if (SW < 8 && s % 4 !== 0) continue;
      g.fillRect(Math.round(x), RULER, 1, H - RULER);
    }
    // area past the end of the song
    const endX = KW + steps * SW - sx;
    if (endX < W) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(endX, RULER, W - endX, H - RULER); }

    // ghost notes of other tracks (melodic view)
    if (!t.drum) {
      g.fillStyle = 'rgba(255,255,255,0.07)';
      for (const o of song.tracks) {
        if (o === t || o.drum) continue;
        for (const n of o.notes) {
          const r = rowOfPitch(n.p); if (r < 0) continue;
          const x = KW + n.s * SW - sx, y = RULER + r * RH - sy;
          if (x > W || x + n.l * SW < KW || y > H || y + RH < RULER) continue;
          g.fillRect(x + 1, y + 1, n.l * SW - 2, RH - 2);
        }
      }
    }
    // notes
    for (const n of t.notes) {
      const r = rowOfPitch(n.p); if (r < 0) continue;
      const x = KW + n.s * SW - sx, y = RULER + r * RH - sy, w = Math.max(3, n.l * SW - 1);
      if (x > W || x + w < KW || y > H || y + RH < RULER) continue;
      g.globalAlpha = 0.45 + 0.55 * (n.v / 127);
      g.fillStyle = n.s >= steps ? '#555' : t.color;
      roundRect(g, x + 0.5, y + 1, w, RH - 2, 3); g.fill();
      g.globalAlpha = 1;
      if (selection.has(n)) { g.strokeStyle = '#fff'; g.lineWidth = 2; roundRect(g, x + 0.5, y + 1, w, RH - 2, 3); g.stroke(); }
      if (!t.drum && RH >= 12 && (w > 26 || (n.t && w > 12))) {
        g.fillStyle = 'rgba(0,0,0,0.7)'; g.font = (n.t ? 'bold ' : '') + '10px Segoe UI, sans-serif';
        g.fillText(n.t || GM.noteName(n.p), x + 3, y + RH - 4, w - 4);
      }
    }
    // rubber band
    if (drag && drag.mode === 'box') {
      g.strokeStyle = '#9fb3ff'; g.fillStyle = 'rgba(108,140,255,0.15)'; g.lineWidth = 1;
      const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
      g.fillRect(x, y, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
      g.strokeRect(x + 0.5, y + 0.5, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
    }
    // motif map: which bar holds the motif, a variation, fragments, a response or a cadence
    if (t.marks && t.marks.length && !t.drum) {
      const MH = 20, my = RULER;
      g.fillStyle = 'rgba(20,22,28,0.92)'; g.fillRect(KW, my, W - KW, MH + 2);
      const fills = { motif: t.color, vary: t.color, frag: '#8a90a2', resp: '#b388ff', cad: '#3a4052', new: '#2f6f5e' };
      for (const mk of t.marks) {
        const x = KW + mk.bar * 16 * SW - sx + 1, w = 16 * SW - 2;
        if (x > W || x + w < KW) continue;
        g.globalAlpha = mk.kind === 'motif' ? 0.95 : mk.kind === 'vary' ? 0.55 : 0.8;
        g.fillStyle = fills[mk.kind] || '#555';
        roundRect(g, x, my + 2, w, MH - 2, 4); g.fill();
        g.globalAlpha = 1;
        g.fillStyle = mk.kind === 'cad' || mk.kind === 'frag' || mk.kind === 'resp' || mk.kind === 'new' ? '#e6e8ee' : '#111';
        g.font = (mk.kind === 'motif' ? 'bold ' : '') + '11px Segoe UI, sans-serif';
        const label = (mk.section ? mk.section + ' · ' : '') + (mk.phrase && mk.kind === 'motif' ? '🗣 ' : '') + mk.label;
        g.fillText(label, x + 5, my + 15, w - 8);
      }
    }
    // playhead
    const ps = posStep();
    const px = KW + ps * SW - sx;
    if (px >= KW && px <= W) { g.fillStyle = playing ? '#7dffb0' : '#ffb347'; g.fillRect(Math.round(px), RULER, 2, H - RULER); }
    g.restore();

    // keys column
    g.save();
    g.beginPath(); g.rect(0, RULER, KW, H - RULER); g.clip();
    for (let r = r0; r <= r1; r++) {
      const p = rs[r], y = RULER + r * RH - sy;
      if (t.drum) {
        g.fillStyle = r % 2 ? '#262a35' : '#2b303c'; g.fillRect(0, y, KW, RH);
        g.fillStyle = '#cfd3dd'; g.font = '12px Segoe UI, sans-serif';
        g.fillText(GM.DRUMS[p] || ('Note ' + p), 8, y + RH / 2 + 4);
      } else {
        g.fillStyle = isBlack(p) ? '#20232b' : '#e9ebf0'; g.fillRect(0, y, KW, RH);
        g.fillStyle = '#9aa0ae'; g.fillRect(0, y + RH - 1, KW, 1);
        if (p % 12 === 0) { g.fillStyle = '#333'; g.font = '10px Segoe UI, sans-serif'; g.fillText(GM.noteName(p), KW - 26, y + RH - 3); }
      }
      if (keyFlash.has(p)) { g.fillStyle = t.color; g.globalAlpha = 0.7; g.fillRect(0, y, KW, RH); g.globalAlpha = 1; }
    }
    g.fillStyle = '#000'; g.fillRect(KW - 1, RULER, 1, H);
    g.restore();

    // ruler
    g.fillStyle = '#1c1f27'; g.fillRect(0, 0, W, RULER);
    g.save(); g.beginPath(); g.rect(KW, 0, W - KW, RULER); g.clip();
    // song form lane: one coloured block per section
    const secs = (song.gen && song.gen.sections) || [];
    const secStarts = new Set();
    for (const sec of secs) {
      if (sec.start >= song.bars) continue;
      const x = KW + sec.start * 16 * SW - sx, w = Math.min(sec.len, song.bars - sec.start) * 16 * SW;
      if (x > W || x + w < KW) continue;
      secStarts.add(sec.start);
      g.globalAlpha = 0.35 + 0.1 * sec.energy;
      g.fillStyle = sec.color || '#555';
      g.fillRect(x + 1, 1, w - 2, LANE - 3);
      g.globalAlpha = 1;
      g.fillStyle = '#fff'; g.font = 'bold 11px Segoe UI, sans-serif';
      g.fillText(`${sec.name}  ${'▮'.repeat(sec.energy)}`, Math.max(x, KW) + 5, 15, Math.max(10, w - 10));
      if (selSec >= 0 && secs[selSec] === sec) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(x + 1.5, 1.5, w - 3, LANE - 4); }
    }
    // chord lane: the chord of every bar (click to change it)
    if (song.gen) {
      const b0 = Math.max(0, Math.floor(s0 / 16)), b1 = Math.min(song.bars - 1, Math.ceil(s1 / 16));
      const BW = 16 * SW;
      for (let b = b0; b <= b1; b++) {
        const x = KW + b * BW - sx;
        const deg = Generator.chordForBar(song.gen, b);
        const c = Generator.chordName(Generator.keyAt(song.gen, b), song.gen.scale, deg);
        const sec = secs.length ? secs.find(q => b >= q.start && b < q.start + q.len) : null;
        const ov = sec ? sec.chordOv && sec.chordOv[b - sec.start] != null : song.gen.chordOv && song.gen.chordOv[b] != null;
        g.fillStyle = ov ? '#3b3360' : (b % 2 ? '#22262f' : '#262b35');
        g.fillRect(x + 1, LANE, BW - 2, RULER - LANE - 2);
        if (BW >= 22) {
          g.fillStyle = ov ? '#d6c8ff' : '#cfd3dd'; g.font = 'bold 11px Segoe UI, sans-serif';
          g.fillText(BW >= 60 ? `${c.name}  ${c.roman}` : BW >= 34 ? c.name : c.roman, x + 5, RULER - 6, BW - 8);
        }
      }
    }
    for (let s = s0 - (s0 % 4); s <= s1; s += 4) {
      const x = KW + s * SW - sx;
      if (s % 16 === 0) {
        g.fillStyle = '#8a90a2'; g.fillRect(x, 6, 1, LANE - 6);
        if (!secStarts.has(s / 16)) { g.fillStyle = secs.length ? '#c8ccd8' : '#e6e8ee'; g.font = '11px Segoe UI, sans-serif'; g.fillText(String(s / 16 + 1), x + 4, secs.length ? 21 : 15); }
      } else if (SW >= 6) { g.fillStyle = '#4a5168'; g.fillRect(x, 16, 1, LANE - 16); }
    }
    const hx = KW + playStart * SW - sx;
    g.fillStyle = '#ffb347';
    g.beginPath(); g.moveTo(hx - 5, 0); g.lineTo(hx + 5, 0); g.lineTo(hx, 8); g.fill();
    g.restore();
    g.fillStyle = '#1c1f27'; g.fillRect(0, 0, KW, RULER);
    g.fillStyle = '#8a90a2'; g.font = '11px Segoe UI, sans-serif'; g.fillText(t.drum ? 'Drum' : 'Note', 8, 16);
    if (song.gen) g.fillText('Chord', 8, RULER - 6);
    g.fillStyle = '#2e3342'; g.fillRect(0, RULER - 1, W, 1);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  const keyFlash = new Set();
  function flashKey(p, ms = 180) { keyFlash.add(p); needsDraw = true; setTimeout(() => { keyFlash.delete(p); needsDraw = true; }, ms); }

  function loop() {
    if (playing) {
      const ps = posStep();
      updatePosition(Math.floor(ps));
      updatePlayingSection(ps);
      if (view.follow && !drag) {
        const px = ps * view.stepW - view.scrollX, vis = W - keyW();
        if (px > vis - 40 || px < 0) { view.scrollX = Math.max(0, ps * view.stepW - 40); clampScroll(); }
      }
      needsDraw = true;
    }
    if (needsDraw) { needsDraw = false; draw(); }
    requestAnimationFrame(loop);
  }

  // ---- mouse ----------------------------------------------------------------
  let drag = null;

  function hit(x, y) {
    const t = curTrack(), KW = keyW(), RH = rowH();
    const step = (x - KW + view.scrollX) / view.stepW;
    const row = Math.floor((y - RULER + view.scrollY) / RH);
    const rs = rows();
    const pitch = row >= 0 && row < rs.length ? rs[row] : null;
    let note = null, edge = false;
    for (let i = t.notes.length - 1; i >= 0; i--) {
      const n = t.notes[i];
      if (n.p === pitch && step >= n.s && step < n.s + Math.max(n.l, 3 / view.stepW)) {
        note = n;
        edge = !t.drum && (n.s + n.l - step) * view.stepW < Math.max(6, Math.min(10, n.l * view.stepW / 3));
        break;
      }
    }
    return { step, pitch, note, edge };
  }

  const snapVal = () => +$('selSnap').value;
  const snapDown = s => Math.floor(s / snapVal()) * snapVal();

  function preview(t, p, v) {
    engine.play(t, channelOf(t), p, v || +$('inVel').value, engine.now, t.drum ? 0.1 : 0.35);
    flashKey(p);
  }

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', e => {
    engine.ensure();
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const t = curTrack(), KW = keyW();
    closeChordMenu();
    if (y >= LANE && y < RULER && x > KW && song.gen) { // chord lane: change this bar's chord
      const bar = Math.floor((x - KW + view.scrollX) / view.stepW / 16);
      if (bar >= 0 && bar < song.bars) openChordMenu(bar, x, y);
      return;
    }
    if (y < RULER && x > KW) { // ruler: set start position
      playStart = Math.max(0, Math.min(songSteps() - 1, snapDown((x - KW + view.scrollX) / view.stepW)));
      const si = secAtBar(Math.floor(playStart / 16));
      if (si >= 0) selectSection(si, false);
      if (playing) { stop(); play(); }
      updatePosition(playStart); needsDraw = true; return;
    }
    if (t.marks && t.marks.length && !t.drum && x > KW && y < RULER + 22) return; // motif map strip
    const h = hit(x, y);
    if (h.pitch == null) return;
    if (x < KW) { preview(t, h.pitch); return; }
    if (h.step < 0) return;

    if (e.button === 2) { // erase
      pushUndo();
      drag = { mode: 'erase' };
      if (h.note) { t.notes.splice(t.notes.indexOf(h.note), 1); selection.delete(h.note); changed(); }
      return;
    }
    if (e.button !== 0) return;

    if (e.shiftKey && !h.note) { drag = { mode: 'box', x0: x, y0: y, x1: x, y1: y }; selection.clear(); return; }

    if (t.drum) {
      pushUndo();
      if (h.note) {
        t.notes.splice(t.notes.indexOf(h.note), 1);
        drag = { mode: 'drum-erase', pitch: h.pitch };
      } else {
        const s = Math.floor(h.step);
        t.notes.push({ p: h.pitch, s, l: 1, v: +$('inVel').value });
        preview(t, h.pitch);
        drag = { mode: 'drum-paint', pitch: h.pitch, last: s };
      }
      changed();
      return;
    }

    if (h.note) {
      pushUndo();
      if (!selection.has(h.note)) { if (!e.ctrlKey) selection.clear(); selection.add(h.note); }
      else if (e.ctrlKey) { selection.delete(h.note); needsDraw = true; return; }
      if (e.altKey) { // alt-drag duplicates
        const copies = [...selection].map(n => Object.assign({}, n));
        t.notes.push(...copies);
        const map = new Map([...selection].map((n, i) => [n, copies[i]]));
        h.note = map.get(h.note);
        selection = new Set(copies);
      }
      const orig = new Map([...selection].map(n => [n, { s: n.s, p: n.p, l: n.l }]));
      drag = h.edge ? { mode: 'resize', note: h.note, orig, startStep: h.step }
        : { mode: 'move', note: h.note, orig, startStep: h.step, startPitch: h.pitch, lastPitch: h.pitch };
      preview(t, h.note.p, h.note.v);
      needsDraw = true;
      return;
    }

    // create a new note
    pushUndo();
    selection.clear();
    const s = snapDown(h.step);
    const n = { p: h.pitch, s, l: +$('selLen').value, v: +$('inVel').value };
    t.notes.push(n);
    selection.add(n);
    preview(t, n.p);
    drag = { mode: 'create', note: n, origL: n.l, startStep: s };
    changed();
  });

  window.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (!drag) {
      if (e.target !== canvas) return;
      const t = curTrack();
      if (x < keyW() || y < RULER) { canvas.style.cursor = 'pointer'; return; }
      const h = hit(x, y);
      canvas.style.cursor = h.note ? (h.edge ? 'ew-resize' : (t.drum ? 'pointer' : 'grab')) : (t.drum ? 'cell' : 'crosshair');
      return;
    }
    const t = curTrack();
    const h = hit(x, y);
    const snap = snapVal();
    switch (drag.mode) {
      case 'box':
        drag.x1 = x; drag.y1 = y; needsDraw = true; break;
      case 'erase':
        if (h.note) { t.notes.splice(t.notes.indexOf(h.note), 1); selection.delete(h.note); changed(); }
        break;
      case 'drum-paint': {
        const s = Math.floor(h.step);
        if (h.pitch === drag.pitch && s >= 0 && s < songSteps() && s !== drag.last && !t.notes.some(n => n.p === h.pitch && n.s === s)) {
          t.notes.push({ p: h.pitch, s, l: 1, v: +$('inVel').value }); drag.last = s; changed();
        }
        break;
      }
      case 'drum-erase':
        if (h.note && h.pitch === drag.pitch) { t.notes.splice(t.notes.indexOf(h.note), 1); changed(); }
        break;
      case 'create': {
        const end = Math.max(drag.startStep + snap, Math.ceil(h.step / snap) * snap);
        const l = Math.max(drag.origL, end - drag.startStep);
        if (l !== drag.note.l) { drag.note.l = l; changed(); }
        break;
      }
      case 'resize': {
        const delta = Math.round((h.step - drag.startStep) / snap) * snap;
        for (const [n, o] of drag.orig) n.l = Math.max(1, o.l + delta);
        changed();
        break;
      }
      case 'move': {
        let ds = Math.round((h.step - drag.startStep) / snap) * snap;
        const dp = h.pitch != null ? h.pitch - drag.startPitch : 0;
        const minS = Math.min(...[...drag.orig.values()].map(o => o.s));
        if (minS + ds < 0) ds = -minS;
        for (const [n, o] of drag.orig) { n.s = o.s + ds; n.p = Math.max(BOTTOM, Math.min(TOP, o.p + dp)); }
        if (h.pitch != null && h.pitch !== drag.lastPitch) { drag.lastPitch = h.pitch; preview(t, drag.note.p, drag.note.v); }
        changed();
        break;
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (!drag) return;
    if (drag.mode === 'box') {
      const t = curTrack(), a = hitXY(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1)), b = hitXY(Math.max(drag.x0, drag.x1), Math.max(drag.y0, drag.y1));
      const rs = rows();
      for (const n of t.notes) {
        const r = rs.indexOf(n.p);
        if (n.s + n.l > a.step && n.s < b.step && r >= a.row && r <= b.row) selection.add(n);
      }
      status(`${selection.size} note${selection.size === 1 ? '' : 's'} selected. Arrows move, Delete removes, Ctrl+C / Ctrl+V copy.`);
    }
    if (drag.mode === 'move' || drag.mode === 'resize') {
      const moved = [...drag.orig].some(([n, o]) => n.s !== o.s || n.p !== o.p || n.l !== o.l);
      if (!moved) undoStack.pop();
    }
    drag = null;
    needsDraw = true;
    changed();
  });

  function hitXY(x, y) {
    return { step: (x - keyW() + view.scrollX) / view.stepW, row: Math.floor((y - RULER + view.scrollY) / rowH()) };
  }

  canvas.addEventListener('dblclick', e => {
    const r = canvas.getBoundingClientRect();
    const h = hit(e.clientX - r.left, e.clientY - r.top);
    const t = curTrack();
    if (h.note && !t.drum) { pushUndo(); t.notes.splice(t.notes.indexOf(h.note), 1); selection.delete(h.note); changed(); }
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey) {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left - keyW();
      const stepAt = (x + view.scrollX) / view.stepW;
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
      view.scrollX = stepAt * view.stepW - x;
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      view.scrollX += e.shiftKey ? e.deltaY : e.deltaX;
    } else {
      view.scrollY += e.deltaY;
    }
    clampScroll();
    needsDraw = true;
  }, { passive: false });

  function zoom(f) {
    view.stepW = Math.max(4, Math.min(80, view.stepW * f));
    clampScroll();
    needsDraw = true;
  }

  // ---- keyboard ---------------------------------------------------------------
  let clipboard = [];
  window.addEventListener('keydown', e => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' && e.target.type !== 'range' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const t = curTrack();
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    if (e.code === 'Space') { e.preventDefault(); playing ? stop() : play(); return; }
    if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (ctrl && k === 'y') { e.preventDefault(); redo(); return; }
    if (ctrl && k === 's') { e.preventDefault(); saveToLibrary(); return; }
    if (ctrl && k === 'a') { e.preventDefault(); selection = new Set(t.notes); needsDraw = true; return; }
    if (ctrl && k === 'c') { clipboard = [...selection].map(n => Object.assign({}, n)); status(`${clipboard.length} notes copied.`); return; }
    if (ctrl && k === 'v') { pasteNotes(); return; }
    if (ctrl && k === 'd') { e.preventDefault(); duplicateSelection(); return; }
    if (ctrl) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size) {
      pushUndo();
      t.notes = t.notes.filter(n => !selection.has(n));
      selection.clear(); changed(); return;
    }
    if (e.key.startsWith('Arrow') && selection.size) {
      e.preventDefault();
      pushUndo();
      const ds = e.key === 'ArrowLeft' ? -snapVal() : e.key === 'ArrowRight' ? snapVal() : 0;
      const dp = e.key === 'ArrowUp' ? (e.shiftKey ? 12 : 1) : e.key === 'ArrowDown' ? (e.shiftKey ? -12 : -1) : 0;
      for (const n of selection) { n.s = Math.max(0, n.s + ds); if (!t.drum) n.p = Math.max(BOTTOM, Math.min(TOP, n.p + dp)); }
      if (dp && !t.drum) preview(t, [...selection][0].p);
      changed(); return;
    }
    if (e.key === 'Escape') { selection.clear(); needsDraw = true; return; }
    if (e.key === '[') { octave = Math.max(0, octave - 1); $('octaveInfo').textContent = 'Oct ' + octave; return; }
    if (e.key === ']') { octave = Math.min(7, octave + 1); $('octaveInfo').textContent = 'Oct ' + octave; return; }
    if (e.key === 'Home') { stop(true); return; }
    if (e.repeat) { if (k in KEYMAP) e.preventDefault(); return; }
    if (k in KEYMAP) {
      e.preventDefault();
      const semi = KEYMAP[k];
      const p = t.drum ? DRUM_KEYS[semi % DRUM_KEYS.length] : Math.min(127, (octave + 1) * 12 + semi);
      liveOn('key' + k, p, +$('inVel').value);
      keyFlash.add(p); needsDraw = true;
    }
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k in KEYMAP) {
      const h = held.get('key' + k);
      if (h) { keyFlash.delete(h.p); needsDraw = true; }
      liveOff('key' + k);
    }
  });
  window.addEventListener('blur', () => { for (const id of [...held.keys()]) liveOff(id); keyFlash.clear(); });

  function pasteNotes() {
    if (!clipboard.length) return;
    const t = curTrack();
    pushUndo();
    const minS = Math.min(...clipboard.map(n => n.s));
    const at = snapDown(posStep());
    const copies = clipboard.map(n => Object.assign({}, n, { s: n.s - minS + at }));
    t.notes.push(...copies);
    selection = new Set(copies);
    changed();
    status(`Pasted ${copies.length} notes at the playhead.`);
  }
  function duplicateSelection() {
    if (!selection.size) return;
    const t = curTrack();
    pushUndo();
    const sel = [...selection];
    const minS = Math.min(...sel.map(n => n.s)), maxE = Math.max(...sel.map(n => n.s + n.l));
    const len = Math.ceil((maxE - minS) / 4) * 4;
    const copies = sel.map(n => Object.assign({}, n, { s: n.s + len }));
    t.notes.push(...copies);
    selection = new Set(copies);
    changed();
  }

  // =========================================================================
  // Sections: see and edit the song's form
  // =========================================================================
  const SEC_INFO = SongForm.SECTION;
  const SEC_ORDER = ['I', 'V', 'P', 'C', 'B', 'S', 'L', 'K', 'U', 'D', 'A', 'O'];
  const secTypeName = k => k === 'A' ? 'A section' : SEC_INFO[k].name;
  let selSec = -1, playSec = -1;
  const secs = () => (song.gen && song.gen.sections) || [];
  const secAtBar = bar => secs().findIndex(s => bar >= s.start && bar < s.start + s.len);

  function restack(list) { let st = 0; list.forEach(s => { s.start = st; st += s.len; }); return st; }

  // automatic names (Verse 1, Verse 2 …) for sections the user has not renamed
  function renumber() {
    const list = secs(), count = {}, seen = {};
    list.forEach(s => count[s.type] = (count[s.type] || 0) + 1);
    list.forEach(s => {
      const n = seen[s.type] = (seen[s.type] || 0) + 1;
      s.n = n;
      if (s.custom) return;
      const base = s.base || SEC_INFO[s.type].name;
      s.name = s.type === 'A' && !s.base ? 'A' + (count.A > 1 ? n : '') : base + (count[s.type] > 1 ? ' ' + n : '');
    });
  }

  // rebuild every track from a new section order: each entry copies the music of its source bars
  // (repeated if the section got longer, cut if it got shorter)
  function remapSections(list) {
    song.tracks.forEach(t => {
      const out = [], marks = [];
      let pos = 0;
      list.forEach(x => {
        const end = (pos + x.len) * 16;
        if (x.src && x.src.len > 0) {
          const a = x.src.start * 16, L = x.src.len * 16;
          const inSrc = t.notes.filter(n => n.s >= a && n.s < a + L);
          for (let rep = 0; pos * 16 + rep * L < end; rep++) {
            inSrc.forEach(n => { const s = pos * 16 + rep * L + (n.s - a); if (s < end) out.push(Object.assign({}, n, { s, l: Math.max(1, Math.min(n.l, end - s)) })); });
          }
          if (t.marks) t.marks.filter(m => m.bar >= x.src.start && m.bar < x.src.start + x.src.len).forEach(m => {
            const b = pos + m.bar - x.src.start;
            if (b < pos + x.len) marks.push(Object.assign({}, m, { bar: b }));
          });
        }
        pos += x.len;
      });
      t.notes = out;
      if (t.marks) t.marks = marks;
    });
    song.gen.sections = list.map(x => Object.assign(x.sec, { len: x.len }));
    song.bars = restack(song.gen.sections);
    renumber();
    selection.clear();
  }

  const secPlan = () => secs().map(s => ({ sec: s, src: { start: s.start, len: s.len }, len: s.len }));

  function afterSectionEdit(msg) {
    $('inBars').value = song.bars;
    playStart = Math.min(playStart, songSteps() - 1);
    clampScroll();
    changed({ tracks: true });
    renderSections();
    if (msg) status(msg + ' Ctrl+Z to undo.');
  }

  function selectSection(i, scroll = true) {
    const list = secs();
    if (!list[i]) return;
    selSec = i;
    const s = list[i];
    if (!playing) { playStart = s.start * 16; updatePosition(playStart); }
    if (scroll) { view.scrollX = Math.max(0, s.start * 16 * view.stepW - 20); clampScroll(); }
    needsDraw = true;
    document.querySelectorAll('.sec').forEach(el => el.classList.toggle('sel', +el.dataset.i === i));
    const el = document.querySelector(`.sec[data-i="${i}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function makeSections() {
    pushUndo();
    if (!song.gen) song.gen = currentGen();
    const chunk = song.bars % 8 === 0 ? 8 : 4;
    const list = [];
    for (let b = 0, k = 1; b < song.bars; b += chunk, k++) {
      const len = Math.min(chunk, song.bars - b);
      list.push({ type: 'A', start: b, len, n: k, name: 'Part ' + k, custom: true, energy: 3, change: null, prog: (song.gen.progression || [0, 4, 5, 3]).slice(), color: SEC_INFO.A.color });
    }
    song.gen.sections = list;
    restack(list);
    afterSectionEdit(`Split the song into ${list.length} sections of ${chunk} bars. Rename them, change their type, or add more.`);
  }

  function resizeSection(i, len) {
    len = Math.max(1, Math.min(64, Math.round(len) || 1));
    const s = secs()[i];
    if (!s || s.len === len) return;
    pushUndo();
    const list = secPlan();
    list[i].len = len;
    const old = s.len;
    remapSections(list);
    s.len = len;
    afterSectionEdit(`${s.name} is now ${len} bars${len > old ? ' (its music repeats to fill the new bars)' : ''}.`);
  }

  function moveSection(i, d) {
    const j = i + d, list = secPlan();
    if (j < 0 || j >= list.length) return;
    pushUndo();
    [list[i], list[j]] = [list[j], list[i]];
    remapSections(list);
    selSec = j;
    afterSectionEdit(`Moved ${secs()[j].name}.`);
  }

  function duplicateSection(i) {
    const list = secPlan();
    if (!list[i]) return;
    pushUndo();
    const src = list[i];
    const copy = JSON.parse(JSON.stringify(src.sec));
    copy.change = null;
    if (copy.custom) copy.name += ' (copy)';
    list.splice(i + 1, 0, { sec: copy, src: src.src, len: src.len });
    remapSections(list);
    selSec = i + 1;
    afterSectionEdit(`Added an exact repeat of ${src.sec.name}.`);
  }

  function deleteSection(i) {
    const list = secPlan();
    if (list.length <= 1) { status('A song needs at least one section.'); return; }
    pushUndo();
    const name = list[i].sec.name;
    list.splice(i, 1);
    remapSections(list);
    selSec = Math.min(i, list.length - 1);
    afterSectionEdit(`Deleted ${name}.`);
  }

  function newSectionOf(type) {
    const gen = song.gen;
    const same = secs().find(s => s.type === type);
    const info = SEC_INFO[type];
    return {
      sec: { type, start: 0, len: same ? same.len : (type === 'I' || type === 'O' ? 4 : 8), n: 1, name: (same && same.base) || info.name, base: same ? same.base || null : null, energy: same ? same.energy : info.energy, change: null,
        prog: SongForm.progressionFor(gen, type, Generator.rng(Date.now() >>> 0), Generator.isMinorish(gen.scale)), color: info.color },
      src: same ? { start: same.start, len: same.len } : null
    };
  }

  function addSection(type) {
    if (!secs().length) { makeSections(); }
    pushUndo();
    const list = secPlan();
    const x = newSectionOf(type);
    x.len = x.sec.len;
    let at = selSec >= 0 && selSec < list.length ? selSec + 1 : list.length;
    if (selSec < 0 && list.length && list[list.length - 1].sec.type === 'O') at = list.length - 1;   // before the outro
    list.splice(at, 0, x);
    remapSections(list);
    selSec = at;
    if (!x.src) { regenerateSection(at, true); afterSectionEdit(`Added a new ${secTypeName(type).toLowerCase()} with fresh music.`); }
    else afterSectionEdit(`Added ${x.sec.name}: it repeats the existing ${secTypeName(type).toLowerCase()} (songs repeat their sections exactly).`);
    selectSection(at);
  }

  function setSectionType(i, type) {
    const s = secs()[i];
    if (!s || s.type === type) return;
    pushUndo();
    const info = SEC_INFO[type];
    const others = secs().filter(x => x !== s);
    s.type = type; s.color = info.color; s.energy = info.energy; s.change = null; s.base = null;
    s.prog = SongForm.progressionFor({ sections: others, progression: song.gen.progression }, type, Generator.rng(Date.now() >>> 0), Generator.isMinorish(song.gen.scale));
    renumber();
    afterSectionEdit(`${s.name}: type changed. Press ↻ on it to write new music for its new job.`);
  }

  function renameSection(i, name) {
    const s = secs()[i];
    if (!s) return;
    pushUndo();
    name = name.trim();
    if (name) { s.name = name; s.custom = true; } else { s.custom = false; renumber(); }
    afterSectionEdit();
  }

  function cycleEnergy(i) {
    const s = secs()[i];
    pushUndo();
    s.energy = s.energy % 5 + 1;
    afterSectionEdit(`${s.name}: energy ${s.energy} of 5. Press ↻ on it to rebuild its drums, bass and chords at this level.`);
  }

  const pitchedScope = () => $('selSecScope').value === 'track'
    ? [curTrack()].filter(t => t && !t.drum)
    : song.tracks.filter(t => !t.drum);

  function octaveSection(i, d) {
    const s = secs()[i];
    const tracks = pitchedScope();
    if (!s || !tracks.length) { status('Select an instrument track first (drums have no octave).'); return; }
    const a = s.start * 16, b = (s.start + s.len) * 16;
    const hit = tracks.filter(t => t.notes.some(n => n.s >= a && n.s < b));
    if (!hit.length) { status(`${s.name} has no notes to move${tracks.length === 1 ? ' on this track' : ''}.`); return; }
    for (const t of hit) {
      const ns = t.notes.filter(n => n.s >= a && n.s < b);
      if (ns.some(n => n.p + 12 * d < 0 || n.p + 12 * d > 127)) { status(`Can't go further: ${t.name} would leave the MIDI range.`); return; }
    }
    pushUndo();
    s.oct = s.oct || {};
    for (const t of hit) {
      t.notes.forEach(n => { if (n.s >= a && n.s < b) n.p += 12 * d; });
      s.oct[t.id] = (s.oct[t.id] || 0) + d;
    }
    if ($('selSecScope').value === 'all') s.oct.all = (s.oct.all || 0) + d;
    changed({ tracks: true });
    renderSections();
    status(`${s.name}: ${hit.length === 1 ? hit[0].name : hit.length + ' instruments'} moved an octave ${d > 0 ? 'up' : 'down'}. Ctrl+Z to undo.`);
  }

  // section octave moves are kept, so a regenerated part lands in the same octave
  function applySectionOctaves(t, notes, onlySec) {
    if (t.drum) return notes;
    secs().forEach((s, i) => {
      if (onlySec != null && i !== onlySec) return;
      const k = s.oct && s.oct[t.id];
      if (!k) return;
      const a = s.start * 16, b = (s.start + s.len) * 16;
      notes.forEach(n => { if (n.s >= a && n.s < b) n.p = Math.max(0, Math.min(127, n.p + 12 * k)); });
    });
    return notes;
  }

  // write new music for one section on every generated track (drums, bass, chords, melody, hook)
  function regenerateSection(i, noUndo) {
    const s = secs()[i];
    if (!s) return;
    if (!noUndo) pushUndo();
    const gen = song.gen = currentGen();
    if (!gen.phrase && $('inPhrase').value.trim()) gen.phrase = $('inPhrase').value.trim();
    const a = s.start * 16, b = (s.start + s.len) * 16;
    const seed = Date.now() >>> 0;
    let n = 0;
    const ordered = song.tracks.map((t, k) => [t, k]).sort((x, y) => (Generator.EXTRA_ROLES.includes(x[0].role) ? 1 : 0) - (Generator.EXTRA_ROLES.includes(y[0].role) ? 1 : 0));
    ordered.forEach(([t, k]) => {
      const role = t.drum ? 'drums' : t.role;
      if (!role) return;
      const fresh = Generator.generatePart(role, gen, song.bars, (seed ^ (k * 7919)) >>> 0, melodyCtx()).filter(x => x.s >= a && x.s < b);
      applySectionOctaves(t, fresh, i);
      t.notes = t.notes.filter(x => x.s < a || x.s >= b).concat(fresh);
      if (role === 'melody' && t.marks && Generator.lastInfo.melody) {
        t.marks = t.marks.filter(m => m.bar < s.start || m.bar >= s.start + s.len)
          .concat((Generator.lastInfo.melody.marks || []).filter(m => m.bar >= s.start && m.bar < s.start + s.len));
      }
      n++;
    });
    selection.clear();
    if (!noUndo) afterSectionEdit(n ? `New music for ${s.name} on ${n} track${n === 1 ? '' : 's'}.` : 'No generated tracks to rewrite (add a song with Generate first).');
  }

  function renderSections() {
    const box = $('secList');
    const list = secs();
    if (selSec >= list.length) selSec = list.length - 1;
    if (!list.length) {
      box.innerHTML = `<div class="empty">This song has no sections yet. <button id="btnMakeSecs">Split into sections</button> or choose Length: Full song and Generate.</div>`;
      $('btnMakeSecs').onclick = makeSections;
      return;
    }
    const scopeTrack = $('selSecScope').value === 'track';
    const progOpts = s => {
      const k = presetOf(s.prog);
      const ov = s.chordOv && Object.keys(s.chordOv).length;
      return (k && !ov ? '' : `<option value="" selected>Chords: ${romanSeq(song.gen, s.prog)}${ov ? ' (edited)' : ''}</option>`) +
        Object.entries(Generator.PROGRESSIONS).map(([id, p]) => `<option value="${id}"${id === k && !ov ? ' selected' : ''}>${p.name}</option>`).join('');
    };
    const typeOpts = k => SEC_ORDER.map(t => `<option value="${t}"${t === k ? ' selected' : ''}>${secTypeName(t)}</option>`).join('');
    box.innerHTML = '';
    list.forEach((s, i) => {
      const o = s.oct ? (scopeTrack ? s.oct[selTrackId] : s.oct.all) || 0 : 0;
      const el = document.createElement('div');
      el.className = 'sec' + (i === selSec ? ' sel' : '') + (i === playSec ? ' playing' : '');
      el.dataset.i = i;
      el.style.setProperty('--c', s.color || '#555');
      el.title = `Bars ${s.start + 1}–${s.start + s.len}${s.change ? ' · return with one change: ' + (SongForm.CHANGE_NAMES[s.change] || s.change) : ''}. Click to jump here.`;
      el.innerHTML = `
        <div class="row"><input class="sname" value="${s.name.replace(/"/g, '&quot;')}" spellcheck="false"><span class="energy" title="Energy ${s.energy}/5 (click to change)">${'▮'.repeat(s.energy)}${'▯'.repeat(5 - s.energy)}</span></div>
        <div class="row"><select class="stype" title="Section type">${typeOpts(s.type)}</select><input class="slen" type="number" min="1" max="64" value="${s.len}" title="Length in bars"><span class="bars">bars</span></div>
        <div class="row"><select class="sprog" title="This section's chord progression">${progOpts(s)}</select></div>
        <div class="row"><span class="bars">Octave</span><button class="od" title="Octave down">−</button><span class="octv">${o > 0 ? '+' + o : o}</span><button class="ou" title="Octave up">+</button></div>
        <div class="row actions">
          <button class="ml" title="Move earlier">◀</button><button class="mr" title="Move later">▶</button>
          <button class="dup" title="Duplicate (exact repeat after this one)">⧉</button>
          <button class="regen" title="Write new music for this section">↻</button>
          <button class="sdel" title="Delete this section and its bars">✕</button>
        </div>`;
      const q = c => el.querySelector(c);
      el.addEventListener('mousedown', e => { if (!/^(INPUT|SELECT|BUTTON|OPTION)$/.test(e.target.tagName)) selectSection(i); });
      q('.sname').addEventListener('change', e => renameSection(i, e.target.value));
      q('.sname').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });
      q('.slen').addEventListener('change', e => resizeSection(i, +e.target.value));
      q('.slen').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });
      q('.stype').addEventListener('change', e => setSectionType(i, e.target.value));
      q('.sprog').addEventListener('change', e => setSectionProgression(i, e.target.value));
      q('.energy').addEventListener('click', () => cycleEnergy(i));
      q('.od').addEventListener('click', () => { selSec = i; octaveSection(i, -1); });
      q('.ou').addEventListener('click', () => { selSec = i; octaveSection(i, 1); });
      q('.ml').addEventListener('click', () => moveSection(i, -1));
      q('.mr').addEventListener('click', () => moveSection(i, 1));
      q('.dup').addEventListener('click', () => duplicateSection(i));
      q('.regen').addEventListener('click', () => { selSec = i; regenerateSection(i); });
      q('.sdel').addEventListener('click', () => deleteSection(i));
      box.appendChild(el);
    });
  }

  function updatePlayingSection(step) {
    const i = secs().length ? secAtBar(Math.floor(step / 16)) : -1;
    if (i === playSec) return;
    playSec = i;
    document.querySelectorAll('.sec').forEach(el => el.classList.toggle('playing', +el.dataset.i === i));
  }

  // Bars box with sections: trim from the end, or lengthen the last section
  function setBarsWithSections(bars) {
    const list = secPlan();
    let left = bars;
    const out = [];
    for (const x of list) { if (left <= 0) break; x.len = Math.min(x.len, left); left -= x.len; out.push(x); }
    if (left > 0) out[out.length - 1].len += left;
    remapSections(out);
    out.forEach(x => x.sec.len = x.len);
    restack(secs());
  }

  // =========================================================================
  // Drum sounds: switch off percussion the generator must not use
  // =========================================================================
  const DRUM_GROUPS = [
    ['Kicks', [36, 35]], ['Snares & claps', [38, 40, 37, 39]], ['Hi-hats', [42, 44, 46]],
    ['Cymbals', [49, 57, 55, 52, 51, 59, 53]], ['Toms', [50, 48, 47, 45, 43, 41]],
    ['Hand percussion', [54, 69, 70, 56, 75, 76, 77, 80, 81, 58, 73, 74]],
    ['Latin drums', [60, 61, 62, 63, 64, 65, 66, 67, 68, 78, 79]], ['Whistles', [71, 72]]
  ];
  const drumOff = () => song.drumOff || (song.drumOff = []);

  function drumHits() {
    const c = {};
    song.tracks.filter(t => t.drum).forEach(t => t.notes.forEach(n => c[n.p] = (c[n.p] || 0) + 1));
    return c;
  }

  function setDrumSound(p, on) {
    pushUndo();
    const off = new Set(drumOff());
    let removed = 0;
    if (on) off.delete(p);
    else {
      off.add(p);
      song.tracks.filter(t => t.drum).forEach(t => { const n0 = t.notes.length; t.notes = t.notes.filter(n => n.p !== p); removed += n0 - t.notes.length; });
      selection.clear();
    }
    song.drumOff = [...off].sort((a, b) => a - b);
    changed({ tracks: true });
    renderDrumSounds();
    const name = GM.DRUMS[p];
    status(on ? `${name} is on again. Press 🎲 on the drum track (or ↻ on a section) to bring it back into the beat.`
      : `${name} switched off${removed ? `: took out ${removed} hit${removed === 1 ? '' : 's'}` : ''}. Generate, 🎲 and ↻ won't use it. Ctrl+Z to undo.`);
  }

  function setDrumOffList(list, msg) {
    pushUndo();
    const off = new Set(list);
    song.tracks.filter(t => t.drum).forEach(t => { t.notes = t.notes.filter(n => !off.has(n.p)); });
    song.drumOff = [...off].sort((a, b) => a - b);
    selection.clear();
    changed({ tracks: true });
    renderDrumSounds();
    status(msg);
  }

  function renderDrumSounds() {
    const box = $('drumList');
    if (!box) return;
    const off = new Set(drumOff()), hits = drumHits();
    box.innerHTML = '';
    for (const [title, ps] of DRUM_GROUPS) {
      const g = document.createElement('div');
      g.className = 'dgroup';
      g.innerHTML = `<h4>${title}</h4>`;
      for (const p of ps) {
        const row = document.createElement('label');
        row.className = 'dsound' + (off.has(p) ? ' off' : '');
        row.innerHTML = `<input type="checkbox"${off.has(p) ? '' : ' checked'}><span class="dname" title="Click to hear it">${GM.DRUMS[p]}</span><span class="dcount">${hits[p] ? hits[p] + ' in song' : ''}</span>`;
        row.querySelector('input').addEventListener('change', e => setDrumSound(p, e.target.checked));
        row.querySelector('.dname').addEventListener('click', e => {
          e.preventDefault();
          engine.ensure();
          const t = song.tracks.find(x => x.drum) || { drum: true, volume: 0.8, pan: 0, id: -1, program: 0 };
          engine.play(t, 9, p, 105, engine.now, 0.1);
        });
        g.appendChild(row);
      }
      box.appendChild(g);
    }
  }

  function openDrumSounds() { renderDrumSounds(); $('drumDialog').showModal(); }

  // ---- v2.3 equalizer: five bands on the whole mix, live while playing ----------------------------
  const EQ_KEY = STORAGE_KEY + '-eq';
  function eqState() { return { on: engine.eqOn, gains: engine.eqGains.slice() }; }
  function saveEq() { try { localStorage.setItem(EQ_KEY, JSON.stringify(eqState())); } catch (e) { } }
  function setEqState(st, quiet) {
    if (!st) return;
    if (Array.isArray(st.gains)) engine.setEqAll(st.gains);
    if (st.on != null) engine.setEqOn(st.on);
    if (!quiet) renderEq();
    updateEqButton();
  }
  function updateEqButton() {
    const used = engine.eqOn && engine.eqGains.some(g => g !== 0);
    $('btnEq').classList.toggle('on', used || $('eqDialog').open);
    $('btnEq').title = 'Equalizer: shape the sound of the whole mix while it plays' + (used ? ' (on: ' + engine.eqGains.map(g => (g > 0 ? '+' : '') + g).join(' / ') + ' dB)' : '');
  }
  function eqPresetOf(gains) { return Object.keys(AudioEngine.EQ_PRESETS).find(k => AudioEngine.EQ_PRESETS[k].g.join() === gains.join()) || ''; }
  function renderEq() {
    const bands = AudioEngine.EQ_BANDS;
    $('eqBands').innerHTML = bands.map((b, i) => `<div class="eqband"><span class="db" id="eqDb${i}"></span>` +
      `<input type="range" min="-12" max="12" step="1" value="${engine.eqGains[i]}" data-i="${i}" aria-label="${b.name} ${b.label}">` +
      `<span class="bn">${b.name}</span><span class="bf">${b.label}</span></div>`).join('');
    $('eqBands').querySelectorAll('input').forEach(inp => {
      inp.oninput = () => { engine.setEq(+inp.dataset.i, +inp.value); eqChanged(); };
      inp.ondblclick = () => { inp.value = 0; engine.setEq(+inp.dataset.i, 0); eqChanged(); };
    });
    $('chkEqOn').checked = engine.eqOn;
    eqChanged(true);
  }
  function eqChanged(noSave) {
    engine.eqGains.forEach((g, i) => { const el = $('eqDb' + i); if (el) el.textContent = (g > 0 ? '+' : '') + g + ' dB'; });
    $('selEqPreset').value = eqPresetOf(engine.eqGains);
    $('eqDialog').classList.toggle('off', !engine.eqOn);
    drawEqCurve();
    updateEqButton();
    if (!noSave) { saveEq(); if (typeof markDirty === 'function') markDirty(); }
  }
  function drawEqCurve() {
    const cv = $('eqCurve');
    const W = cv.clientWidth || 480, H = cv.clientHeight || 110, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const fx = f => Math.log10(f / 20) / Math.log10(20000 / 20) * W;
    const dy = db => H / 2 - db / 15 * (H / 2 - 8);
    g.strokeStyle = '#2e3342'; g.lineWidth = 1; g.fillStyle = '#8a90a2'; g.font = '10px Segoe UI, sans-serif';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = fx(f); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x + 2, H - 3); }
    for (const db of [-12, -6, 6, 12]) { const y = dy(db); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillText((db > 0 ? '+' : '') + db, 2, y - 2); }
    g.strokeStyle = '#4a5170'; g.beginPath(); g.moveTo(0, dy(0)); g.lineTo(W, dy(0)); g.stroke();
    const N = 160, freqs = [];
    for (let k = 0; k < N; k++) freqs.push(20 * Math.pow(1000, k / (N - 1)));
    let resp;
    try { resp = engine.eqResponse(freqs); } catch (e) { resp = new Float32Array(N); }
    g.strokeStyle = engine.eqOn ? '#ffb347' : '#8a90a2'; g.lineWidth = 2; g.beginPath();
    freqs.forEach((f, k) => { const x = fx(f), y = dy(Math.max(-15, Math.min(15, resp[k]))); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  }
  function openEq() {
    const d = $('eqDialog');
    if (d.open) { d.close(); updateEqButton(); return; }
    d.show();
    renderEq();
  }

  function newBeatAllDrums() {
    const ds = song.tracks.filter(t => t.drum);
    if (!ds.length) { status('Add a drum track first (+ Drums).'); return; }
    pushUndo();
    const gen = song.gen = currentGen();
    ds.forEach(t => { t.notes = Generator.generatePart('drums', gen, song.bars, (Date.now() ^ (t.id * 7919)) >>> 0); });
    selection.clear();
    changed({ tracks: true });
    renderDrumSounds();
    status(`New beat written with ${drumOff().length ? 'only the sounds that are on' : 'all sounds'}. Ctrl+Z to undo.`);
  }

  // =========================================================================
  // Chords: progression types per song / section, and a chord per bar
  // =========================================================================
  const CHORD_ROLES = ['chords', 'bass', 'pad', 'arp', 'harmony'];
  const romanSeq = (gen, prog) => prog.map(d => Generator.chordName(gen.key, gen.scale, d).roman).join('–');
  const presetOf = prog => Object.keys(Generator.PROGRESSIONS).find(k => Generator.PROGRESSIONS[k].prog.join() === prog.join()) || null;

  // rewrite the parts that follow the chords in bars [from, to); the melody is rewritten ('regen') or nudged onto the new chord ('fit')
  function rechord(from, to, melodyMode) {
    const gen = song.gen = currentGen();
    const a = from * 16, b = to * 16, seed = Date.now() >>> 0;
    const mel = song.tracks.find(t => t.role === 'melody');
    const splice = (t, role, k) => {
      const fresh = Generator.generatePart(role, gen, song.bars, (seed ^ (k * 7919)) >>> 0, melodyCtx()).filter(x => x.s >= a && x.s < b);
      secs().forEach((s, i) => { if (s.start < to && s.start + s.len > from) applySectionOctaves(t, fresh.filter(n => n.s >= s.start * 16 && n.s < (s.start + s.len) * 16), i); });
      t.notes = t.notes.filter(x => x.s < a || x.s >= b).concat(fresh);
    };
    if (mel && melodyMode === 'regen') {
      splice(mel, 'melody', 99);
      if (mel.marks && Generator.lastInfo.melody) mel.marks = mel.marks.filter(m => m.bar < from || m.bar >= to).concat((Generator.lastInfo.melody.marks || []).filter(m => m.bar >= from && m.bar < to));
    } else if (mel && melodyMode === 'fit') {
      // strong-beat melody notes that are not in the new chord move to the nearest chord tone
      for (const n of mel.notes) {
        if (n.s < a || n.s >= b || n.s % 8) continue;
        const pcs = Generator.chordPCs(Generator.keyAt(gen, Math.floor(n.s / 16)), gen.scale, Generator.chordAtStep(Generator.chordForBar(gen, Math.floor(n.s / 16)), n.s % 16), false);
        if (pcs.includes(n.p % 12)) continue;
        for (const d of [1, -1, 2, -2, 3, -3]) if (pcs.includes(((n.p + d) % 12 + 12) % 12)) { n.p += d; break; }
      }
    }
    song.tracks.forEach((t, k) => { if (CHORD_ROLES.includes(t.role)) splice(t, t.role, k); });
    selection.clear();
    changed({ tracks: true });
  }

  function setBarChord(bar, deg) {
    if (!song.gen) return;
    pushUndo();
    const s = secs().length ? secs()[secAtBar(bar)] : null;
    if (s) { s.chordOv = s.chordOv || {}; if (deg == null) delete s.chordOv[bar - s.start]; else s.chordOv[bar - s.start] = deg; }
    else { song.gen.chordOv = song.gen.chordOv || {}; if (deg == null) delete song.gen.chordOv[bar]; else song.gen.chordOv[bar] = deg; }
    rechord(bar, bar + 1, 'fit');
    const c = Generator.chordName(Generator.keyAt(song.gen, bar), song.gen.scale, Generator.chordForBar(song.gen, bar));
    status(`Bar ${bar + 1} is now ${c.name} (${c.roman})${deg == null ? ', back to the progression' : ''}. Chords, bass, pad, arpeggio and harmony follow it, and melody notes on the beat moved onto the chord. Ctrl+Z to undo.`);
    playChord(bar);
  }

  function playChord(bar) {
    const t = song.tracks.find(x => x.role === 'chords') || song.tracks.find(x => !x.drum);
    if (!t || !song.gen) return;
    engine.ensure();
    Generator.chordPCs(Generator.keyAt(song.gen, bar), song.gen.scale, Generator.chordForBar(song.gen, bar), false)
      .forEach(pc => engine.play(t, channelOf(t), 60 + ((pc - 60) % 12 + 12) % 12, 80, engine.now, 0.6));
  }

  function setSectionProgression(i, key) {
    const s = secs()[i];
    if (!s || !Generator.PROGRESSIONS[key]) return;
    pushUndo();
    s.prog = Generator.PROGRESSIONS[key].prog.slice();
    s.chordOv = {};
    rechord(s.start, s.start + s.len, 'regen');
    renderSections();
    status(`${s.name}: chords are now ${Generator.PROGRESSIONS[key].name}. Its melody and chord parts were rewritten to fit. Ctrl+Z to undo.`);
  }

  // the generator's progression type, applied to the whole song now (and used by the next Generate)
  function setSongProgression(key) {
    if (!song.gen || !song.tracks.length) return;
    pushUndo();
    const gen = song.gen;
    gen.progType = key;
    if (key === 'auto') { status('Progression: the style picks one. Press Generate new song to use it.'); return; }
    const prog = Generator.PROGRESSIONS[key].prog;
    gen.progression = prog.slice();
    gen.chordOv = {};
    secs().forEach(s => { if (!['P', 'U', 'B'].includes(s.type)) { s.prog = prog.slice(); s.chordOv = {}; } });
    rechord(0, song.bars, 'regen');
    renderSections();
    status(`Chords: ${Generator.PROGRESSIONS[key].name} across the song (pre-choruses, builds and bridges keep their own for contrast). Melody and chord parts were rewritten to fit. Ctrl+Z to undo.`);
  }

  // the little menu that opens on the chord lane
  function openChordMenu(bar, x, y) {
    const gen = song.gen;
    if (!gen) { status('Generate a song first: the chord lane shows its chords.'); return; }
    const menu = $('chordMenu');
    const cur = Generator.chordForBar(gen, bar);
    const s = secs().length ? secs()[secAtBar(bar)] : null;
    const ov = s ? s.chordOv && s.chordOv[bar - s.start] != null : gen.chordOv && gen.chordOv[bar] != null;
    menu.innerHTML = `<div class="cm-head">Bar ${bar + 1}${s ? ' · ' + s.name : ''}</div><div class="cm-grid">` +
      [0, 1, 2, 3, 4, 5, 6].map(d => { const c = Generator.chordName(Generator.keyAt(gen, bar), gen.scale, d); return `<button data-d="${d}" class="${d === cur ? 'on' : ''}">${c.name}<small>${c.roman}</small></button>`; }).join('') +
      `</div>${ov ? '<button class="cm-reset">↺ Back to the progression</button>' : ''}`;
    menu.style.display = 'block';
    const wrap = $('rollWrap').getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(x, wrap.width - 250)) + 'px';
    menu.style.top = (y + 6) + 'px';
    menu.querySelectorAll('.cm-grid button').forEach(btn => {
      btn.onmouseenter = () => { const t = song.tracks.find(q => q.role === 'chords') || song.tracks.find(q => !q.drum); if (!t) return; engine.ensure(); Generator.chordPCs(Generator.keyAt(gen, bar), gen.scale, +btn.dataset.d, false).forEach(pc => engine.play(t, channelOf(t), 60 + ((pc - 60) % 12 + 12) % 12, 60, engine.now, 0.35)); };
      btn.onclick = () => { closeChordMenu(); setBarChord(bar, +btn.dataset.d); };
    });
    const rs = menu.querySelector('.cm-reset');
    if (rs) rs.onclick = () => { closeChordMenu(); setBarChord(bar, null); };
  }
  function closeChordMenu() { $('chordMenu').style.display = 'none'; }

  // =========================================================================
  // Melody leaps
  // =========================================================================
  const leapValue = () => +$('inLeap').value / 100;
  function leapText(v) {
    const max = Melody.maxLeap(v);
    return max <= 2 ? 'scale steps only' : max <= 4 ? 'up to a 3rd' : max <= 6 ? 'up to a 4th' : max === 7 ? 'up to a 5th' : max <= 9 ? 'up to a 6th' : max <= 11 ? 'up to a 7th' : 'up to an octave';
  }
  function showLeap() { $('leapVal').textContent = leapText(leapValue()); }

  // =========================================================================
  // Projects: save the whole current state (IndexedDB, with a localStorage fallback)
  // =========================================================================
  const ProjectDB = (() => {
    let dbp = null;
    const LS = 'midi-music-maker-projects';
    const lsAll = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
    const lsStore = {
      list: async () => Object.values(lsAll()),
      get: async id => lsAll()[id],
      put: async rec => { const a = lsAll(); a[rec.id] = rec; localStorage.setItem(LS, JSON.stringify(a)); },
      del: async id => { const a = lsAll(); delete a[id]; localStorage.setItem(LS, JSON.stringify(a)); }
    };
    function open() {
      if (!dbp) dbp = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('no IndexedDB'));
        const rq = indexedDB.open('midi-music-maker', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('projects', { keyPath: 'id' });
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
      return dbp;
    }
    async function run(mode, fn) {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction('projects', mode);
        const rq = fn(tx.objectStore('projects'));
        tx.oncomplete = () => res(rq && rq.result);
        tx.onerror = () => rej(tx.error);
      });
    }
    const wrap = (name, fn) => async (...a) => { try { return await fn(...a); } catch (e) { return lsStore[name](...a); } };
    return {
      list: wrap('list', () => run('readonly', st => st.getAll())),
      get: wrap('get', id => run('readonly', st => st.get(id))),
      put: wrap('put', rec => run('readwrite', st => st.put(rec))),
      del: wrap('del', id => run('readwrite', st => st.delete(id)))
    };
  })();

  // ---- instrument theme packs -------------------------------------------------------------
  const PACK_ROLES = ['chords', 'bass', 'melody', 'riff', 'harmony', 'counter', 'pad', 'arp', 'lead'];
  function packSummary(pk) {
    const pr = pk.programs;
    return ['melody', 'chords', 'bass', 'pad'].map(r => `${r}: ${GM.GM_NAMES[pr[r]]}`).join(', ');
  }
  function renderPackOptions() {
    const esc = x => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const groups = {};
    for (const [id, pk] of Object.entries(Generator.PACKS)) (groups[pk.group] = groups[pk.group] || []).push(`<option value="${esc(id)}" title="${esc(packSummary(pk))}">${esc(pk.name)}</option>`);
    $('selPack').innerHTML = '<option value="auto">Style’s own band</option>' + Object.entries(groups).map(([g, o]) => `<optgroup label="${esc(g)}">${o.join('')}</optgroup>`).join('');
  }
  // switch the generated parts of the current song to the pack's instruments right away
  function setPack(id) {
    const gen = song.gen;
    const probe = Object.assign({}, gen || { style: $('selStyle').value }, { pack: id });
    const parts = song.tracks.filter(t => !t.drum && PACK_ROLES.includes(t.role));
    if (!parts.length) { status('Pack chosen. Press Generate new song to use it.'); return; }
    pushUndo();
    if (gen) gen.pack = id;
    for (const t of parts) {
      t.program = Generator.programFor(t.role, probe);
      if (engine.mode === 'sampled') engine.loadProgram(t.program);
    }
    changed({ tracks: true });
    const pk = id === 'auto' ? Generator.PACKS[probe.style] : Generator.PACKS[id];
    status(`Instruments: ${pk ? pk.name : 'style default'} (${parts.map(t => `${t.name} → ${GM.GM_NAMES[t.program]}`).join(', ')}). Ctrl+Z undoes it.`, true);
  }

  const CONTROL_IDS = ['selStyle', 'selKey', 'selScale', 'selForm', 'selLength', 'inLoopBars', 'selStructure', 'inInstruments', 'selProg', 'selKeyPlan', 'selPack', 'inPhrase', 'inLeap', 'selSnap', 'selLen', 'inVel', 'inReverb', 'selSecScope'];
  let project = { id: null, name: null, dirty: false, savedAt: null };

  function captureUI() {
    const controls = {};
    CONTROL_IDS.forEach(id => controls[id] = $(id).value);
    controls.chkHook = $('chkHook').checked;
    controls.loop = $('btnLoop').classList.contains('on');
    controls.keep = Object.assign({}, keep);
    controls.eq = eqState();
    return { selTrackId, selSec, playStart, octave, view: { scrollX: view.scrollX, scrollY: view.scrollY, stepW: view.stepW, rowH: view.rowH }, controls };
  }
  function captureState(withHistory = true) {
    return {
      app: 'midi-music-maker', kind: 'project-state', version: 2, savedAt: Date.now(),
      song: JSON.parse(snapshot()), ui: captureUI(),
      history: withHistory ? { undo: undoStack.slice(-25), redo: redoStack.slice(-25) } : null
    };
  }
  function applyUI(ui) {
    if (!ui) return;
    const c = ui.controls || {};
    CONTROL_IDS.forEach(id => { if (c[id] != null) $(id).value = c[id]; });
    $('chkHook').checked = !!c.chkHook;
    if (c.loop != null) $('btnLoop').classList.toggle('on', c.loop);
    if (c.keep) ['bpm', 'bars', 'swing'].forEach(k => setKeep(k, c.keep[k]));
    $('velVal').textContent = $('inVel').value;
    engine.setReverb(+$('inReverb').value);
    if (c.eq) setEqState(c.eq, !$('eqDialog').open);
    showLeap();
    showLoopBars();
    if (song.tracks.some(t => t.id === ui.selTrackId)) selTrackId = ui.selTrackId;
    selSec = ui.selSec != null ? ui.selSec : -1;
    playStart = Math.min(ui.playStart || 0, songSteps() - 1);
    if (ui.octave != null) { octave = ui.octave; $('octaveInfo').textContent = 'Oct ' + octave; }
    if (ui.view) Object.assign(view, ui.view);
  }
  function applyState(st, msg) {
    stop(true);
    song = st.song;
    nextId = Math.max(0, ...song.tracks.map(t => t.id || 0)) + 1;
    undoStack = (st.history && st.history.undo) || [];
    redoStack = (st.history && st.history.redo) || [];
    selection.clear();
    selTrackId = song.tracks[0] && song.tracks[0].id;
    applyUI(st.ui);
    const v = Object.assign({}, view);
    syncAll();
    Object.assign(view, { scrollX: v.scrollX, scrollY: v.scrollY });
    clampScroll();
    updatePosition(playStart);
    renderSections();
    if (engine.mode === 'sampled') song.tracks.forEach(t => { if (!t.drum) engine.loadProgram(t.program); });
    if (msg) status(msg);
  }

  function showProjState() {
    const el = $('projState');
    el.classList.toggle('dirty', project.dirty);
    if (!project.id) el.textContent = project.dirty ? '● not saved' : '';
    else el.textContent = project.dirty ? '● unsaved changes' : '✓ saved ' + new Date(project.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.title = project.id ? `Project “${project.name}”` : 'This song is not in your projects yet: press Save';
  }
  function markDirty() { if (!project.dirty) { project.dirty = true; showProjState(); } }
  function detachProject() { project = { id: null, name: null, dirty: true, savedAt: null }; showProjState(); }

  async function saveToLibrary(asNew, name) {
    const state = captureState(true);
    let rec = !asNew && project.id ? await ProjectDB.get(project.id) : null;
    if (!rec) {
      rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || song.name || 'Untitled', created: Date.now(), versions: [] };
    }
    if (!asNew && project.id && song.name && rec.name !== song.name && !name) rec.name = song.name;
    rec.updated = state.savedAt;
    rec.state = state;
    rec.summary = { bars: song.bars, tracks: song.tracks.length, bpm: song.bpm, style: song.gen ? song.gen.style : '', sections: secs().length };
    // every save is also kept as a version (without undo history) so earlier states can be reopened
    rec.versions = [{ at: state.savedAt, summary: rec.summary, state: Object.assign({}, state, { history: null }) }].concat(rec.versions || []).slice(0, 20);
    try { await ProjectDB.put(rec); }
    catch (e) { status('Could not save: ' + e.message + '. Try “Download project file” instead.', true); return; }
    project = { id: rec.id, name: rec.name, dirty: false, savedAt: rec.updated };
    showProjState();
    persistSession();
    status(`Saved “${rec.name}” (version ${rec.versions.length}). Open 📁 Projects to reopen it or go back to an earlier version.`);
    if ($('projDialog').open) renderProjects();
  }

  async function openFromLibrary(id, versionAt) {
    const rec = await ProjectDB.get(id);
    if (!rec) return;
    if (project.dirty && !confirm('Your current song has unsaved changes. Open the other project anyway?')) return;
    const v = versionAt ? rec.versions.find(x => x.at === versionAt) : null;
    const st = JSON.parse(JSON.stringify(v ? v.state : rec.state));
    applyState(st, v ? `Opened “${rec.name}” as it was at ${new Date(v.at).toLocaleString()}.` : `Opened “${rec.name}”, exactly as you saved it.`);
    project = { id: rec.id, name: rec.name, dirty: !!v, savedAt: rec.updated };
    showProjState();
    persistSession();
    $('projDialog').close();
  }

  function downloadState() {
    download(safeName(song.name) + '.mmm.json', JSON.stringify(captureState(true)), 'application/json');
    status('Project file saved to your Downloads folder. Open file… loads it back exactly as it is now.');
  }

  const fmtDate = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  async function renderProjects() {
    const box = $('projList');
    const all = (await ProjectDB.list()).sort((a, b) => b.updated - a.updated);
    if (!all.length) { box.innerHTML = '<div class="none">No saved projects yet. Press “Save current project”.</div>'; return; }
    box.innerHTML = '';
    for (const rec of all) {
      const s = rec.summary || {};
      const el = document.createElement('div');
      el.className = 'proj' + (rec.id === project.id ? ' cur' : '');
      el.innerHTML = `
        <div class="row"><span class="pname"></span><span class="meta">${fmtDate(rec.updated)}</span></div>
        <div class="row"><span class="meta" style="flex:1">${[s.style, s.bars + ' bars', s.tracks + ' tracks', s.sections ? s.sections + ' sections' : '', s.bpm + ' BPM'].filter(Boolean).join(' · ')}</span>
          <button class="open accent">Open</button><button class="vers">Versions (${(rec.versions || []).length})</button>
          <button class="ren">Rename</button><button class="dl" title="Download this project as a file">⬇</button><button class="del" title="Delete">✕</button></div>
        <div class="versions"></div>`;
      el.querySelector('.pname').textContent = rec.name + (rec.id === project.id ? '  (open now)' : '');
      el.querySelector('.open').onclick = () => openFromLibrary(rec.id);
      el.querySelector('.vers').onclick = () => el.classList.toggle('open');
      el.querySelector('.ren').onclick = async () => {
        const n = prompt('Project name', rec.name);
        if (!n || !n.trim()) return;
        rec.name = n.trim();
        await ProjectDB.put(rec);
        if (rec.id === project.id) { project.name = rec.name; showProjState(); }
        renderProjects();
      };
      el.querySelector('.dl').onclick = () => download(safeName(rec.name) + '.mmm.json', JSON.stringify(rec.state), 'application/json');
      el.querySelector('.del').onclick = async () => {
        if (!confirm(`Delete “${rec.name}” and all its versions from this browser? This can't be undone.`)) return;
        await ProjectDB.del(rec.id);
        if (rec.id === project.id) detachProject();
        renderProjects();
      };
      const vbox = el.querySelector('.versions');
      (rec.versions || []).forEach((v, k) => {
        const row = document.createElement('div');
        row.className = 'ver';
        row.innerHTML = `<span>${k === 0 ? 'Latest · ' : ''}${fmtDate(v.at)} · ${v.summary ? v.summary.bars + ' bars, ' + v.summary.tracks + ' tracks' : ''}</span><button>Open this version</button>`;
        row.querySelector('button').onclick = () => openFromLibrary(rec.id, v.at);
        vbox.appendChild(row);
      });
      box.appendChild(el);
    }
  }
  function openProjects() { renderProjects(); $('projDialog').showModal(); }

  // the last session (song + view + which project it is) comes back when the page is reopened
  function persistSession() {
    try {
      localStorage.setItem(STORAGE_KEY, snapshot());
      localStorage.setItem(STORAGE_KEY + '-ui', JSON.stringify({ ui: captureUI(), project }));
    } catch (e) { /* storage full */ }
  }

  // =========================================================================
  // File handling
  // =========================================================================

  function exportMid() {
    const data = MidiFile.exportMidi(Object.assign({}, song, { tracks: song.tracks.map(t => Object.assign({}, t, { mute: !audible(t) })) }));
    download(safeName(song.name) + '.mid', data, 'audio/midi');
    status('MIDI file exported to your Downloads folder.');
  }

  function loadSong(s, msg) {
    stop(true);
    pushUndo();
    song = s;
    nextId = Math.max(0, ...song.tracks.map(t => t.id || 0)) + 1;
    song.tracks.forEach((t, i) => { if (!t.id) t.id = nextId++; if (!t.color) t.color = COLORS[i % COLORS.length]; });
    selTrackId = song.tracks[0] && song.tracks[0].id;
    selection.clear();
    if (song.gen) {
      $('selKey').value = song.gen.key; $('selScale').value = song.gen.scale; $('selStyle').value = song.gen.style;
      $('selForm').value = song.gen.form || 'auto';
      if (song.gen.phrase) $('inPhrase').value = song.gen.phrase;
      $('selLength').value = song.gen.sections ? 'full' : 'loop';
      if (song.gen.loopBars) $('inLoopBars').value = song.gen.loopBars; else if (!song.gen.sections) $('inLoopBars').value = song.bars;
      showLoopBars();
      $('selStructure').value = song.gen.structure && SongForm.TEMPLATES[song.gen.structure] ? song.gen.structure : 'style';
      if (song.gen.instruments) $('inInstruments').value = song.gen.instruments;
      $('selProg').value = song.gen.progType && Generator.PROGRESSIONS[song.gen.progType] ? song.gen.progType : 'auto';
      $('selPack').value = song.gen.pack && Generator.PACKS[song.gen.pack] ? song.gen.pack : 'auto';
      $('selKeyPlan').value = song.gen.keyPlan && SongForm.KEY_PLANS[song.gen.keyPlan] ? song.gen.keyPlan : 'auto';
      if (typeof song.gen.leap === 'number') { $('inLeap').value = Math.round(song.gen.leap * 100); showLeap(); }
    }
    selSec = -1;
    syncAll();
    if (engine.mode === 'sampled') song.tracks.forEach(t => { if (!t.drum) engine.loadProgram(t.program); });
    if (msg) status(msg);
  }

  $('fileInput').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      if (/\.midi?$/i.test(f.name)) {
        const m = MidiFile.importMidi(await f.arrayBuffer());
        if (!m.tracks.length) throw new Error('No notes found in this MIDI file.');
        let end = 0;
        m.tracks.forEach(t => t.notes.forEach(n => end = Math.max(end, n.s + n.l)));
        const s = {
          name: m.name || f.name.replace(/\.midi?$/i, ''), bpm: m.bpm, bars: Math.max(1, Math.min(256, Math.ceil(end / 16))),
          beatsPerBar: 4, stepsPerBeat: 4, swing: 0, gen: null,
          tracks: m.tracks.map((t, i) => Object.assign(t, { id: i + 1, volume: 0.8, pan: 0, mute: false, solo: false, color: COLORS[i % COLORS.length], role: null }))
        };
        loadSong(s, `Imported “${f.name}” – ${s.tracks.length} tracks, ${s.bars} bars.`);
        detachProject();
      } else {
        const s = JSON.parse(await f.text());
        if (s.kind === 'project-state' && s.song) {
          if (project.dirty && !confirm('Your current song has unsaved changes. Open this project file anyway?')) return;
          applyState(s, `Opened “${f.name}” exactly as it was saved.`);
          detachProject();
          return;
        }
        if (!s.tracks) throw new Error('This is not a MIDI Music Maker project.');
        delete s.app; delete s.version;
        loadSong(s, `Opened “${f.name}”.`);
        detachProject();
      }
    } catch (err) {
      status('Could not open file: ' + err.message, true);
    }
  });

  // =========================================================================
  // Controls wiring
  // =========================================================================
  function syncAll() {
    $('inBpm').value = song.bpm;
    $('inBars').value = song.bars;
    $('inSwing').value = song.swing || 0;
    $('inName').value = song.name;
    renderTracks();
    renderSections();
    indexDirty = true;
    scrollToNotes();
    changed({ tracks: true, quiet: true });
  }

  function init() {
    // an old cached index.html with a new app.js (or the other way round) shows up as missing controls
    if (!$('sectionbar') || !$('btnDrumSounds') || !$('inLeap') || !$('selPack') || !$('inLoopBars')) {
      document.body.insertAdjacentHTML('afterbegin', '<div style="background:#ffb347;color:#000;padding:8px 12px;font-weight:600">This page is an older copy. Press Ctrl+F5 to load the newest version.</div>');
    }
    // generator selects
    const esc = x => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    $('selStyle').innerHTML = Generator.FAMILIES.map((fam, fi) => `<optgroup label="${esc(fam)}">` +
      Object.entries(Generator.STYLES).filter(([, st]) => st.family === fi).map(([name, st]) => `<option value="${esc(name)}" title="${esc(st.desc || '')}">${esc(name)}</option>`).join('') + '</optgroup>').join('');
    $('selStyle').onchange = e => {
      const st = Generator.STYLES[e.target.value];
      if (!st) return;
      const pk = $('selPack').value === 'auto' ? `the ${e.target.value} band` : `the ${Generator.PACKS[$('selPack').value].name} pack`;
      status(`${e.target.value}: ${st.desc}, about ${st.bpm} BPM${st.swing ? ', swung' : ''}. Plays with ${pk}. ${st.tip ? st.tip + ' ' : ''}Press Generate new song to hear it.`);
    };
    renderPackOptions();
    $('selPack').onchange = e => setPack(e.target.value);
    $('selKey').innerHTML = GM.NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    $('selScale').innerHTML = Object.keys(GM.SCALES).map(s => `<option>${s}</option>`).join('');
    const tplBars = f => f.split(' ').reduce((a, x) => a + +x.slice(1), 0);
    $('selStructure').innerHTML = '<option value="style">Style default</option>' +
      Object.entries(SongForm.TEMPLATES).map(([id, t]) => `<option value="${id}" title="${t.form}">${t.name} · ${tplBars(t.form)} bars</option>`).join('');
    $('selStructure').onchange = e => {
      if (e.target.value !== 'style') $('selLength').value = 'full';
      const t = SongForm.TEMPLATES[e.target.value];
      status(t ? `Structure: ${t.name}. Press Generate new song to use it.` : 'Structure: each style uses its own layout. Press Generate new song to use it.');
    };
    $('selProg').innerHTML = '<option value="auto">Auto (style picks)</option>' +
      Object.entries(Generator.PROGRESSIONS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
    $('selProg').onchange = e => setSongProgression(e.target.value);
    document.addEventListener('mousedown', e => { if (!e.target.closest('#chordMenu') && e.target !== canvas) closeChordMenu(); });
    $('inInstruments').addEventListener('keydown', e => e.stopPropagation());
    $('inInstruments').onchange = e => {
      const n = Math.max(2, Math.min(9, Math.round(+e.target.value) || 4));
      e.target.value = n;
      const roles = Generator.rolesFor(n).map(r => r === 'drums' ? 'drums' : (Generator.ROLE_NAMES_X[r] || r).toLowerCase());
      status(`${n} instruments: ${roles.join(', ')}. Press Generate new song to use them.`);
    };
    $('selLength').addEventListener('change', e => { if (e.target.value === 'loop') $('selStructure').value = 'style'; showLoopBars(); });
    $('selStructure').addEventListener('change', showLoopBars);
    $('selStyle').addEventListener('change', showLoopBars);
    $('inLoopBars').addEventListener('keydown', e => e.stopPropagation());
    $('inLoopBars').onchange = e => { e.target.value = loopBarsValue(); status(`Loop length ${e.target.value} bars. Press Generate new song to use it.`); };
    showLoopBars();

    $('btnPlay').onclick = () => playing ? stop() : play();
    $('btnStop').onclick = () => stop(true);
    $('btnLoop').onclick = e => e.currentTarget.classList.toggle('on');
    $('btnRec').onclick = e => {
      recording = !recording;
      e.currentTarget.classList.toggle('on', recording);
      status(recording ? 'Recording armed: press Play, then play notes on your keyboard (Z–M, Q–U) or a MIDI keyboard.' : 'Recording off.');
    };
    $('inBpm').onchange = e => { pushUndo(); song.bpm = Math.max(30, Math.min(300, +e.target.value || 120)); e.target.value = song.bpm; setKeep('bpm', true); changed(); };
    document.querySelectorAll('button.keep').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.keep; setKeep(k, !keep[k]);
        status(keep[k] ? `Generate will keep your ${k === 'bpm' ? 'BPM' : k === 'bars' ? 'bar count' : 'swing'}.` : `Generate will use the style's ${k === 'bpm' ? 'tempo' : k === 'bars' ? 'length' : 'swing'} again.`);
      };
    });
    ['bpm', 'bars', 'swing'].forEach(k => setKeep(k, false));
    $('inBars').onchange = e => {
      pushUndo();
      const bars = Math.max(1, Math.min(256, Math.round(+e.target.value) || 8));
      if (secs().length) { setBarsWithSections(bars); renderSections(); } else song.bars = bars;
      e.target.value = song.bars; clampScroll(); changed({ tracks: true });
      setKeep('bars', true);
      $('inLoopBars').value = song.bars;
    };
    $('inSwing').oninput = e => { song.swing = +e.target.value; setKeep('swing', true); changed(); };
    $('inName').onchange = e => { song.name = e.target.value || 'Untitled'; changed(); };
    $('inName').addEventListener('keydown', e => e.stopPropagation());
    $('inReverb').oninput = e => engine.setReverb(+e.target.value);
    // equalizer
    $('selEqPreset').innerHTML = '<option value="">Custom</option>' + Object.entries(AudioEngine.EQ_PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
    $('btnEq').onclick = openEq;
    $('btnEqClose').onclick = () => { $('eqDialog').close(); updateEqButton(); };
    $('selEqPreset').onchange = e => { const p = AudioEngine.EQ_PRESETS[e.target.value]; if (p) { engine.setEqAll(p.g); if (!engine.eqOn) engine.setEqOn(true); renderEq(); saveEq(); } };
    $('btnEqReset').onclick = () => { engine.setEqAll([0, 0, 0, 0, 0]); renderEq(); saveEq(); };
    $('chkEqOn').onchange = e => { engine.setEqOn(e.target.checked); eqChanged(); };
    window.addEventListener('resize', () => { if ($('eqDialog').open) drawEqCurve(); });
    $('inVel').oninput = e => { $('velVal').textContent = e.target.value; if (selection.size) { for (const n of selection) n.v = +e.target.value; changed(); } };
    $('selEngine').onchange = e => setEngine(e.target.value);
    $('selKey').onchange = $('selScale').onchange = () => { needsDraw = true; };

    $('btnNew').onclick = () => { const off = song.drumOff; loadSong(Object.assign(emptySong(), { drumOff: off ? off.slice() : [] }), 'New empty song. Ctrl+Z to get the previous one back.'); detachProject(); };
    $('btnDrumSounds').onclick = openDrumSounds;
    $('btnEdDrumSounds').onclick = openDrumSounds;
    $('btnDrumClose').onclick = () => $('drumDialog').close();
    $('drumDialog').addEventListener('keydown', e => e.stopPropagation());
    $('btnDrumAllOn').onclick = () => setDrumOffList([], 'All drum sounds are on. Press 🎲 New beat to use them.');
    $('btnDrumOnlyUsed').onclick = () => {
      const hits = drumHits();
      const off = DRUM_GROUPS.flatMap(([, ps]) => ps).filter(p => !hits[p]);
      setDrumOffList(off, `Switched off ${off.length} sounds that aren't in this song. Only ${Object.keys(hits).length} stay on.`);
    };
    $('btnDrumRebeat').onclick = newBeatAllDrums;
    $('btnOpen').onclick = () => $('fileInput').click();
    $('btnSave').onclick = () => saveToLibrary();
    $('btnProjects').onclick = openProjects;
    $('btnDlgClose').onclick = () => $('projDialog').close();
    $('btnDlgSave').onclick = () => saveToLibrary();
    $('btnDlgSaveAs').onclick = () => { const n = prompt('Name for the new copy', (song.name || 'Untitled') + ' (copy)'); if (n && n.trim()) saveToLibrary(true, n.trim()); };
    $('btnDlgDownload').onclick = downloadState;
    $('btnDlgOpenFile').onclick = () => { $('projDialog').close(); $('fileInput').click(); };
    $('projDialog').addEventListener('keydown', e => e.stopPropagation());
    // sections
    $('selAddSec').innerHTML = SEC_ORDER.map(t => `<option value="${t}"${t === 'C' ? ' selected' : ''}>${secTypeName(t)}</option>`).join('');
    $('btnAddSec').onclick = () => addSection($('selAddSec').value);
    $('selSecScope').onchange = () => { renderSections(); persistSession(); };
    // melody leaps: the label follows the slider, letting go rebuilds the melody
    $('inLeap').oninput = showLeap;
    $('inLeap').onchange = () => {
      showLeap();
      const mel = song.tracks.find(t => t.role === 'melody');
      if (!mel) { status(`Melody leaps: ${leapText(leapValue())}. Used the next time a melody is generated.`); return; }
      regeneratePart(mel);
      status(`Melody rebuilt with leaps ${leapText(leapValue())}. ${melodyReport()} Ctrl+Z to undo.`, true);
    };
    $('btnExport').onclick = exportMid;
    $('btnGenerate').onclick = () => {
      const s = generatedSong(Date.now() >>> 0);
      loadSong(s);
      if (s.gen && s.gen.loop) $('btnLoop').classList.add('on');   // game loops play round and round
      if (s.gen && s.gen.stinger) $('btnLoop').classList.remove('on');   // a stinger plays once
      detachProject();
      const formInfo = (Generator.lastInfo.form ? `Form: ${Generator.lastInfo.form}. ` : '') + (Generator.lastInfo.band && Generator.lastInfo.band.length ? Generator.lastInfo.band.join('. ') + '. ' : '');
      status(`Generated “${s.name}” at ${s.bpm} BPM. ${formInfo}${riffReport()} ${melodyReport()} Space plays.`, true);
      if (Generator.lastInfo.riff) $('phraseInfo').textContent = riffReport();
      selTrackId = (s.tracks.find(t => t.role === 'melody') || s.tracks[0]).id;
      renderTracks(); scrollToNotes();
    };
    $('btnPhrase').onclick = makeHook;
    $('inPhrase').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') makeHook(); });
    $('btnAnswer').onclick = () => deriveFrom('answer');
    $('btnRepitch').onclick = () => deriveFrom('repitch');
    $('btnAddTrack').onclick = () => addTrack(false);
    $('btnAddDrums').onclick = () => addTrack(true);
    $('btnZoomIn').onclick = () => zoom(1.25);
    $('btnZoomOut').onclick = () => zoom(0.8);
    $('btnClear').onclick = () => { const t = curTrack(); if (!t.notes.length) return; pushUndo(); t.notes = []; t.marks = undefined; selection.clear(); changed(); status('Track cleared. Ctrl+Z to undo.'); };

    new ResizeObserver(resize).observe($('rollWrap'));

    // restore last session or start with a generated demo
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { }
    if (saved && saved.tracks) {
      song = saved;
      nextId = Math.max(0, ...song.tracks.map(t => t.id)) + 1;
    } else {
      $('selKey').value = 0; $('selScale').value = 'Major'; $('selStyle').value = 'Pop';
      song = { bars: 8 };
      song = generatedSong(12345);
    }
    if (song.gen) {
      $('selKey').value = song.gen.key; $('selScale').value = song.gen.scale; $('selStyle').value = song.gen.style;
      $('selForm').value = song.gen.form || 'auto';
      if (song.gen.phrase) $('inPhrase').value = song.gen.phrase;
    }
    selTrackId = (song.tracks.find(t => t.role === 'melody') || song.tracks[0]).id;
    let session = null;
    try { session = JSON.parse(localStorage.getItem(STORAGE_KEY + '-ui')); } catch (e) { }
    if (saved && saved.tracks && session) {
      if (session.project) project = session.project;
      applyUI(session.ui);
    } else if (song.gen && typeof song.gen.leap === 'number') $('inLeap').value = Math.round(song.gen.leap * 100);
    // the equalizer you last used (it may be newer than the saved session)
    try { setEqState(JSON.parse(localStorage.getItem(EQ_KEY)), true); } catch (e) { }
    showLeap();
    showProjState();

    let eng = 'sampled';
    try { eng = localStorage.getItem(STORAGE_KEY + '-engine') || 'sampled'; } catch (e) { }
    engine.mode = eng;
    $('selEngine').value = eng;

    resize();
    const keepView = session && session.ui && session.ui.view;
    syncAll();
    if (keepView) { Object.assign(view, keepView); clampScroll(); updatePosition(playStart); }
    engineStatus();
    // start downloading instrument samples right away (decoding waits for the first click)
    if (engine.mode === 'sampled') song.tracks.forEach(t => { if (!t.drum) engine.loadProgram(t.program); });
    requestAnimationFrame(loop);
  }

  // expose for debugging / tests
  window.mmm = { get song() { return song; }, play, stop, engine, exportMid };
  init();
})();
