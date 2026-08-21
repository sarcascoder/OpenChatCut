import { useMemo, useState } from 'react';
import type { CaptionsData } from './types';
import type { TimelineItem } from '../editor/types';
import { buildCues, cueTextPatch, fmtCueMs } from './captionCues';

// Sentence-by-sentence caption editing: List the pagination results of the same pipeline in the rendering layer (resolve→overrides→paginate) as
// A list of sentences that can be clicked/changed. Changes written back to wordOverrides (with agent edit_captions
// display_text (same channel): The entire new text of the sentence is hung on the first word of the sentence (with forceBreak to occupy an exclusive page),
// The rest of the words hidden; the first complement of the next sentence forceBreak prevents the following words from merging pages. Undo the existing undo.
// Cost: Sentences that have been modified by hand lose the word-by-word karaoke highlighting granularity (the entire sentence is highlighted with the first word).

interface CaptionCueEditorProps {
  captions: CaptionsData;
  items: TimelineItem[];
  fps: number;
  onUpdate: (patch: Partial<CaptionsData>) => void;
  /** Click sentence → the preview jumps to the beginning of the sentence (timeline ms) */
  onSeekMs?: (ms: number) => void;
}

export function CaptionCueEditor({ captions, items, fps, onUpdate, onSeekMs }: CaptionCueEditorProps) {
  const [open, setOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const multiLane = !!captions.sourceEntries?.length;
  const rows = useMemo(
    () => (multiLane ? [] : buildCues(captions, items, fps)),
    [multiLane, captions, items, fps],
  );

  const save = (k: number, text: string) => {
    const patch = cueTextPatch(captions, rows, k, text);
    if (patch) onUpdate(patch);
    setEditIdx(null);
  };

  return (
    <div className="cc-cap-bilingual">
      <button type="button" className="cc-cap-bilingual-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>Edit lines{rows.length > 0 ? ` (${rows.length} lines)` : ''}</span>
        <span className="cc-cap-hint">{open ? 'Collapse' : 'Expand'}</span>
      </button>
      {open && multiLane && (
        <p className="cc-cap-hint">Edit transcript-driven lanes in chat; manual lanes can be edited directly in “Manual captions” above.</p>
      )}
      {open && !multiLane && rows.length === 0 && (
        <p className="cc-cap-hint">No caption lines to edit yet (transcribe and generate captions first).</p>
      )}
      {open && !multiLane && rows.length > 0 && (
        <div className="cc-cap-cues">
          <p className="cc-cap-hint">Click a timecode to jump there; click the text to edit it. Clearing the text removes the line. Undo with ⌘Z.</p>
          <div className="cc-cap-cue-list">
            {rows.map((cue, k) => (
              <div key={`${cue.start}_${k}`} className="cc-cap-cue-row">
                <button
                  type="button"
                  onClick={() => onSeekMs?.(cue.start)}
                  title="Jump to this line"
                  className="cc-cap-cue-time"
                >
                  {fmtCueMs(cue.start)}
                </button>
                {editIdx === k ? (
                  <div className="cc-cap-cue-edit">
                    <textarea
                      value={draft}
                      autoFocus
                      rows={2}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(k, draft); }
                        if (e.key === 'Escape') setEditIdx(null);
                      }}
                      className="cc-cap-input cc-cap-textarea active"
                    />
                    <div className="cc-cap-cue-actions">
                      <button type="button" className="cc-cap-btn primary sm" onClick={() => save(k, draft)}>Save</button>
                      <button type="button" className="cc-cap-btn sm" onClick={() => setEditIdx(null)}>Cancel</button>
                      <button
                        type="button"
                        className="cc-cap-btn sm ghost"
                        title="Hide this line (transcript words and timeline stay untouched)"
                        onClick={() => save(k, '')}
                      >
                        Remove line
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="cc-cap-cue-text"
                    title="Click to edit this caption line"
                    onClick={() => { setEditIdx(k); setDraft(cue.text); }}
                  >
                    {cue.text}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
