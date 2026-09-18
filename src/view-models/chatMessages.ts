import type { AgentTask } from '../contracts';
import { projectTaskAssistantContent } from './chatProjection';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  taskId?: string;
  approvalId?: string;
  status?: 'pending' | 'completed' | 'failed';
}

export function mergeTaskAssistantMessages(
  messages: readonly ChatMessage[],
  tasks: readonly AgentTask[],
): ChatMessage[] {
  const updated = [...messages];

  for (const task of tasks) {
    const text = projectTaskAssistantContent(task);
    if (!text) continue;

    const taskMessage: ChatMessage = {
      id: `assistant-msg-${task.id}`,
      role: 'assistant',
      content: text,
      createdAt: task.finishedAt || task.createdAt,
      taskId: task.id,
      status: task.status === 'completed' ? 'completed' : 'failed',
    };
    const matchingIndexes = updated
      .map((message, index) => message.taskId === task.id ? index : -1)
      .filter((index) => index >= 0);

    if (matchingIndexes.length === 0) {
      updated.push(taskMessage);
      continue;
    }

    updated[matchingIndexes[0]] = taskMessage;
    for (let index = matchingIndexes.length - 1; index >= 1; index -= 1) {
      updated.splice(matchingIndexes[index], 1);
    }
  }

  return updated;
}
