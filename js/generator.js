// Procedural music generator: chords, bass, melody and drums in a chosen key/scale/style
(function (root) {
  const NODE = typeof module !== 'undefined' && module.exports;
  const GM = NODE ? require('./gm.js') : root.GM;
  const Melody = NODE ? require('./melody.js') : root.Melody;
  const SongForm = NODE ? require('./songform.js') : root.SongForm;
  const Arrange = NODE ? require('./arrange.js') : root.Arrange;
  const Perform = NODE ? require('./perform.js') : root.Perform;

  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    next.pick = arr => arr[Math.floor(next() * arr.length)];
    next.chance = p => next() < p;
    return next;
  }

  // ---- styles (genres) ------------------------------------------------------------------
  // Each style sets the tempo, swing, chord and bass rhythm, drum pattern, melody rhythm cells,
  // the song layout and the progressions it prefers, plus its own instrument pack.
  //   drums: one bar of 16ths per GM drum note ('x' hit, 'o' soft ghost)
  //   bass: [start, length, interval above the chord root]
  //   flags: calm (energy capped, no fills), edm (beat-only intro/outro, 16th arps), arp16, keyChange (last chorus up a step),
  //          walk (bass walks into the next chord), fill ('toms' | 'snare' | 'none' | [drum notes]), crash (false = no crash cymbals)
  const CELLS = {
    pop: [[[0, 2], [2, 2], [4, 4]], [[0, 4], [4, 4]], [[0, 3], [3, 3], [6, 2]], [[0, 2], [2, 2], [4, 2], [6, 2]], [[2, 2], [4, 4]], [[0, 6]]],
    lofi: [[[0, 3], [3, 5]], [[2, 2], [4, 4]], [[0, 2], [2, 2], [4, 4]], [[0, 8]], [[4, 4]], [[0, 2], [3, 3], [6, 2]]],
    rock: [[[0, 4], [4, 4]], [[0, 2], [2, 2], [4, 4]], [[0, 6], [6, 2]], [[0, 8]], [[0, 2], [2, 2], [4, 2], [6, 2]]],
    edm: [[[0, 2], [2, 2], [4, 2], [6, 2]], [[0, 3], [3, 3], [6, 2]], [[0, 1], [2, 1], [3, 1], [6, 2]], [[0, 4], [4, 4]], [[2, 2], [4, 2], [6, 2]]],
    ambient: [[[0, 8]], [[0, 4]], [[4, 4]], [], [[0, 2], [2, 6]], [[0, 6]]],
    swing: [[[0, 3], [3, 5]], [[0, 2], [2, 2], [4, 4]], [[2, 2], [4, 4]], [[0, 6], [6, 2]], [[0, 1], [1, 2], [3, 5]], [[0, 8]]],
    rap: [[[0, 1], [1, 1], [2, 2], [4, 2], [6, 2]], [[0, 2], [2, 1], [3, 1], [4, 4]], [[2, 2], [4, 2], [6, 2]], [[0, 3], [3, 3], [6, 2]], [[0, 4], [6, 2]]],
    latin: [[[0, 3], [3, 3], [6, 2]], [[0, 2], [3, 2], [6, 2]], [[0, 3], [3, 5]], [[2, 2], [4, 2], [6, 2]], [[0, 2], [2, 2], [4, 4]]],
    slow: [[[0, 4], [4, 4]], [[0, 8]], [[0, 6], [6, 2]], [[0, 2], [2, 6]], [[0, 3], [3, 5]]],
    drive: [[[0, 2], [2, 2], [4, 2], [6, 2]], [[0, 4], [4, 4]], [[0, 2], [2, 2], [4, 4]], [[0, 6], [6, 2]]]
  };
  const EIGHTHS = [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]];
  const OFFBEATS = [[2, 2], [6, 2], [10, 2], [14, 2]];
  const FAMILIES = ['Pop & rock', 'Blues, jazz & soul', 'Hip-hop', 'Electronic', 'World & Latin', 'Country & folk', 'Orchestral', 'Game music'];
  // programs: chords, bass, melody, riff, then the extra parts harmony, counter, pad, arp, lead
  const P = (chords, bass, melody, riff, harmony, counter, pad, arp, lead) => ({ chords, bass, melody, riff, harmony, counter, pad, arp, lead });

  const STYLES = {
    'Pop': {
      family: 0, bpm: 110, swing: 0, keyChange: true, form: 'I4 V16 P8 C8 V16 P8 C8 B8 C8 C8 O4', formName: 'verse–chorus–bridge',
      progs: { major: ['pop', 'sensitive', 'doowop', 'royal'], minor: ['epic', 'lament', 'minor'] },
      programs: P(0, 33, 80, 27, 53, 73, 48, 46, 56),
      chordRhythm: [[0, 6], [6, 4], [10, 6]], sevenths: false,
      bass: [[0, 3, 0], [3, 3, 0], [6, 2, 7], [8, 3, 0], [11, 3, 0], [14, 2, 12]],
      drums: { 36: 'x.....x.x.......', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.pop, melodyVel: 96, desc: 'bright verse–chorus pop'
    },
    'Indie': {
      family: 0, bpm: 118, swing: 0, form: 'I4 V16 C8 V16 C8 B8 C8 C8 O4', formName: 'verse–chorus with a bridge',
      progs: { major: ['sensitive', 'royal', 'pop', 'two'], minor: ['lament', 'epic'] },
      programs: P(25, 33, 27, 9, 53, 27, 48, 9, 81),
      chordRhythm: EIGHTHS, sevenths: false,
      bass: [[0, 2, 0], [2, 2, 0], [4, 2, 0], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, 7], [14, 2, 0]],
      drums: { 36: 'x.....x...x.....', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.', 54: '....x.......x...' },
      cells: CELLS.drive, melodyVel: 94, desc: 'jangly guitars and a driving 8th-note bass'
    },
    'Rock': {
      family: 0, bpm: 128, swing: 0, keyChange: true, form: 'I4 A8 A8 B8 A8 S8 B8 A8 O4', formName: 'AABA with a solo',
      progs: { major: ['rock', 'pop', 'two'], minor: ['minor', 'lament', 'epic'] },
      programs: P(29, 34, 65, 30, 66, 61, 49, 27, 29),
      chordRhythm: EIGHTHS, power: true,
      bass: [[0, 2, 0], [2, 2, 0], [4, 2, 0], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, 0], [14, 2, 0]],
      drums: { 36: 'x.......x.x.....', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.rock, melodyVel: 100, desc: 'power chords and a straight backbeat'
    },
    'Punk': {
      family: 0, bpm: 172, swing: 0, form: 'I4 V8 C8 V8 C8 B8 C8 C8 O4', formName: 'fast verse–chorus',
      progs: { major: ['rock', 'pop', 'two', 'doowop'], minor: ['minor', 'lament'] },
      programs: P(30, 34, 29, 30, 29, 30, 30, 29, 30),
      chordRhythm: EIGHTHS, power: true,
      bass: [[0, 2, 0], [2, 2, 0], [4, 2, 0], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, 0], [14, 2, 0]],
      drums: { 36: 'x.x...x.x.x...x.', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.drive, melodyVel: 108, desc: 'fast, loud and simple'
    },
    'Metal': {
      family: 0, bpm: 150, swing: 0, form: 'I8 V16 C8 V16 C8 S16 C8 C8 O4', formName: 'verse–chorus with a guitar solo',
      progs: { major: ['rock', 'two'], minor: ['epic', 'andalusian', 'minor', 'lament'] },
      programs: P(30, 34, 29, 30, 30, 29, 48, 30, 30),
      chordRhythm: [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2], [8, 1], [9, 1], [10, 2], [12, 1], [13, 1], [14, 2]], power: true,
      bass: [[0, 1, 0], [1, 1, 0], [2, 2, 0], [4, 1, 0], [5, 1, 0], [6, 2, 0], [8, 1, 0], [9, 1, 0], [10, 2, 0], [12, 1, 0], [13, 1, 0], [14, 2, 0]],
      drums: { 36: 'x.x.x.x.x.x.x.x.', 38: '....x.......x...', 51: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.rock, melodyVel: 106, desc: 'galloping distorted riffs and double kick'
    },
    'Blues': {
      family: 1, bpm: 92, swing: 0.33, template: 'blues', walk: true,
      progs: { major: ['blues'], minor: ['blues'] },
      programs: P(0, 33, 22, 29, 61, 16, 16, 26, 29),
      chordRhythm: [[0, 3], [4, 3], [8, 3], [12, 3]], sevenths: true,
      bass: [[0, 4, 0], [4, 4, 7], [8, 4, 9], [12, 4, 7]],
      drums: { 36: 'x.......x.......', 38: '....x.......x...', 51: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.swing, melodyVel: 92, desc: '12-bar shuffle with a boogie bass', tip: 'Try the Blues or Minor pentatonic scale.'
    },
    'Jazz': {
      family: 1, bpm: 130, swing: 0.33, walk: true, template: 'aaba', fill: 'snare',
      progs: { major: ['jazz', 'circle'], minor: ['circle', 'jazz'] },
      programs: P(0, 32, 65, 26, 66, 56, 48, 11, 56),
      chordRhythm: [[0, 2], [6, 2], [10, 3]], sevenths: true,
      bass: [[0, 4, 0], [4, 4, 7], [8, 4, 12], [12, 4, 7]],
      drums: { 36: 'x...............', 44: '....x.......x...', 51: 'x...x.x.x...x.x.' },
      cells: CELLS.swing, melodyVel: 88, desc: 'swung ride, walking bass, seventh chords', tip: 'Dorian or Major both suit jazz.'
    },
    'Funk': {
      family: 1, bpm: 104, swing: 0.1, form: 'I4 V16 C8 V16 C8 K8 C8 C8 O4', formName: 'groove, hook and a breakdown',
      progs: { major: ['two', 'circle'], minor: ['two', 'minor'] },
      programs: P(7, 36, 61, 28, 65, 28, 16, 28, 66),
      chordRhythm: [[0, 1], [3, 1], [6, 1], [10, 1], [11, 1], [14, 1]], sevenths: true,
      bass: [[0, 2, 0], [3, 1, 12], [6, 1, 0], [7, 1, 12], [10, 2, 7], [14, 1, 12]],
      drums: { 36: 'x.....x...x..x..', 38: '....x..o.o..x...', 42: 'xoxoxoxoxoxoxoxo', 46: '..............x.' },
      cells: CELLS.rap, melodyVel: 96, desc: 'clavinet chops, slap bass, ghost-note snare', tip: 'Dorian or Mixolydian sound funky.'
    },
    'Disco': {
      family: 1, bpm: 120, swing: 0, keyChange: true, form: 'I4 V16 P8 C8 V16 P8 C8 B8 C8 C8 O4', formName: 'verse–chorus–bridge',
      progs: { major: ['circle', 'pop', 'sensitive'], minor: ['circle', 'epic', 'minor'] },
      programs: P(27, 33, 48, 61, 53, 61, 48, 4, 73),
      chordRhythm: OFFBEATS, sevenths: true,
      bass: [[0, 2, 0], [2, 2, 12], [4, 2, 0], [6, 2, 12], [8, 2, 0], [10, 2, 12], [12, 2, 0], [14, 2, 12]],
      drums: { 36: 'x...x...x...x...', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.', 46: '..x...x...x...x.' },
      cells: CELLS.pop, melodyVel: 96, desc: 'four-on-the-floor, octave bass, strings'
    },
    'R&B / Soul': {
      family: 1, bpm: 76, swing: 0.15, form: 'I4 V16 P8 C8 V16 P8 C8 B8 C8 C8 O4', formName: 'verse–chorus–bridge', fill: 'snare',
      progs: { major: ['royal', 'circle', 'jazz', 'sensitive'], minor: ['circle', 'lament'] },
      programs: P(4, 33, 53, 26, 52, 65, 89, 4, 66),
      chordRhythm: [[0, 6], [6, 2], [8, 8]], sevenths: true,
      bass: [[0, 4, 0], [6, 2, 7], [8, 4, 0], [13, 3, 12]],
      drums: { 36: 'x......x..x.....', 37: '....x.......x...', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.slow, melodyVel: 88, desc: 'slow Rhodes seventh chords and a laid-back groove'
    },
    'Gospel': {
      family: 1, bpm: 96, swing: 0.2, keyChange: true, form: 'I4 V16 P8 C8 V16 P8 C8 B8 C8 C8 O4', formName: 'verse–chorus with a vamp',
      progs: { major: ['royal', 'doowop', 'circle', 'pop'], minor: ['circle', 'lament'] },
      programs: P(0, 33, 52, 16, 53, 16, 19, 0, 61),
      chordRhythm: [[0, 4], [4, 4], [8, 4], [12, 4]], sevenths: true,
      bass: [[0, 4, 0], [6, 2, 7], [8, 4, 0], [12, 4, 7]],
      drums: { 36: 'x.....x...x.....', 38: '....x.......x...', 39: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.slow, melodyVel: 96, desc: 'choir, piano and organ, with handclaps'
    },
    'Hip-hop': {
      family: 2, bpm: 90, swing: 0.18, template: 'hiphop', fill: 'snare',
      progs: { major: ['two', 'sensitive'], minor: ['minor', 'lament', 'two'] },
      programs: P(4, 38, 0, 48, 53, 48, 89, 10, 81),
      chordRhythm: [[0, 8], [8, 8]], sevenths: true,
      bass: [[0, 6, 0], [10, 2, 0], [12, 4, 7]],
      drums: { 36: 'x......x.x......', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.rap, melodyVel: 90, desc: 'boom-bap beat and a looped keys sample'
    },
    'Trap': {
      family: 2, bpm: 140, swing: 0, template: 'hiphop', fill: 'snare',
      progs: { major: ['sensitive', 'two'], minor: ['minor', 'lament', 'andalusian', 'epic'] },
      programs: P(89, 38, 73, 98, 54, 9, 92, 10, 81),
      chordRhythm: [[0, 16]], sevenths: false,
      bass: [[0, 10, 0], [10, 2, 0], [12, 4, 0]],
      drums: { 36: 'x.........x..x..', 38: '........x.......', 39: '........x.......', 42: 'x.x.x.x.x.x.xxxx', 46: '......x.........' },
      cells: CELLS.rap, melodyVel: 86, desc: 'half-time 808s, hi-hat rolls, dark bells', tip: 'Minor or Harmonic minor sounds the part.'
    },
    'Lo-fi': {
      family: 2, bpm: 82, swing: 0.28, form: 'I4 A8 A8 B8 A8 B8 A8 O4', formName: 'AABA',
      progs: { major: ['jazz', 'royal', 'circle'], minor: ['circle', 'lament'] },
      programs: P(4, 32, 11, 12, 65, 71, 89, 8, 26),
      chordRhythm: [[0, 7], [7, 9]], sevenths: true,
      bass: [[0, 6, 0], [7, 3, 7], [10, 6, 0]],
      drums: { 36: 'x......x..x.....', 38: '....x.......x..o', 42: 'x.xox.x.x.xox.x.' },
      cells: CELLS.lofi, melodyVel: 80, desc: 'dusty swung beat and jazzy electric piano'
    },
    'Electronic': {
      family: 3, bpm: 124, swing: 0, edm: true, form: 'I16 K16 U8 D16 K16 U8 D16 O16', formName: 'build and drop',
      progs: { major: ['sensitive', 'pop', 'royal'], minor: ['epic', 'lament', 'minor'] },
      programs: P(90, 38, 81, 84, 82, 84, 94, 81, 87),
      chordRhythm: OFFBEATS, sevenths: true,
      bass: [[2, 2, 0], [6, 2, 0], [10, 2, 0], [14, 2, 12]],
      drums: { 36: 'x...x...x...x...', 39: '....x.......x...', 42: 'xoxoxoxoxoxoxoxo', 46: '..x...x...x...x.' },
      cells: CELLS.edm, melodyVel: 92, desc: 'EDM with builds and drops'
    },
    'House': {
      family: 3, bpm: 124, swing: 0.08, edm: true, template: 'edm', fill: 'snare',
      progs: { major: ['sensitive', 'pop', 'royal', 'two'], minor: ['lament', 'minor', 'two'] },
      programs: P(0, 38, 81, 4, 54, 80, 89, 81, 87),
      chordRhythm: [[3, 2], [6, 2], [11, 2], [14, 2]], sevenths: true,
      bass: [[2, 2, 0], [6, 2, 0], [10, 2, 0], [14, 2, 12]],
      drums: { 36: 'x...x...x...x...', 39: '....x.......x...', 46: '..x...x...x...x.', 70: 'xoxoxoxoxoxoxoxo' },
      cells: CELLS.edm, melodyVel: 92, desc: 'four-on-the-floor with piano stabs'
    },
    'Techno': {
      family: 3, bpm: 130, swing: 0, edm: true, arp16: true, template: 'edm', fill: 'snare',
      progs: { major: ['two'], minor: ['two', 'minor', 'lament'] },
      programs: P(90, 38, 81, 80, 80, 84, 95, 81, 87),
      chordRhythm: [[6, 1], [14, 1]], sevenths: false,
      bass: [[2, 1, 0], [3, 1, 0], [6, 1, 0], [7, 1, 0], [10, 1, 0], [11, 1, 0], [14, 1, 0], [15, 1, 12]],
      drums: { 36: 'x...x...x...x...', 39: '....x.......x...', 42: 'xo.oxo.oxo.oxo.o', 46: '..x...x...x...x.' },
      cells: CELLS.edm, melodyVel: 88, desc: 'driving kick, rolling bass, sparse stabs', tip: 'Minor or Dorian keeps it dark.'
    },
    'Drum and bass': {
      family: 3, bpm: 174, swing: 0, edm: true, arp16: true, template: 'edm', fill: 'snare',
      progs: { major: ['sensitive', 'royal'], minor: ['lament', 'epic', 'minor'] },
      programs: P(4, 39, 81, 98, 54, 11, 89, 98, 85),
      chordRhythm: [[0, 16]], sevenths: true,
      bass: [[0, 8, 0], [8, 6, 0], [14, 2, 12]],
      drums: { 36: 'x.........x.....', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.', 46: '......x.........' },
      cells: CELLS.slow, melodyVel: 90, desc: 'fast two-step breakbeat under slow pads'
    },
    'Dubstep': {
      family: 3, bpm: 140, swing: 0, edm: true, template: 'edm', fill: 'snare',
      progs: { major: ['sensitive'], minor: ['minor', 'epic', 'andalusian'] },
      programs: P(90, 87, 81, 84, 54, 80, 95, 81, 87),
      chordRhythm: [[0, 16]], sevenths: false,
      bass: [[0, 2, 0], [2, 2, 0], [4, 1, 12], [5, 1, 0], [6, 2, 0], [8, 2, 0], [10, 1, 12], [11, 1, 0], [12, 2, 0], [14, 2, 12]],
      drums: { 36: 'x.........x.....', 38: '........x.......', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.edm, melodyVel: 92, desc: 'half-time drums and a wobbling bass'
    },
    'Synthwave': {
      family: 3, bpm: 100, swing: 0, arp16: true, keyChange: true, form: 'I8 V16 C8 V16 C8 B8 C8 C8 O8', formName: 'verse–chorus with a synth bridge',
      progs: { major: ['royal', 'sensitive', 'pop'], minor: ['epic', 'lament', 'minor'] },
      programs: P(89, 38, 81, 80, 62, 80, 95, 81, 84),
      chordRhythm: [[0, 16]], sevenths: false,
      bass: [[0, 2, 0], [2, 2, 0], [4, 2, 12], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, 12], [14, 2, 0]],
      drums: { 36: 'x.......x.......', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.drive, melodyVel: 94, desc: '80s pads, saw leads and a pulsing bass'
    },
    'Ambient': {
      family: 3, bpm: 72, swing: 0, calm: true, fill: 'none', crash: false, form: 'I8 A16 B16 A16 O8', formName: 'ternary (A B A)',
      progs: { major: ['royal', 'two', 'canon'], minor: ['lament', 'epic'] },
      programs: P(89, 39, 10, 98, 52, 73, 92, 11, 74),
      chordRhythm: [[0, 16]], sevenths: true,
      bass: [[0, 16, 0]],
      drums: { 36: 'x.........x.....', 42: '....o.......o...', 81: '........x.......' },
      cells: CELLS.ambient, melodyVel: 70, desc: 'slow pads and soft bells'
    },
    'Reggae': {
      family: 4, bpm: 76, swing: 0.12, form: 'I4 V16 C8 V16 C8 C8 O4', formName: 'verse–chorus', fill: 'snare',
      progs: { major: ['two', 'rock', 'pop'], minor: ['two', 'minor'] },
      programs: P(27, 33, 53, 16, 53, 57, 16, 0, 56),
      chordRhythm: [[2, 1], [6, 1], [10, 1], [14, 1]], sevenths: false,
      bass: [[2, 4, 0], [6, 2, 7], [8, 2, 12], [12, 4, 7]],
      drums: { 36: '........x.......', 37: '........x.......', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.latin, melodyVel: 88, desc: 'one-drop beat and offbeat guitar skank'
    },
    'Reggaeton': {
      family: 4, bpm: 94, swing: 0, template: 'verse-chorus', fill: 'snare',
      progs: { major: ['sensitive', 'pop'], minor: ['andalusian', 'lament', 'minor'] },
      programs: P(24, 38, 54, 24, 53, 75, 89, 24, 81),
      chordRhythm: [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]], sevenths: false,
      bass: [[0, 3, 0], [3, 3, 0], [6, 2, 7], [8, 3, 0], [11, 3, 0], [14, 2, 7]],
      drums: { 36: 'x...x...x...x...', 38: '...x..x....x..x.', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.latin, melodyVel: 92, desc: 'dembow beat and nylon guitar', tip: 'Minor or Harmonic minor fits it.'
    },
    'Latin (salsa)': {
      family: 4, bpm: 96, swing: 0, form: 'I4 V16 C8 V16 C8 S8 C8 C8 O4', formName: 'verse, montuno chorus and a horn break', fill: [66, 65, 65],
      progs: { major: ['rock', 'two', 'jazz'], minor: ['andalusian', 'minor', 'two'] },
      programs: P(0, 32, 56, 61, 57, 73, 61, 24, 56),
      chordRhythm: [[0, 1], [2, 1], [3, 1], [5, 1], [7, 1], [8, 1], [10, 1], [11, 1], [13, 1], [15, 1]], sevenths: false,
      bass: [[3, 3, 7], [6, 5, 0], [11, 3, 7], [14, 2, 0]],
      drums: { 36: 'x.......x.......', 56: 'x...x...x...x...', 62: '..x.......x.....', 63: '......xx......xx', 75: 'x..x..x...x.x...' },
      cells: CELLS.latin, melodyVel: 96, desc: 'clave, congas, cowbell, piano montuno and horns'
    },
    'Bossa nova': {
      family: 4, bpm: 128, swing: 0, template: 'aaba', fill: 'none',
      progs: { major: ['jazz', 'circle', 'two'], minor: ['circle', 'minor'] },
      programs: P(24, 32, 73, 11, 53, 66, 48, 11, 73),
      chordRhythm: [[0, 2], [3, 2], [6, 3], [10, 2], [13, 3]], sevenths: true,
      bass: [[0, 6, 0], [6, 2, 7], [8, 6, 7], [14, 2, 0]],
      drums: { 36: 'x..x....x..x....', 37: 'x..x..x...x..x..', 42: 'xoxoxoxoxoxoxoxo' },
      cells: CELLS.latin, melodyVel: 80, desc: 'nylon guitar, rim clicks, soft flute'
    },
    'Afrobeats': {
      family: 4, bpm: 108, swing: 0.12, template: 'verse-chorus', fill: [64, 63, 62],
      progs: { major: ['sensitive', 'pop', 'two', 'royal'], minor: ['lament', 'two'] },
      programs: P(4, 33, 27, 108, 53, 65, 89, 108, 56),
      chordRhythm: [[0, 3], [3, 3], [6, 4], [10, 3], [13, 3]], sevenths: true,
      bass: [[0, 3, 0], [6, 2, 7], [8, 3, 0], [11, 2, 12], [14, 2, 7]],
      drums: { 36: 'x.....x.x.......', 37: '..x..x..x....x..', 39: '....x.......x...', 63: '......x.......x.', 70: 'x.xxx.xxx.xxx.xx' },
      cells: CELLS.latin, melodyVel: 90, desc: 'syncopated groove, shakers, highlife guitar'
    },
    'Country': {
      family: 5, bpm: 112, swing: 0.1, keyChange: true, form: 'I4 V16 C8 V16 C8 B8 C8 C8 O4', formName: 'verse–chorus–bridge',
      progs: { major: ['rock', 'pop', 'doowop', 'two'], minor: ['minor', 'lament'] },
      programs: P(25, 33, 110, 105, 22, 27, 48, 105, 26),
      chordRhythm: [[0, 2], [4, 2], [6, 2], [8, 2], [12, 2], [14, 2]], sevenths: false,
      bass: [[0, 4, 0], [4, 4, 7], [8, 4, 0], [12, 4, 7]],
      drums: { 36: 'x.......x.......', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.pop, melodyVel: 94, desc: 'strummed acoustic, root–fifth bass, fiddle and banjo'
    },
    'Folk': {
      family: 5, bpm: 96, swing: 0, form: 'I4 V16 V16 B8 V16 O4', formName: 'strophic with a bridge', fill: 'none', crash: false,
      progs: { major: ['pop', 'rock', 'doowop', 'two'], minor: ['lament', 'minor', 'andalusian'] },
      programs: P(25, 32, 73, 105, 53, 110, 21, 105, 22),
      chordRhythm: [[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]], sevenths: false,
      bass: [[0, 8, 0], [8, 8, 7]],
      drums: { 36: 'x.......x.......', 37: '....x.......x...', 54: '..x...x...x...x.' },
      cells: CELLS.slow, melodyVel: 86, desc: 'acoustic guitar, flute and fiddle, light percussion'
    },
    'Classical': {
      family: 6, bpm: 88, swing: 0, template: 'rondo', fill: 'none', crash: false,
      progs: { major: ['canon', 'royal', 'doowop', 'circle'], minor: ['minor', 'circle', 'andalusian'] },
      programs: P(48, 42, 40, 73, 41, 71, 60, 46, 68),
      chordRhythm: [[0, 8], [8, 8]], sevenths: false,
      bass: [[0, 8, 0], [8, 8, 7]],
      drums: { 41: 'x...............' },
      cells: CELLS.slow, melodyVel: 84, desc: 'string orchestra with woodwinds, no drum kit (only a soft low drum)'
    },
    'Cinematic': {
      family: 6, bpm: 84, swing: 0, form: 'I8 V16 U8 C16 B16 U8 C16 O8', formName: 'rising themes and builds',
      progs: { major: ['royal', 'canon'], minor: ['epic', 'lament', 'andalusian', 'minor'] },
      programs: P(48, 43, 60, 56, 57, 40, 52, 45, 56),
      chordRhythm: EIGHTHS, sevenths: false,
      bass: [[0, 8, 0], [8, 8, 0]],
      drums: { 36: 'x.....x...x.....', 41: '........x.......', 45: '............x.x.' },
      cells: CELLS.slow, melodyVel: 96, desc: 'string ostinato, horns, choir and big drums'
    },
    // ---- game background music (generic styles; most loop seamlessly) ----
    'Chiptune platformer': {
      family: 7, bpm: 150, swing: 0, arp16: true, template: 'game-loop', fill: 'snare',
      progs: { major: ['pop', 'rock', 'doowop', 'fanfare'], minor: ['epic', 'minor'] },
      programs: P(80, 38, 80, 81, 80, 81, 80, 80, 81),
      chordRhythm: [[0, 2], [4, 2], [8, 2], [12, 2]], sevenths: false,
      bass: [[0, 2, 0], [2, 2, 12], [4, 2, 0], [6, 2, 12], [8, 2, 0], [10, 2, 12], [12, 2, 7], [14, 2, 12]],
      drums: { 36: 'x.......x.x.....', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.edm, melodyVel: 96, desc: 'bouncy 8-bit square-wave tune for a jump-and-run level'
    },
    'RPG town': {
      family: 7, bpm: 104, swing: 0.1, template: 'game-loop', fill: 'none', crash: false,
      progs: { major: ['doowop', 'royal', 'pop', 'canon'], minor: ['lament', 'circle'] },
      programs: P(24, 32, 73, 46, 71, 68, 48, 46, 21),
      chordRhythm: [[0, 4], [4, 4], [8, 4], [12, 4]], sevenths: false,
      bass: [[0, 8, 0], [8, 8, 7]],
      drums: { 36: 'x.......x.......', 37: '....x.......x...' },
      cells: CELLS.slow, melodyVel: 84, desc: 'calm, friendly village tune with guitar, flute and harp'
    },
    'Overworld adventure': {
      family: 7, bpm: 128, swing: 0, template: 'game-loop',
      progs: { major: ['royal', 'rock', 'pop', 'fanfare'], minor: ['epic', 'lament'] },
      programs: P(48, 32, 56, 60, 60, 73, 61, 46, 56),
      chordRhythm: EIGHTHS, sevenths: false,
      bass: [[0, 4, 0], [4, 4, 7], [8, 4, 0], [12, 4, 7]],
      drums: { 36: 'x.......x.......', 38: '....x..o....x.oo', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.drive, melodyVel: 98, desc: 'heroic travelling theme with strings, horns and a marching snare'
    },
    'Dungeon / cave': {
      family: 7, bpm: 80, swing: 0, template: 'game-loop', fill: 'none', crash: false,
      progs: { major: ['two'], minor: ['lament', 'minor', 'andalusian', 'fall'] },
      programs: P(92, 43, 11, 98, 52, 42, 95, 8, 73),
      chordRhythm: [[0, 16]], sevenths: false,
      bass: [[0, 16, 0]],
      drums: { 41: 'x.....x.........', 54: '........o.......' },
      cells: CELLS.ambient, melodyVel: 72, desc: 'dark, echoing and slow, for exploring underground', tip: 'Minor or Harmonic minor sounds mysterious.'
    },
    'Boss battle': {
      family: 7, bpm: 160, swing: 0, template: 'game-loop',
      progs: { major: ['rock'], minor: ['epic', 'andalusian', 'minor'] },
      programs: P(30, 34, 61, 55, 57, 48, 52, 44, 30),
      chordRhythm: [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2], [8, 1], [9, 1], [10, 2], [12, 1], [13, 1], [14, 2]], power: true,
      bass: [[0, 1, 0], [1, 1, 0], [2, 2, 0], [4, 1, 0], [5, 1, 0], [6, 2, 0], [8, 1, 0], [9, 1, 0], [10, 2, 0], [12, 1, 0], [13, 1, 0], [14, 2, 0]],
      drums: { 36: 'x.x.x.x.x.x.x.x.', 38: '....x.......x...', 51: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.drive, melodyVel: 108, desc: 'fast and intense: distorted guitar, brass and choir', tip: 'Harmonic minor makes it more menacing.'
    },
    'Fantasy tavern': {
      family: 7, bpm: 120, swing: 0.2, template: 'game-loop', fill: 'none', crash: false,
      progs: { major: ['doowop', 'rock', 'two'], minor: ['andalusian', 'minor', 'lament'] },
      programs: P(24, 32, 110, 74, 21, 110, 21, 105, 74),
      chordRhythm: [[0, 2], [4, 2], [6, 2], [8, 2], [12, 2], [14, 2]], sevenths: false,
      bass: [[0, 4, 0], [4, 4, 7], [8, 4, 0], [12, 4, 7]],
      drums: { 36: 'x.....x.x.......', 54: '..x...x...x...x.' },
      cells: CELLS.latin, melodyVel: 92, desc: 'lively folk band with fiddle, recorder and accordion', tip: 'Dorian or Mixolydian sound old-world.'
    },
    'Horror ambience': {
      family: 7, bpm: 60, swing: 0, calm: true, template: 'game-loop', fill: 'none', crash: false,
      progs: { major: ['two'], minor: ['lament', 'minor', 'fall'] },
      programs: P(95, 43, 10, 101, 54, 42, 92, 10, 40),
      chordRhythm: [[0, 16]], sevenths: true,
      bass: [[0, 16, 0]],
      drums: { 41: 'x...............', 81: '..........o.....' },
      cells: CELLS.ambient, melodyVel: 64, desc: 'slow, uneasy drones with a music box', tip: 'Harmonic minor is the creepiest.'
    },
    'Sci-fi space': {
      family: 7, bpm: 96, swing: 0, arp16: true, template: 'game-loop', fill: 'snare',
      progs: { major: ['royal', 'two'], minor: ['epic', 'lament', 'minor'] },
      programs: P(94, 38, 81, 98, 54, 80, 89, 81, 85),
      chordRhythm: [[0, 16]], sevenths: true,
      bass: [[0, 2, 0], [2, 2, 0], [4, 2, 12], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, 12], [14, 2, 0]],
      drums: { 36: 'x.......x.......', 39: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.slow, melodyVel: 88, desc: 'spacey pads, pulsing synth bass and arpeggios'
    },
    'Puzzle / casual': {
      family: 7, bpm: 112, swing: 0.12, template: 'game-loop', fill: 'none', crash: false,
      progs: { major: ['pop', 'doowop', 'royal'], minor: ['circle', 'lament'] },
      programs: P(0, 45, 12, 9, 11, 73, 48, 9, 73),
      chordRhythm: [[0, 4], [6, 2], [8, 4], [14, 2]], sevenths: true,
      bass: [[0, 2, 0], [4, 2, 7], [8, 2, 0], [12, 2, 7]],
      drums: { 36: 'x.......x.......', 37: '....x.......x...', 70: 'x.x.x.x.x.x.x.x.' },
      cells: CELLS.pop, melodyVel: 86, desc: 'light and playful: marimba, pizzicato and glockenspiel'
    },
    'Racing': {
      family: 7, bpm: 150, swing: 0, arp16: true, template: 'game-loop', fill: 'snare',
      progs: { major: ['rock', 'pop'], minor: ['epic', 'minor'] },
      programs: P(29, 38, 81, 84, 62, 80, 95, 81, 30),
      chordRhythm: EIGHTHS, power: true,
      bass: [[0, 2, 0], [2, 2, 12], [4, 2, 0], [6, 2, 12], [8, 2, 0], [10, 2, 12], [12, 2, 0], [14, 2, 12]],
      drums: { 36: 'x...x...x...x...', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.', 46: '..x...x...x...x.' },
      cells: CELLS.edm, melodyVel: 100, desc: 'fast driving beat, guitars and saw leads'
    },
    'Menu / title theme': {
      family: 7, bpm: 92, swing: 0, template: 'game-loop', fill: 'none',
      progs: { major: ['royal', 'canon', 'sensitive'], minor: ['epic', 'lament'] },
      programs: P(48, 42, 0, 46, 53, 40, 89, 46, 60),
      chordRhythm: [[0, 8], [8, 8]], sevenths: false,
      bass: [[0, 8, 0], [8, 8, 7]],
      drums: { 36: 'x.......x.......', 37: '....x.......x...' },
      cells: CELLS.slow, melodyVel: 88, desc: 'memorable piano theme over strings, for a title screen'
    },
    'Victory fanfare': {
      family: 7, bpm: 132, swing: 0, template: 'stinger', fill: 'none',
      progs: { major: ['fanfare'], minor: ['fanfare'] },
      programs: P(61, 58, 56, 61, 57, 60, 48, 46, 56),
      chordRhythm: [[0, 2], [3, 1], [4, 4], [8, 8]], sevenths: false,
      bass: [[0, 2, 0], [3, 1, 0], [4, 4, 7], [8, 8, 0]],
      drums: { 36: 'x...............', 38: 'x.x.xxxx........', 49: 'x...............' },
      cells: CELLS.drive, melodyVel: 104, desc: 'a short brass fanfare for winning a level (does not loop)'
    },
    'Game over': {
      family: 7, bpm: 72, swing: 0, template: 'stinger', fill: 'none', crash: false,
      progs: { major: ['fall'], minor: ['fall'] },
      programs: P(48, 43, 68, 10, 41, 42, 92, 46, 40),
      chordRhythm: [[0, 16]], sevenths: false,
      bass: [[0, 16, 0]],
      drums: { 41: 'x...............' },
      cells: CELLS.slow, melodyVel: 80, desc: 'a short, sad falling phrase (does not loop)', tip: 'Minor sounds sadder.'
    }
  };
  // the extra parts' instruments per style (kept for older code)
  const EXTRA_PROGRAMS = {};
  for (const [name, st] of Object.entries(STYLES)) EXTRA_PROGRAMS[name] = { harmony: st.programs.harmony, counter: st.programs.counter, pad: st.programs.pad, arp: st.programs.arp, lead: st.programs.lead };

  // ---- instrument theme packs: General MIDI instruments for every part ----------------
  // every style has its own pack; a few more packs mix across genres
  const PACKS = {};
  for (const [name, st] of Object.entries(STYLES)) PACKS[name] = { name: name + ' band', group: 'Genre packs', programs: st.programs };
  Object.assign(PACKS, {
    'x-orchestra': { name: 'Symphony orchestra', group: 'Theme packs', programs: P(48, 42, 40, 73, 41, 71, 60, 46, 56) },
    'x-chiptune': { name: '8-bit chiptune', group: 'Theme packs', programs: P(80, 38, 80, 81, 80, 81, 80, 80, 81) },
    'x-unplugged': { name: 'Acoustic unplugged', group: 'Theme packs', programs: P(25, 32, 24, 24, 53, 73, 21, 46, 22) },
    'x-bigband': { name: 'Big band', group: 'Theme packs', programs: P(0, 32, 56, 61, 57, 65, 61, 66, 56) },
    'x-80s': { name: '80s synth pop', group: 'Theme packs', programs: P(90, 38, 81, 62, 62, 80, 89, 81, 84) },
    'x-church': { name: 'Church choir and organ', group: 'Theme packs', programs: P(19, 19, 52, 19, 53, 52, 19, 46, 56) },
    'x-pianotrio': { name: 'Piano trio', group: 'Theme packs', programs: P(0, 32, 0, 0, 0, 0, 0, 0, 1) },
    'x-world': { name: 'World instruments', group: 'Theme packs', programs: P(24, 32, 104, 107, 77, 75, 89, 108, 105) },
    'x-musicbox': { name: 'Music box lullaby', group: 'Theme packs', programs: P(46, 32, 10, 9, 8, 11, 88, 10, 73) },
    'x-dream': { name: 'Dreamy pads', group: 'Theme packs', programs: P(89, 39, 54, 98, 91, 99, 94, 98, 85) }
  });
  // the instrument for a part: the chosen pack, else the style's own
  function programFor(role, gen) {
    const pk = gen && gen.pack && PACKS[gen.pack] ? PACKS[gen.pack] : PACKS[gen && gen.style] || PACKS['Pop'];
    return pk.programs[role] != null ? pk.programs[role] : 0;
  }
  const styleOf = gen => STYLES[gen && gen.style] || STYLES['Pop'];

  const MAJORISH = [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 5, 4], [1, 4, 0, 0], [0, 3, 0, 4], [3, 4, 2, 5]];
  const MINORISH = [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 6], [0, 5, 3, 4], [0, 3, 6, 2], [0, 2, 3, 4]];

  function harmonyScale(scaleName) {
    const s = GM.SCALES[scaleName];
    if (s.length === 7) return s;
    if (scaleName === 'Major pentatonic' || scaleName === 'Chromatic') return GM.SCALES['Major'];
    return GM.SCALES['Minor'];
  }
  const isMinorish = scaleName => harmonyScale(scaleName)[2] === 3;

  // v2.3 colour chords (outside the scale), stored by code next to the plain degrees 0..6:
  //   borrowed b7 b6 b3 (major chords on the flat degrees), iv (minor four in a major key), IV and V (major in a minor key),
  //   II (Lydian / major two), and secondary dominants V/1..V/5 (the major chord a fifth above degree n)
  const CHROMA = {
    b7: { root: 10, q: 'M', roman: '♭VII' }, b6: { root: 8, q: 'M', roman: '♭VI' }, b3: { root: 3, q: 'M', roman: '♭III' },
    iv: { root: 5, q: 'm', roman: 'iv' }, IV: { root: 5, q: 'M', roman: 'IV' }, V: { root: 7, q: 'M', roman: 'V' }, II: { root: 2, q: 'M', roman: 'II' },
    // v2.5: a chromatic mediant (major III), the Neapolitan (major bII), the tritone substitute of V (bII7)
    // and V with a suspended fourth (resolves to V: the 4-3 suspension at a cadence)
    III: { root: 4, q: 'M', roman: 'III' }, N: { root: 1, q: 'M', roman: '♭II' }, sub: { root: 1, q: 'M', roman: '♭II7', dom: true },
    Vsus: { root: 7, q: 's', roman: 'Vsus4' }
  };
  const SEC_ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii'];
  const isColour = d => typeof d === 'string';
  // a bar may hold two chords [first half, second half]; this returns the one sounding at step s (0..15)
  const chordAtStep = (cell, s = 0) => Array.isArray(cell) ? cell[s >= 8 && cell.length > 1 ? 1 : 0] : cell;
  function colourInfo(key, scaleName, code) {
    const sec = /^V\/(\d)$/.exec(code);
    if (sec) { const sc = harmonyScale(scaleName); return { root: (key + sc[+sec[1] % 7] + 7) % 12, q: 'M', roman: 'V/' + SEC_ROMAN[+sec[1] % 7] }; }
    const c = CHROMA[code] || CHROMA.b7;
    return { root: (key + c.root) % 12, q: c.q, roman: c.roman, dom: !!c.dom };
  }

  // v2.5 (gap 8): chord qualities by style, on top of the plain stacked thirds of the scale
  //   dom:    I, IV and V are dominant sevenths (blues: C7 F7 G7), major-triad based even in a minor or blues scale
  //   leading: in a minor key V is major (the raised 7th leads home), as in classical, film, flamenco and game music
  //   ext9:   jazz, soul, lo-fi, gospel and bossa colour seventh chords with a 9th (in place of the 5th)
  //   add9:   pop, indie, synthwave and dreamy styles add a 9th to I and IV
  const FLAVOURS = {
    dom: ['Blues'],
    leading: ['Classical', 'Cinematic', 'Metal', 'Latin (salsa)', 'Reggaeton', 'Boss battle', 'Dungeon / cave', 'Horror ambience', 'Overworld adventure', 'Menu / title theme', 'Game over', 'Victory fanfare', 'Fantasy tavern', 'RPG town'],
    ext9: ['Jazz', 'R&B / Soul', 'Lo-fi', 'Gospel', 'Bossa nova'],
    add9: ['Pop', 'Indie', 'Synthwave', 'Ambient', 'Sci-fi space', 'Puzzle / casual', 'Menu / title theme']
  };
  let curStyle = null;                       // the style of the song being generated (chordPCs callers may omit it)
  const has = (f, style) => FLAVOURS[f].includes(style || curStyle);
  // Pitch classes of a chord on a scale degree (root first, then the third: the bass relies on that order)
  function chordPCs(key, scaleName, degree, sevenths, style) {
    degree = chordAtStep(degree, 0);
    style = style || curStyle;
    if (isColour(degree)) {
      const c = colourInfo(key, scaleName, degree);
      if (c.q === 's') return [c.root, (c.root + 5) % 12, (c.root + 7) % 12].concat(sevenths ? [(c.root + 10) % 12] : []);
      const pcs = [c.root, (c.root + (c.q === 'm' ? 3 : 4)) % 12, (c.root + 7) % 12];
      // secondary dominants (and the tritone substitute) sound as dominant sevenths when the style uses sevenths
      if (sevenths || c.dom) pcs.push((c.root + (c.q === 'm' || /^V\//.test(degree) || c.roman === '♭VII' || c.dom ? 10 : 11)) % 12);
      return pcs;
    }
    degree = ((+degree || 0) % 7 + 7) % 7;
    const sc = harmonyScale(scaleName);
    const minor = sc[2] === 3;
    // blues: dominant sevenths on I, IV, V
    if (has('dom', style) && [0, 3, 4].includes(degree)) {
      const root = (key + [0, 5, 7][[0, 3, 4].indexOf(degree)]) % 12;
      return [root, (root + 4) % 12, (root + 7) % 12].concat(sevenths ? [(root + 10) % 12] : []);
    }
    // minor key: major V (with the leading tone)
    if (minor && degree === 4 && has('leading', style)) {
      const root = (key + 7) % 12;
      return [root, (root + 4) % 12, (root + 7) % 12].concat(sevenths ? [(root + 10) % 12] : []);
    }
    const n = sevenths ? 4 : 3;
    const pcs = [];
    for (let i = 0; i < n; i++) {
      const idx = degree + i * 2;
      pcs.push((key + sc[idx % 7] + 12 * Math.floor(idx / 7)) % 12);
    }
    // a major 9th (two semitones over the root, from the scale) replaces the 5th in jazzy styles, or joins I and IV in pop
    const ninth = (key + sc[(degree + 1) % 7]) % 12;
    const isMaj9 = ((ninth - pcs[0]) % 12 + 12) % 12 === 2;
    const dim = ((pcs[2] - pcs[0]) % 12 + 12) % 12 === 6;
    if (isMaj9 && !dim && sevenths && has('ext9', style)) pcs[2] = ninth;
    else if (isMaj9 && !dim && !sevenths && has('add9', style) && (degree === 0 || degree === 3)) pcs.push(ninth);
    return pcs;
  }

  // the style's favourite progressions first, otherwise a common one for the mode
  function pickProgression(scaleName, r, style) {
    const st = STYLES[style], minor = isMinorish(scaleName);
    const fav = st && st.progs ? st.progs[minor ? 'minor' : 'major'] : null;
    if (fav && fav.length && (fav.length === 1 || r.chance(0.8))) return PROGRESSIONS[r.pick(fav)].prog.slice();
    return r.pick(minor ? MINORISH : MAJORISH).slice();
  }

  // chord progression types (scale degrees, 0 = I). Diatonic, so they work in any key and scale.
  const PROGRESSIONS = {
    'pop': { name: 'Pop: I–V–vi–IV', prog: [0, 4, 5, 3] },
    'sensitive': { name: 'Sensitive: vi–IV–I–V', prog: [5, 3, 0, 4] },
    'doowop': { name: '50s doo-wop: I–vi–IV–V', prog: [0, 5, 3, 4] },
    'rock': { name: 'Rock: I–IV–V–IV', prog: [0, 3, 4, 3] },
    'royal': { name: 'Royal road: IV–V–iii–vi', prog: [3, 4, 2, 5] },
    'canon': { name: 'Canon: I–V–vi–iii–IV–I–IV–V', prog: [0, 4, 5, 2, 3, 0, 3, 4] },
    'circle': { name: 'Circle: vi–ii–V–I', prog: [5, 1, 4, 0] },
    'jazz': { name: 'Jazz ii–V–I', prog: [1, 4, 0, 0] },
    'blues': { name: '12-bar blues: I×4 IV IV I I V IV I V', prog: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4] },
    'two': { name: 'Two-chord vamp: I–IV', prog: [0, 3] },
    'minor': { name: 'Minor: i–iv–v–i', prog: [0, 3, 4, 0] },
    'andalusian': { name: 'Andalusian: i–VII–VI–V', prog: [0, 6, 5, 4] },
    'epic': { name: 'Epic: i–VI–III–VII', prog: [0, 5, 2, 6] },
    'lament': { name: 'Aeolian: i–VI–VII–i', prog: [0, 5, 6, 0] },
    'fanfare': { name: 'Fanfare: IV–V–I–I', prog: [3, 4, 0, 0] },
    'fall': { name: 'Falling: i–VI–iv–i', prog: [0, 5, 3, 0] }
  };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  // chord name for a degree in a key/scale, e.g. { roman: 'vi', name: 'Am' }
  function chordName(key, scaleName, degree, style) {
    if (Array.isArray(degree)) {
      const parts = degree.map(d => chordName(key, scaleName, d, style));
      return { roman: parts.map(c => c.roman).join(' '), name: parts.map(c => c.name).join(' ') };
    }
    if (isColour(degree)) {
      const c = colourInfo(key, scaleName, degree);
      return { roman: c.roman, name: GM.NOTE_NAMES[c.root] + (c.q === 'm' ? 'm' : c.q === 's' ? 'sus4' : c.dom ? '7' : '') };
    }
    degree = ((+degree || 0) % 7 + 7) % 7;
    const pcs = chordPCs(key, scaleName, degree, false, style);
    const third = (pcs[1] - pcs[0] + 12) % 12, fifth = (pcs[2] - pcs[0] + 12) % 12;
    const dim = third === 3 && fifth === 6, minor = third === 3;
    const dom = has('dom', style || curStyle) && [0, 3, 4].includes(degree) && (STYLES[style || curStyle] || {}).sevenths;
    const roman = (minor ? ROMAN[degree].toLowerCase() : ROMAN[degree]) + (dim ? '°' : '') + (dom ? '7' : '');
    return { roman, name: GM.NOTE_NAMES[pcs[0]] + (dim ? 'dim' : minor ? 'm' : '') + (dom ? '7' : '') };
  }

  // a bar's chord: a per-bar change wins, then the section's progression, then the song's
  function chordForBar(gen, bar) {
    if (gen.sections) {
      const sec = SongForm.sectionAt(gen.sections, bar);
      if (sec && sec.chordOv && sec.chordOv[bar - sec.start] != null) return sec.chordOv[bar - sec.start];
      return SongForm.degreeAt(gen, bar);
    }
    if (gen.chordOv && gen.chordOv[bar] != null) return gen.chordOv[bar];
    const p = gen.progression;
    return p[bar % p.length];
  }

  const humanVel = (r, base, spread = 10) => Math.max(20, Math.min(127, Math.round(base + (r() * 2 - 1) * spread)));

  // v2.4: loop-mode chords, voice-led in a lane under the melody (see arrange.js)
  function genChords(gen, bars, r, ctx = {}) {
    const st = styleOf(gen);
    const program = progOf('chords', gen, ctx), rg = Arrange.rangeOf(program);
    const prof = Arrange.melodyProfile(ctx.melodyHome || [], bars, null, null);
    const notes = [];
    let prev = null;
    for (let b = 0; b < bars; b++) {
      const cell = chordForBar(gen, b), two = Array.isArray(cell) && cell.length > 1;
      const lane = Arrange.laneUnder(prof, b, program, 1, st.power ? 40 : 45);
      const voices = {};
      const voice = s => {
        const k = two && s >= 8 ? 1 : 0;
        if (voices[k]) return voices[k];
        const pcs = chordPCs(gen.key, gen.scale, chordAtStep(cell, s), st.sevenths);
        const v = st.power ? Arrange.voicePower(pcs[0], prev, Math.max(rg.lo, 40), Math.min(lane.hi, 66))
          : Arrange.voiceLead(pcs, prev, { lo: lane.lo, hi: lane.hi, center: lane.hi - 7 });
        prev = v;
        return (voices[k] = v);
      };
      let rhythm = st.chordRhythm;
      if (two) {
        rhythm = rhythm.map(([s, l]) => [s, s < 8 ? Math.min(l, 8 - s) : l]);
        if (!rhythm.some(([s]) => s === 8)) rhythm = rhythm.concat([[8, 8]]).sort((x, y) => x[0] - y[0]);
      }
      for (const [s, l] of rhythm) {
        const accent = s % 4 === 0 ? 8 : 0;
        for (const p of voice(s)) notes.push({ p, s: b * 16 + s, l, v: humanVel(r, 72 + accent, 6) });
      }
    }
    return notes;
  }

  // v2.4: loop-mode bass: planned line (octaves follow the line, inversions), checked against the melody
  function genBass(gen, bars, r, ctx = {}) {
    const st = styleOf(gen);
    const rg = Arrange.rangeOf(progOf('bass', gen, ctx));
    const lo = Math.max(rg.lo, 31), hi = Math.min(rg.hi, lo + 21);
    const split = b => Array.isArray(chordForBar(gen, b));
    const pcsAt = (b, s = 0) => chordPCs(gen.key, gen.scale, chordAtStep(chordForBar(gen, b % bars), s), false);
    const { at } = Arrange.planBass({ bars: bars + 1, pcsAt, split: b => split(b % bars), lo, hi, invRate: invRate(gen), r });
    const notes = [];
    for (let b = 0; b < bars; b++) {
      st.bass.forEach(([s, l, iv], i) => {
        const x = at(b, s);
        let p = Arrange.patternPitch(x, iv);
        if (split(b) && s < 8 && s + l > 8) l = 8 - s;
        // occasional passing tone into next bar on the last hit
        if (i === st.bass.length - 1 && st.bass.length > 2 && r.chance(st.walk ? 0.85 : 0.25)) { const nx = at(b + 1, 0); if (nx) p = nx.p + (r.chance(0.5) ? -1 : 2); }
        const onset = s === x.s;
        const alts = onset ? (x.inv || invRate(gen) === 0 ? [] : [Arrange.bassNote(x.pcs[1], x.p, lo, hi + 5)]) : x.pcs.map(pc => Arrange.bassNote(pc, p, lo, hi + 12)).filter(q => q !== p);
        notes.push({ p, s: b * 16 + s, l, v: humanVel(r, s % 4 === 0 ? 100 : 86, 6), alts });
      });
    }
    const rep = Arrange.fixParallels(notes, ctx.melodyHome || [], t => t % 8 === 0);
    lastInfo.arrange = Object.assign(lastInfo.arrange || {}, { bassParallelsFixed: rep.fixed, bassParallelsLeft: rep.left });
    return notes;
  }

  // how often the bass takes a chord's third (first inversion) to make a stepwise line, by style
  function invRate(gen) {
    const st = styleOf(gen);
    if (st.power || st.walk || st.template === 'blues' || gen.structure === 'blues') return 0;
    if (st.edm) return 0.3;
    if (['Pop', 'Indie', 'Gospel', 'Classical', 'Cinematic', 'R&B / Soul', 'Folk', 'Country', 'Menu / title theme', 'RPG town', 'Disco', 'Synthwave'].includes(gen.style)) return 0.7;
    return 0.45;
  }
  const scalePcs = gen => harmonyScale(gen.scale).map(x => (gen.key + x) % 12);
  // the instrument a part is played on: the track's own (sent by the app), else the pack's
  const progOf = (role, gen, ctx) => ctx && ctx.programs && ctx.programs[role] != null ? ctx.programs[role] : programFor(role, gen);
  // the melody in home-key pitches, without the section octave moves (what the accompaniment is placed against)
  function melodyHome(gen, ctx) {
    const mel = (ctx && (ctx.melodyBase || ctx.melody)) || [];
    if (!gen.sections) return mel;
    return mel.map(n => ({ p: n.p - SongForm.keyShiftAt(gen, Math.floor(n.s / 16)), s: n.s, l: n.l }));
  }

  function genDrums(gen, bars, r) {
    const st = styleOf(gen);
    const notes = [];
    for (let b = 0; b < bars; b++) {
      const fillKind = st.fill || 'toms', fill = (b % 4 === 3) && fillKind !== 'none' && !st.calm;
      for (const [key, pat] of Object.entries(st.drums)) {
        const p = +key;
        for (let s = 0; s < 16; s++) {
          let c = pat[s];
          if (fill && s >= 12 && (p === 38 || p === 39)) c = s === 12 ? 'x' : (r.chance(0.7) ? 'o' : c);
          if (c === '.' && p === 36 && !fill && r.chance(0.04)) c = 'o';
          if (c === '.') continue;
          notes.push({ p, s: b * 16 + s, l: 1, v: humanVel(r, c === 'x' ? 104 : 62, 8) });
        }
      }
      if (fill) {
        const toms = Array.isArray(fillKind) ? fillKind : fillKind === 'snare' ? [38, 38, 38] : [50, 47, 45];
        toms.forEach((tom, i) => { if (r.chance(0.6)) notes.push({ p: tom, s: b * 16 + 13 + i, l: 1, v: humanVel(r, 96, 8) }); });
      }
      if (b % 4 === 0 && b > 0 && st.crash !== false && !st.calm) notes.push({ p: 49, s: b * 16, l: 1, v: 100 });
    }
    return notes;
  }

  // ---- melody (see melody.js) ----------------------------------------------
  function harmony(gen) {
    curStyle = gen.style;
    return { key: gen.key, scale: gen.scale, leap: typeof gen.leap === 'number' ? gen.leap : 0.35, arp: typeof gen.arp === 'number' ? gen.arp : 0.15, chordAt: (bar, s = 0) => chordPCs(gen.key, gen.scale, chordAtStep(chordForBar(gen, bar), s), false) };
  }
  // the key a bar sounds in (sections can move to another key; the final chorus can lift)
  const keyAt = (gen, bar) => ((gen.key + (gen.sections ? SongForm.keyShiftAt(gen, bar) : 0)) % 12 + 12) % 12;

  let lastInfo = {};

  function genMelody(gen, bars, r) {
    const best = Melody.bestMelody(harmony(gen), styleOf(gen), bars, r, { form: gen.form, hookMotif: gen.hookMotif, rng }, 24);
    lastInfo.melody = { form: best.form, score: best.score, candidates: best.candidates, ops: best.ops, marks: best.marks, fromPhrase: !!gen.hookMotif };
    return best.notes;
  }

  function genRiff(gen, bars, r) {
    if (!gen.phrase) return [];
    const res = Melody.phraseToRiff(gen.phrase, harmony(gen), bars, r, { lo: 52, hi: 79, center: 64 });
    lastInfo.riff = res.info;
    return res.notes;
  }

  // ---- extra instruments: harmony, counter-melody, pad, arpeggio, interlude lead ----------
  // Each one has a job and a place: it enters and leaves by section, so the arrangement grows and thins out.
  const ROLE_ORDER = ['melody', 'chords', 'drums', 'bass', 'harmony', 'counter', 'pad', 'arp', 'lead'];
  const EXTRA_ROLES = ['harmony', 'counter', 'pad', 'arp', 'lead'];
  const EXTRA_INFO = {
    harmony: 'Harmony: sings a third or sixth under the melody in the choruses',
    counter: 'Counter-melody: answers the melody in its gaps in the verses and bridge',
    pad: 'Pad: held chords under the intro, bridge, breaks and big choruses',
    arp: 'Arpeggio: broken chords that drive the pre-choruses, builds and choruses',
    lead: 'Lead: takes the tune in the intro and interludes, doubles the last chorus an octave up'
  };
  const ROLE_NAMES_X = { harmony: 'Harmony', counter: 'Counter-melody', pad: 'Pad', arp: 'Arpeggio', lead: 'Lead' };

  // where each extra plays: whole sections (full song) or bar ranges (loop)
  function extraActive(role, gen, bars) {
    const on = new Array(bars).fill(false);
    if (gen.sections) {
      const hooks = gen.sections.filter(s => ['C', 'D', 'A'].includes(s.type));
      const lastHook = hooks[hooks.length - 1];
      for (const s of gen.sections) {
        let a = false;
        if (role === 'harmony') a = ['C', 'D'].includes(s.type) || (s.type === 'A' && s.energy >= 4) || s.type === 'S';
        if (role === 'counter') a = ['V', 'B', 'K'].includes(s.type) || (s.type === 'A' && s.n % 2 === 0);
        if (role === 'pad') a = ['I', 'B', 'K', 'O', 'L', 'U'].includes(s.type) || s.energy >= 4;
        if (role === 'arp') a = ['P', 'U', 'D', 'L', 'S'].includes(s.type) || (['C', 'A'].includes(s.type) && s.energy >= 4);
        if (role === 'lead') a = ['I', 'L'].includes(s.type) || s === lastHook;
        if (a) for (let b = s.start; b < Math.min(bars, s.start + s.len); b++) on[b] = true;
        // v2.3 hand-off: the lead takes the tune for the first 4 bars of that chorus
        if (role === 'lead' && s.change === 'handoff') for (let b = s.start; b < Math.min(bars, s.start + Math.min(4, s.len)); b++) on[b] = true;
      }
      // forms without the usual sections (e.g. strophic): come in for the second half of the song instead
      if (!on.some(Boolean)) {
        const total = SongForm.total(gen.sections);
        const main = gen.sections.filter(s => s.type !== 'I' && s.type !== 'O');
        const pickS = role === 'lead' ? gen.sections.filter(s => s.type === 'I').concat(main.slice(-1))
          : role === 'counter' ? main.filter(s => s.start < total / 2) : main.filter(s => s.start + s.len > total / 2);
        for (const s of pickS) for (let b = s.start; b < Math.min(bars, s.start + s.len); b++) on[b] = true;
      }
    } else {
      const half = Math.floor(bars / 2);
      for (let b = 0; b < bars; b++) {
        if (role === 'harmony') on[b] = b >= half;
        if (role === 'counter') on[b] = b < half || bars <= 4;
        if (role === 'pad') on[b] = true;
        if (role === 'arp') on[b] = b >= half || bars <= 4;
        if (role === 'lead') on[b] = b >= bars - Math.min(4, bars);
      }
    }
    return on;
  }
  const secOf = (gen, bar) => gen.sections ? SongForm.sectionAt(gen.sections, bar) : null;
  const topLine = notes => { const by = new Map(); for (const n of notes) if (!by.has(n.s) || by.get(n.s).p < n.p) by.set(n.s, n); return [...by.values()].sort((a, b) => a.s - b.s); };

  const ARP_PATTERNS = [[0, 1, 2, 3, 2, 1, 0, 1], [0, 1, 2, 3], [3, 2, 1, 0], [0, 2, 1, 3], [0, 2, 1, 2], [0, 3, 1, 3, 2, 3, 1, 3], [0, 1, 2, 1, 3, 2, 1, 2]];
  function genExtra(role, gen, bars, r, ctx = {}) {
    const arpPats = {};
    const st = styleOf(gen), h = harmony(gen), M = Melody._;
    const on = extraActive(role, gen, bars);
    // the melody in home-key pitches: these parts are written in the home key and moved by the key plan afterwards
    // (v2.5 fix: in a chorus that changes key they used to be moved twice)
    const unshift = n => gen.sections ? Object.assign({}, n, { p: n.p - SongForm.keyShiftAt(gen, Math.floor(n.s / 16)) }) : n;
    const mel = topLine((ctx.melody || []).filter(n => n.s < bars * 16).map(unshift));
    const notes = [];
    const energyAt = b => { const s = secOf(gen, b); return s ? s.energy : 3; };
    const program = progOf(role, gen, ctx);
    const prof = Arrange.melodyProfile(melodyHome(gen, ctx), bars, gen.sections, null);
    if (role === 'harmony') {
      // v2.5 (gap 12): a second voice with counterpoint: mostly a third or sixth under the melody (a chord tone),
      // but it holds its note while the melody moves quickly and the held note still sounds well (oblique motion),
      // never moves in parallel fifths or octaves, and goes against the melody's direction into long cadence notes
      const pool = M.makePool(h, 36, 96);
      const iv = (a, b) => ((a - b) % 12 + 12) % 12;
      const sweet = d => [3, 4, 8, 9].includes(d);
      let last = null, lastMel = null;
      for (const n of mel) {
        const b = Math.floor(n.s / 16);
        if (!on[b]) { last = null; lastMel = null; continue; }
        const pcs = h.chordAt(b, n.s % 16);
        // oblique: keep the last note under a quick melody note if it is still a third or sixth below it
        if (last && lastMel && n.l <= 2 && last.s + last.l >= n.s - 1 && last.p < n.p && sweet(iv(n.p, last.p)) && r.chance(0.7)) {
          last.l = n.s + n.l - last.s; lastMel = n; continue;
        }
        const opts = [];
        for (const d of [3, 4, 8, 9]) { const p = n.p - d; if (pcs.includes(((p % 12) + 12) % 12)) opts.push(p); }
        if (!opts.length) { const i = M.nearestIdx(pool, n.p); opts.push(pool[Math.max(0, i - 2)]); }
        let p = opts[0];
        if (last && lastMel) {
          const mDir = Math.sign(n.p - lastMel.p);
          const score = q => Math.abs(q - last.p) + (n.l >= 8 && mDir && Math.sign(q - last.p) === mDir ? 4 : 0) - (n.l >= 8 && mDir && Math.sign(q - last.p) === -mDir ? 2 : 0)
            + (Arrange.parallelPerfect(last.p, lastMel.p, q, n.p) ? 20 : 0);
          p = opts.reduce((a, q) => score(q) < score(a) ? q : a, opts[0]);
        }
        last = { p, s: n.s, l: n.l, v: Math.max(30, Math.round(n.v * 0.78)) };
        notes.push(last); lastMel = n;
      }
    } else if (role === 'counter') {
      const src = mel.filter(n => on[Math.floor(n.s / 16)]);
      const ans = Melody.answer(src.length ? src : mel, h, st, bars, r);
      Melody.treatNonChordTones(ans, h);
      ans.forEach(n => { if (on[Math.floor(n.s / 16)]) notes.push(Object.assign(n, { v: Math.round(n.v * 0.85) })); });
    } else if (role === 'pad') {
      // v2.4: open, voice-led chords under the melody (no longer in the middle of its octave)
      let prev = null;
      for (let b = 0; b < bars; b++) {
        if (!on[b]) { prev = null; continue; }
        const E = energyAt(b), v = 42 + E * 5;
        const two = Array.isArray(chordForBar(gen, b));
        const lane = Arrange.laneUnder(prof, b, program, 1, 43);
        for (const s0 of two ? [0, 8] : [0]) {
          const voice = Arrange.voiceLead(h.chordAt(b, s0), prev, { lo: lane.lo, hi: lane.hi, open: true, center: lane.hi - 9 });
          prev = voice;
          voice.forEach(p => notes.push({ p, s: b * 16 + s0, l: two ? 8 : 16, v: humanVel(r, v, 4) }));
        }
      }
    } else if (role === 'arp') {
      for (let b = 0; b < bars; b++) {
        if (!on[b]) continue;
        const E = energyAt(b);
        // v2.4: above the melody while it sings (inside the instrument's range), under it if there is no room
        const rg = Arrange.rangeOf(program);
        let base = prof.sung[b] ? prof.high[b] + 2 : 67;
        if (prof.sung[b] && base + 14 > Math.min(rg.hi, 93)) base = Math.max(rg.lo, prof.low[b] - 14);   // no room up there (or too shrill): under the melody
        base = Math.max(base, rg.lo);
        const shapeAt = s => { const tones = h.chordAt(b, s).map(pc => base + ((pc - base) % 12 + 12) % 12).sort((a, c) => a - c); return tones.concat([tones[0] + 12]); };
        // v2.5 (gap 11): each section type gets its own arpeggio figure (up, down, up-down, broken, Alberti...)
        const sec = secOf(gen, b), key = sec ? sec.type : 'loop';
        if (!arpPats[key]) arpPats[key] = r.pick(ARP_PATTERNS);
        const pat = arpPats[key];
        const step = E >= 4 || st.edm || st.arp16 ? 1 : 2;
        let k = 0;
        for (let s = 0; s < 16; s += step) { const shape = shapeAt(s); notes.push({ p: shape[pat[k++ % pat.length] % shape.length], s: b * 16 + s, l: step, v: humanVel(r, (s % 4 === 0 ? 78 : 64) + (E - 3) * 4, 5) }); }
      }
    } else if (role === 'lead') {
      // the hook, played by an instrument: in intros and interludes it takes the tune, in the last chorus it doubles it
      let hookNotes = mel, hookStart = 0, hookLen = Math.max(1, Math.min(8, bars));
      if (gen.sections) {
        const hs = gen.sections.find(s => ['C', 'D', 'A'].includes(s.type)) || gen.sections.find(s => mel.some(n => n.s >= s.start * 16 && n.s < (s.start + s.len) * 16));
        if (hs) { hookStart = hs.start; hookLen = hs.len; hookNotes = mel.filter(n => n.s >= hs.start * 16 && n.s < (hs.start + hs.len) * 16); }
      }
      const hi = hookNotes.length ? Math.max(...hookNotes.map(n => n.p)) : 72;
      const up = hi + 12 <= 91 ? 12 : 0;
      for (let b = 0; b < bars; b++) {
        if (!on[b]) continue;
        const s = secOf(gen, b);
        const doubling = s && !['I', 'L'].includes(s.type) && !(s.change === 'handoff' && b - s.start < 4);
        if (doubling || !gen.sections) {
          mel.filter(n => Math.floor(n.s / 16) === b).forEach(n => notes.push({ p: Math.min(108, n.p + up), s: n.s, l: n.l, v: Math.round(n.v * 0.8) }));
        } else {
          const local = s ? b - s.start : b;
          const srcBar = hookStart + (local % hookLen);
          hookNotes.filter(n => Math.floor(n.s / 16) === srcBar).forEach(n => notes.push({ p: n.p, s: b * 16 + (n.s % 16), l: n.l, v: Math.round(n.v * (s && s.type === 'I' ? 0.8 : 0.95)) }));
        }
      }
    }
    if (role === 'harmony' || role === 'counter') Arrange.fitOctaves(notes, program);
    return notes.filter(n => n.s < bars * 16 && n.p >= 0 && n.p <= 127).map(n => Object.assign(n, { l: Math.max(1, Math.min(n.l, bars * 16 - n.s)) }));
  }

  // which parts a song with this many instruments gets (drums count as one)
  function rolesFor(count) {
    const n = Math.max(2, Math.min(ROLE_ORDER.length, Math.round(count) || 4));
    const pick = new Set(ROLE_ORDER.slice(0, n));
    return ['drums', 'bass', 'chords', 'melody', ...EXTRA_ROLES].filter(x => pick.has(x));
  }

  const ROLE_NAMES = { drums: 'Drums', bass: 'Bass', chords: 'Chords', melody: 'Melody', riff: 'Hook' };

  // Build a complete song description (tracks + generation settings)
  function generateSong({ key = 0, scale = 'Major', style = 'Pop', bars = 8, seed = Date.now(), phrase = '', form = 'auto', hookTrack = false, full = false, leap = 0.35, drumOff = [], structure = 'style', instruments = 4, progression = 'auto', pack = 'auto', loopBars = 0, fitBars = 0, keyPlan = 'auto', arp = 0.15, chordVar = 0.5 }) {
    const r = rng(seed);
    const st = STYLES[style] || STYLES['Pop'];
    if (!STYLES[style]) style = 'Pop';
    curStyle = style;
    lastInfo = {};
    const base = rolesFor(instruments);
    const gen = { key, scale, style, seed, form, leap, structure, instruments, interlude: base.includes('lead'), drumOff: drumOff.slice(), phrase: phrase.trim() || null, hookMotif: null, pack: PACKS[pack] ? pack : 'auto', progression: pickProgression(scale, r, style), progType: PROGRESSIONS[progression] ? progression : 'auto', keyPlan, arp, chordVar };
    if (PROGRESSIONS[progression]) gen.progression = PROGRESSIONS[progression].prog.slice();
    // full song: plan the sections first; their length sets the song length
    if (full) {
      if (fitBars > 0) gen.fitBars = Math.max(1, Math.min(256, Math.round(fitBars)));
      if (loopBars > 0) gen.loopBars = Math.max(1, Math.min(256, Math.round(loopBars)));
      gen.sections = SongForm.plan(gen, r, helpers());
      bars = SongForm.total(gen.sections);
      gen.loop = SongForm.isLoop(gen, helpers());
      gen.stinger = gen.sections.length === 1 && bars <= 8;
      lastInfo.form = SongForm.describe(gen, st.bpm, helpers());
    }
    // a typed phrase becomes the melody's core motif
    if (gen.phrase) usePhrase(gen, gen.phrase, Math.floor(r() * 4294967296));
    const roles = base.slice();
    if (gen.phrase && hookTrack) roles.splice(roles.indexOf('melody') >= 0 ? roles.indexOf('melody') : roles.length, 0, 'riff');
    let melodyNotes = [];
    const tracks = [];
    // the melody is written first: v2.4 places the bass, chords and pad against it, and harmony, counter-melody and lead follow it
    const order = roles.filter(x => x === 'melody').concat(roles.filter(x => x !== 'melody' && !EXTRA_ROLES.includes(x)), roles.filter(x => EXTRA_ROLES.includes(x)));
    const made = {};
    const programs = {};
    roles.forEach(x => { if (x !== 'drums') programs[x] = programFor(x, gen); });
    for (const role of order) {
      const notes = generatePart(role, gen, bars, r, { melody: melodyNotes, programs });
      if (role === 'melody') melodyNotes = notes;
      made[role] = {
        name: ROLE_NAMES[role] || ROLE_NAMES_X[role],
        role,
        drum: role === 'drums',
        program: role === 'drums' ? 0 : programFor(role, gen),
        notes,
        marks: role === 'melody' && lastInfo.melody ? lastInfo.melody.marks : undefined
      };
    }
    roles.forEach(role => tracks.push(made[role]));
    lastInfo.band = roles.filter(x => EXTRA_ROLES.includes(x)).map(x => EXTRA_INFO[x]);
    // v2.5: a song that ends slows down over its last bars
    const tempo = full && !gen.loop ? Perform.ritardando(bars, { stinger: gen.stinger }) : null;
    return { bpm: st.bpm, swing: st.swing, gen, tracks, bars, tempo };
  }

  const helpers = () => ({ STYLES, chordPCs, chordAtStep, isMinorish, humanVel, harmony, rng, Arrange, invRate, scalePcs });

  // full-song versions of each part (section plan, energy, exact returns)
  function generateFull(role, gen, bars, r, ctx = {}) {
    const H = helpers();
    const actx = { melodyHome: melodyHome(gen, ctx), program: progOf(role, gen, ctx), report: (lastInfo.arrange = lastInfo.arrange || {}), noLead: !(ctx.programs && ctx.programs.lead != null) };
    let notes;
    switch (role) {
      case 'drums': return SongForm.drums(gen, r, H);
      case 'bass': notes = SongForm.bass(gen, r, H, actx); break;
      case 'chords': notes = SongForm.chords(gen, r, H, actx); break;
      case 'riff': notes = SongForm.riffFilter(gen, genRiff(gen, SongForm.total(gen.sections), r)); break;
      case 'melody': {
        const res = SongForm.melody(gen, r, H);
        lastInfo.melody = { form: res.form, score: res.score, candidates: 10, marks: res.marks, fromPhrase: !!gen.hookMotif, sections: true, motifShare: res.motifShare, nct: res.nct, perf: res.perf };
        notes = res.notes;
        break;
      }
      default: return [];
    }
    return SongForm.keyUp(gen, notes).filter(n => n.s < bars * 16);
  }

  // drum sounds the user switched off are never written
  function generatePart(role, gen, bars, r, ctx) {
    if (typeof r === 'number') r = rng(r);
    curStyle = gen.style;
    let notes = EXTRA_ROLES.includes(role) ? genExtra(role, gen, bars, r, ctx || {}) : generatePartRaw(role, gen, bars, r, ctx || {});
    // v2.4: the melody sits in its instrument's range (moved by octaves only when much of it falls outside)
    if (role === 'melody') Arrange.fitOctaves(notes, progOf('melody', gen, ctx));
    if (EXTRA_ROLES.includes(role) && gen.sections) notes = SongForm.keyUp(gen, notes);
    // v2.5: stops before a chorus silence the pad and arpeggio for the second half of that bar too
    if ((role === 'pad' || role === 'arp') && gen.sections) {
      const stops = new Set(gen.sections.filter(s => s.exit === 'stop').map(s => s.start + s.len - 1));
      if (stops.size) notes = notes.filter(n => !(stops.has(Math.floor(n.s / 16)) && n.s % 16 >= 8)).map(n => { const b = Math.floor(n.s / 16); if (stops.has(b)) n.l = Math.min(n.l, b * 16 + 8 - n.s); return n; });
    }
    if (role === 'drums' && gen.drumOff && gen.drumOff.length) { const off = new Set(gen.drumOff); notes = notes.filter(n => !off.has(n.p)); }
    // v2.5 (gap 12): accompaniment notes that rub against the melody are left out or moved
    if (['chords', 'pad', 'arp', 'counter'].includes(role) && ctx && ctx.melody && ctx.melody.length) {
      const pcsAt = t => { const b = Math.floor(t / 16); return chordPCs(keyAt(gen, b), gen.scale, chordAtStep(chordForBar(gen, b), t % 16), styleOf(gen).sevenths, gen.style); };
      const res = Arrange.clearClashes(notes, ctx.melody, pcsAt, role === 'chords' || role === 'pad');
      notes = res.notes;
      lastInfo.arrange = lastInfo.arrange || {};
      lastInfo.arrange.clashesCleared = (lastInfo.arrange.clashesCleared || 0) + res.fixed;
    }
    return perform(role, gen, notes, r, ctx || {});
  }

  // v2.5 (gaps 6, 9, 11): dynamics, articulation and timing feel, by part (see perform.js)
  function perform(role, gen, notes, r, ctx) {
    const st = styleOf(gen), program = progOf(role, gen, ctx), secs = gen.sections || null;
    // phrase groups of 4 bars, counted from each section's start
    const groups = secs ? b => { const s = secs.find(x => b >= x.start && b < x.start + x.len); return s ? s.start + Math.floor((b - s.start) / 4) * 4 : b; } : null;
    const loop = !!gen.loop;
    if (role === 'melody' || role === 'lead' || role === 'counter' || role === 'harmony' || role === 'riff') {
      Perform.phraseDynamics(notes, 4, role === 'melody' ? 12 : 8, groups);
      if (role === 'melody') Perform.accentSyncopation(notes);
      Perform.articulateLine(notes, program);
    } else if (role === 'arp') Perform.phraseDynamics(notes, 4, 6, groups);
    else if (role === 'chords') { Perform.pedal(notes, program, st); notes = Perform.strum(notes, program, r); }
    if (role !== 'riff') Perform.sectionDynamics(notes, secs, { loop });
    Perform.feel(notes, role, gen.style, st, r, program);
    return notes;
  }

  function generatePartRaw(role, gen, bars, r, ctx = {}) {
    if (typeof r === 'number') r = rng(r);
    if (gen.sections) return generateFull(role, gen, bars, r, ctx);
    const actx = Object.assign({}, ctx, { melodyHome: melodyHome(gen, ctx) });
    switch (role) {
      case 'drums': return genDrums(gen, bars, r);
      case 'bass': return genBass(gen, bars, r, actx);
      case 'chords': return genChords(gen, bars, r, actx);
      case 'melody': return genMelody(gen, bars, r);
      case 'riff': return genRiff(gen, bars, r);
    }
    return [];
  }

  // Generation settings (incl. a chord progression) for regenerating single parts
  function makeGen({ key = 0, scale = 'Major', style = 'Pop', seed = Date.now(), form = 'auto', phrase = null, leap = 0.35, arp = 0.15, chordVar = 0.5 }) {
    return { key, scale, style, seed, form, leap, arp, chordVar, phrase, hookMotif: null, progression: pickProgression(scale, rng(seed), style) };
  }

  // A. set the phrase as the song's core motif (returns false if the phrase is too short)
  function usePhrase(gen, text, seed) {
    const m = Melody.phraseMotif(text, rng(seed));
    gen.phrase = text;
    gen.hookMotif = m;
    if (m) lastInfo.phrase = m.info;
    return !!m;
  }

  // B. riff -> vocal melody
  function answerRiff(riffNotes, gen, bars, seed) { return Melody.answer(riffNotes, harmony(gen), styleOf(gen), bars, rng(seed)); }
  function repitchRiff(riffNotes, gen, bars, seed) { return Melody.repitch(riffNotes, harmony(gen), bars, rng(seed)); }
  function scoreNotes(notes, gen, bars) { return Melody.scoreMelody(notes, harmony(gen), bars); }

  const api = { Arrange, invRate, STYLES, FAMILIES, PACKS, programFor, PROGRESSIONS, chordName, chordForBar, chordAtStep, keyAt, isColour, EXTRA_ROLES, EXTRA_PROGRAMS, EXTRA_INFO, ROLE_NAMES_X, rolesFor, isMinorish, generateSong, generatePart, makeGen, rng, chordPCs, answerRiff, repitchRiff, scoreNotes, usePhrase, get lastInfo() { return lastInfo; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Generator = api;
})(this);
