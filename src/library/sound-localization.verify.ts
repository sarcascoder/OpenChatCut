// The built-in sound `name` is the canonical value persisted into project data as
// `AudioAsset.name`, so adding or dragging a sound must never substitute a display
// string for it. Group rows render their own name directly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOUND_EFFECTS, SOUND_GROUPS } from '../audio/soundLibrary';

const unnamedGroups = SOUND_GROUPS.filter((group) => !group.name.trim()).map((group) => group.id);
assert.deepEqual(unnamedGroups, [], 'every sound group must have a display name');

const unnamedSounds = SOUND_EFFECTS.filter((sound) => !sound.name.trim()).map((sound) => sound.id);
assert.deepEqual(unnamedSounds, [], 'every built-in sound effect must have a display name');

const browserSource = readFileSync(new URL('./SoundBrowser.tsx', import.meta.url), 'utf8');

assert.match(browserSource, /\{g\.name\}/, 'sound group chips must render the group name');
assert.match(browserSource, /const displayName = sound\.name/, 'sound rows must derive their display name from the canonical name');
assert.match(browserSource, /cc-sound-name[^>]*>\{displayName\}/, 'sound rows must render that display name');
assert.match(browserSource, /\$\{list\.length\} sounds total/, 'the footer must report the active search/category result count');
assert.doesNotMatch(
  browserSource,
  /\$\{SOUND_EFFECTS\.length\} sounds total/,
  'the filtered result footer must not keep reporting the full library size',
);

assert.match(
  browserSource,
  /function toAsset[\s\S]*?name: s\.name/,
  'adding a sound must preserve its canonical data name',
);
assert.match(
  browserSource,
  /setLibraryDrag\([\s\S]*?name: sound\.name/,
  'dragging a sound must preserve its canonical data name',
);

console.log(`sound-localization.verify: ${SOUND_EFFECTS.length} built-in sound names reach the UI without mutating data`);
