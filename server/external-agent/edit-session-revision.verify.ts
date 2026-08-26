// An MCP edit session must survive the document revision advancing underneath
// it. It is the revision advance that made this worth pinning: `begin_edit_session`
// records its owner's binding once, and EditorBinding carries `baseRevision`, so
// matching that whole binding meant the FIRST advance after the session opened
// orphaned it -- whatever caused the advance, including the editor's own
// autosave. In the app that surfaced as being told to restart the session on
// essentially every edit.
//
// Ownership must therefore ignore `baseRevision` while still honouring
// `ownershipEpoch`, because an epoch change IS a browser takeover and must
// still invalidate the session.
//
// How to run: npx tsx server/external-agent/edit-session-revision.verify.ts
import assert from 'node:assert/strict';
import {
  editSessionOwnerMatches,
  editorBinding,
  invokeEditorTool,
  nextEditorCall,
  registerEditor,
  resetExternalAgentBrokerForTest,
  settleEditorCall,
  touchEditor,
} from './broker.ts';

const projectId = 'project-edit-session-revision';
const editorId = 'editor-edit-session-revision';
const first = 'rev-1';
const tools = [
  { name: 'begin_edit_session', input_schema: { type: 'object' as const, properties: {} } },
  { name: 'edit_item', input_schema: { type: 'object' as const, properties: {} } },
];

resetExternalAgentBrokerForTest();
const capability = registerEditor(projectId, editorId, first, tools, undefined, null);
const opened = editorBinding(projectId);
assert(opened, 'the editor is registered');

// -- open an edit session and record its owner, exactly as the broker does --
const ownerId = 'mcp-owner-1';
const pending = invokeEditorTool(ownerId, opened, 'begin_edit_session', {});
const call = await nextEditorCall(projectId, editorId, first, new AbortController().signal, capability);
assert(call, 'the editor receives the begin_edit_session call');
const editSessionId = 'edit-session-abc';
assert.equal(settleEditorCall(call.id, 'applied', { editSessionId }, capability), true);
await pending;

assert.equal(
  editSessionOwnerMatches(ownerId, editorBinding(projectId)!, editSessionId),
  true,
  'the session is owned immediately after it is opened',
);

// -- THE REGRESSION: the document revision advances (an autosave landing, a
//    committed edit) and the session must still be owned --
const second = 'rev-2';
await touchEditor(projectId, editorId, second, capability);
const advanced = editorBinding(projectId);
assert(advanced);
assert.equal(advanced.baseRevision, second, 'the registry adopted the new revision');
assert.equal(
  editSessionOwnerMatches(ownerId, advanced, editSessionId),
  true,
  'a revision advance must NOT orphan the edit session it happened under',
);

// -- a different MCP transport still does not own it --
assert.equal(
  editSessionOwnerMatches('mcp-owner-2', advanced, editSessionId),
  false,
  'ownership is per MCP transport, not global',
);

// -- an unknown session id is not owned --
assert.equal(
  editSessionOwnerMatches(ownerId, advanced, 'no-such-session'),
  false,
  'an unknown edit session id is never owned',
);

// -- a browser TAKEOVER must still invalidate: the epoch is the takeover fence,
//    and dropping the revision check must not have dropped that too --
assert.equal(
  editSessionOwnerMatches(
    ownerId,
    { ...advanced, ownershipEpoch: (advanced.ownershipEpoch ?? 0) + 1 },
    editSessionId,
  ),
  false,
  'a browser takeover (ownershipEpoch change) must still orphan the session',
);

// -- a different editor instance is a different editor, revision aside --
assert.equal(
  editSessionOwnerMatches(ownerId, { ...advanced, editorInstanceId: 'other-editor' }, editSessionId),
  false,
  'another editor instance never owns this session',
);

console.log('edit-session-revision.verify: an edit session survives a revision advance but not a takeover');
