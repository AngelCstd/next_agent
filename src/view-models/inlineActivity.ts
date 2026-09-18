import type { AgentActivityStep } from './agentActivity';

export interface InlineActivityPresentation {
  mode: 'running' | 'completed';
  expanded: boolean;
  summary: string;
  visibleSteps: AgentActivityStep[];
}

export function deriveInlineActivityPresentation(
  steps: readonly AgentActivityStep[],
  expanded: boolean,
): InlineActivityPresentation {
  const isRunning = steps.some(
    (step) => step.status === 'running' || step.status === 'pending',
  );

  if (isRunning) {
    return {
      mode: 'running',
      expanded: true,
      summary: 'Actividad de agentes en progreso',
      visibleSteps: [...steps],
    };
  }

  return {
    mode: 'completed',
    expanded,
    summary: `Actividad de agentes · ${steps.length} ${steps.length === 1 ? 'paso' : 'pasos'}`,
    visibleSteps: expanded ? [...steps] : [],
  };
}
