import { useState } from 'react';

import { createPortal } from 'react-dom';
import { theme } from '../../theme';
import { BrandMark, Icon, OpenChatCutWordmark } from '../icons';
import { AgentChangeLogMenu } from './AgentChangeLogMenu';
import { AgentRunInspector } from './AgentRunInspector';
import { ChatComposer } from './ChatComposer';
import { ChatMessage } from './ChatMessage';
import { ChatRunStatus } from './ChatRunStatus.tsx';
import { ExternalProposalCard } from './ExternalProposalCard';
import { ProposalCard } from './ProposalCard';
import { TerminalView } from './TerminalView';
import { ToolGroupRow } from './ToolGroupRow';
import { groupMessages } from './message-groups';
import { EMPTY_PROJECT_STARTERS, QUICK_ACTIONS } from './chatPanelPresets';
import type { DisplayMessage } from '../../agent/agent-session';
import { readStoredServerRun } from '../../agent/serverRunSessionStorage';
import type { ChatPanelController } from './chatPanelController';
import { CAPABILITY_LABELS, missingCreativeCaps } from './capabilityBanner';

const MESSAGE_WINDOW_SIZE = 40;

function ChangeLogPortal({ controller }: { controller: ChatPanelController }) {
  const { changeLogSlot, agent } = controller;
  if (!changeLogSlot) return null;
  return createPortal(
    <AgentChangeLogMenu
      changeLog={agent.changeLog}
      running={agent.running}
      canRollback={agent.canRollbackChangeSession}
      onRollback={agent.rollbackChangeSession}
    />,
    changeLogSlot,
  );
}

function CollapsedPanel({ controller }: { controller: ChatPanelController }) {
  const { props } = controller;
  return <>
    <ChangeLogPortal controller={controller} />
    <aside className="cc-chat-panel collapsed" data-cc-shortcut-surface="agent-chat" tabIndex={-1}
      style={{ gridColumn: 1, gridRow: '2 / 5', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '10px 0', borderRight: `0.5px solid ${theme.border}`, background: theme.panel }}>
      <button type="button" onClick={props.onToggleCollapse} title={'Expand OpenChatCut Agent'}
        style={{ background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer', fontSize: 14 }}>
        <span style={{ transform: 'rotate(-90deg)', display: 'inline-flex' }}><Icon name="chevronDown" size={14} /></span>
      </button>
      <div className="cc-chat-collapsed-brand">OpenChatCut</div>
    </aside>
  </>;
}

export function CapabilityBanner({ controller }: { controller: ChatPanelController }) {
  const { props } = controller;
  const [dismissed, setDismissed] = useState(false);
  const missing = missingCreativeCaps();
  if (dismissed || !props.onOpenSettings || missing.length === 0) return null;
  const names = missing.map((key) => CAPABILITY_LABELS[key] ?? key).join(', ');
  return <div className="cc-chat-capability-banner">
    <span>{'These capabilities are not configured; related features are unavailable: '}{names}</span>
    <button type="button" onClick={props.onOpenSettings}>Open settings</button>
    <button type="button" className="cc-chat-capability-banner-close" aria-label={'Close'}
      onClick={() => setDismissed(true)}>×</button>
  </div>;
}


function ChatHeader({ controller, tab, onToggleTab }: {
  controller: ChatPanelController;
  tab: 'chat' | 'terminal';
  onToggleTab: () => void;
}) {
  const { props, agent } = controller;
  return <div className="cc-chat-header">
    <div className="cc-chat-brand">
      <BrandMark size={20} />
      <span className="cc-chat-brand-copy">
        <OpenChatCutWordmark width={102} />
        <small>Agent workspace</small>
      </span>
    </div>
    <AgentRunInspector projectId={props.projectId} />
    <button type="button" onClick={agent.clearHistory} disabled={agent.running} title={'Clear chat'}
      style={{ background: 'none', border: 'none', color: theme.textDim, cursor: agent.running ? 'default' : 'pointer', opacity: agent.running ? 0.4 : 1, padding: 2, lineHeight: 0 }}>
      <Icon name="trash" size={14} />
    </button>
    <button type="button" onClick={onToggleTab}
      title={tab === 'chat' ? 'Switch to terminal' : 'Switch to chat'}
      style={{ background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer', padding: 2, lineHeight: 0 }}>
      <Icon name={tab === 'chat' ? 'terminal' : 'sparkles'} size={14} />
    </button>
    <button type="button" onClick={props.onToggleCollapse} title={'Collapse OpenChatCut Agent'}
      style={{ background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer', fontSize: 13 }}>
      <span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}><Icon name="chevronDown" size={14} /></span>
    </button>
  </div>;
}

function ChatOnboarding({ controller }: { controller: ChatPanelController }) {
  const { composer } = controller;
  return <div className="cc-chat-onboarding">
    <div className="cc-chat-onboarding-kicker">Start here</div>
    <h2>Start with an editing goal</h2>
    <p>Choose a workflow, or describe the finished video you want.</p>
    <div className="cc-chat-starter-list">
      {EMPTY_PROJECT_STARTERS.map((starter) => (
        <button type="button" key={starter.label} onClick={() => {
          composer.setInput(starter.prompt);
          requestAnimationFrame(() => composer.taRef.current?.focus());
        }}>
          <span className="cc-chat-starter-icon"><Icon name={starter.icon} size={16} /></span>
          <span className="cc-chat-starter-copy">
            <strong>{starter.label}</strong><small>{starter.description}</small>
          </span>
          <span className="cc-chat-starter-arrow" aria-hidden="true">→</span>
        </button>
      ))}
    </div>
  </div>;
}

function EarlierMessagesButton({ controller }: { controller: ChatPanelController }) {
  const { visibleFrom, composer, scroll } = controller;
  if (visibleFrom === 0) return null;
  return <button type="button"
    onClick={() => {
      // Keep the current viewport anchored: the newly loaded history is
      // inserted above, so restore the previous bottom offset after render.
      const node = scroll.scrollRef.current;
      const bottomBefore = node ? node.scrollHeight - node.scrollTop : 0;
      composer.setVisibleMessageCount((count) => count + MESSAGE_WINDOW_SIZE);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (node) node.scrollTop = node.scrollHeight - bottomBefore;
      }));
    }}
    style={{ display: 'block', margin: '4px auto 12px', padding: '5px 10px', border: `0.5px solid ${theme.border}`, borderRadius: 6, background: 'transparent', color: theme.textDim, cursor: 'pointer', fontSize: 12 }}>
    Load earlier messages ({visibleFrom})
  </button>;
}

function MessageEntries({ controller }: { controller: ChatPanelController }) {
  const { agent, composer, visibleMessages, visibleFrom } = controller;
  const onRetry = (retry: NonNullable<DisplayMessage['retry']>) => {
    if (!agent.running) void agent.send(retry.text, {
      askOnly: retry.askOnly,
      references: retry.references,
    });
  };
  return <>
    {groupMessages(visibleMessages, visibleFrom).map((item) => item.kind === 'toolgroup' ? (
      <ToolGroupRow key={item.index} name={item.name} items={item.items} />
    ) : (
      <ChatMessage key={item.index} msg={item.msg} running={agent.running}
        retry={item.msg.role === 'user' ? item.msg.retry : undefined}
        streaming={agent.running && item.index === agent.messages.length - 1 && item.msg.role === 'assistant'}
        widgetSubmitted={agent.messages.slice(item.index + 1).some((message) => message.role === 'user')}
        onRetry={onRetry}
        onContinue={item.msg.role === 'continue' && item.index === agent.messages.length - 1 && !agent.running
          ? () => { void agent.send('Continue'); } : null}
        onWidgetSubmit={(answer) => {
          if (!agent.running) void agent.send(answer, { askOnly: composer.mode === 'ask' });
        }} />
    ))}
  </>;
}

function AgentRunCards({ controller }: { controller: ChatPanelController }) {
  const { agent, composer, externalProposal, props, streamingThinking, runSeed } = controller;
  const showProposal = agent.proposal
    && !composer.autoApply;
  return <>
    <ChatRunStatus running={agent.running} liveTool={agent.liveTool}
      streamingThinking={streamingThinking} phraseSeed={runSeed}
      startedAt={readStoredServerRun(props.projectId)?.createdAt ?? Date.now()} />
    {showProposal && agent.proposal && (
      <ProposalCard proposal={agent.proposal} onApply={agent.applyProposal} onReject={agent.rejectProposal}
        stale={agent.proposalStale} onForceApply={agent.forceApplyProposal} onRePropose={agent.reProposeStale}
        onPreview={(on) => props.onPreviewState(on ? agent.proposal?.resultState ?? null : null)} />
    )}
    <ExternalProposalCard external={externalProposal} onPreviewState={props.onPreviewState} />
  </>;
}

function ScrollNavigation({ controller }: { controller: ChatPanelController }) {
  const { scroll } = controller;
  const target = scroll.target;
  if (!target) return null;
  const label = (target === 'top' ? 'Jump to top' : 'Jump to bottom');
  return <div className={`cc-chat-scroll-navigation cc-chat-scroll-navigation--${target}`}
    aria-label={'Chat scroll shortcuts'}>
    <button type="button"
      className={`cc-chat-scroll-navigation-button cc-tip${target === 'bottom' ? ' cc-chat-scroll-navigation-button--bottom cc-tip-up' : ''}`}
      data-tip={label} aria-label={label} onClick={() => scroll.scrollTo(target)}>
      <Icon name="arrowUp" size={14} />
    </button>
  </div>;
}

function MessageWorkspace({ controller }: { controller: ChatPanelController }) {
  const { agent, scroll } = controller;
  return <div className="cc-chat-messages-shell">
    <div ref={scroll.scrollRef} onScroll={scroll.onScroll}
      className={`cc-chat-messages${agent.messages.length === 0 ? ' empty' : ''}`}>
      {agent.messages.length === 0 && <ChatOnboarding controller={controller} />}
      <EarlierMessagesButton controller={controller} />
      <MessageEntries controller={controller} />
      <AgentRunCards controller={controller} />
    </div>
    <ScrollNavigation controller={controller} />
  </div>;
}

function QuickActionSelect({ controller }: { controller: ChatPanelController }) {
  const { agent, composer } = controller;
  return <select aria-label={'Quick actions'} value="" disabled={agent.running}
    onChange={(event) => {
      if (!event.target.value) return;
      const action = QUICK_ACTIONS[Number(event.target.value)];
      if (!action) return;
      composer.setInput(action.prompt);
      requestAnimationFrame(() => composer.taRef.current?.focus());
    }}
    style={{ width: '100%', marginBottom: 8, border: `0.5px solid ${theme.border}`, borderRadius: 6, padding: '6px 8px', background: theme.panelAlt, color: theme.text, fontSize: 12 }}>
    <option value="">Quick actions…</option>
    {QUICK_ACTIONS.map((action, index) => (
      <option key={action.label} value={index}>{action.label}</option>
    ))}
  </select>;
}

function ComposerInput({ controller }: { controller: ChatPanelController }) {
  const { props, agent, composer, actions, references } = controller;
  return <ChatComposer
    value={composer.input} onChange={actions.onComposerChange}
    onSubmit={actions.submit} onStop={agent.stop}
    onEnhance={actions.runEnhance} enhancing={composer.enhancing} running={agent.running}
    mode={composer.mode} onModeChange={composer.setMode}
    autoApply={composer.autoApply} onAutoApplyChange={composer.setAutoApply}
    agentSettings={composer.agentSettings} patchAgent={composer.patchAgent}
    contextUsage={agent.contextUsage}
    selecting={composer.selecting} onToggleSelecting={() => composer.setSelecting((value) => !value)}
    creativeMode={props.creativeMode} onCreativeModeChange={props.onCreativeModeChange}
    references={references} onInsertRef={actions.insertRef}
    selectedRefs={composer.selectedRefs} onRemoveRef={actions.removeRef}
    onPasteFiles={actions.importPastedFiles} onDropFiles={actions.importPastedFiles}
    pasting={composer.pendingAttachmentCount > 0}
    pendingAttachmentCount={composer.pendingAttachmentCount}
    pasteError={composer.pasteError} onDismissPasteError={() => composer.setPasteError(null)}
    onDropEditorItem={actions.onDropEditorItem} taRef={composer.taRef}
    placeholder={agent.messages.length === 0
      ? 'Describe what you want to create...' : 'Tell the AI what to change — @ to reference assets'} />;
}

function ComposerSection({ controller }: { controller: ChatPanelController }) {
  return <div style={{ padding: 12, borderTop: `0.5px solid ${theme.border}`, minWidth: 0, flexShrink: 0, boxSizing: 'border-box' }}>
    <QuickActionSelect controller={controller} />
    <ComposerInput controller={controller} />
  </div>;
}

function ExpandedPanel({ controller }: { controller: ChatPanelController }) {
  const { scroll } = controller;
  const [tab, setTab] = useState<'chat' | 'terminal'>('chat');
  const projectRoot = controller.props.projectRoot ?? null;
  return <>
    <ChangeLogPortal controller={controller} />
    <aside className="cc-chat-panel" data-cc-chat-popover-boundary data-cc-shortcut-surface="agent-chat"
      tabIndex={-1} onKeyDown={scroll.onKeyDown}
      onPointerDownCapture={(event) => {
        if (!(event.target instanceof HTMLElement)) return;
        if (!event.target.closest('button, input, select, textarea, [contenteditable="true"]')) {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      style={{ gridColumn: 1, gridRow: '2 / 5', display: 'flex', flexDirection: 'column', borderRight: `0.5px solid ${theme.border}`, background: theme.panel, minHeight: 0, minWidth: 0 }}>
      <ChatHeader controller={controller} tab={tab} onToggleTab={() => setTab((t) => (t === 'chat' ? 'terminal' : 'chat'))} />
      {/* Both panes stay mounted: unmounting the terminal would kill a running
          `claude`, and unmounting chat would drop its scroll position. The chat
          pane's own markup is unchanged -- it is only wrapped so it can be
          hidden, and `display: contents` means the wrapper adds no box of its
          own, so chat layout and spacing stay byte-for-byte what they were. */}
      <div style={{ display: tab === 'chat' ? 'contents' : 'none' }}>
        <CapabilityBanner controller={controller} />
        <MessageWorkspace controller={controller} />
        <ComposerSection controller={controller} />
      </div>
      <div style={{ display: tab === 'terminal' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <TerminalView projectRoot={projectRoot} />
      </div>
    </aside>
  </>;
}

export function ChatPanelView({ controller }: { controller: ChatPanelController }) {
  return controller.props.collapsed
    ? <CollapsedPanel controller={controller} />
    : <ExpandedPanel controller={controller} />;
}
