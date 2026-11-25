// Standard MIDI File (.mid) export and import
(function (root) {
  const PPQ = 480;

  function vlq(n) {
    const bytes = [n & 0x7f];
    n >>= 7;
    while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; }
    return bytes;
  }
  const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const u16 = n => [(n >>> 8) & 255, n & 255];
  const textBytes = s => Array.from(unescape(encodeURIComponent(s))).map(c => c.charCodeAt(0));

  function chunk(type, data) {
    return [...textBytes(type), ...u32(data.length), ...data];
  }

  function trackChunk(events) {
    // events: [{tick, order, bytes}] ; order breaks ties (note-offs before note-ons)
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const data = [];
    let last = 0;
    for (const e of events) {
      data.push(...vlq(e.tick - last), ...e.bytes);
      last = e.tick;
    }
    data.push(0, 0xff, 0x2f, 0); // end of track
    return chunk('MTrk', data);
  }

  // Assign MIDI channels: drum tracks -> 9, melodic tracks -> 0..15 skipping 9
  function assignChannels(tracks) {
    const melodic = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
    let next = 0;
    return tracks.map(t => t.drum ? 9 : melodic[next++ % melodic.length]);
  }

  // song: { bpm, stepsPerBeat, tracks:[{name, program, drum, volume, pan, mute, notes:[{p,s,l,v}]}] }
  function exportMidi(song) {
    const stepTicks = PPQ / song.stepsPerBeat;
    const mpqn = Math.round(60000000 / song.bpm);
    const tracks = song.tracks;
    const channels = assignChannels(tracks);

    const conductor = [
      { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(textBytes(song.name || 'Untitled').length), ...textBytes(song.name || 'Untitled')] },
      { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255] },
      { tick: 0, order: 0, bytes: [0xff, 0x58, 0x04, song.beatsPerBar || 4, 2, 24, 8] }
    ];
    // section markers (Verse, Chorus…) so DAWs show the song form
    const secs = song.sections || (song.gen && song.gen.sections) || [];
    for (const sec of secs) {
      const t = textBytes(sec.name);
      conductor.push({ tick: Math.round(sec.start * 16 * stepTicks), order: 0, bytes: [0xff, 0x06, ...vlq(t.length), ...t] });
    }
    const chunks = [trackChunk(conductor)];

    tracks.forEach((t, i) => {
      const ch = channels[i];
      const name = textBytes(t.name || ('Track ' + (i + 1)));
      const ev = [
        { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...name] },
        { tick: 0, order: 0, bytes: [0xc0 | ch, t.drum ? 0 : (t.program & 127)] },
        { tick: 0, order: 0, bytes: [0xb0 | ch, 7, Math.round(Math.max(0, Math.min(1, t.volume)) * 127)] },
        { tick: 0, order: 0, bytes: [0xb0 | ch, 10, Math.round(((t.pan || 0) + 1) * 63.5)] }
      ];
      if (!t.mute) {
        for (const n of t.notes) {
          const sw = s => s + (s % 2 === 1 ? (song.swing || 0) : 0); // swing delays odd 16ths
          const on = Math.round(sw(n.s) * stepTicks);
          const off = Math.round(sw(n.s + n.l) * stepTicks) - (t.drum ? 0 : 1);
          if (n.t) { const ly = textBytes(n.t); ev.push({ tick: on, order: 1.5, bytes: [0xff, 0x05, ...vlq(ly.length), ...ly] }); }
          ev.push({ tick: on, order: 2, bytes: [0x90 | ch, n.p & 127, Math.max(1, Math.min(127, n.v | 0))] });
          ev.push({ tick: Math.max(on + 1, off), order: 1, bytes: [0x80 | ch, n.p & 127, 0] });
        }
      }
      chunks.push(trackChunk(ev));
    });

    const header = chunk('MThd', [...u16(1), ...u16(chunks.length), ...u16(PPQ)]);
    return new Uint8Array([...header, ...chunks.flat()]);
  }

  // Returns { bpm, name, tracks:[{name, program, drum, notes:[{p,s,l,v}]}] } with times in steps
  function importMidi(buffer, stepsPerBeat = 4) {
    const d = new Uint8Array(buffer);
    let pos = 0;
    const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d[pos++]); return s; };
    const r32 = () => { const v = (d[pos] << 24 >>> 0) + (d[pos + 1] << 16) + (d[pos + 2] << 8) + d[pos + 3]; pos += 4; return v; };
    const r16 = () => { const v = (d[pos] << 8) + d[pos + 1]; pos += 2; return v; };
    const rv = () => { let v = 0, b; do { b = d[pos++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

    if (str(4) !== 'MThd') throw new Error('Not a MIDI file');
    const hlen = r32();
    const hstart = pos;
    r16(); // format
    const ntracks = r16();
    const division = r16();
    if (division & 0x8000) throw new Error('SMPTE time division is not supported');
    pos = hstart + hlen;

    let bpm = null, songName = null;
    const out = new Map(); // key trackIndex:channel -> track
    for (let ti = 0; ti < ntracks && pos < d.length; ti++) {
      const id = str(4);
      const len = r32();
      const end = pos + len;
      if (id !== 'MTrk') { pos = end; continue; }
      let tick = 0, status = 0, tname = null;
      const programs = {};
      const open = {}; // ch:pitch -> stack of {tick, v}
      const notesByCh = {};
      while (pos < end) {
        tick += rv();
        let b = d[pos];
        if (b & 0x80) { status = b; pos++; } // else running status
        const type = status & 0xf0, ch = status & 0x0f;
        if (status === 0xff) {
          const mt = d[pos++]; const ml = rv();
          if (mt === 0x51 && bpm === null) bpm = 60000000 / ((d[pos] << 16) + (d[pos + 1] << 8) + d[pos + 2]);
          if (mt === 0x03) { const s = String.fromCharCode(...d.slice(pos, pos + ml)); if (ti === 0 && songName === null) songName = s; tname = s; }
          pos += ml;
        } else if (status === 0xf0 || status === 0xf7) {
          pos += rv();
        } else if (type === 0x90 || type === 0x80) {
          const p = d[pos++], v = d[pos++];
          const k = ch + ':' + p;
          if (type === 0x90 && v > 0) {
            (open[k] = open[k] || []).push({ tick, v });
          } else if (open[k] && open[k].length) {
            const st = open[k].shift();
            (notesByCh[ch] = notesByCh[ch] || []).push({ p, on: st.tick, off: tick, v: st.v });
          }
        } else if (type === 0xc0) { programs[ch] = d[pos++]; }
        else if (type === 0xd0) { pos++; }
        else { pos += 2; } // 0xa0 0xb0 0xe0
      }
      pos = end;
      for (const ch of Object.keys(notesByCh)) {
        const c = +ch;
        const key = ti + ':' + c;
        out.set(key, {
          name: tname || (c === 9 ? 'Drums' : 'Track ' + (out.size + 1)),
          program: programs[c] || 0,
          drum: c === 9,
          notes: notesByCh[ch].map(n => {
            const s = Math.round(n.on * stepsPerBeat / division);
            const e = Math.round(n.off * stepsPerBeat / division);
            return { p: n.p, s, l: Math.max(1, e - s), v: n.v };
          })
        });
      }
    }
    return { bpm: bpm ? Math.round(bpm) : 120, name: songName, tracks: [...out.values()] };
  }

  const api = { exportMidi, importMidi, assignChannels, PPQ };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MidiFile = api;
})(this);
