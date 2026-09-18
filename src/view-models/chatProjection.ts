import type { AgentTask } from '../contracts/task';

export function isAnswerTextData(data: unknown): data is { text: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'text' in data &&
    typeof (data as { text: unknown }).text === 'string' &&
    (data as { text: string }).text.trim().length > 0
  );
}

export function projectTaskAssistantContent(task: AgentTask): string | null {
  if (task.status === 'completed' && task.result) {
    if (isAnswerTextData(task.result.data)) {
      return task.result.data.text;
    }
    return task.result.summary;
  }

  if (task.status === 'failed' && task.failure) {
    if (task.failure.code === 'APPROVAL_REJECTED') {
      return 'No realicé la acción.';
    }
    return task.failure.message;
  }

  return null;
}
