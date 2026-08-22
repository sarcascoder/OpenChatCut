// Session grants for scaffold-eligible project roots: only a directory the
// user chose through a trusted OS dialog (grantProjectRoot) is eligible; a
// directory the renderer merely names is not, even if it exists on disk and
// even after a matching directory elsewhere was granted.
// How to run: npx tsx desktop/project-root-grants.verify.ts (wired into verify:desktop-window).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearProjectRootGrants,
  detachProjectRootGrantStore,
  grantProjectRoot,
  isProjectRootGranted,
  loadProjectRootGrants,
} from './project-root-grants.ts';

const base = await mkdtemp(join(tmpdir(), 'occ-root-grants-'));
const granted = join(base, 'Granted');
const ungranted = join(base, 'Ungranted');
await mkdir(granted, { recursive: true });
await mkdir(ungranted, { recursive: true });

clearProjectRootGrants();

// -- nothing is granted before a dialog pick --
assert.equal(await isProjectRootGranted(granted), false, 'a directory is not granted until chosen');

// -- grantProjectRoot (called by the select-project-folder dialog handler) admits it --
const canonicalGranted = await grantProjectRoot(granted);
assert.equal(await isProjectRootGranted(granted), true, 'a directory the dialog granted is eligible');
assert.ok(canonicalGranted.endsWith('Granted'), 'grantProjectRoot returns the canonicalised path');

// -- a directory the renderer merely names, never chosen through the dialog, stays refused --
assert.equal(
  await isProjectRootGranted(ungranted),
  false,
  'a directory that was never granted must not become eligible',
);

// -- a symlink to a granted directory IS granted: the grant is stored per canonical path and
//    isProjectRootGranted resolves through realpath, so an alias lands on the same canonical
//    path. Aliasing therefore neither widens the grant nor lets a granted directory be
//    reached under a name that escapes the check --
const alias = join(base, 'Alias');
await symlink(granted, alias);
assert.equal(
  await isProjectRootGranted(alias),
  true,
  'a symlink that resolves to a granted directory is granted (same canonical path)',
);

// -- clearing removes every grant --
await clearProjectRootGrants();
assert.equal(await isProjectRootGranted(granted), false, 'clearProjectRootGrants revokes every prior grant');

// -- a path that does not exist is refused, not thrown --
assert.equal(
  await isProjectRootGranted(join(base, 'does-not-exist')),
  false,
  'a nonexistent directory is refused rather than throwing',
);

// -- persistence: a grant survives a restart, which is the whole point --
// This is a deliberately weakened boundary (see the module header): a folder
// granted in an earlier run is usable with no dialog in this one. These
// assertions pin what that does and does NOT admit.
const storeDir = await mkdtemp(join(tmpdir(), 'occ-grant-store-'));
const store = join(storeDir, 'project-root-grants.json');
const survives = join(base, 'Survives');
await mkdir(survives);

detachProjectRootGrantStore();
await loadProjectRootGrants(store);
await grantProjectRoot(survives);

// Simulate a restart: drop all in-memory state, then load from disk alone.
detachProjectRootGrantStore();
assert.equal(await isProjectRootGranted(survives), false, 'a detached store must grant nothing');
const restored = await loadProjectRootGrants(store);
assert.equal(restored, 1, 'exactly the one granted root is restored');
assert.equal(await isProjectRootGranted(survives), true, 'a grant survives a restart');

// -- the store is not world-readable: it names directories the renderer may reach --
const mode = (await stat(store)).mode & 0o777;
assert.equal(mode, 0o600, `the grant store must be 0600, got ${mode.toString(8)}`);

// -- a directory that vanished after being granted is NOT restored --
const vanishes = join(base, 'Vanishes');
await mkdir(vanishes);
await grantProjectRoot(vanishes);
await rm(vanishes, { recursive: true });
detachProjectRootGrantStore();
await loadProjectRootGrants(store);
assert.equal(await isProjectRootGranted(vanishes), false, 'a deleted directory must not carry a stale grant');
assert.equal(await isProjectRootGranted(survives), true, 'dropping a dead entry must not drop the live ones');

// -- a path replaced by a FILE is not restored: only directories are grantable --
const replaced = join(base, 'Replaced');
await mkdir(replaced);
await grantProjectRoot(replaced);
await rm(replaced, { recursive: true });
await writeFile(replaced, 'not a directory');
detachProjectRootGrantStore();
await loadProjectRootGrants(store);
assert.equal(await isProjectRootGranted(replaced), false, 'a path swapped for a file must not stay granted');

// -- a corrupt store yields NO grants rather than being trusted --
await writeFile(store, '{ this is not json');
detachProjectRootGrantStore();
assert.equal(await loadProjectRootGrants(store), 0, 'a corrupt store must yield no grants');
assert.equal(await isProjectRootGranted(survives), false, 'a corrupt store must not resurrect anything');

// -- a grant racing the restore must not CLOBBER THE FILE --
// The in-memory Set was never at risk here; the file was. A grant that wrote
// the store while the load was still reading it back would persist a set
// missing the roots not yet restored, so they would vanish on the NEXT launch
// even though this run looked correct. The assertion therefore reloads from
// disk rather than trusting the live Set.
await writeFile(store, JSON.stringify({ version: 1, roots: [survives] }));
detachProjectRootGrantStore();
const racing = join(base, 'Racing');
await mkdir(racing);
const loading = loadProjectRootGrants(store);
await grantProjectRoot(racing);
await loading;
detachProjectRootGrantStore();
await loadProjectRootGrants(store);
assert.equal(await isProjectRootGranted(racing), true, 'a grant made while loading must survive on disk');
assert.equal(
  await isProjectRootGranted(survives),
  true,
  'a grant made while loading must not clobber roots still being restored',
);

detachProjectRootGrantStore();
console.log('project-root-grants.verify: only dialog-chosen roots are scaffold-eligible, and they persist across a restart');
