import type { CSSProperties } from 'react';
import {
  AGENT_CACHE_MODES,
  MG_TIERS,
  type AgentCacheMode,
  type AgentSettings,
  type MgTier,
} from '../../agent/settings/agentSettings';
import { theme } from '../../theme';

const TIER_LABELS: Record<MgTier, string> = {
  speed: 'Speed',
  balance: 'Balanced',
  quality: 'Quality',
};
const CACHE_LABELS: Record<AgentCacheMode, string> = {
  short: 'Short session',
  long: 'Long session',
};

interface AgentComposerSettingsProps {
  readonly autoApply: boolean;
  readonly onAutoApplyChange: (value: boolean) => void;
  readonly settings: AgentSettings;
  readonly onSettingsChange: (patch: Partial<AgentSettings>) => void;
}

function choiceStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '4px 0',
    fontSize: 11.5,
    borderRadius: 6,
    cursor: 'pointer',
    border: `0.5px solid ${active ? theme.accent : theme.borderLight}`,
    background: active ? theme.panel : 'none',
    color: active ? theme.text : theme.textDim,
  };
}

export function AgentComposerSettings(props: AgentComposerSettingsProps) {
  const { autoApply, onAutoApplyChange, settings, onSettingsChange } = props;
  return (
    <>
      <div style={{ padding: '8px 10px 4px', color: theme.text, fontSize: 12.5 }}>Mode</div>
      <div style={{ display: 'flex', gap: 4, padding: '0 10px' }}>
        {(['ask', 'yolo'] as const).map((mode) => {
          const active = (mode === 'yolo') === autoApply;
          return (
            <button key={mode} onClick={() => onAutoApplyChange(mode === 'yolo')} style={choiceStyle(active)}>
              {mode === 'ask' ? 'Ask Mode' : 'YOLO Mode'}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: theme.textDim, padding: '0 10px 6px' }}>
        {autoApply
          ? 'YOLO Mode: proposals apply automatically and tools run directly; questions are asked only when critical information is missing.'
          : 'Ask Mode: timeline proposals wait for you to apply them; tools run directly, while critical choices are still asked.'}
      </div>
      <div style={{ padding: '8px 10px 4px', color: theme.text, fontSize: 12.5 }}>MG quality</div>
      <div style={{ display: 'flex', gap: 4, padding: '0 10px' }}>
        {MG_TIERS.map((tier) => (
          <button key={tier} onClick={() => onSettingsChange({ mgTier: tier })}
            style={choiceStyle(settings.mgTier === tier)}>{TIER_LABELS[tier]}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: theme.textDim, padding: '4px 10px 6px' }}>
        Speed = fastest output / Balanced / Quality = polished motion detail.
      </div>
      <div style={{ padding: '8px 10px 4px', color: theme.text, fontSize: 12.5 }}>Cache duration</div>
      <div style={{ display: 'flex', gap: 4, padding: '0 10px' }}>
        {AGENT_CACHE_MODES.map((mode) => (
          <button key={mode} onClick={() => onSettingsChange({ cacheMode: mode })}
            style={choiceStyle(settings.cacheMode === mode)}>{CACHE_LABELS[mode]}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: theme.textDim, padding: '4px 10px 6px' }}>
        Short sessions use the default cache; long sessions request a 1-hour cache from supported providers.
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', color: theme.text, fontSize: 12.5 }}>
        <input type="checkbox" checked={settings.planMode}
          onChange={(event) => onSettingsChange({ planMode: event.target.checked })}
          style={{ accentColor: theme.accent }} />
        Plan mode
      </label>
      <div style={{ fontSize: 11, color: theme.textDim, padding: '0 10px 10px' }}>
        Presents a numbered plan first; acts after you confirm.
      </div>
    </>
  );
}
