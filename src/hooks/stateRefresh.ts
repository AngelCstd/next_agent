export type StateRefreshKind = 'tasks' | 'tasks-and-approvals';

export function getStateRefreshKind(eventType: string): StateRefreshKind | null {
  if (eventType.startsWith('task.')) return 'tasks';
  if (eventType.startsWith('approval.') || eventType.startsWith('supervisor.')) {
    return 'tasks-and-approvals';
  }
  return null;
}

export interface StateRefreshScheduler<TContext> {
  schedule(kind: StateRefreshKind, context: TContext): void;
  cancel(): void;
}

export function createStateRefreshScheduler<TContext>({
  delayMs,
  refreshTasks,
  refreshApprovals,
}: {
  delayMs: number;
  refreshTasks: (context: TContext) => void | Promise<void>;
  refreshApprovals: (context: TContext) => void | Promise<void>;
}): StateRefreshScheduler<TContext> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingTasks = false;
  let pendingApprovals = false;
  let latestContext: TContext | undefined;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingTasks = false;
    pendingApprovals = false;
    latestContext = undefined;
  };

  const flush = () => {
    timer = null;
    const context = latestContext;
    const shouldRefreshTasks = pendingTasks;
    const shouldRefreshApprovals = pendingApprovals;
    pendingTasks = false;
    pendingApprovals = false;
    latestContext = undefined;

    if (context === undefined) return;

    const refreshes: Array<void | Promise<void>> = [];
    if (shouldRefreshTasks) refreshes.push(refreshTasks(context));
    if (shouldRefreshApprovals) refreshes.push(refreshApprovals(context));
    void Promise.all(refreshes);
  };

  return {
    schedule(kind, context) {
      pendingTasks = true;
      if (kind === 'tasks-and-approvals') pendingApprovals = true;
      latestContext = context;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    cancel,
  };
}

export interface StartGuard {
  tryStart(): boolean;
  reset(): void;
}

export function createStartGuard(): StartGuard {
  let started = false;

  return {
    tryStart() {
      if (started) return false;
      started = true;
      return true;
    },
    reset() {
      started = false;
    },
  };
}
