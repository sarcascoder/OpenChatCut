import { useRef, useState } from 'react';
import { theme } from '../theme';
import {
  buildScriptRows,
  formatGapClock,
  isCjkText,
  speakerColor,
  speakerLabel,
  type IndexedWord,
  type WordGroup,
} from './segment';
import { msToFrame, type TranscriptWord } from './types';
import { Icon } from '../components/icons';

interface WordRowProps {
  words: IndexedWord[];
  deleted: Set<number>;
  editMode: boolean;
  onWord: (w: IndexedWord) => void;
}

function WordRow({ words, deleted, editMode, onWord }: WordRowProps) {
  const cjk = isCjkText(words.map((w) => w.text).join(''));
  return (
    <span className="cc-tx-words" style={{ color: theme.text }}>
      {words.map((w, i) => {
        const isDel = deleted.has(w.gi);
        const prev = words[i - 1];
        const needSpace = !cjk && i > 0 && prev && !/^\s/.test(w.text) && !/\s$/.test(prev.text);
        return (
          <span key={w.gi}>
            {needSpace ? ' ' : null}
            <span
              className={`cc-tx-word${isDel ? ' del' : ''}${editMode ? ' editable' : ''}`}
              data-gi={w.gi}
              onClick={() => onWord(w)}
              title={editMode ? (isDel ? 'Restore this word' : 'Delete this word') : `${(w.start / 1000).toFixed(2)}s`}
            >
              {w.text}
            </span>
          </span>
        );
      })}
    </span>
  );
}

interface ViewProps {
  groups: WordGroup[];
  deleted: Set<number>;
  editMode: boolean;
  onWord: (w: IndexedWord) => void;
}

/** Legacy paragraph groups (no gap rows) — kept for any external use. */
export function ParagraphView({ groups, deleted, editMode, onWord }: ViewProps) {
  if (!groups.length) {
    return <div className="cc-tx-muted">This clip has no transcript text yet.</div>;
  }
  return (
    <div className="cc-tx-script">
      {groups.map((p, i) => (
        <div key={i} className="cc-tx-speech">
          <div className="cc-tx-speech-label" style={{ color: speakerColor(p.speaker) }}>
            {speakerLabel(p.speaker)}
          </div>
          <div className="cc-tx-speech-body">
            <span className="cc-tx-grip" aria-hidden>⋮⋮</span>
            <WordRow words={p.words} deleted={deleted} editMode={editMode} onWord={onWord} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ScriptViewProps {
  words: TranscriptWord[];
  deleted: Set<number>;
  editMode: boolean;
  fps: number;
  gapCapsMs?: Record<string, number>;
  silenceFrames?: number;
  playOrder?: number[];
  minDisplayMs?: number;
  onWord: (w: IndexedWord) => void;
  onDeleteGap: (afterWordGi: number) => void;
  onCapGap: (afterWordGi: number, maxMs: number | null) => void;
  /** Flattened source word indices after speech-block drag — syncs playback order. */
  onReorderSpeech?: (playOrder: number[]) => void;
}

/** Script view with draggable speaker blocks and gap rows. */
export function ScriptView({
  words, deleted, editMode, fps, gapCapsMs, silenceFrames, playOrder, minDisplayMs,
  onWord, onDeleteGap, onCapGap, onReorderSpeech,
}: ScriptViewProps) {
  const rows = buildScriptRows(words, deleted, {
    gapCapsMs, silenceFrames, fps, minDisplayMs, playOrder,
  });
  const [adjustGi, setAdjustGi] = useState<number | null>(null);
  const dragSpeechFrom = useRef<number | null>(null);
  const [dragOverSpeech, setDragOverSpeech] = useState<number | null>(null);

  if (!rows.length) {
    return <div className="cc-tx-muted">This clip has no transcript text yet.</div>;
  }

  // Speech blocks only (for reorder) — indices into `rows`
  const speechRowIdxs = rows
    .map((r, i) => (r.kind === 'speech' ? i : -1))
    .filter((i) => i >= 0);

  const applySpeechReorder = (fromSpeech: number, toSpeech: number) => {
    if (!onReorderSpeech || fromSpeech === toSpeech) return;
    const speechBlocks = rows.filter((r) => r.kind === 'speech') as Extract<typeof rows[number], { kind: 'speech' }>[];
    if (fromSpeech < 0 || toSpeech < 0 || fromSpeech >= speechBlocks.length || toSpeech >= speechBlocks.length) return;
    const next = [...speechBlocks];
    const [moved] = next.splice(fromSpeech, 1);
    if (!moved) return;
    next.splice(toSpeech, 0, moved);
    const order = next.flatMap((b) => b.words.map((w) => w.gi));
    onReorderSpeech(order);
  };

  let speechOrdinal = -1;

  return (
    <div className="cc-tx-script">
      {rows.map((row, i) => {
        if (row.kind === 'speech') {
          speechOrdinal += 1;
          const sOrd = speechOrdinal;
          const canDrag = !!onReorderSpeech && speechRowIdxs.length > 1;
          return (
            <div
              key={`s-${i}-${row.words[0]?.gi}`}
              className={`cc-tx-speech${dragOverSpeech === sOrd ? ' drag-over' : ''}`}
              draggable={canDrag}
              onDragStart={(e) => {
                if (!canDrag) return;
                dragSpeechFrom.current = sOrd;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', `speech:${sOrd}`);
              }}
              onDragEnd={() => {
                dragSpeechFrom.current = null;
                setDragOverSpeech(null);
              }}
              onDragOver={(e) => {
                if (!canDrag || dragSpeechFrom.current == null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverSpeech(sOrd);
              }}
              onDragLeave={() => {
                setDragOverSpeech((cur) => (cur === sOrd ? null : cur));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragSpeechFrom.current;
                dragSpeechFrom.current = null;
                setDragOverSpeech(null);
                if (from == null) return;
                applySpeechReorder(from, sOrd);
              }}
            >
              <div className="cc-tx-speech-label" style={{ color: speakerColor(row.speaker) }}>
                {speakerLabel(row.speaker)}
              </div>
              <div className="cc-tx-speech-body">
                <span
                  className={`cc-tx-grip${canDrag ? ' active' : ''}`}
                  title={canDrag ? 'Drag to reorder speech blocks (playback order follows)' : 'Only one block — nothing to reorder'}
                >
                  ⋮⋮
                </span>
                <WordRow words={row.words} deleted={deleted} editMode={editMode} onWord={onWord} />
              </div>
            </div>
          );
        }
        const displayMs = row.removed ? 0 : row.appliedMs;
        const open = adjustGi === row.afterWordGi;
        return (
          <div key={`g-${row.afterWordGi}`} className={`cc-tx-gap-wrap${row.removed ? ' removed' : ''}`}>
            <div className="cc-tx-gap" role="group" aria-label={`Gap ${formatGapClock(row.gapMs)}`}>
              <button
                type="button"
                className="cc-tx-gap-main"
                onClick={() => setAdjustGi(open ? null : row.afterWordGi)}
                title="Click to adjust this gap"
              >
                Gap: {formatGapClock(displayMs || (row.removed ? 0 : row.gapMs))}
                {row.removed ? ' · deleted' : ''}
              </button>
              {!row.removed ? (
                <button
                  type="button"
                  className="cc-tx-gap-del"
                  title="Delete this gap (squeeze out the silence)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteGap(row.afterWordGi);
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  className="cc-tx-gap-del"
                  title="Restore the original gap"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCapGap(row.afterWordGi, null);
                  }}
                >
                  Restore
                </button>
              )}
            </div>
            {open && !row.removed && (
              <div className="cc-tx-gap-adjust">
                <span className="cc-tx-muted">{`Original ${formatGapClock(row.gapMs)}`}</span>
                <button type="button" className="cc-tx-btn sm" onClick={() => onCapGap(row.afterWordGi, 200)}>Cap at 0.2s</button>
                <button type="button" className="cc-tx-btn sm" onClick={() => onCapGap(row.afterWordGi, 500)}>Cap at 0.5s</button>
                <button type="button" className="cc-tx-btn sm" onClick={() => onDeleteGap(row.afterWordGi)}>Delete gap</button>
                <button type="button" className="cc-tx-btn sm ghost" onClick={() => onCapGap(row.afterWordGi, null)}>Reset</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** @deprecated prefer ScriptView */
export function SegmentView({ groups, deleted, editMode, onWord, fps }: ViewProps & { fps: number }) {
  return (
    <div className="cc-tx-script">
      {groups.map((s, i) => (
        <div key={i} className="cc-tx-speech">
          <div className="cc-tx-speech-label" style={{ color: speakerColor(s.speaker) }}>
            {speakerLabel(s.speaker)}
            <span className="cc-tx-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
              {msToFrame(s.words[0]!.start, fps)}f
            </span>
          </div>
          <div className="cc-tx-speech-body">
            <span className="cc-tx-grip" aria-hidden>⋮⋮</span>
            <WordRow words={s.words} deleted={deleted} editMode={editMode} onWord={onWord} />
          </div>
        </div>
      ))}
    </div>
  );
}
