import { useState } from 'react';
import type { LlmProvider } from '../../../shared/llm-providers';
import {
  findModelCapabilityOverride,
  parseModelCapabilityOverrides,
  resolveModelCapabilities,
  serializeModelCapabilityOverrides,
  updateModelCapabilityOverride,
  type ModelBackend,
  type ModelCapabilities,
  type ModelCapabilityOverride,
} from '../../../shared/model-capabilities';
import { theme } from '../../theme';

interface ModelCapabilityEditorProps {
  readonly backend: ModelBackend;
  readonly provider: LlmProvider;
  readonly modelId: string;
  readonly rawOverrides: string;
  readonly onChange: (value: string) => void;
}

type OverridePatch = Parameters<typeof updateModelCapabilityOverride>[2];
type CapabilityBoolean = 'supportsTools' | 'supportsImages' | 'supportsReasoning';

function resolvedSummary(capabilities: ModelCapabilities): string {
  const context = capabilities.contextWindowTokens;
  const output = capabilities.maxOutputTokens;
  return `Context ${context.value.toLocaleString()} · Output ${output.value.toLocaleString()}`;
}

function parseRecords(raw: string): readonly ModelCapabilityOverride[] {
  try { return parseModelCapabilityOverrides(raw); } catch { return []; }
}

function BooleanOverride({ label, resolved, onChange }: {
  readonly label: string;
  readonly resolved: ModelCapabilities[CapabilityBoolean];
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <select value={String(resolved.value)}
        onChange={(event) => onChange(event.target.value === 'true')}
        style={inputStyle}>
        <option value="true">Supported</option>
        <option value="false">Unsupported</option>
      </select>
    </label>
  );
}

function NumericOverride({ label, value, resolved, minimum, onCommit }: {
  readonly label: string;
  readonly value: number | undefined;
  readonly resolved: ModelCapabilities['contextWindowTokens'];
  readonly minimum: number;
  readonly onCommit: (value: number | undefined) => void;
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input key={`${label}:${value ?? `resolved-${resolved.value}`}`} type="number" min={minimum} max={4_000_000}
        defaultValue={value ?? resolved.value}
        onBlur={(event) => {
          const raw = event.target.value.trim();
          if (!raw) {
            event.target.value = String(resolved.value);
            onCommit(undefined);
            return;
          }
          const next = Number(raw);
          if (value === undefined && next === resolved.value) return;
          onCommit(next);
        }} style={inputStyle} />
    </label>
  );
}

export function ModelCapabilityEditor({
  backend, provider, modelId, rawOverrides, onChange,
}: ModelCapabilityEditorProps) {
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const identity = { backend, provider, modelId: modelId.trim() } as const;
  const records = parseRecords(rawOverrides);
  const override = findModelCapabilityOverride(records, identity);
  const resolved = resolveModelCapabilities(identity, records);
  const inherited = resolveModelCapabilities(identity);
  const update = (patch: OverridePatch): void => {
    try {
      const next = updateModelCapabilityOverride(records, identity, patch);
      onChange(next.length ? serializeModelCapabilityOverrides(next) : '');
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const booleanUpdate = (field: CapabilityBoolean) => (value: boolean) => update({
    [field]: value === inherited[field].value ? undefined : value,
  });
  return (
    <section style={boxStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 11.5 }}>Model capabilities</b>
          <div style={summaryStyle}>{modelId} · {resolvedSummary(resolved)}</div>
          {(resolved.contextWindowTokens.estimated || resolved.maxOutputTokens.estimated) && (
            <div style={{ fontSize: 10.5, lineHeight: 1.5, marginTop: 4, color: theme.textDim, maxWidth: 420 }}>
              {`This model is not in the built-in catalog, so these values are estimates (context ${resolved.contextWindowTokens.value.toLocaleString()} / output ${resolved.maxOutputTokens.value.toLocaleString()}). If they do not match the real model, expand and adjust them manually.`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
          {override && <button type="button" onClick={() => update(Object.fromEntries(
            ['contextWindowTokens', 'maxInputTokens', 'maxOutputTokens', 'supportsTools', 'supportsImages', 'supportsReasoning', 'reasoningEfforts', 'defaultReasoningEffort']
              .map((field) => [field, undefined]),
          ))} style={clearStyle}>Clear override</button>}
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}
            style={clearStyle}>{expanded ? 'Collapse' : 'Expand'}</button>
        </div>
      </div>
      {expanded && <>
        <div style={gridStyle}>
          <NumericOverride label='Context window (tokens)' value={override?.contextWindowTokens}
            resolved={resolved.contextWindowTokens} minimum={4_096}
            onCommit={(value) => update({ contextWindowTokens: value })} />
          <NumericOverride label='Maximum input (tokens)' value={override?.maxInputTokens}
            resolved={resolved.maxInputTokens} minimum={1}
            onCommit={(value) => update({ maxInputTokens: value })} />
          <NumericOverride label='Maximum output (tokens)' value={override?.maxOutputTokens}
            resolved={resolved.maxOutputTokens} minimum={1}
            onCommit={(value) => update({ maxOutputTokens: value })} />
          <BooleanOverride label='Tool calling' resolved={resolved.supportsTools}
            onChange={booleanUpdate('supportsTools')} />
          <BooleanOverride label='Image input' resolved={resolved.supportsImages}
            onChange={booleanUpdate('supportsImages')} />
          <BooleanOverride label='Reasoning' resolved={resolved.supportsReasoning}
            onChange={booleanUpdate('supportsReasoning')} />
        </div>
        {error && <div style={{ ...summaryStyle, color: theme.danger }}>{error}</div>}
        <div style={summaryStyle}>Leave fields empty to use the bundled model catalog. Unknown models use conservative fallback values.</div>
      </>}
    </section>
  );
}

const boxStyle: React.CSSProperties = {
  marginTop: 10, borderTop: `0.5px solid ${theme.border}`, paddingTop: 10,
};
const gridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 9,
};
const fieldStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: theme.textDim,
};
const inputStyle: React.CSSProperties = {
  font: 'inherit', fontSize: 11.5, background: theme.panelAlt, color: theme.text,
  border: `0.5px solid ${theme.border}`, borderRadius: 5, padding: '5px 7px', minWidth: 0,
};
const summaryStyle: React.CSSProperties = { fontSize: 10, color: theme.textDim, marginTop: 3 };
const clearStyle: React.CSSProperties = {
  border: 0, background: 'transparent', color: theme.textDim, textDecoration: 'underline', cursor: 'pointer', fontSize: 10.5,
};
