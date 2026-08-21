import {
  useEffect, useRef, useState, type ReactNode,
} from 'react';
import type {
  CodexAgentStatus, CodexLoginStartResponse,
} from '../../../shared/codex-agent';
import { theme, themeAlpha } from '../../theme';
import { Icon } from '../icons';
import {
  safeHttpsUrl, type CodexSettingsController,
} from './useCodexSettings';

const COPY_FEEDBACK_MS = 1_600;

type AccountState = 'loading' | 'missing' | 'signed-out' | 'pending' | 'signed-in' | 'api-key' | 'error';

function accountState(controller: CodexSettingsController): AccountState {
  const { status } = controller;
  if (controller.loading && !status) return 'loading';
  if (!status) return 'error';
  if (!status.installed) return 'missing';
  if (status.loginPending || controller.login) return 'pending';
  if (status.account?.type === 'apiKey') return 'api-key';
  if (status.account) return 'signed-in';
  if (status.error || controller.error) return 'error';
  return 'signed-out';
}

export function CodexAccountCard({ controller }: {
  controller: CodexSettingsController;
}) {
  const state = accountState(controller);
  return (
    <section style={card} aria-live="polite">
      <StatusSummary state={state} controller={controller} />
      {state === 'pending' && <LoginDetails login={controller.login} />}
      <ActionRow state={state} controller={controller}
        onLoadModels={() => { void controller.discoverModels(); }} />
      {state !== 'error' && (controller.error ?? controller.status?.error) && (
        <div role="alert" style={errorText}>{controller.error ?? controller.status?.error}</div>
      )}
      {state === 'signed-in' && controller.modelError && <div role="alert" style={errorText}>{controller.modelError}</div>}
    </section>
  );
}

function StatusSummary({ state, controller }: {
  state: AccountState; controller: CodexSettingsController;
}) {
  const status = controller.status;
  const signedInDetail = 'Credentials and renewal are managed by the Codex CLI.';
  const copy: Record<AccountState, readonly [string, string]> = {
    loading: ['Checking Codex CLI…', 'Reading the local Codex runtime status.'],
    missing: ['Codex CLI was not found', 'Install the OpenAI Codex CLI, then refresh the status.'],
    'signed-out': ['Not signed in to ChatGPT', 'Connect a ChatGPT subscription through the official Codex sign-in flow.'],
    pending: ['Waiting for ChatGPT authorization', 'Finish authorization on the sign-in page. This status will refresh automatically.'],
    'signed-in': ['Signed in to ChatGPT', signedInDetail],
    'api-key': [
      'Codex CLI is using an API key',
      'This page enables ChatGPT subscriptions only. Use the OpenAI provider page for API keys.',
    ],
    error: ['Codex is temporarily unavailable', controller.error ?? status?.error ?? 'Refresh and try again.'],
  };
  const [title, detail] = copy[state];
  const tone = state === 'signed-in' ? theme.success
    : state === 'pending' || state === 'api-key' ? theme.gold
      : state === 'error' || state === 'missing' ? theme.danger : theme.borderLight;
  return (
    <div style={summaryRow}>
      <span aria-hidden style={{ ...statusDot, background: tone }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={summaryTitle}>{title}</div>
        <div style={summaryDetail}>{detail}</div>
        {(state === 'signed-in' || state === 'api-key') && status?.account && <AccountMetadata status={status} />}
      </div>
      {status?.installed && status.version && <span style={versionTag}>{`Codex CLI ${status.version}`}</span>}
    </div>
  );
}

function AccountMetadata({ status }: { status: CodexAgentStatus }) {
  const account = status.account;
  if (!account) return null;
  return (
    <div style={metadata}>
      {account.email && <span title={account.email}>{account.email}</span>}
      {account.planType && <span>{`Plan: ${account.planType}`}</span>}
    </div>
  );
}

function LoginDetails({ login }: { login: CodexLoginStartResponse | null }) {
  if (!login) return <div style={pendingNote}>Finish authorization in the Codex sign-in window you opened earlier.</div>;
  if (login.type === 'chatgpt') {
    const authUrl = safeHttpsUrl(login.authUrl);
    return authUrl
      ? <ValueRow label="Sign-in URL" value={authUrl} href={authUrl} />
      : <div role="alert" style={errorText}>Codex returned an invalid sign-in URL.</div>;
  }
  const verificationUrl = safeHttpsUrl(login.verificationUrl);
  if (!verificationUrl) {
    return <div role="alert" style={errorText}>Codex returned an invalid verification URL.</div>;
  }
  return (
    <div style={loginDetails}>
      <ValueRow label="Verification URL" value={verificationUrl} href={verificationUrl} />
      <ValueRow label="Device code" value={login.userCode} prominent />
    </div>
  );
}

function ValueRow({ label, value, href, prominent = false }: {
  label: string; value: string; href?: string; prominent?: boolean;
}) {
  return (
    <div style={valueRow}>
      <span style={valueLabel}>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={valueLink} title={value}>
          <code style={valueCode}>{value}</code>
        </a>
      ) : <code tabIndex={0} style={{ ...valueCode, ...(prominent ? prominentCode : {}) }}>{value}</code>}
      <CopyButton value={value} />
    </div>
  );
}

function ActionRow({ state, controller, onLoadModels }: {
  state: AccountState; controller: CodexSettingsController; onLoadModels: () => void;
}) {
  const busy = controller.loginBusy || controller.logoutBusy || controller.loading || controller.modelBusy;
  if (state === 'loading' || state === 'missing' || state === 'error') {
    return <div style={actions}><ActionButton disabled={busy} onClick={() => { void controller.refresh(); }}>{controller.loading ? 'Refreshing…' : 'Refresh status'}</ActionButton></div>;
  }
  if (state === 'signed-in') {
    return (
      <div style={actions}>
        <ActionButton primary disabled={busy} onClick={onLoadModels}>{controller.modelBusy ? 'Loading…' : 'Load models'}</ActionButton>
        <ActionButton disabled={busy} onClick={() => { void controller.refresh(); }}>{controller.loading ? 'Refreshing…' : 'Refresh status'}</ActionButton>
        <ActionButton danger disabled={busy} onClick={() => { void controller.logout(); }}>{controller.logoutBusy ? 'Signing out…' : 'Sign out'}</ActionButton>
      </div>
    );
  }
  if (state === 'api-key') {
    return (
      <div style={actions}>
        <ActionButton disabled={busy} onClick={() => { void controller.refresh(); }}>{controller.loading ? 'Refreshing…' : 'Refresh status'}</ActionButton>
        <ActionButton danger disabled={busy} onClick={() => { void controller.logout(); }}>{controller.logoutBusy ? 'Signing out…' : 'Sign out'}</ActionButton>
      </div>
    );
  }
  if (state === 'pending') {
    return (
      <div style={actions}>
        <ActionButton danger disabled={busy} onClick={() => { void controller.cancelLogin(); }}>Cancel sign-in</ActionButton>
        <ActionButton disabled={busy} onClick={() => { void controller.refresh(); }}>{controller.loading ? 'Refreshing…' : 'Refresh status'}</ActionButton>
      </div>
    );
  }
  return (
    <div style={actions}>
      <ActionButton primary disabled={busy} onClick={() => { void controller.startLogin('chatgpt'); }}>{controller.loginBusy ? 'Starting…' : 'Sign in with browser'}</ActionButton>
      <ActionButton disabled={busy} onClick={() => { void controller.startLogin('chatgptDeviceCode'); }}>Use device code</ActionButton>
      <ActionButton disabled={busy} onClick={() => { void controller.refresh(); }}>{controller.loading ? 'Refreshing…' : 'Refresh status'}</ActionButton>
    </div>
  );
}

function ActionButton({ children, onClick, disabled = false, primary = false, danger = false }: {
  children: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; danger?: boolean;
}) {
  const color = danger ? theme.danger : primary ? theme.onAccent : theme.text;
  const background = primary ? theme.accent : 'transparent';
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ ...button, color, background, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}>
      {children}
    </button>
  );
}

function CopyButton({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (): Promise<void> => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), COPY_FEEDBACK_MS);
  };
  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy';
  return (
    <button type="button" onClick={() => { void copy(); }} title={label} aria-label={label} style={copyButton}>
      <Icon name={state === 'copied' ? 'check' : 'copy'} size={11} />
      {label}
    </button>
  );
}

const card: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, padding: '11px 13px',
  background: theme.bg, border: `0.5px solid ${theme.border}`, borderRadius: 4,
};
const summaryRow: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 9 };
const statusDot: React.CSSProperties = { width: 8, height: 8, marginTop: 4, borderRadius: '50%', flex: '0 0 auto' };
const summaryTitle: React.CSSProperties = { color: theme.text, fontSize: 12, fontWeight: 600, lineHeight: 1.35 };
const summaryDetail: React.CSSProperties = { marginTop: 2, color: theme.textDim, fontSize: 10.5, lineHeight: 1.45 };
const versionTag: React.CSSProperties = {
  flex: '0 0 auto', padding: '1px 5px', border: `0.5px solid ${theme.border}`,
  borderRadius: 4, color: theme.textDim, fontSize: 9.5,
};
const metadata: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: '2px 9px', marginTop: 5, color: theme.textMuted,
  fontSize: 10.5, lineHeight: 1.35, overflowWrap: 'anywhere',
};
const pendingNote: React.CSSProperties = { color: theme.textDim, fontSize: 10.5, lineHeight: 1.45 };
const loginDetails: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const valueRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 };
const valueLabel: React.CSSProperties = { width: 52, flex: '0 0 52px', color: theme.textDim, fontSize: 10.5 };
const valueLink: React.CSSProperties = { minWidth: 0, flex: 1, color: theme.accent, textDecoration: 'underline' };
const valueCode: React.CSSProperties = {
  display: 'block', minWidth: 0, overflow: 'hidden', color: 'inherit', fontFamily: 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10.5, lineHeight: 1.45, textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'all',
};
const prominentCode: React.CSSProperties = { color: theme.textStrong, fontSize: 14, fontWeight: 700, letterSpacing: '0.08em' };
const actions: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 };
const button: React.CSSProperties = {
  minHeight: 28, padding: '4px 9px', border: `0.5px solid ${theme.border}`, borderRadius: 4,
  font: 'inherit', fontSize: 10.5, fontWeight: 500,
};
const copyButton: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto', minHeight: 24,
  padding: '2px 6px', border: `0.5px solid ${theme.border}`, borderRadius: 4,
  background: themeAlpha.ink(0.04), color: theme.textMuted, cursor: 'pointer', fontSize: 10,
};
const errorText: React.CSSProperties = {
  paddingTop: 7, borderTop: `0.5px solid ${theme.border}`, color: theme.danger,
  fontSize: 10.5, lineHeight: 1.45,
};
