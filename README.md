# MIDI Music Maker

A music-making app that runs in your browser. No install needed.

## Start it
Double-click **Start MIDI Music Maker.bat** (or `index.html`). Chrome or Edge works best.

## New in v2.6: play your own melody with keys 1 to 5 (scale keys)
- Click **1–5** (next to ● in the top bar) to turn on scale keys. Keys **1 to 5** now play the melody track on the
  notes of the chord that is sounding at the playhead: **1** is the chord's root, and each number is one step up the
  song's scale (on most chords 3 is the third and 5 the fifth). The difference between two numbers is the number of
  scale steps between the notes, so 1 → 3 goes up two steps and 5 → 4 down one. **Shift** plays an octave higher.
- Every note is in key, also in sections that change key (the keys follow the key the bar is in). A colour chord
  whose root is outside the key starts from the nearest note of the key instead.
- **To replace the melody:** generate a song, turn on 1–5 and ● (record), press Play and play along. From your first
  key press the old melody goes quiet, and when you stop (or the loop comes round) your notes replace it up to the
  end of the bar of your last note. The harmony, counter-melody and lead parts are rewritten to follow your melody.
  Ctrl+Z undoes the take. Notes snap to the editor's Snap setting.
- Not playing: press a number to hear it; the status bar lists what 1 to 5 are over the chord at the playhead.
- While scale keys are on, 2, 3 and 5 no longer play piano keys (the letter keys still do).
- **🧹 Clear** on every track (and *Clear track* in the editor bar) removes all its notes and keeps the track and its
  sound. Clearing the melody also clears the harmony, counter-melody and lead that follow it, so the old tune is gone
  before you record a new one; they are written again from your melody when the take ends. Ctrl+Z undoes it.

## New in v2.5: the rest of the composer's checklist (gaps 4 to 12 from "What composers still do")
- **Melody arpeggios** slider (generator bar): how often the melody plays broken chords, running through the
  chord's notes instead of stepping along the scale. There is also a new variation, *broken chord (arpeggio)*.
  Letting go rebuilds the melody.
- **Chord variety** slider: from *same loop* (one progression all through) through *some* (the usual) to *lots*
  (more swaps, up to three colour chords per section anywhere in it, mediants and suspended V chords). Used by Generate.
- **Notes off the chord are used properly.** Every melody note that is not in its chord must be a passing note,
  neighbour, appoggiatura or suspension, anticipation or escape tone; anything else moves to the nearest chord tone
  (unexplained off-chord notes went from about 14% of melody notes to about 1%). Over colour chords the melody takes
  the chord's own altered note (an A over a borrowed F minor becomes A♭).
- **Cadences match the chords.** The chords now end each 8-bar phrase to fit the melody: V–I (sometimes with the chord
  before V in the same bar, or a Vsus4 resolving to V), IV–I in gospel, folk, country, classical and rock, a half
  cadence on V or a deceptive V–vi on open phrase ends. The melody's last note picks a note of the chord it lands on,
  so section endings are always on a chord tone.
- **Style harmony.** Blues plays C7–F7–G7. In minor keys, classical, film, flamenco-flavoured and most game styles
  use a major V. Jazz, soul, lo-fi, gospel and bossa chords get 9ths; pop, indie, synthwave and dreamy styles add a
  9th to I and IV. Jazz-type styles sometimes swap V for its tritone substitute (♭II7). Film and game themes use
  chromatic mediants (♭VI, ♭III, major III) and, in minor, the Neapolitan ♭II before V.
- **Dynamics and articulation.** Melody phrases swell to their high note and relax into the cadence, pre-choruses and
  builds grow louder, outros fade, syncopated notes are accented. Sustaining instruments (strings, winds, voices,
  organ, synth leads) play legato; plucked and struck ones re-articulate repeated notes; slow piano parts are held
  like the sustain pedal. Songs that end slow down over the last two bars (a ritardando, also written to the .mid
  file as tempo changes).
- **Feel.** Notes can now sit slightly off the grid: a laid-back backbeat and bass in hip-hop, soul, funk, reggae,
  jazz and similar styles, looser hi-hats, a human melody, and strummed guitar chords (down-strokes low to high,
  up-strokes high to low and softer). Electronic styles stay tight. Bass notes a sixteenth off the kick drum move onto it.
- **Rhythm.** Some phrases start with a pickup before the bar line, and in pop, rock, soul, Latin and similar styles
  some downbeat notes come an eighth early, tied over (anticipations). Drums play 4-bar phrases: a pushed kick in the
  2nd bar and a small snare pickup in the 4th.
- **Song shape.** The last big chorus carries the song's highest note (now in about 80% of songs, up from about 10%).
  Before some choruses the band stops for half a bar. The last chorus before the outro may be extended: its last two
  bars come round again, the first time ending on vi, the second on I.
- **Accompaniment.** Each section type gets its own arpeggio figure. Classical, title-screen, RPG town, puzzle, tavern
  and folk songs play broken chords (Alberti on keys and harp, finger-picking on guitar). Slow piano parts add a
  left hand. With no lead instrument, the intro has the chords instrument play the hook's rhythm and shape.
- **Second voices.** The harmony part holds its note while the melody moves quickly, avoids parallel fifths and
  octaves and moves against the melody into long notes. Chord, pad, arpeggio and counter-melody notes that would
  rub a semitone against the melody on a beat are left out or moved.
- **Fix:** harmony, counter-melody and lead parts were transposed twice in choruses that change key.
- Not in this version: 3/4 and 6/8 time (gap 7). The whole app assumes 16 steps per bar, so it needs its own
  release.

## New in v2.4: the parts listen to each other (from the "What composers still do" research, gaps 1 to 3)
- **Every part has its own register.** Chords and pads are now voiced under the melody's lowest note in each 4-bar
  phrase, so they no longer play in the middle of the tune (the pad used to sit inside the melody's octave in about a
  quarter of its notes; now it never does). The arpeggio plays above the melody while it sings, or under it when the
  instrument has no room up there. Each part also stays in its instrument's comfortable range (a table for all 128
  General MIDI sounds), and a melody that falls mostly outside its instrument's range moves by an octave.
- **Voice-led chords.** Each chord is voiced from the one before it: the nearest notes, shared notes held, a smooth
  top voice, and no muddy close thirds down low. Inversions come out of this naturally. Choruses spread the voicing
  open, and the fullest choruses double the bottom note an octave down instead of adding a top note over the melody.
  Power chords move to the nearest root instead of always sitting on E2 to D♯3.
- **A bass line, not just roots.** The bass is now written after the melody and planned as a line: octaves follow the
  line (no jump where B wraps to C), the chord's third goes in the bass when that makes a stepwise line
  (I – V/7 – vi, C–B–A), at a rate set by style (often in pop, gospel, classical and film; never in rock, blues or
  walking jazz bass). Intros and outros can hold a tonic **pedal**, builds and some pre-choruses a dominant pedal.
  Before a section of equal or more energy the bass can **walk up** to the next section's first note. Parallel
  octaves and fifths with the melody on the beat are fixed where another chord tone works (about two in three).
  The status bar reports inversions, pedals, walk-ups and fixes after Generate.
- 🎲 on bass, chords, pad or arpeggio, ↻ on a section and chord-lane changes all place the part against the current
  melody and the track's own instrument.

## New in v2.3: less repetition (from the "Keeping songs fresh" research)
- **Longer ideas, heard less often.** Melodies now grow from a 2-bar idea (6–10 notes) in 8-bar phrases instead of a
  1-bar motif restated at the start of every 4 bars. About half of each phrase is new material (contrast,
  continuation), and the hook sits at the top of the chorus and once more halfway. The status bar shows how much of
  the sung melody states one of the ideas (about 40% in Pop songs, down from about 58%). New bars show as green
  *Second idea* / *New cell* marks in the strip above the notes.
- **Every section has its own material.** The verse has its own idea, and its second 8 bars a new idea that keeps only
  the rhythm. The pre-chorus climbs on its own cell, the solo plays the hook's rhythm on new notes, and a returning
  verse keeps its first half and gets a new second half.
- **The scorer no longer rewards repetition.** It aims for about half the bars sharing a rhythm, penalises one bar
  shape filling the melody, and likes one clear peak note. The song's score is the mean of its sections' scores.
- **Chords per section.** Each section gets a varied plan instead of one 4-chord loop: middle groups swap a chord for
  one with the same job, pre-choruses speed up to two chords a bar and land on V, choruses can start on the home chord
  and have turnarounds, slow verses hold each chord for 2 bars, and now and then a colour chord appears (borrowed iv,
  ♭VII or ♭VI, a secondary dominant on the half bar before its target, a Lydian II in a bridge). The chord lane shows
  both chords of a split bar.
- **Key changes** (generator bar): *Auto*, *None*, *Last chorus up a step* or *Choruses up a minor third* (the bar
  before each chorus plays the new key's V and the next verse starts back home). Key changes only happen at section
  borders, as in real songs. The chord lane shows chord names in the key each bar sounds in.
- **New chorus returns**: *same tune, new chords* (reharmonised), *melody rests for 4 bars* and, with a lead
  instrument in the band, *lead takes the tune for 4 bars*. Every return also gets small velocity changes so no two
  passes are identical.
- **More cadences**: more phrase-ending rhythms (some from the style's own rhythm cells) and the occasional
  appoggiatura, a note above the goal that lands on the beat and resolves down.
- **🎚 EQ** (top bar, next to Reverb): a 5-band equalizer on the whole mix (Bass 80 Hz, Low mids 250 Hz, Mids 1 kHz,
  Presence 3.5 kHz, Air 10 kHz, ±12 dB) with a live response curve, presets (Bass boost, Warm, Bright, Melody
  forward, Loudness, Lo-fi radio, Small speakers, Clear the mud) and an on/off switch to compare. It changes the sound
  while it plays, is remembered in the browser and saved with projects. It shapes the sampled and synth sounds;
  MIDI devices and exported .mid files are not changed. Double-click a slider to reset that band.
- **Quieter drums by default**: new songs and new drum tracks start the drums at a third of the old volume (0.27
  instead of 0.8). Songs you saved keep their own volumes.

## What it does
- **Generator**: pick a style (Pop, Lo-fi, Rock, Electronic, Ambient), key, scale and melody form, then click
  *Generate new song* to get drums, bass, chords and melody. The 🎲 button on a track regenerates just that part.
- **Phrase → melody**: type a phrase (e.g. "Where did you go last night?") and click *Build melody from phrase*.
  The phrase becomes the melody's core motif: stressed syllables land on the beats, the speech contour is snapped to
  the scale, questions end high and statements fall to the home note. The verse states the phrase, and the rest of the
  melody is developed from it (varied repeats, fragments, the chorus as a variation). A strip above the notes shows
  which bars hold the motif and how each one was varied, and the syllables show on the notes (and are saved as lyrics
  in the .mid file). Tick *+ looping hook track* to also get the phrase as a separate looping riff. With a phrase
  typed in, *Generate new song* builds the whole song's melody from it too.
- **Melody engine**: melodies grow from a 2–4 note motif using classic forms (sentence, period / question–answer,
  call & response) and variations (sequence, changed ending, rhythm shift, augmentation, passing notes, inversion…).
  Songs are built as verse A A′ and chorus B B′. 24 candidates are generated and the best is kept, scored on what
  listeners expect: mostly steps, leaps that turn back, arch-shaped phrases, about an octave of range, chord tones on
  strong beats and ending on the home note. The status bar shows the winner's score.
- **Answer this / Re-pitch to chords** (editor bar): build a vocal line from the selected track. *Answer* plays in its
  rests and held notes in another register (call and response). *Re-pitch* keeps its rhythm and moves the notes onto
  each bar's chord.
- **Full song form** (Length: *Full song*): the generator plans the whole song as sections, with a layout and bar
  counts per style: Pop verse–pre-chorus–chorus–bridge (96 bars), Rock AABA with a solo, Lo-fi AABA, Electronic
  intro–break–build–drop (112 bars), Ambient A B A. Each section gets its own chords (the bridge avoids the home chord
  and ends on V, the outro ends home) and an energy level: thin verses, full choruses, beat-only EDM intros, breaks
  without kick, builds with a snare roll that speeds up from quarters to eighths to sixteenths. Each section's melody
  is written once; verses return with the same music and every chorus return is an exact copy with exactly one change
  (new ending, passing notes, octave doubling, a drop-out breakdown, or a final key change up a whole step). A typed
  phrase goes where the title belongs (the chorus / A sections / drop) and the verses use a variation of it. The
  sections show as coloured blocks in the ruler (bars ▮ = energy) and as markers in the exported .mid file.
  *Loop (8 bars)* keeps the old short-loop generator.
- **Sections bar** (under the phrase bar): every section of the song as a card. Rename it, change its type
  (verse, chorus, bridge…), set its length in bars, click the ▮ bars to change its energy, move it earlier or later,
  duplicate it as an exact repeat, write new music for it (↻) or delete it. *+ Add section* inserts a new one;
  if the song already has that type, it repeats it. **Octave − / +** moves a section an octave, for all instruments
  or only the selected track; the move is kept when you regenerate that part. Songs without sections get a
  *Split into sections* button.
- **🥁 Drum sounds** (generator bar): untick any drum or percussion sound and the generator stops using it
  (Generate, 🎲 on a drum track, ↻ on a section). Unticking also removes it from the song's drum tracks
  (Ctrl+Z undoes it). Click a name to hear it. *Keep only the sounds in this song* and *Turn all on* are shortcuts,
  and *New beat with these sounds* rewrites the drums. The choice is saved with the project and carries over to new songs.
- **Style** (generator bar): 30 genres in groups. Pop & rock: Pop, Indie, Rock, Punk, Metal. Blues, jazz & soul:
  Blues, Jazz, Funk, Disco, R&B / Soul, Gospel. Hip-hop: Hip-hop, Trap, Lo-fi. Electronic: Electronic (EDM), House,
  Techno, Drum and bass, Dubstep, Synthwave, Ambient. World & Latin: Reggae, Reggaeton, Latin (salsa), Bossa nova,
  Afrobeats. Country & folk: Country, Folk. Orchestral: Classical, Cinematic. Each sets its own tempo, swing, drum
  groove, chord and bass rhythm, melody rhythm, song layout and favourite chord progressions.
- **Game music** (Style group): Chiptune platformer, RPG town, Overworld adventure, Dungeon / cave, Boss battle,
  Fantasy tavern, Horror ambience, Sci-fi space, Puzzle / casual, Racing, Menu / title theme, plus two short stingers,
  Victory fanfare and Game over. Each has its own instrument pack. The background styles use the *Seamless game loop*
  structure (A B A B, no intro or outro, no final key change or big last chorus, and the last bar's fill leads back
  into bar 1), and Generate turns the Loop button on so it plays round and round. *Long game loop* (A B A C) and
  *Short stinger* are in the Structure list too and work with any style.
- **BPM, Bars and Swing** (top bar): each has a small *auto* / *🔒 kept* switch. On *auto*, Generate uses the style's
  tempo and swing and the structure's length. As soon as you change one yourself it switches to *kept*, and Generate
  keeps your value: a kept bar count builds the full song to exactly that many bars, with the sections scaled to fit.
  Click the switch to go back to *auto*. In Loop mode the *Loop bars* box sets the length (editing Bars copies into it).
- **Loop bars** (generator bar, next to Length): shown only when Length is *Loop*. Type any length from 1 to 256
  bars (the list suggests 4, 8, 16, 24, 32, 64); every part is written to repeat seamlessly over exactly that many bars.
- **Instrument pack** (generator bar): which General MIDI instrument plays each part (chords, bass, melody, hook,
  harmony, counter-melody, pad, arpeggio, lead). *Style's own band* follows the style; every genre also has its pack,
  plus theme packs (symphony orchestra, 8-bit chiptune, acoustic unplugged, big band, 80s synth pop, church choir
  and organ, piano trio, world instruments, music box lullaby, dreamy pads). Changing it re-voices the current
  song straight away (Ctrl+Z undoes it) and is used by Generate.
- **Structure** (generator bar): pick the song's layout. *Style default* uses each style's own form; the templates
  are verse–chorus, verse–pre–chorus–bridge (pop), chorus first, AABA 32-bar, AABA with a solo, 12-bar blues
  (with blues changes), EDM build and drop, hip-hop verse and hook, ternary (A B A), rondo (A B A C A) and strophic.
  Picking one switches Length to *Full song*; it is used on the next Generate.
- **Instruments** (generator bar, 2–9): how many instruments the song uses, drums included. Past the core band
  (melody, chords, drums, bass) each extra gets a job and a place in the form: **harmony** a third or sixth under the
  melody in the choruses, a **counter-melody** that answers the melody in the verses and bridge, a **pad** under the
  intro, bridge, breaks and big choruses, an **arpeggio** driving the pre-choruses, builds and choruses, and a **lead**
  that plays the tune in the intro and in an added instrumental **interlude**, then doubles the last chorus an octave up.
  So the arrangement grows and thins out across the song. 🎲 on the melody rewrites the parts that follow it.
- **Chords** (generator bar): pick a progression type: pop I–V–vi–IV, sensitive vi–IV–I–V, 50s doo-wop, rock
  I–IV–V–IV, royal road, Pachelbel's canon, circle vi–ii–V–I, jazz ii–V–I, 12-bar blues, two-chord vamp, minor
  i–iv–v–i, Andalusian, epic i–VI–III–VII or aeolian. Changing it rewrites the chords and the melody across the song
  (pre-choruses, builds and bridges keep their own for contrast). Each **section card** has its own progression menu too.
- **Chord lane** (under the section names, above the notes): every bar's chord, as a name and a numeral. Click a
  bar to pick a different chord (hover to hear it). Bass, chords, pad, arpeggio and harmony follow it straight away,
  and melody notes on the beat move onto the new chord. Changed bars show in purple; *Back to the progression* undoes one.
- **Melody leaps** slider: how far the melody may jump between notes. Far left moves only up and down the scale;
  far right allows leaps up to an octave. Letting go rebuilds the melody (Ctrl+Z undoes it).
- **Projects** (📁 Projects, 💾 Save or Ctrl+S): saves the project inside the browser exactly as it is: all tracks,
  sections, generator settings, view and undo history. Every save also keeps a version (the last 20), so you can
  reopen an earlier state. *Download project file* writes the whole state to a `.mmm.json` file for backups or
  another PC; *Open file…* loads it back. Reopening the page brings back your last session where you left it.
- **Piano roll** for instruments and a **step sequencer** for drums.
- **All 128 General MIDI instruments** plus the GM drum kit.
- **Three sound sources** (Sound menu):
  - *Sampled GM instruments*: real recorded instrument samples, downloaded on first use (needs internet).
  - *Built-in synth*: works fully offline.
  - *Connect MIDI devices*: plays through a MIDI device. On Windows this includes
    **Microsoft GS Wavetable Synth**, the built-in General MIDI sound set, which also works offline.
    MIDI keyboards plugged into the PC can play and record too.
- **Export .mid** gives you a standard MIDI file for any DAW (FL Studio, Ableton, Reaper, MuseScore…).
- **Open file…** imports `.mid` files, project files (`.mmm.json`) and older `.json` projects. Your work also autosaves in the browser.

## Controls
| Action | How |
|---|---|
| Play / stop | Space |
| Add note | Click (drag right to make it longer) |
| Move / resize | Drag a note / drag its right edge |
| Delete | Right-click, double-click, or select + Delete |
| Select several | Shift+drag, Ctrl+A, Ctrl+click |
| Copy / paste / duplicate | Ctrl+C / Ctrl+V (pastes at the playhead) / Ctrl+D |
| Transpose selection | Up/Down arrows (Shift = octave), Left/Right moves |
| Undo / redo | Ctrl+Z / Ctrl+Y |
| Play notes from the keyboard | Z S X D C V… (lower octave), Q 2 W 3 E… (upper), [ and ] change octave |
| Scale keys (1–5 on) | 1–5 play steps of the scale from the current chord's root, Shift = octave up |
| Record | Press ● then Play, and play notes on your keyboard or a MIDI keyboard |
| Zoom / scroll | Ctrl+wheel / wheel, Shift+wheel |
| Set start position | Click the bar ruler |

## Files
- `index.html`: the page
- `js/app.js`: UI, piano roll, sequencer
- `js/audio.js`: sound engines (samples, synth, MIDI out)
- `js/generator.js`: song generator (chords, bass, drums, arrangement)
- `js/perform.js`: dynamics, articulation, timing feel, strums and the closing ritardando
- `js/arrange.js`: instrument ranges, register plan, chord voice leading, bass line planning and the bass–melody check
- `js/songform.js`: song form (section plans, per-section chords and energy, exact returns with one change)
- `js/melody.js`: melody engine (phrase → riff, motif development, candidate scoring, answer / re-pitch)
- `js/midifile.js`: .mid export/import
- `js/gm.js`: General MIDI instrument and drum tables
