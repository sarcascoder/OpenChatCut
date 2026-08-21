// Provider configuration page, field rendering, and connection tests.
import { useState } from 'react';
import { theme, themeAlpha } from '../../theme';
import { VendorIcon } from './vendorIcons';
import { Icon } from '../icons';
import { CodexAccountCard } from './CodexAccountCard';
import type { CodexAgentModel } from '../../../shared/codex-agent';
import type { CodexSettingsController } from './useCodexSettings';
import { shouldRenderModelPicker } from './codexReasoning';
import { llmProviderConfigNames, normalizeLlmProvider } from '../../../shared/llm-providers';
import { MODEL_CAPABILITY_OVERRIDES_KEY } from '../../../shared/model-capabilities';
import { ModelCapabilityEditor } from './ModelCapabilityEditor';
import { VisionModelPane } from './VisionModelPane';
import { LocalAsrPane } from './LocalAsrPane';
import { LocalModelPackPane } from './LocalModelPackPane';
import { SemanticModelPackPane } from './SemanticModelPackPane';
import { SettingsNoteAction } from './SettingsNoteAction.tsx';
import {
  fieldPlaceholder, isModelField, modelValue, selectOptionLabel, selectOptions, vendorConfigured,
  type KeyStatusResponse, type SelectOption, type SettingsField, type SettingsVendorPage,
  type StagedValues as Values,
} from './settingsSchema';
export const ON = theme.success; // Status green → Semantic token (graphite value ≈ original #4caf7d, light skin automatically changes to dark green)
export const WARN = '#f77';    // Error / Clear warning (retain the original panel error color)

/** Field rendering shared context: server status + temporary storage + plain text switch + temporary storage/clear callback. */
export interface FieldCtx {
  status: KeyStatusResponse | null;
  values: Values;
  reveal: boolean;
  onStage: (field: SettingsField, raw: string) => void;
  onToggleClear: (field: SettingsField) => void;
  modelOptions: Record<string, readonly string[]>;
  onModelsDiscovered: (name: string, models: readonly string[]) => void;
  codex: CodexSettingsController;
}

const CAPABILITY_OVERRIDE_FIELD: SettingsField = {
  name: MODEL_CAPABILITY_OVERRIDES_KEY, label: 'Model capabilities', kind: 'text', defaultLabel: '',
};

function capabilityOverridesValue(ctx: FieldCtx): string {
  return ctx.values[MODEL_CAPABILITY_OVERRIDES_KEY]
    ?? modelValue(ctx.status, MODEL_CAPABILITY_OVERRIDES_KEY);
}

function apiModelId(page: SettingsVendorPage, ctx: FieldCtx): string {
  const names = llmProviderConfigNames(page.vendor);
  const field = page.fields.find((candidate) => candidate.name === names.model);
  return (ctx.values[names.model] ?? modelValue(ctx.status, names.model)) || field?.defaultLabel || '';
}

// ──Provider configuration page ────────────────────────────────────────────────────────

export function VendorPane({ page, hint, ctx }: {
  page: SettingsVendorPage; hint: string; ctx: FieldCtx;
}) {
  if (page.connection === 'codex') return <CodexVendorPane page={page} hint={hint} ctx={ctx} />;
  if (page.key === 'llm/vision') return <VisionModelPane />;
  if (page.kind === 'local-models') return <LocalModelsPane page={page} fields={page.fields} ctx={ctx} />;
  const on = vendorConfigured(ctx.status, page, ctx.codex.status);
  return (
    <div style={pane}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <VendorIcon vendor={page.vendor} size={18} />
          <b style={{ fontSize: 13 }}>{page.title}</b>
          <span style={{ fontSize: 11, color: on ? ON : theme.textDim }}>{on ? 'Configured' : 'Not configured'}</span>
        </div>
        <div style={{ fontSize: 11.5, color: theme.textDim, marginTop: 3, paddingLeft: 26 }}>{hint}</div>
      </div>
      <section style={fieldCardBox}>
        {page.note && <div style={pageNote}>{page.note}</div>}
        {page.noteAction && <SettingsNoteAction config={page.noteAction} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: page.note ? 9 : 0 }}>
          {page.fields.map((f) => <FieldRow key={f.name} field={f} ctx={ctx} />)}
        </div>
        {page.key.startsWith('llm/') && (
          <ModelCapabilityEditor backend="api" provider={normalizeLlmProvider(page.vendor)}
            modelId={apiModelId(page, ctx)} rawOverrides={capabilityOverridesValue(ctx)}
            onChange={(value) => ctx.onStage(CAPABILITY_OVERRIDE_FIELD, value)} />
        )}
      </section>
      <TestConnectionRow page={page} ctx={ctx} />
    </div>
  );
}

function CodexVendorPane({ page, hint, ctx }: {
  page: SettingsVendorPage; hint: string; ctx: FieldCtx;
}) {
  const status = ctx.codex.status;
  const statusLabel = !status ? 'Status unknown'
    : !status.installed ? 'CLI not installed'
      : status.loginPending || ctx.codex.login ? 'Signing in'
        : status.account?.type === 'chatgpt' ? 'Signed in'
          : status.account ? 'API key mode'
            : status.error || ctx.codex.error ? 'Connection error' : 'Signed out';
  const on = vendorConfigured(ctx.status, page, status);
  const capabilityModelId = (ctx.values.CODEX_MODEL ?? modelValue(ctx.status, 'CODEX_MODEL'))
    || ctx.codex.models.find((model) => model.isDefault)?.id
    || '';
  return (
    <div style={pane}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <VendorIcon vendor={page.vendor} size={18} />
          <b style={{ fontSize: 13 }}>{page.title}</b>
          <span style={{ fontSize: 11, color: on ? ON : theme.textDim }}>{statusLabel}</span>
        </div>
        <div style={{ fontSize: 11.5, color: theme.textDim, marginTop: 3, paddingLeft: 26 }}>{hint}</div>
      </div>
      <CodexAccountCard controller={ctx.codex} />
      <section style={fieldCardBox}>
        {page.note && <div style={pageNote}>{page.note}</div>}
        {page.noteAction && <SettingsNoteAction config={page.noteAction} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: page.note ? 9 : 0 }}>
          {page.fields.map((field) => <FieldRow key={field.name} field={field} ctx={ctx} />)}
        </div>
        {capabilityModelId && (
          <ModelCapabilityEditor backend="codex" provider="openai"
            modelId={capabilityModelId}
            rawOverrides={capabilityOverridesValue(ctx)}
            onChange={(value) => ctx.onStage(CAPABILITY_OVERRIDE_FIELD, value)} />
        )}
      </section>
    </div>
  );
}

function LocalModelsPane({ page, fields, ctx }: {
  page: SettingsVendorPage; fields: readonly SettingsField[]; ctx: FieldCtx;
}) {
  const title = page.key === 'local/asr' ? 'Local transcription' : page.key === 'local/music/packs' ? 'Beat and music analysis' : 'Visual semantic search';
  return (
    <div style={pane}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {page.icon ? <Icon name={page.icon} size={18} /> : <VendorIcon vendor={page.vendor} size={18} />}
          <b style={{ fontSize: 13 }}>{title}</b>
        </div>
        <div style={{ fontSize: 11.5, color: theme.textDim, marginTop: 3, paddingLeft: 26 }}>
          Local models install on demand. Indexing, transcription, and analysis all run on this device.
        </div>
      </div>
      {page.key === 'local/asr' && <LocalAsrPane fields={fields} ctx={ctx} />}
      {page.key === 'local/music/packs' && <LocalModelPackPane
        packIds={['rhythm-lite', 'music-semantics-lite']}
        title='Beat and music analysis models'
        description='Models are never installed automatically. Once installed, beat and music-semantic analysis runs locally.' />}
      {page.key === 'local/semantic/setup' && <SemanticModelPackPane />}
    </div>
  );
}


// ── Test connection ───────────────────────────────────────────────────────

interface ProbeRequestResult { body: ProbeResponse; staged: boolean; }
interface ProbeResponse { ok: boolean; message: string; latencyMs?: number; models?: string[]; }
interface ProbeShown { page: string; ok: boolean; message: string; }

/** Unsaved temporary values in the fields on this page → detect overrides; the empty string represents the default value for this test. */
function stagedOverrides(page: SettingsVendorPage, values: Values): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const f of page.fields) {
    const v = values[f.name];
    if (v !== undefined) overrides[f.name] = v.trim();
  }
  return overrides;
}

async function requestProbe(page: SettingsVendorPage, ctx: FieldCtx): Promise<ProbeRequestResult> {
  const overrides = stagedOverrides(page, ctx.values);
  if (page.kind === 'settings' && page.fields[0]) {
    const field = page.fields[0];
    const effectiveValue = ctx.values[field.name] ?? modelValue(ctx.status, field.name);
    if (effectiveValue?.trim()) overrides[field.name] = effectiveValue.trim();
    else delete overrides[field.name];
  }
  const staged = Object.keys(ctx.values).some((name) => page.fields.some((field) => field.name === name));
  const res = await fetch('/api/keys/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: page.key, overrides }),
  });
  const body = await res.json().catch(() => null) as ProbeResponse | null;
  if (!body || typeof body.message !== 'string') throw new Error(`Test request failed (${res.status})`);
  return { body, staged };
}

function TestConnectionRow({ page, ctx }: { page: SettingsVendorPage; ctx: FieldCtx }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeShown | null>(null);
  const shown = result && result.page === page.key ? result : null;

  const test = async (): Promise<void> => {
    setBusy(true); setResult(null);
    try {
      const { body, staged } = await requestProbe(page, ctx);
      const suffix = staged && body.ok ? ' (tested with current input — remember to save)' : '';
      setResult({ page: page.key, ok: body.ok, message: body.message + suffix });
      const modelField = page.fields.find((field) => field.discoverableModel);
      if (body.ok && modelField && Array.isArray(body.models)) {
        ctx.onModelsDiscovered(modelField.name, body.models);
      }
    } catch (err) {
      setResult({ page: page.key, ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const discoversModels = page.fields.some((field) => field.discoverableModel);
  const isProxy = page.key === 'agent/proxy';
  return (
    <div style={testRow}>
      <button type="button" onClick={() => { void test(); }} disabled={busy}
        style={{ ...testBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
        {busy ? 'Testing…' : discoversModels ? 'Test & load models' : isProxy ? 'Test proxy connection' : 'Test connection'}
      </button>
      {shown && (
        <span style={{ ...testMsg, color: shown.ok ? ON : WARN }} title={shown.message}>
          {shown.ok ? '✓ ' : '✗ '}{shown.message}
        </span>
      )}
      {!shown && !busy && (
        <span style={{ ...testMsg, color: theme.textDim }}>
          {discoversModels
            ? 'Verifies the endpoint and key, then loads the models available from that API'
            : isProxy ? 'Uses the current proxy address to reach an external connectivity endpoint' : 'Sends one minimal request to verify the key and endpoint'}
        </span>
      )}
    </div>
  );
}

// ──Field rendering ────────────────────────────────────────────────────────

function selectedCodexModel(ctx: FieldCtx): CodexAgentModel | undefined {
  const selectedId = ctx.values.CODEX_MODEL ?? modelValue(ctx.status, 'CODEX_MODEL');
  return ctx.codex.models.find((model) => model.id === selectedId)
    ?? (selectedId ? undefined : ctx.codex.models.find((model) => model.isDefault));
}

function codexReasoningOptions(
  ctx: FieldCtx,
  formatDefault: (effort?: string) => string,
): readonly SelectOption[] {
  const model = selectedCodexModel(ctx);
  return [
    { value: '', label: formatDefault(model?.defaultReasoningEffort ?? undefined) },
    ...(model?.supportedReasoningEfforts.map((option) => ({
      value: option.reasoningEffort,
      label: option.reasoningEffort,
    })) ?? []),
  ];
}


export function FieldRow({ field, ctx }: { field: SettingsField; ctx: FieldCtx }) {
  const { status, reveal, onStage, onToggleClear } = ctx;
  // value: undefined = no temporary changes; '' = temporary cache clear / return to default; the rest = temporary new values.
  const value = ctx.values[field.name];
  const st = status?.keys[field.name];
  const configured = Boolean(st?.configured);
  const stagedClear = value === '' && field.kind !== 'toggle';
  // Model / routing field echoes the current value of the server; secret / base url will never be backfilled.
  const shown = value ?? (isModelField(field) ? modelValue(status, field.name) : '');
  // Select uses the "default" option to clear; toggle's off/on itself is set/clear.
  const clearable = configured && field.kind !== 'select' && field.kind !== 'toggle';
  const discovered = field.name === 'CODEX_MODEL'
    ? ctx.codex.models.map((model) => model.id)
    : field.discoverableModel ? ctx.modelOptions[field.name] ?? [] : [];
  const options = field.name === 'CODEX_REASONING_EFFORT'
    ? codexReasoningOptions(ctx, (effort) => effort
      ? `Model default (${effort})`
      : 'Model default')
    : undefined;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={fieldHead}>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
          {field.label}
          {configured && <span style={sourceTag}>{st?.source === 'env' ? '.env.local' : 'This session'}</span>}
        </span>
        {clearable && (
          <button type="button" onClick={(e) => { e.preventDefault(); onToggleClear(field); }}
            style={{ ...clearBtn, color: stagedClear ? WARN : theme.textDim }}>
            {stagedClear ? 'Undo clear' : 'Clear'}
          </button>
        )}
      </span>
      {field.kind === 'toggle'
        ? <ToggleSwitch field={field} shown={shown} onStage={onStage} />
        : shouldRenderModelPicker(field, discovered.length)
          ? <ModelInput field={field} shown={shown} models={discovered} reveal={reveal}
              loading={field.name === 'CODEX_MODEL' && ctx.codex.modelBusy}
              configured={configured} stagedClear={stagedClear} onStage={onStage} />
          : field.kind === 'select'
          ? <SelectInput field={field} status={status} shown={shown} options={options} onStage={onStage} />
          : field.kind === 'directory'
            ? <DirectoryInput field={field} shown={shown} stagedClear={stagedClear} onStage={onStage} />
            : <TextInput field={field} shown={shown} reveal={reveal} configured={configured}
                stagedClear={stagedClear} onStage={onStage} />}
      {field.note && <span style={{ fontSize: 10.5, color: theme.textDim }}>{field.note}</span>}
    </label>
  );
}

function ModelInput({ field, shown, models, reveal, loading, configured, stagedClear, onStage }: {
  field: SettingsField;
  shown: string;
  models: readonly string[];
  reveal: boolean;
  loading?: boolean;
  configured: boolean;
  stagedClear: boolean;
  onStage: (field: SettingsField, raw: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 7 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TextInput field={field} shown={shown} reveal={reveal} configured={configured}
          stagedClear={stagedClear} onStage={onStage} />
      </div>
      <select
        value=""
        aria-label="Choose model"
        title="Choose model"
        disabled={models.length === 0}
        aria-busy={loading === true}
        onChange={(event) => {
          if (event.target.value) onStage(field, event.target.value);
        }}
        style={{ ...select, width: 118, flex: '0 0 118px' }}
      >
        <option value="">{loading ? 'Loading…' : 'Choose model'}</option>
        {[...new Set(models)].map((model) => <option key={model} value={model}>{model}</option>)}
      </select>
    </div>
  );
}

/** Switch field:''/Anything other than '0' = enabled (default), '0' = disabled. On = temporary storage ''(clear key to return to default),
 * Off = Temporary storage '0' - The semantics are naturally consistent with the "'' explicit clear" of buildPatch, and it will take effect immediately after saving. */
function ToggleSwitch({ field, shown, onStage }: {
  field: SettingsField; shown: string;
  onStage: (field: SettingsField, raw: string) => void;
}) {
  const on = shown !== '0';
  return (
    <button
      type="button" role="switch" aria-checked={on}
      onClick={(e) => { e.preventDefault(); onStage(field, on ? '0' : ''); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
        font: 'inherit', fontSize: 11.5, color: on ? ON : theme.textDim,
        background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
      }}
    >
      <span aria-hidden style={{
        width: 30, height: 17, borderRadius: 999, position: 'relative', flexShrink: 0,
        background: on ? ON : theme.border, transition: 'background .18s ease',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 15 : 2, width: 13, height: 13,
          borderRadius: '50%', background: theme.textStrong, transition: 'left .18s ease',
          boxShadow: `0 1px 3px ${themeAlpha.shadow(0.4)}`,
        }} />
      </span>
      {on ? 'Enabled' : 'Disabled'}
    </button>
  );
}

interface TextInputProps {
  field: SettingsField; shown: string; reveal: boolean; configured: boolean; stagedClear: boolean;
  onStage: (field: SettingsField, raw: string) => void;
}

function TextInput({ field, shown, reveal, configured, stagedClear, onStage }: TextInputProps) {
  const listId = field.kind === 'text' && field.options ? `cc-dl-${field.name}` : undefined;
  const displayValue = stagedClear ? shown : shown || field.defaultValue || '';
  return (
    <>
      <input
        type={field.kind === 'secret' && !reveal ? 'password' : 'text'}
        autoComplete="off" spellCheck={false} list={listId}
        value={displayValue}
        onChange={(e) => onStage(field, e.target.value)}
        placeholder={fieldPlaceholder(field, configured, stagedClear)}
        style={stagedClear ? { ...input, border: `0.5px solid ${WARN}` } : input}
      />
      {listId && (
        <datalist id={listId}>
          {field.options?.map((o) => <option key={o.value} value={o.value} />)}
        </datalist>
      )}
    </>
  );
}

function DirectoryInput({ field, shown, stagedClear, onStage }: {
  field: SettingsField; shown: string; stagedClear: boolean;
  onStage: (field: SettingsField, raw: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = window.openChatCutDesktop?.selectDirectory;
  const pick = async (): Promise<void> => {
    if (!picker) return;
    setBusy(true); setError(null);
    try {
      const selected = await picker(shown || undefined);
      if (selected) onStage(field, selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open the folder picker');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 7 }}>
        <input type="text" autoComplete="off" spellCheck={false} value={shown}
          onChange={(e) => onStage(field, e.target.value)}
          placeholder={fieldPlaceholder(field, false, stagedClear)}
          style={{ ...(stagedClear ? { ...input, border: `0.5px solid ${WARN}` } : input), minWidth: 0 }} />
        <button type="button" onClick={(e) => { e.preventDefault(); void pick(); }}
          disabled={!picker || busy} title={!picker ? 'Folder picker is available in the desktop app only' : 'Choose media storage directory'}
          style={{ ...browseBtn, opacity: !picker || busy ? 0.55 : 1 }}>
          {busy ? 'Choosing…' : 'Choose Folder'}
        </button>
      </div>
      {!picker && <span style={fieldHint}>The folder picker is available in the desktop app only. Enter an absolute path manually in the browser.</span>}
      {error && <span style={{ ...fieldHint, color: WARN }}>{error}</span>}
    </>
  );
}

function SelectInput({ field, status, shown, options, onStage }: {
  field: SettingsField; status: KeyStatusResponse | null; shown: string;
  options?: readonly SelectOption[];
  onStage: (field: SettingsField, raw: string) => void;
}) {
  const opts = options ?? selectOptions(field);
  const unknown = shown !== '' && !opts.some((o) => o.value === shown);  // Manually changing the value of.env.local is also displayed faithfully
  return (
    <select value={shown} onChange={(e) => onStage(field, e.target.value)} style={select}>
      {unknown && <option value={shown}>{shown}</option>}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{selectOptionLabel(status, field, o)}</option>
      ))}
    </select>
  );
}

// ── Style ───────────────────────────────────────────────────────────

const pane: React.CSSProperties = {
  flex: 1, minWidth: 0, overflowY: 'auto', padding: '14px 20px 16px', display: 'flex', flexDirection: 'column', gap: 12,
};
  const fieldCardBox: React.CSSProperties = { background: theme.bg, border: `0.5px solid ${theme.border}`, borderRadius: 4, padding: '11px 13px' };
const pageNote: React.CSSProperties = { fontSize: 10.5, color: theme.textDim };
const fieldHead: React.CSSProperties = {
  fontSize: 11.5, color: theme.text, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between',
};
const input: React.CSSProperties = {
  font: 'inherit', fontSize: 12.5, background: theme.panelAlt, color: theme.text,
  border: `0.5px solid ${theme.border}`, borderRadius: 6, padding: '6px 9px', width: '100%', outline: 'none',
};
const select: React.CSSProperties = { ...input, cursor: 'pointer', colorScheme: 'var(--cc-color-scheme)' };
const sourceTag: React.CSSProperties = { fontSize: 10, color: theme.textDim, border: `0.5px solid ${theme.border}`, borderRadius: 4, padding: '0 5px' };
const clearBtn: React.CSSProperties = {
  font: 'inherit', fontSize: 10.5, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flex: '0 0 auto', textDecoration: 'underline',
};
const browseBtn: React.CSSProperties = {
  font: 'inherit', fontSize: 11.5, color: theme.text, background: theme.panelAlt,
  border: `0.5px solid ${theme.border}`, borderRadius: 6, padding: '6px 11px',
  cursor: 'pointer', flex: '0 0 auto', whiteSpace: 'nowrap',
};
const fieldHint: React.CSSProperties = { fontSize: 10.5, color: theme.textDim };
const testRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 26 };
const testBtn: React.CSSProperties = {
  font: 'inherit', fontSize: 11.5, background: 'transparent', color: theme.text,
  border: `0.5px solid ${theme.border}`, borderRadius: 4, padding: '4px 11px', flex: '0 0 auto',
};
const testMsg: React.CSSProperties = {
  flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box',
  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
};
