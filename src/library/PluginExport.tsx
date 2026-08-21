// "Creation Extension": Check the custom content in the session → Group package verification →
// Save to local resource library or download submission JSON. The pure logic of the group package is in plugins/export.ts.
import { useMemo, useState } from 'react';
import { theme } from '../theme';
import type { TimelineItem, TransitionItem } from '../editor/types';
import type { SerializableFxDef } from '../gl/fx/uniforms';
import { CUSTOM_FX } from '../gl/fx/effects';
import { listCustomTransitions } from '../gl/customTransitions';
import { buildExportPack, fxCandidates, lutCandidates, mgCandidates, transitionCandidates, zoomCandidates, type ExportCandidate } from '../plugins/export';
import { installFromText } from '../plugins/install';
import { PACK_ID_RE } from '../plugins/types';

interface PluginExportProps {
  items: TimelineItem[];
  transitions: TransitionItem[];
  fxDefs: Record<string, SerializableFxDef>;
  defaultOpen?: boolean;
}

function download(filename: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Synchronous revoke will kill uninitiated downloads (Chrome); leave enough startup window before recycling
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Group({ title, list, checked, toggle }: { title: string; list: ExportCandidate[]; checked: Set<string>; toggle: (key: string) => void }) {
  if (!list.length) return null;
  return (
    <div>
      <div style={{ fontSize: 10.5, color: theme.textDim, margin: '6px 0 3px', letterSpacing: 0.3 }}>{title}</div>
      {list.map((c) => (
        <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: theme.text, padding: '2px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={checked.has(c.key)} onChange={() => toggle(c.key)} style={{ accentColor: theme.accent }} />
          {c.label}
        </label>
      ))}
    </div>
  );
}

export function PluginExport({ items, transitions, fxDefs, defaultOpen = false }: PluginExportProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [packId, setPackId] = useState('');
  const [packName, setPackName] = useState('');
  const [author, setAuthor] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The session registry and project persistent data are merged and deduplicated, and only user-created content is exported.
  const groups = useMemo(() => {
    const defs = new Map<string, SerializableFxDef>();
    for (const d of Object.values(fxDefs)) defs.set(d.id, d);
    for (const d of Object.values(CUSTOM_FX)) if (!d.pipeline) defs.set(d.id, d as SerializableFxDef);
    const allDefs = [...defs.values()];
    return {
      fx: fxCandidates(allDefs),
      lut: lutCandidates(allDefs),
      tr: transitionCandidates(listCustomTransitions(), transitions),
      zoom: zoomCandidates(items),
      mg: mgCandidates(items),
    };
  }, [items, transitions, fxDefs]);
  const allCandidates = [...groups.fx, ...groups.lut, ...groups.tr, ...groups.zoom, ...groups.mg];
  const total = allCandidates.length;

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const buildSelected = () => {
    setDone(null);
    const selected = allCandidates.filter((c) => checked.has(c.key)).map((c) => c.item);
    if (!selected.length) { setErrors(['Select the content to pack first']); return null; }
    if (!PACK_ID_RE.test(packId.trim())) { setErrors(['Pack id must be lowercase letters/digits/hyphens (2–40 chars), e.g. my-pack']); return null; }
    const res = buildExportPack({ id: packId, name: packName || packId, author }, selected);
    if (!res.ok) { setErrors(res.errors.slice(0, 4)); return null; }
    setErrors([]);
    return res;
  };

  const doExport = () => {
    const res = buildSelected();
    if (!res) return;
    download(`${res.pack.id}.json`, res.json);
    setDone(`Exported ${`${res.pack.id}.json`} (${res.pack.items.length} items) — ready to upload to the resource website`);
  };

  const doSave = async () => {
    const res = buildSelected();
    if (!res) return;
    setSaving(true);
    try {
      const installed = await installFromText(res.json);
      if (!installed.ok) { setErrors(installed.errors.slice(0, 4)); return; }
      setDone(`Saved to the resource library (${res.pack.items.length} items). They are now available in their categories.`);
    } catch (error) {
      setErrors([`Save failed: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { background: theme.panelAlt, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 12, minWidth: 0 } as const;

  return (
    <div style={{ borderTop: `0.5px solid ${theme.border}`, paddingTop: 10 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.text, fontSize: 12, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease-out', fontSize: 10, color: theme.textDim }}>▶</span>
        Create extension
        <span style={{ fontWeight: 400, color: theme.textDim, fontSize: 11 }}>Save Agent-generated and timeline creations to the library, or export a submission pack</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {total === 0 ? (
            <div style={{ fontSize: 11.5, color: theme.textDim, lineHeight: 1.6 }}>
              This project has no creations to save yet. Ask the Agent to generate content, or create an MG/zoom on the timeline first.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={packId} onChange={(e) => setPackId(e.target.value)} placeholder="Pack id (my-pack)" style={{ ...inputStyle, flex: 1 }} />
                <input value={packName} onChange={(e) => setPackName(e.target.value)} placeholder="Pack name" style={{ ...inputStyle, flex: 1 }} />
                <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" style={{ ...inputStyle, width: 90 }} />
              </div>
              <Group title={`Custom effects · ${groups.fx.length}`} list={groups.fx} checked={checked} toggle={toggle} />
              <Group title={`Custom LUTs · ${groups.lut.length}`} list={groups.lut} checked={checked} toggle={toggle} />
              <Group title={`Custom transitions · ${groups.tr.length}`} list={groups.tr} checked={checked} toggle={toggle} />
              <Group title={`Timeline zooms · ${groups.zoom.length}`} list={groups.zoom} checked={checked} toggle={toggle} />
              <Group title={`Timeline MGs · ${groups.mg.length}`} list={groups.mg} checked={checked} toggle={toggle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { void doSave(); }} disabled={saving}
                  style={{ background: theme.accent, color: theme.onAccent, border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.65 : 1 }}>
                  {saving ? 'Saving…' : 'Save to library'}
                </button>
                <button onClick={doExport} disabled={saving}
                  style={{ background: theme.accent, color: theme.onAccent, border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Export submission pack
                </button>
              </div>
            </>
          )}
          {errors.length > 0 && <div style={{ fontSize: 11.5, color: theme.danger, lineHeight: 1.5 }}>{errors.join(';')}</div>}
          {done && <div style={{ fontSize: 11.5, color: `color-mix(in srgb, ${theme.success} 65%, ${theme.textStrong})`, lineHeight: 1.5 }}>{done}</div>}
        </div>
      )}
    </div>
  );
}
