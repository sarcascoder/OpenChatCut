// Trusted editor guide for the authenticated Streamable HTTP endpoint.
import { useEffect, useState } from 'react';
import { editorBootstrapInfo } from '../../agent/editor-credential';
import { theme } from '../../theme';
import { Icon } from '../icons';

interface Snippet {
  label: string;
  code: string;
}

function snippets(endpoint: string, token: string): Snippet[] {
  return [
    {
      label: 'Claude Code',
      code: `claude mcp add --transport http -H "Authorization: Bearer ${token}" openchatcut ${endpoint}`,
    },
    {
      label: 'Codex',
      code: `export OPENCHATCUT_MCP_TOKEN='${token}'\\ncodex mcp add openchatcut --url ${endpoint} --bearer-token-env-var OPENCHATCUT_MCP_TOKEN`,
    },
    {
      label: 'Cursor (~/.cursor/mcp.json)',
      code: JSON.stringify({
        mcpServers: {
          openchatcut: {
            type: 'http',
            url: endpoint,
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      }, null, 2),
    },
  ];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      style={{
        flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', border: `0.5px solid ${theme.border}`, borderRadius: 4,
        background: theme.hover, color: copied ? theme.accent : theme.textMuted,
        fontSize: 11, cursor: 'pointer',
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={11} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function McpGuideDialog({ onClose }: { onClose: () => void }) {
  const endpoint = `${window.location.origin}/api/external-mcp/mcp`;
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  useEffect(() => {
    let active = true;
    void editorBootstrapInfo().then(
      (info) => { if (active) setMcpToken(info.mcpToken); },
      () => { if (active) setTokenError(true); },
    );
    return () => { active = false; };
  }, []);
  const codeStyle: React.CSSProperties = {
    margin: 0, padding: '7px 9px', border: `0.5px solid ${theme.borderLight}`, borderRadius: 4,
    background: theme.inset, color: theme.text, fontSize: 11.5, lineHeight: 1.5,
    fontFamily: 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
    whiteSpace: 'pre-wrap', wordBreak: 'break-all', userSelect: 'text',
  };
  return (
    <div className="cc-modal-backdrop" onPointerDown={onClose}>
      <div
        className="cc-modal"
        style={{ width: 560, gap: 10, maxHeight: 'calc(100vh - 64px)', overflowY: 'auto' }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}>
          <Icon name="plug" size={15} />
          <strong style={{ fontSize: 14 }}>External agents (MCP)</strong>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', padding: '3px 9px' }}>Close</button>
        </div>
        <div style={{ color: theme.textMuted, fontSize: 12, lineHeight: 1.55 }}>
          OpenChatCut exposes a Streamable HTTP MCP endpoint. External agents such as Claude Code, Codex, and Cursor share the same editing tools as the built-in agent and can read and edit the current project directly.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Built-in Agent vs external MCP</span>
          <div style={{ color: theme.textMuted, fontSize: 12, lineHeight: 1.55 }}>
            The built-in Agent creates a previewable proposal for you to apply or reject. External MCP uses an isolated edit session: manual mode waits for review, while auto mode applies during review. Both modify projects only through EditorCore commands.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Connect a local model</span>
          <div style={{ color: theme.textMuted, fontSize: 12, lineHeight: 1.55 }}>
            Open Settings → Agent Model → Agent Brain → OpenAI, enter the API URL and model for your local or compatible service, choose Responses API or Chat Completions API as required, then click “Test and load models.” Enter an API key only if the service requires one.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Endpoint</span>
            <CopyButton text={endpoint} />
          </div>
          <pre style={codeStyle}>{endpoint}</pre>
        </div>

        {mcpToken ? snippets(endpoint, mcpToken).map((snippet) => (
          <div key={snippet.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{snippet.label}</span>
              <CopyButton text={snippet.code} />
            </div>
            <pre style={codeStyle}>{snippet.code}</pre>
          </div>
        )) : (
          <div style={{ color: tokenError ? theme.danger : theme.textMuted, fontSize: 12 }}>
            {tokenError ? 'Could not load the MCP connection token. Retry from a trusted editor window.' : 'Loading the MCP connection token…'}
          </div>
        )}

        <div style={{ color: theme.textDim, fontSize: 11.5, lineHeight: 1.55, borderTop: `0.5px solid ${theme.borderLight}`, paddingTop: 8 }}>
          The MCP endpoint always requires a bearer token. The token is generated on first launch and kept on this machine, so it stays the same across restarts: registering once keeps working; the OPENCHATCUT_MCP_TOKEN environment variable overrides it. The token is shown only in the current trusted editor session and is never written to the project, chat, or browser storage.
        </div>
      </div>
    </div>
  );
}
