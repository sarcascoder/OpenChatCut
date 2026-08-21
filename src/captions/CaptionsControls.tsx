import { useMemo, useState } from 'react';
import type { CaptionsData, CaptionPacing, CaptionTemplate } from './types';
import type { TimelineItem, TrackId } from '../editor/types';
import type { TranscriptVariant } from '../transcript/types';
import { CaptionCueEditor } from './CaptionCueEditor';
import { CAPTION_STYLES, CAPTION_STYLE_BY_ID } from './styles';
import { theme } from '../theme';
import { ManualCaptionEditor } from './ManualCaptionEditor';
import { beginCaptionStylePointerDrag } from './captionStyleDrag';
import { captionTemplatePatch } from './captionTemplatePatch';
import { CaptionMotionControls } from './CaptionMotionControls';

interface CaptionsControlsProps {
  captionTrackId?: TrackId;
  captions: CaptionsData | null;
  /** translation / correction variants of the caption's source transcript (main-line language picker) */
  sourceVariants?: TranscriptVariant[];
  /** The sentence-by-sentence editing list needs to recalculate the same paging as the rendering layer, which requires timeline items + fps */
  items: TimelineItem[];
  fps: number;
  /** Sentence-by-sentence editing: click-to-sentence preview (timeline ms) */
  onSeekMs?: (ms: number) => void;
  onCreateManual: () => void;
  getPlayheadMs?: () => number;
  onUpdate: (patch: Partial<CaptionsData>) => void;
  /** Completely remove captions (hide and clear overlay status) */
  onRemove?: () => void;
  onTranslate: (lang: string) => void;
  translating: boolean;
  translateError: string | null;
}

const PACINGS: { v: CaptionPacing; label: string; hint: string }[] = [
  { v: 'phrase', label: 'By sentence/phrase', hint: 'One sentence at a time — suits documentary voiceover' },
  { v: 'word', label: 'Word-by-word highlight', hint: 'The word being spoken lights up, karaoke-style' },
];

/** Translation target = second line language. When the spoken broadcast is in Chinese, it will be translated into English by default. Do not select "Chinese" again. */
const TRANSLATE_TO: { id: string; label: string }[] = [
  { id: 'English', label: 'English' },
  // '\u65e5\u672c\u8a9e' = "Japanese" — native-script language id sent to the translator
  { id: '\u65e5\u672c\u8a9e', label: 'Japanese' },
  { id: 'Español', label: 'Spanish' },
  { id: 'Français', label: 'French' },
  { id: '\ud55c\uad6d\uc5b4', label: 'Korean' },
];

// Independent caption workspace: style, rhythm, manual captions and translation are all edited here.
export function CaptionsControls({
  captionTrackId, captions, sourceVariants = [], items, fps, onSeekMs, onCreateManual, getPlayheadMs, onUpdate, onRemove, onTranslate, translating, translateError,
}: CaptionsControlsProps) {
  const [bilingualOpen, setBilingualOpen] = useState(!!captions?.bilingual || !!captions?.translation);
  const style = captions ? CAPTION_STYLE_BY_ID[captions.template] : null;
  const pacingMeta = PACINGS.find((p) => p.v === (captions?.pacing ?? 'phrase')) ?? PACINGS[0]!;

  const translateLang = useMemo(() => {
    const cur = captions?.translationLang;
    if (cur && TRANSLATE_TO.some((l) => l.id === cur || l.label === cur)) return cur;
    // never default to Chinese — source VO is already Chinese
    return 'English';
  }, [captions?.translationLang]);

  return (
    <div className="cc-cap-panel open standalone">
      {!captions && (
        <div className="cc-cap-empty">
          <div className="cc-cap-empty-actions">
            <button type="button" className="cc-cap-btn primary" onClick={onCreateManual}>Add captions manually</button>
          </div>
          <p className="cc-cap-hint">Open "Caption styles" from Transcript, or add independent captions manually here.</p>
        </div>
      )}

      {captions && (
        <div className="cc-cap-body">
          {/* Show / Hide - most visible */}
          <div className="cc-cap-row main">
            <label className="cc-cap-toggle">
              <input
                type="checkbox"
                checked={captions.enabled}
                onChange={(e) => onUpdate({ enabled: e.target.checked })}
              />
              <span>{captions.enabled ? 'Captions showing in preview' : 'Captions hidden'}</span>
            </label>
            <div className="cc-cap-row-actions">
              {!captions.enabled && (
                <button type="button" className="cc-cap-btn sm" onClick={() => onUpdate({ enabled: true })}>
                  Show
                </button>
              )}
              {captions.enabled && (
                <button type="button" className="cc-cap-btn sm" onClick={() => onUpdate({ enabled: false })}>
                  Hide
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  className="cc-cap-btn sm ghost"
                  title="Remove captions from the project"
                  onClick={onRemove}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {!captions.enabled && (
            <p className="cc-cap-hint warn">Captions are off — neither preview nor export will burn them in. Click "Show" or tick the box to bring them back.</p>
          )}

          {/* Style: color block + Chinese name */}
          <div className="cc-cap-field">
            <div className="cc-cap-label">Style</div>
            <div className="cc-cap-styles" role="listbox" aria-label="Caption styles">
              {CAPTION_STYLES.map((s) => {
                const active = captions.template === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`cc-cap-style${active ? ' selected' : ''}`}
                    title={`${s.labelZh} — ${s.hint} · ${'Drag onto the preview to create a caption anywhere'}`}
                    onClick={() => onUpdate(captionTemplatePatch(captions, s.id as CaptionTemplate))}
                    onPointerDown={(event) => {
                      if (!captionTrackId) return;
                      beginCaptionStylePointerDrag(event.nativeEvent, { trackId: captionTrackId, template: s.id });
                    }}
                  >
                    <span
                      className="cc-cap-swatch"
                      style={{
                        color: s.color,
                        background: s.highlightBackground ?? '#1a1a1a',
                        borderColor: s.strokeWidth > 0 ? s.strokeColor : theme.border,
                      }}
                    >
                      A
                    </span>
                    <span className="cc-cap-style-name">{s.labelZh}</span>
                  </button>
                );
              })}
            </div>
            {style && <p className="cc-cap-hint">{style.labelZh}: {style.hint} · Drag onto the preview to create and edit a caption anywhere</p>}
          </div>

          {/* Rhythm*/}
          <div className="cc-cap-field">
            <div className="cc-cap-label">Pacing</div>
            <div className="cc-cap-pills">
              {PACINGS.map((p) => (
                <button
                  key={p.v}
                  type="button"
                  className={`cc-cap-pill${captions.pacing === p.v ? ' selected' : ''}`}
                  onClick={() => onUpdate({ pacing: p.v })}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="cc-cap-hint">{pacingMeta.hint}</p>
          </div>

          <CaptionMotionControls
            value={captions.motionPreset}
            onChange={(motionPreset) => onUpdate({ motionPreset })}
          />

          <ManualCaptionEditor captions={captions} items={items} onUpdate={onUpdate} getPlayheadMs={getPlayheadMs} onSeekMs={onSeekMs} />

          {/* caption language (text variant): Change the main caption line to a translation/correction variant, leaving the timeline unchanged.
Variants are generated by Agent's manage_transcript translate. Here you only select which one to display.*/}
          {sourceVariants.length > 0 && (
            <div className="cc-cap-field">
              <div className="cc-cap-label">Caption language (text variant)</div>
              <select
                value={captions.captionVariantId ?? ''}
                onChange={(e) => onUpdate({ captionVariantId: e.target.value || undefined })}
                className="cc-cap-select"
              >
                <option value="">Original (source)</option>
                {sourceVariants.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              <p className="cc-cap-hint">Switch the language of the main caption line. Translations swap text only — word timing/frames still come from the source.</p>
            </div>
          )}

          {/* Bilingual: folded, translated into English by default*/}
          <div className="cc-cap-bilingual">
            <button
              type="button"
              className="cc-cap-bilingual-toggle"
              onClick={() => setBilingualOpen((v) => !v)}
              aria-expanded={bilingualOpen}
            >
              <span>Bilingual second line (optional)</span>
              <span className="cc-cap-hint">{bilingualOpen ? 'Collapse' : 'Expand'}</span>
            </button>
            {bilingualOpen && (
              <div className="cc-cap-bilingual-body">
                <p className="cc-cap-hint">
                  {'The first line stays the original (Chinese voiceover). The second line is a '}<strong>translation</strong>{' — pick a target language (not Chinese).'}
                </p>
                <div className="cc-cap-translate-row">
                  <select
                    value={translateLang}
                    disabled={translating}
                    onChange={(e) => onTranslate(e.target.value)}
                    className="cc-cap-select"
                  >
                    {TRANSLATE_TO.map((l) => (
                      <option key={l.id} value={l.id}>{l.label} ({l.id})</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="cc-cap-btn primary sm"
                    disabled={translating}
                    onClick={() => onTranslate(translateLang)}
                  >
                    {translating ? 'Translating…' : captions.translation ? 'Re-translate' : 'Generate translation'}
                  </button>
                </div>
                {captions.translation && (
                  <label className="cc-cap-toggle">
                    <input
                      type="checkbox"
                      checked={!!captions.bilingual}
                      onChange={(e) => onUpdate({ bilingual: e.target.checked })}
                    />
                    <span>{`Show translated second line (${captions.translationLang ?? translateLang})`}</span>
                  </label>
                )}
                {translateError && <div className="cc-cap-error">{translateError}</div>}
              </div>
            )}
          </div>

          {/* Manually change the caption text sentence by sentence (same channel as agent display_text)*/}
          <CaptionCueEditor captions={captions} items={items} fps={fps} onUpdate={onUpdate} onSeekMs={onSeekMs} />
        </div>
      )}
    </div>
  );
}
