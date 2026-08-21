import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { colorOf, fontOf, type DesignStyle } from '../../editor/types';
import { DESIGN_STYLE_PRESETS } from '../../editor/design-presets';
import {
  FONT_CATALOG,
  searchFontCatalog,
  type FontCatalogEntry,
} from '../../fonts/googleFontCatalog';
import type { OwnedStyle } from '../../persist/ownedStyleStore';
import { theme, themeAlpha } from '../../theme';
import { Icon } from '../icons';
import { DesignStyleTransferButtons } from './DesignStyleTransferButtons';
import type { useDesignStylePanelModel } from './useDesignStylePanelModel';

type Model = ReturnType<typeof useDesignStylePanelModel>;
const COLOR_LABEL: Record<string, string> = {
  primary: 'Primary', secondary: 'Secondary', accent: 'Accent', background: 'Background', text: 'Text',
};
const FONT_LABEL: Record<string, string> = { heading: 'Heading font', body: 'Body font' };
const isEmpty = (style: DesignStyle): boolean => !style.colors.length && !style.fonts.length && !style.styleGuide;
const sameStyle = (first: DesignStyle, second: DesignStyle): boolean => JSON.stringify(first) === JSON.stringify(second);

export function DesignStylePanelFrame({ onClose, children }: {
  onClose: () => void;
  children: ReactNode;
}) {
  return <div onClick={onClose} style={backdrop}>
    <div onClick={(event) => event.stopPropagation()} style={card}>{children}</div>
  </div>;
}

export function DesignStylePanelHeader({ primary, onClose }: {
  primary: string;
  onClose: () => void;
}) {
  return <div style={header}>
    <span style={{ color: primary, lineHeight: 0 }}><Icon name="palette" size={16} /></span>
    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Design Style</span>
    <button onClick={onClose} title="Close" style={iconBtn}><Icon name="x" size={15} /></button>
  </div>;
}

function StyleRow({ colors, thumbnailUrl, name, title, selected, onClick, onDelete }: {
  colors?: string[];
  thumbnailUrl?: string;
  name: string;
  title?: string;
  selected: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return <div style={{ position: 'relative' }}>
    <button onClick={onClick} title={title} style={{ ...styleRowBtn, background: selected ? themeAlpha.ink(0.06) : 'transparent', paddingRight: onDelete ? 28 : 12 }}
      onMouseEnter={(event) => { if (!selected) event.currentTarget.style.background = themeAlpha.ink(0.035); }}
      onMouseLeave={(event) => { if (!selected) event.currentTarget.style.background = selected ? themeAlpha.ink(0.06) : 'transparent'; }}>
      <div style={thumbnailUrl || colors?.length ? thumb : noneThumb}>
        {thumbnailUrl
          ? <img src={thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : colors?.map((color, index) => <span key={index} style={{ flex: 1, background: color }} />)}
      </div>
      <span style={rowName}>{name}</span><div style={{ flex: 1 }} />
      {selected && <span style={dot} />}
    </button>
    {onDelete && <button onClick={onDelete} title="Delete this style"
      style={{ ...iconBtn, position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: 2 }}>
      <Icon name="x" size={11} />
    </button>}
  </div>;
}

function PresetStyleList({ model }: { model: Model }) {
  return <>
    <div style={styleList}>
      <StyleRow name="None" selected={isEmpty(model.draft)}
        onClick={() => { model.setDraft({ colors: [], fonts: [] }); model.library.setSelectedOwnedId(null); }} />
    </div>
    <div style={{ ...sectionTitle, marginTop: 12 }}>Presets</div>
    <div style={styleList}>{DESIGN_STYLE_PRESETS.map((preset) => (
      <StyleRow key={preset.id} name={preset.name}
        title={preset.style.styleGuide ?? ''}
        colors={preset.style.colors.map((color) => color.value)} thumbnailUrl={preset.thumbnailUrl}
        selected={sameStyle(model.draft, preset.style)}
        onClick={() => { model.setDraft(preset.style); model.library.setSelectedOwnedId(null); }} />
    ))}</div>
  </>;
}

function OwnedStyleList({ model }: { model: Model }) {
  const { library } = model;
  if (!library.owned.length) return null;
  return <>
    <div style={{ ...sectionTitle, marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>My styles</span>
      {!!library.sceneOptions.length && <select value={library.sceneFilter}
        onChange={(event) => library.setSceneFilter(event.target.value)}
        style={{ ...textInput, marginLeft: 'auto', width: 128, padding: '4px 6px' }}>
        <option value="">All scenarios</option>
        {library.sceneOptions.map((scenario) => <option key={scenario} value={scenario}>{scenario}</option>)}
      </select>}
    </div>
    <div style={styleList}>{library.visibleOwned.map((owned) => (
      <StyleRow key={owned.id} name={owned.name} title={owned.style.styleGuide}
        colors={owned.style.colors.map((color) => color.value)} thumbnailUrl={owned.thumbnailUrl}
        selected={library.selectedOwnedId === owned.id || sameStyle(model.draft, owned.style)}
        onClick={() => model.selectOwned(owned)} onDelete={() => { void library.deleteOwned(owned.id); }} />
    ))}</div>
  </>;
}

function StyleSelectorSection({ model }: { model: Model }) {
  return <section>
    <div style={sectionTitle}>Pick a visual style for MG animations</div>
    <PresetStyleList model={model} />
    <OwnedStyleList model={model} />
  </section>;
}

function MetadataSection({ model }: { model: Model }) {
  const { library, metadata } = model;
  if (!library.selectedOwnedId) return null;
  return <section>
    <div style={sectionTitle}>Style details</div>
    <div style={{ display: 'grid', gap: 7 }}>
      <input value={metadata.name} onChange={(event) => metadata.setName(event.target.value)} placeholder="Style name" style={textInput} />
      <input value={metadata.scenarios} onChange={(event) => metadata.setScenarios(event.target.value)} placeholder="Scenarios, separated by commas" style={textInput} />
      <input value={metadata.thumbnail} onChange={(event) => metadata.setThumbnail(event.target.value)} placeholder="Thumbnail URL (style picker only)" style={textInput} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => { void metadata.save(); }} style={primaryBtn}>Save details</button>
        {metadata.thumbnail && <button onClick={() => { void metadata.clearThumbnail(); }} style={ghostBtn}>Clear thumbnail</button>}
      </div>
    </div>
  </section>;
}

function ColorsSection({ model }: { model: Model }) {
  return <section>
    <div style={sectionTitle}>Colors</div>
    <div style={colorGrid}>{model.colorRoles.map((role) => {
      const value = colorOf(model.draft, role) ?? '';
      return <label key={role} style={colorRow}>
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(event) => model.setColor(role, event.target.value)} style={colorInput(value)} />
        <span title={role} style={colorLabel}>{COLOR_LABEL[role] ? COLOR_LABEL[role] : role}</span>
        <input value={value} placeholder="#—" onChange={(event) => model.setColor(role, event.target.value)} style={hexInput} />
      </label>;
    })}</div>
  </section>;
}

function useFontOptions(value: string): FontCatalogEntry[] {
  const query = value.trim();
  return useMemo(() => {
    const loadable = FONT_CATALOG.filter((font) => font.loadable);
    if (!query || loadable.some((font) => font.family.toLowerCase() === query.toLowerCase())) return loadable;
    const hits = searchFontCatalog(query, FONT_CATALOG.length).filter((font) => font.loadable);
    return hits.length ? hits : loadable;
  }, [query]);
}

function useFontClickAway(open: boolean, boxRef: RefObject<HTMLDivElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!boxRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [boxRef, close, open]);
}

function FontOptionGroup({ title, options, onPick }: {
  title: string;
  options: FontCatalogEntry[];
  onPick: (family: string) => void;
}) {
  if (!options.length) return null;
  return <div>
    <div style={{ ...sectionTitle, padding: '6px 8px 2px', marginBottom: 0 }}>{title}</div>
    {options.map((option) => <button key={option.family} type="button"
      onMouseDown={(event) => { event.preventDefault(); onPick(option.family); }} style={fontOption}>
      <span style={{ fontFamily: `'${option.family}'`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.family}</span>
      {option.aliases[0] && <span style={{ fontSize: 10.5, color: theme.textDim, flexShrink: 0 }}>{option.aliases[0]}</span>}
    </button>)}
  </div>;
}

function FontField({ label, role, value, onChange }: {
  label: string;
  role: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const options = useFontOptions(value);
  const close = () => setOpen(false);
  useFontClickAway(open, boxRef, close);
  const pick = (family: string) => { onChange(family); close(); };
  return <div ref={boxRef} style={fontField}>
    <span title={role} style={fontLabel}>{label}</span>
    <div style={{ position: 'relative' }}>
      <input value={value} placeholder="e.g. Inter / Smiley Sans" onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onKeyDown={(event) => { if (event.key === 'Escape') close(); }} style={{ ...textInput, paddingRight: 26 }} />
      <button type="button" aria-label="Pick a font from the list"
        onMouseDown={(event) => { event.preventDefault(); setOpen((current) => !current); }} style={caretBtn}>▾</button>
    </div>
    {open && <div style={fontMenu}>
      <FontOptionGroup title="Chinese" options={options.filter((option) => option.source === 'bundled')} onPick={pick} />
      <FontOptionGroup title="Latin" options={options.filter((option) => option.source !== 'bundled')} onPick={pick} />
    </div>}
  </div>;
}

function FontsSection({ model }: { model: Model }) {
  return <section>
    <div style={sectionTitle}>Fonts</div>
    <div style={fontGrid}>{model.fontRoles.map((role) => <FontField key={role}
      label={FONT_LABEL[role] ? FONT_LABEL[role] : role} role={role}
      value={fontOf(model.draft, role) ?? ''} onChange={(value) => model.setFont(role, value)} />)}</div>
  </section>;
}

function GuideSection({ model }: { model: Model }) {
  return <section>
    <div style={sectionTitle}>Project editing guide (optional)</div>
    <textarea value={model.draft.styleGuide ?? ''} placeholder="Describe color, captions, pacing, transition preferences, and anything the Agent should avoid."
      onChange={(event) => model.setDraft((current) => ({ ...current, styleGuide: event.target.value }))}
      style={{ ...textInput, minHeight: 54, resize: 'vertical', fontFamily: 'inherit' }} />
  </section>;
}

function PreviewSection({ model }: { model: Model }) {
  const { bg, fg, primary, accent, heading, body } = model.preview;
  return <section>
    <div style={sectionTitle}>Preview</div>
    <div style={{ background: bg, color: fg, borderRadius: 4, padding: '20px 22px', border: `0.5px solid ${theme.border}` }}>
      <div style={{ fontFamily: heading, fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Heading Sample</div>
      <div style={{ fontFamily: body, fontSize: 14, opacity: 0.85, marginBottom: 12 }}>Body sample: this text shows the body font paired with the text color.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ background: primary, color: bg, fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 6 }}>Primary button</span>
        <span style={{ background: accent, color: bg, fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 6 }}>Accent</span>
      </div>
    </div>
  </section>;
}

export function DesignStylePanelBody({ model }: { model: Model }) {
  return <div style={body}>
    <StyleSelectorSection model={model} />
    <MetadataSection model={model} />
    <ColorsSection model={model} />
    <FontsSection model={model} />
    <GuideSection model={model} />
    <PreviewSection model={model} />
  </div>;
}

export function DesignStylePanelFooter({ model, onApply, onClose }: {
  model: Model;
  onApply: (style: DesignStyle | null) => void;
  onClose: () => void;
}) {
  const { library, metadata } = model;
  const clear = () => { onApply(null); onClose(); };
  const apply = () => { onApply(model.draft); onClose(); };
  const imported = (entry: OwnedStyle) => { model.selectOwned(entry); void library.refreshOwned(); };
  return <div style={footer}>
    {model.savingName !== null && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input autoFocus value={model.savingName} placeholder="Style name"
        onChange={(event) => model.setSavingName(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') void model.saveOwned(); if (event.key === 'Escape') model.setSavingName(null); }}
        style={{ ...textInput, flex: 1 }} />
      <button onClick={() => { void model.saveOwned(); }} style={primaryBtn}>OK</button>
      <button onClick={() => model.setSavingName(null)} style={ghostBtn}>Cancel</button>
    </div>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button onClick={clear} style={{ ...ghostBtn, color: theme.textDim }}>Clear style</button>
      <button onClick={() => model.setSavingName('')} style={ghostBtn}>Save as my style</button>
      <DesignStyleTransferButtons name={metadata.name} style={model.draft}
        scenarios={metadata.scenarios.split(',').map((value) => value.trim()).filter(Boolean)}
        thumbnailUrl={metadata.thumbnail} onImported={imported} />
      <div style={{ flex: 1, minWidth: 8 }} />
      <button onClick={onClose} style={ghostBtn}>Cancel</button>
      <button onClick={apply} style={primaryBtn}>Apply to project</button>
    </div>
  </div>;
}

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'transparent', zIndex: 60 };
const card: CSSProperties = {
  position: 'fixed', left: 6, top: 92, width: 352, maxWidth: 'calc(100vw - 12px)',
  maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column',
  background: theme.panelAlt, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 4,
  boxShadow: `0 18px 48px ${themeAlpha.shadow(0.34)}, 0 1px 0 ${themeAlpha.ink(0.04)} inset`,
};
const header: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `0.5px solid ${theme.border}` };
const body: CSSProperties = { padding: '12px 12px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 };
const footer: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderTop: `0.5px solid ${theme.border}` };
const sectionTitle: CSSProperties = { fontSize: 11, fontWeight: 500, color: theme.textDim, paddingLeft: 8, marginBottom: 6, letterSpacing: 0.2 };
const styleList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const styleRowBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', color: theme.text,
  borderRadius: 4, padding: '5px 12px 5px 8px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s',
};
const thumb: CSSProperties = { display: 'flex', width: 64, height: 36, borderRadius: 4, overflow: 'hidden', flexShrink: 0, border: `0.5px solid ${theme.border}` };
const noneThumb: CSSProperties = { ...thumb, background: `linear-gradient(to top right, transparent calc(50% - 1px), ${theme.border} calc(50% - 1px), ${theme.border} calc(50% + 1px), transparent calc(50% + 1px))` };
const rowName: CSSProperties = { fontSize: 12, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const dot: CSSProperties = { width: 8, height: 8, borderRadius: '50%', background: theme.accent, flexShrink: 0 };
const colorGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 };
const colorRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, background: theme.panelAlt, border: `0.5px solid ${theme.border}`, borderRadius: 4, padding: '4px 7px' };
const colorInput = (value: string): CSSProperties => ({ width: 24, height: 24, padding: 0, border: 'none', background: value || 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 });
const colorLabel: CSSProperties = { fontSize: 11, color: theme.textDim, minWidth: 40, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const hexInput: CSSProperties = { minWidth: 0, flex: 1, background: 'none', border: 'none', color: theme.text, fontSize: 12, fontFamily: 'ui-monospace, monospace', outline: 'none' };
const textInput: CSSProperties = { width: '100%', background: theme.bg, color: theme.text, border: `0.5px solid ${theme.borderLight}`, borderRadius: 6, padding: '7px 9px', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const iconBtn: CSSProperties = { background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer', padding: 3, lineHeight: 0 };
const ghostBtn: CSSProperties = { background: 'none', border: `0.5px solid ${theme.border}`, color: theme.text, borderRadius: 4, padding: '6px 14px', fontSize: 13, cursor: 'pointer' };
const primaryBtn: CSSProperties = { background: theme.accent, border: 'none', color: theme.onAccent, borderRadius: 4, padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const fontGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 };
const fontField: CSSProperties = { position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 };
const fontLabel: CSSProperties = { fontSize: 11.5, color: theme.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const caretBtn: CSSProperties = { position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer', fontSize: 11, padding: '2px 5px', lineHeight: 1 };
const fontMenu: CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 5, maxHeight: 224, overflowY: 'auto', background: theme.panelAlt, border: `0.5px solid ${theme.border}`, borderRadius: 4, boxShadow: `0 12px 32px ${themeAlpha.shadow(0.4)}`, padding: '2px 0 6px' };
const fontOption: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', background: 'none', border: 'none', color: theme.text, cursor: 'pointer', padding: '6px 10px', fontSize: 13, textAlign: 'left' };
