import type { AgentEvent, AgentTask } from '../contracts';

export interface AgentActivityStep {
  id: string;
  agentLabel: string;
  text: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  timestamp?: string;
}

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

function safeDestination(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 80 ||
    UUID_PATTERN.test(trimmed) ||
    /authContextId|[{}[\]"]/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function scopeTasksToTurn(
  tasks: readonly AgentTask[],
  taskId: string | undefined,
): AgentTask[] {
  if (!taskId) return [];

  const selectedTask = tasks.find((task) => task.id === taskId);
  if (!selectedTask) return [];

  const rootTask = selectedTask.parentTaskId
    ? tasks.find((task) => task.id === selectedTask.parentTaskId)
    : selectedTask;

  if (!rootTask) return [selectedTask];

  return tasks.filter(
    (task) => task.id === rootTask.id || task.parentTaskId === rootTask.id,
  );
}

export function scopeTasksToLatestTurn(tasks: readonly AgentTask[]): AgentTask[] {
  const latestRoot = tasks
    .filter((task) => !task.parentTaskId && task.agentName === 'SupervisorAgent')
    .reduce<AgentTask | undefined>((latest, task) => {
      if (!latest) return task;
      return Date.parse(task.createdAt) >= Date.parse(latest.createdAt) ? task : latest;
    }, undefined);

  return scopeTasksToTurn(tasks, latestRoot?.id);
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
  turnTasks: readonly AgentTask[],
  events: readonly AgentEvent[] = [],
): AgentActivityStep[] {
  const steps: AgentActivityStep[] = [];

  const supervisorTask = turnTasks.find((t) => t.agentName === 'SupervisorAgent');
  const hotelTask = turnTasks.find((t) => t.agentName === 'HotelSearchAgent');

  if (!supervisorTask && !hotelTask) {
    return steps;
  }

  // 1. Determine destination (from tool.called argsPreview or task goal)
  let destination = 'Cancún';
  const turnTaskIds = new Set(turnTasks.map((task) => task.id));
  const toolCalled = events.find((e) => {
    if (e.type !== 'tool.called' || typeof e.payload !== 'object' || e.payload === null) {
      return false;
    }
    const payload = e.payload as { action?: string; taskId?: string };
    return payload.action === 'search_hotels' &&
      typeof payload.taskId === 'string' &&
      turnTaskIds.has(payload.taskId);
  });

  const toolPayload = toolCalled?.payload as
    | { argsPreview?: Array<{ label?: string; name?: string; value?: string }> }
    | undefined;

  if (Array.isArray(toolPayload?.argsPreview)) {
    const destItem = toolPayload.argsPreview.find((a) => {
      const key = (a.name || a.label || '').toLowerCase();
      return key === 'destination' || key === 'destino';
    });
    destination = safeDestination(destItem?.value) ?? destination;
  } else if (hotelTask) {
    const goalLower = hotelTask.goal.toLowerCase();
    if (goalLower.includes('cancún') || goalLower.includes('cancun')) {
      destination = 'Cancún';
    } else if (hotelTask.goal.includes('Demo Harbor')) {
      destination = 'Demo Harbor';
    } else {
      const match = hotelTask.goal.match(/en\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?:\s+para|\s+del|\s+desde|\s*$)/i);
      if (match && match[1]?.trim()) {
        destination = safeDestination(match[1]) ?? destination;
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
  const approvalTask = turnTasks.find((t) => t.status === 'awaiting_human_approval');
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

