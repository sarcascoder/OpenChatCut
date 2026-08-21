import assert from 'node:assert/strict';
import { pathAllowedByRoots } from './agent-path-import.ts';

// AGENT_IMPORT_ROOTS whitelist semantics: only explicit roots authorize a
// path; prefix look-alikes and siblings must stay outside.
const roots = ['/Volumes/Footage', '/Users/qinpx/Movies'];

assert.equal(pathAllowedByRoots(roots, '/Volumes/Footage/20260101/A001.mp4'), true, 'direct child file is allowed');
assert.equal(pathAllowedByRoots(roots, '/Volumes/Footage/20260101/sub/A002.mp4'), true, 'deep child is allowed');
assert.equal(pathAllowedByRoots(roots, '/Volumes/Footage'), true, 'the root itself is allowed');
assert.equal(pathAllowedByRoots(roots, '/Users/qinpx/Movies/Shorts'), true, 'second root child is allowed');
assert.equal(pathAllowedByRoots(roots, '/Volumes/Footage2/20260101/A001.mp4'), false, 'prefix look-alike sibling is rejected');
assert.equal(pathAllowedByRoots(roots, '/Volumes/OtherDrive/A.mp4'), false, 'unrelated path is rejected');
assert.equal(pathAllowedByRoots(roots, '/Users/qinpx/Desktop/A.mp4'), false, 'path outside both roots is rejected');
assert.equal(pathAllowedByRoots([], '/Volumes/Footage/A.mp4'), false, 'empty root list authorizes nothing');
assert.equal(pathAllowedByRoots(roots, '/Volumes/Footage'), true, 'root boundary itself allowed');

console.log('agent-path-import.verify: root whitelist containment passed');
