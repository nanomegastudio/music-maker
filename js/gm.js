// General MIDI instrument + drum tables
(function (root) {
  const GM_IDS = [
    'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano',
    'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavinet',
    'celesta', 'glockenspiel', 'music_box', 'vibraphone', 'marimba', 'xylophone', 'tubular_bells', 'dulcimer',
    'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ', 'reed_organ', 'accordion', 'harmonica', 'tango_accordion',
    'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean',
    'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics',
    'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass', 'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2',
    'violin', 'viola', 'cello', 'contrabass', 'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani',
    'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2', 'choir_aahs', 'voice_oohs', 'synth_choir', 'orchestra_hit',
    'trumpet', 'trombone', 'tuba', 'muted_trumpet', 'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2',
    'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax', 'oboe', 'english_horn', 'bassoon', 'clarinet',
    'piccolo', 'flute', 'recorder', 'pan_flute', 'blown_bottle', 'shakuhachi', 'whistle', 'ocarina',
    'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff', 'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass__lead',
    'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir', 'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep',
    'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere', 'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi',
    'sitar', 'banjo', 'shamisen', 'koto', 'kalimba', 'bagpipe', 'fiddle', 'shanai',
    'tinkle_bell', 'agogo', 'steel_drums', 'woodblock', 'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal',
    'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet', 'telephone_ring', 'helicopter', 'applause', 'gunshot'
  ];

  const GM_NAMES = GM_IDS.map(id => id.replace('__', ' + ').split('_')
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ').replace('Honkytonk', 'Honky-tonk'));

  const GM_FAMILIES = ['Piano', 'Chromatic Percussion', 'Organ', 'Guitar', 'Bass', 'Strings', 'Ensemble', 'Brass',
    'Reed', 'Pipe', 'Synth Lead', 'Synth Pad', 'Synth Effects', 'Ethnic', 'Percussive', 'Sound Effects'];

  // GM percussion key map (channel 10)
  const DRUMS = {
    35: 'Kick 2', 36: 'Kick', 37: 'Side Stick', 38: 'Snare', 39: 'Clap', 40: 'Snare 2', 41: 'Low Floor Tom',
    42: 'Closed Hi-Hat', 43: 'High Floor Tom', 44: 'Pedal Hi-Hat', 45: 'Low Tom', 46: 'Open Hi-Hat', 47: 'Low-Mid Tom',
    48: 'Hi-Mid Tom', 49: 'Crash', 50: 'High Tom', 51: 'Ride', 52: 'China', 53: 'Ride Bell', 54: 'Tambourine',
    55: 'Splash', 56: 'Cowbell', 57: 'Crash 2', 58: 'Vibraslap', 59: 'Ride 2', 60: 'Hi Bongo', 61: 'Low Bongo',
    62: 'Mute Hi Conga', 63: 'Open Hi Conga', 64: 'Low Conga', 65: 'High Timbale', 66: 'Low Timbale', 67: 'High Agogo',
    68: 'Low Agogo', 69: 'Cabasa', 70: 'Maracas', 71: 'Short Whistle', 72: 'Long Whistle', 73: 'Short Guiro',
    74: 'Long Guiro', 75: 'Claves', 76: 'Hi Wood Block', 77: 'Low Wood Block', 78: 'Mute Cuica', 79: 'Open Cuica',
    80: 'Mute Triangle', 81: 'Open Triangle'
  };
  // Rows shown by default in the drum editor (top to bottom)
  const DEFAULT_DRUM_ROWS = [49, 51, 46, 42, 50, 47, 45, 56, 54, 39, 37, 38, 36];

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = p => NOTE_NAMES[p % 12] + (Math.floor(p / 12) - 1);

  const SCALES = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'Harmonic minor': [0, 2, 3, 5, 7, 8, 11],
    'Major pentatonic': [0, 2, 4, 7, 9],
    'Minor pentatonic': [0, 3, 5, 7, 10],
    'Blues': [0, 3, 5, 6, 7, 10],
    'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  };

  const api = { GM_IDS, GM_NAMES, GM_FAMILIES, DRUMS, DEFAULT_DRUM_ROWS, NOTE_NAMES, noteName, SCALES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GM = api;
})(this);
