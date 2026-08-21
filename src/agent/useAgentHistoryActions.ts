import { useCallback, useRef } from 'react';
import { flushChatWrites } from '../persist/projectStore';
import { clearAgentSessionContext } from '../persist/agentRuntimeStore';
import { loadProposalRecord } from '../persist/proposalStore';
import { initialAgentMessages } from './agent-session';
import { PROVIDER } from './providerConfig';
import { canRollbackAgentChange, rollbackAgentChange } from './changeLog';
import type { AgentHookState } from './useAgentState';
import { clearStoredServerRun } from './serverRunSessionStorage';

type ClearBlockedError = Error & {
  code?: string;
  run?: { runId?: string; status?: string };
};

export async function clearAgentHistory(state: AgentHookState, projectId: string): Promise<void> {
  if (state.runningRef.current) {
    // Do not fail silently: the user clicked clear and nothing happened.
    state.setMessages((current) => [...current, {
      role: 'error',
      text: 'The Agent is still running and the chat cannot be cleared. Wait for the run to finish or stop it first, then try again.',
    }]);
    return;
  }
  const hydrationEpoch = ++state.hydrationEpochRef.current;
  state.hydratedRef.current = false;
  state.setHydrated(false);
  try {
    await flushChatWrites(projectId);
    const durable = await loadProposalRecord(projectId);
    const durableRunId = durable?.phase !== 'settled'
      ? durable?.proposal.agentRunId
      : undefined;
    await clearAgentSessionContext(
      projectId,
      durableRunId ? new Set([durableRunId]) : new Set(),
    );
    clearStoredServerRun(projectId);
  } catch (error) {
    if (state.hydrationEpochRef.current !== hydrationEpoch) return;
    state.hydratedRef.current = true;
    state.setHydrated(true);
    const blocked = error as ClearBlockedError;
    const runId = blocked.run?.runId;
    const status = blocked.run?.status;
    const detail = blocked.code === 'agent_session_clear_blocked' && runId
      ? `Run ${runId} (${status ?? 'unknown'}) is still active. Stop it, confirm the inspector has no active tasks, then retry.`
      : 'Confirm no other Agent is running, then retry.';
    state.setMessages((current) => [...current, {
      role: 'error',
      text: `${'Unable to clear context and run history.'}${detail}`,
    }]);
    return;
  }
  state.llmRef.current = initialAgentMessages();
  state.llmProviderRef.current = PROVIDER;
  state.setProposalStale(false);
  state.setChangeLog([]);
  state.setMessages([]);
  state.replaceContextUsage(null);
  state.hydratedRef.current = true;
  state.setHydrated(true);
}

function rollbackSession(state: AgentHookState, id: string, force: boolean): boolean {
  const session = state.changeLogRef.current.find((item) => item.id === id);
  if (!session) return false;
  const previous = rollbackAgentChange(session, state.ctxRef.current.getDoc(), force);
  if (!previous) return false;
  state.ctxRef.current.commands.applyDoc(previous);
  return true;
}

function canRollbackSession(state: AgentHookState, id: string): boolean {
  const session = state.changeLogRef.current.find((item) => item.id === id);
  return !!session && canRollbackAgentChange(session, state.ctxRef.current.getDoc());
}

export function useAgentHistoryActions(state: AgentHookState, projectId: string) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const clearHistory = useCallback(
    () => { void clearAgentHistory(stateRef.current, projectId); },
    [projectId],
  );
  const rollbackChangeSession = useCallback(
    (id: string, force = false) => rollbackSession(stateRef.current, id, force),
    [],
  );
  const canRollbackChangeSession = useCallback(
    (id: string) => canRollbackSession(stateRef.current, id),
    [],
  );
  return { clearHistory, rollbackChangeSession, canRollbackChangeSession };
}
