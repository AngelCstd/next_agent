import type { AgentEvent, AgentTask } from '../contracts';

export interface AgentActivityStep {
  id: string;
  agentLabel: string;
  text: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  timestamp?: string;
}

/**
 * Derives a safe, clean, human-readable timeline of multi-agent work.
 * Strictly observable operational states only:
 * - Friendly agent labels (Supervisor, Agente de hoteles)
 * - Operational action / status
 * - Destination if applicable
 * - Running / Completed / Pending status
 * - Zero chain-of-thought, zero internal reasoning, zero prompts, zero UUIDs, zero JSON crudo, zero tokens/secrets.
 */
export function deriveAgentActivity(
  tasks: readonly AgentTask[],
  events: readonly AgentEvent[] = [],
): AgentActivityStep[] {
  const steps: AgentActivityStep[] = [];

  const supervisorTask = tasks.find((t) => t.agentName === 'SupervisorAgent');
  const hotelTask = tasks.find((t) => t.agentName === 'HotelSearchAgent');

  if (!supervisorTask && !hotelTask) {
    return steps;
  }

  // 1. Determine destination (from tool.called argsPreview or task goal)
  let destination = 'Cancún';
  const toolCalled = events.find((e) => {
    if (e.type !== 'tool.called' || typeof e.payload !== 'object' || e.payload === null) {
      return false;
    }
    return (e.payload as { action?: string }).action === 'search_hotels';
  });

  const toolPayload = toolCalled?.payload as
    | { argsPreview?: Array<{ label?: string; name?: string; value?: string }> }
    | undefined;

  if (Array.isArray(toolPayload?.argsPreview)) {
    const destItem = toolPayload.argsPreview.find((a) => {
      const key = (a.name || a.label || '').toLowerCase();
      return key === 'destination' || key === 'destino';
    });
    if (destItem?.value && typeof destItem.value === 'string' && destItem.value.trim().length > 0) {
      destination = destItem.value.trim();
    }
  } else if (hotelTask) {
    const goalLower = hotelTask.goal.toLowerCase();
    if (goalLower.includes('cancún') || goalLower.includes('cancun')) {
      destination = 'Cancún';
    } else if (hotelTask.goal.includes('Demo Harbor')) {
      destination = 'Demo Harbor';
    } else {
      const match = hotelTask.goal.match(/en\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?:\s+para|\s+del|\s+desde|\s*$)/i);
      if (match && match[1]?.trim()) {
        destination = match[1].trim();
      }
    }
  }

  // 1. Supervisor — Analizando solicitud...
  if (supervisorTask) {
    const isSupervisorFailed = supervisorTask.status === 'failed';
    const isAnalyzed =
      !!hotelTask ||
      supervisorTask.status === 'completed' ||
      supervisorTask.status === 'awaiting_human_approval';

    steps.push({
      id: 'step-supervisor-analyzing',
      agentLabel: 'Supervisor',
      text: 'Analizando solicitud...',
      status: isSupervisorFailed
        ? 'failed'
        : isAnalyzed
        ? 'completed'
        : supervisorTask.status === 'running'
        ? 'running'
        : 'pending',
      timestamp: supervisorTask.createdAt,
    });
  }

  // 2. Agente de hoteles — Buscando hoteles en [Destination]...
  if (hotelTask) {
    const isHotelRunning = hotelTask.status === 'running';
    const isHotelCompleted = hotelTask.status === 'completed';
    const isHotelFailed = hotelTask.status === 'failed';

    steps.push({
      id: 'step-hotel-searching',
      agentLabel: 'Agente de hoteles',
      text: `Buscando hoteles en ${destination}...`,
      status: isHotelFailed
        ? 'failed'
        : isHotelCompleted
        ? 'completed'
        : isHotelRunning
        ? 'running'
        : 'pending',
      timestamp: hotelTask.startedAt || hotelTask.createdAt,
    });

    // 3. Agente de hoteles — 3 opciones encontradas
    if (isHotelCompleted) {
      steps.push({
        id: 'step-hotel-found',
        agentLabel: 'Agente de hoteles',
        text: '3 opciones encontradas',
        status: 'completed',
        timestamp: hotelTask.finishedAt,
      });
    }
  }

  // 4. Human approval step if applicable
  const approvalTask = tasks.find((t) => t.status === 'awaiting_human_approval');
  if (approvalTask) {
    steps.push({
      id: 'step-approval-wait',
      agentLabel: 'Supervisor',
      text: 'En espera de confirmación humana',
      status: 'pending',
    });
  }

  // 5. Supervisor — Respuesta preparada
  if (supervisorTask) {
    const isHotelCompleted = hotelTask?.status === 'completed';
    const isDirectCompletion = !hotelTask && supervisorTask.status === 'completed' && !approvalTask;

    if (isHotelCompleted || isDirectCompletion) {
      steps.push({
        id: 'step-supervisor-ready',
        agentLabel: 'Supervisor',
        text: 'Respuesta preparada',
        status: supervisorTask.status === 'completed' ? 'completed' : 'running',
        timestamp: supervisorTask.finishedAt,
      });
    }
  }

  return steps;
}

