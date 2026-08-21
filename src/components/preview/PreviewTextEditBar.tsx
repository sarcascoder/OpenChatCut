import { useEffect, useRef, useState } from 'react';
import type { TimelineItem } from '../../editor/types';
import { Icon } from '../icons';
import {
  bumpPreviewFontSize,
  cyclePreviewAlign,
  cyclePreviewFontWeight,
  previewTextEditFields,
} from './previewTextEdit';
import type { PreviewCandidateGeometry } from './previewTransform';

const COLOR_SWATCHES = ['#ffffff', '#0a0a0a', '#FFD84A', '#FF5A5A', '#6EE7F9', '#7CFF9B', '#FF8FD1', '#FFA94D'];

export interface PreviewTextEditBarProps {
  item: TimelineItem;
  selection: PreviewCandidateGeometry;
  composition: { width: number; height: number };
  onPropChange: (id: string, key: string, value: unknown) => void;
  onSeedChat?: (text: string) => void;
  /** Parent requests open the inline text editor (e.g. double-click). */
  autoEdit?: boolean;
  onAutoEditHandled?: () => void;
}

/**
 * Floating toolbar for a selected text / text-like MG clip.
 * Mirrors caption direct-edit affordances: AI · text · color · size · weight · align.
 */
export function PreviewTextEditBar({
  item,
  selection,
  composition,
  onPropChange,
  onSeedChat,
  autoEdit,
  onAutoEditHandled,
}: PreviewTextEditBarProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [pop, setPop] = useState<'color' | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const fields = previewTextEditFields(item);
  const topY = Math.min(...selection.corners.map((point) => point.y));
  const left = `${(selection.center.x / composition.width) * 100}%`;
  const top = `${(topY / composition.height) * 100}%`;

  useEffect(() => {
    if (!autoEdit || !fields?.textKey) return;
    setEditing(true);
    setDraft(fields.text);
    setPop(null);
    onAutoEditHandled?.();
  }, [autoEdit, fields?.text, fields?.textKey, onAutoEditHandled]);

  useEffect(() => {
    if (!editing) return;
    editorRef.current?.focus();
    editorRef.current?.select();
  }, [editing]);

  if (!fields) return null;

  const saveText = () => {
    if (fields.textKey) onPropChange(item.id, fields.textKey, draft);
    setEditing(false);
  };

  const hasColor = fields.colorKey !== null;
  const hasSize = fields.fontSizeKey !== null;
  const hasText = fields.textKey !== null;
  const hasWeight = fields.fontWeightKey !== null;
  const hasAlign = fields.alignKey !== null;

  return (
    <div
      className="cc-capedit-bar cc-preview-text-edit-bar"
      style={{ left, top, transform: 'translate(-50%, calc(-100% - 14px))' }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {onSeedChat && hasText && (
        <button
          type="button"
          className="cc-capedit-btn ai"
          title="Ask AI to rewrite this on-screen text"
          onClick={() => onSeedChat(`Improve this on-screen text (keep layout): "${fields.text || '(empty)'}"`)}
        >
          <Icon name="sparkles" size={12} />AI edit
        </button>
      )}

      {hasText && (
        <>
          {onSeedChat && <span className="cc-capedit-divider" aria-hidden />}
          <button
            type="button"
            className={`cc-capedit-btn${editing ? ' on' : ''}`}
            title="Edit text"
            onClick={() => {
              setPop(null);
              if (!editing) {
                setDraft(fields.text);
                setEditing(true);
              }
            }}
          >
            <Icon name="pencil" size={12} />Text
          </button>
        </>
      )}

      {hasColor && (
        <button
          type="button"
          className={`cc-capedit-btn${pop === 'color' ? ' on' : ''}`}
          title="Text color"
          onClick={() => setPop(pop === 'color' ? null : 'color')}
        >
          <span className="cc-capedit-colordot" style={{ background: fields.color }} />
        </button>
      )}

      {hasSize && (
        <>
          <span className="cc-capedit-divider" aria-hidden />
          <button
            type="button"
            className="cc-capedit-btn"
            title="Smaller text"
            onClick={() => fields.fontSizeKey && onPropChange(item.id, fields.fontSizeKey, bumpPreviewFontSize(fields, -1))}
          >
            A−
          </button>
          <button
            type="button"
            className="cc-capedit-btn"
            title="Bigger text"
            onClick={() => fields.fontSizeKey && onPropChange(item.id, fields.fontSizeKey, bumpPreviewFontSize(fields, 1))}
          >
            A+
          </button>
        </>
      )}

      {hasWeight && (
        <>
          <span className="cc-capedit-divider" aria-hidden />
          <button
            type="button"
            className="cc-capedit-btn"
            title="Weight"
            onClick={() => onPropChange(item.id, fields.fontWeightKey!, cyclePreviewFontWeight(fields.fontWeight))}
          >
            {fields.fontWeight >= 900 ? 'B++' : fields.fontWeight >= 700 ? 'B' : 'R'}
          </button>
        </>
      )}

      {hasAlign && (
        <button
          type="button"
          className="cc-capedit-btn"
          title="Align"
          onClick={() => onPropChange(item.id, fields.alignKey!, cyclePreviewAlign(fields.align))}
        >
          {fields.align === 'left' ? '⫷' : fields.align === 'right' ? '⫸' : '☰'}
        </button>
      )}

      {editing && hasText && (
        <div className="cc-preview-text-edit-draft" onPointerDown={(event) => event.stopPropagation()}>
          <textarea
            ref={editorRef}
            value={draft}
            rows={2}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                saveText();
              }
              if (event.key === 'Escape') {
                event.stopPropagation();
                setEditing(false);
              }
            }}
            onBlur={saveText}
          />
        </div>
      )}

      {pop === 'color' && hasColor && (
        <div className="cc-capedit-pop color">
          {COLOR_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              className={`cc-capedit-swatch${fields.color.toLowerCase() === hex.toLowerCase() ? ' on' : ''}`}
              style={{ background: hex }}
              title={hex}
              onClick={() => {
                if (fields.colorKey) onPropChange(item.id, fields.colorKey, hex);
                setPop(null);
              }}
            />
          ))}
          <label className="cc-capedit-custom" title="Custom color">
            <input
              type="color"
              defaultValue={/^#[0-9a-fA-F]{6}$/.test(fields.color) ? fields.color : '#ffffff'}
              onBlur={(event) => {
                if (fields.colorKey) onPropChange(item.id, fields.colorKey, event.target.value);
                setPop(null);
              }}
            />
            <span>Custom</span>
          </label>
        </div>
      )}
    </div>
  );
}
