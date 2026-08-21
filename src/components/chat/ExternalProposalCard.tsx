import { useEffect } from 'react';
import type { ExternalProposalController } from '../../agent/useExternalAgentBridge';
import type { TimelineState } from '../../editor/types';
import { theme } from '../../theme';
import { ProposalCard } from './ProposalCard';
import { Icon } from '../icons';
import { ApprovalDetails } from './ApprovalDetails';

type ExternalGuard = NonNullable<ExternalProposalController['pendingGuard']>;
type ConfirmGuard = ExternalProposalController['confirmGuard'];

function ExternalErrorAlert({ message }: { message: string }) {
  // Bridge errors surface as machine-readable strings; map the common
  // ownership-conflict cases to user-facing copy, then translate via i18n.
  const BRIDGE_ERROR_KEYS: Record<string, string> = {
    'registration failed: HTTP 409': 'This project is being edited in another window; registration failed. Close the other window and try again.',
    'poll failed: HTTP 409': 'This project is being edited in another window; the connection was interrupted. Close the other window and try again.',
    'cancellation poll failed: HTTP 409': 'This project is being edited in another window; the connection was interrupted. Close the other window and try again.',
    'result failed: HTTP 409': 'This project is being edited in another window; the result could not be delivered. Close the other window and try again.',
  };
  const text = BRIDGE_ERROR_KEYS[message] ?? message;
  return (
    <div role="alert" style={{ margin: '10px 0', color: theme.danger, fontSize: 12 }}>
      {text}
    </div>
  );
}

function GuardDetails({ guard }: { guard: ExternalGuard }) {
  return (
    <div style={{ fontSize: 12, color: theme.text, marginBottom: 8, lineHeight: 1.5 }}>
      {`Tool ${guard.tool} will affect the current project. Approval is bound only to the parameters below; changed parameters require a new approval.`}
      {!guard.details.length && (
        <div style={{ marginTop: 5, color: theme.textDim, overflowWrap: 'anywhere' }}>
          {guard.summary}
        </div>
      )}
      <ApprovalDetails
        details={guard.details}
        argsDigest={guard.argsDigest}
        operationId={guard.operationId}
      />
    </div>
  );
}

function GuardActions({ guard, confirmGuard }: {
  guard: ExternalGuard;
  confirmGuard: ConfirmGuard;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        type="button"
        onClick={() => confirmGuard(guard.id, true)}
        style={{ border: `0.5px solid ${theme.accent}`, background: 'none', color: theme.text, borderRadius: 6, padding: '5px 14px', fontSize: 12.5, cursor: 'pointer' }}
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => confirmGuard(guard.id, false)}
        style={{ border: `0.5px solid ${theme.border}`, background: 'none', color: theme.textDim, borderRadius: 6, padding: '5px 14px', fontSize: 12.5, cursor: 'pointer' }}
      >
        Reject
      </button>
    </div>
  );
}

function PendingGuardDialog({ guard, confirmGuard }: {
  guard: ExternalGuard;
  confirmGuard: ConfirmGuard;
}) {
  return (
    <div
      role="alertdialog"
      style={{
        margin: '10px 0', padding: '10px 12px', borderRadius: 6,
        background: theme.panelAlt, border: `0.5px solid ${theme.accent}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <Icon name="wand" size={14} />
        <strong style={{ fontSize: 12.5 }}>External agent requests a live-project operation</strong>
      </div>
      <GuardDetails guard={guard} />
      <GuardActions guard={guard} confirmGuard={confirmGuard} />
    </div>
  );
}

function ExternalProposal({ external, onPreviewState }: {
  external: ExternalProposalController;
  onPreviewState: (state: TimelineState | null) => void;
}) {
  const proposal = external.proposal;
  if (!proposal) return null;
  return (
    <ProposalCard
      proposal={{ ...proposal, title: `${proposal.title} ${'Edit proposal'}` }}
      onApply={external.applyProposal}
      onReject={external.rejectProposal}
      stale={external.proposalStale}
      onForceApply={external.forceApplyProposal}
      onPreview={(on) => onPreviewState(on ? proposal.resultState : null)}
    />
  );
}

export function ExternalProposalCard({ external, onPreviewState }: {
  external: ExternalProposalController;
  onPreviewState: (state: TimelineState | null) => void;
}) {
  useEffect(() => {
    if (!external.proposal) onPreviewState(null);
  }, [external.proposal, onPreviewState]);

  return (
    <>
      {external.error && <ExternalErrorAlert message={external.error} />}
      {external.pendingGuard && (
        <PendingGuardDialog
          guard={external.pendingGuard}
          confirmGuard={external.confirmGuard}
        />
      )}
      <ExternalProposal external={external} onPreviewState={onPreviewState} />
    </>
  );
}
