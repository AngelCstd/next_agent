import assert from 'node:assert/strict';
import {
  deriveAgentActivity,
  scopeTasksToTurn,
} from '../src/view-models/agentActivity.ts';
import {
  createStartGuard,
  createStateRefreshScheduler,
  getStateRefreshKind,
} from '../src/hooks/stateRefresh.ts';
import { deriveInlineActivityPresentation } from '../src/view-models/inlineActivity.ts';
import { mergeTaskAssistantMessages } from '../src/view-models/chatMessages.ts';
import {
  isNearScrollBottom,
  shouldAutoScroll,
} from '../src/view-models/scrollBehavior.ts';

console.log('[test-conversation-request-volume-and-activity] Starting suite...');

const supervisorTask = (id, status, createdAt) => ({
  id,
  conversationId: 'conversation-fixture',
  agentName: 'SupervisorAgent',
  goal: `Turn for ${id}`,
  status,
  createdAt,
  ...(status === 'completed' ? { finishedAt: createdAt } : {}),
});

const first = supervisorTask('supervisor-first', 'completed', '2026-09-18T10:00:00.000Z');
const second = supervisorTask('supervisor-second', 'running', '2026-09-18T10:01:00.000Z');
const third = supervisorTask('supervisor-third', 'failed', '2026-09-18T10:02:00.000Z');

// Running activity is compact but fully visible; terminal activity starts collapsed.
{
  const runningSteps = deriveAgentActivity(scopeTasksToTurn([second], second.id));
  const running = deriveInlineActivityPresentation(runningSteps, false);
  assert.equal(running.mode, 'running');
  assert.equal(running.expanded, true);
  assert.equal(running.visibleSteps.length, runningSteps.length);

  const completedSteps = deriveAgentActivity(scopeTasksToTurn([first], first.id));
  const collapsed = deriveInlineActivityPresentation(completedSteps, false);
  assert.equal(collapsed.mode, 'completed');
  assert.equal(collapsed.expanded, false);
  assert.match(collapsed.summary, /Actividad de agentes · 2 pasos/);
  assert.deepEqual(collapsed.visibleSteps, []);

  const expanded = deriveInlineActivityPresentation(completedSteps, true);
  assert.equal(expanded.expanded, true);
  assert.deepEqual(expanded.visibleSteps, completedSteps);
  const collapsedAgain = deriveInlineActivityPresentation(completedSteps, !expanded.expanded);
  assert.equal(collapsedAgain.expanded, false);
  assert.deepEqual(collapsedAgain.visibleSteps, []);
}

// 1. A single Supervisor task projects only its own turn.
{
  const scoped = scopeTasksToTurn([first], first.id);
  const steps = deriveAgentActivity(scoped);
  assert.deepEqual(scoped.map((task) => task.id), [first.id]);
  assert.equal(steps[0].status, 'completed');
}

// Hotel delegation keeps Supervisor and HotelSearchAgent together for the selected turn.
{
  const cancunRoot = supervisorTask('supervisor-cancun', 'running', '2026-09-18T10:04:00.000Z');
  const cancunChild = {
    ...supervisorTask('hotel-cancun', 'running', '2026-09-18T10:04:01.000Z'),
    parentTaskId: cancunRoot.id,
    agentName: 'HotelSearchAgent',
    goal: 'Busca hoteles en Cancún para dos personas',
  };
  const steps = deriveAgentActivity(
    scopeTasksToTurn([first, cancunRoot, cancunChild], cancunRoot.id),
  );
  assert.deepEqual(steps.map((step) => step.agentLabel), ['Supervisor', 'Agente de hoteles']);
  assert.match(steps[1].text, /Cancún/);
}

// 2. A second turn reflects the second task, never the first match in conversation order.
{
  const scoped = scopeTasksToTurn([first, second], second.id);
  const steps = deriveAgentActivity(scoped);
  assert.deepEqual(scoped.map((task) => task.id), [second.id]);
  assert.equal(steps[0].status, 'running');
}

// Approval completion/rejection messages are non-empty, friendly, current and idempotent.
{
  const cartTask = {
    ...supervisorTask('cart-task', 'completed', '2026-09-18T10:05:00.000Z'),
    result: {
      kind: 'answer',
      data: { mock: true, cartItemId: 'cart-item-safe', status: 'added' },
      summary: 'La reservación ficticia se agregó al carrito.',
    },
  };
  let messages = [];
  messages = mergeTaskAssistantMessages(messages, [cartTask]);
  messages = mergeTaskAssistantMessages(messages, [cartTask]);
  messages = mergeTaskAssistantMessages(messages, [{
    ...cartTask,
    result: { ...cartTask.result, summary: 'La reservación ficticia ya está en el carrito.' },
  }]);
  assert.equal(messages.filter((message) => message.taskId === cartTask.id).length, 1);
  assert.equal(messages[0].content, 'La reservación ficticia ya está en el carrito.');

  const rejectedTask = {
    ...supervisorTask('rejected-task', 'failed', '2026-09-18T10:06:00.000Z'),
    failure: { code: 'APPROVAL_REJECTED', message: 'Approval was rejected.' },
  };
  messages = mergeTaskAssistantMessages(messages, [rejectedTask]);
  messages = mergeTaskAssistantMessages(messages, [rejectedTask]);
  const rejectionMessages = messages.filter((message) => message.taskId === rejectedTask.id);
  assert.equal(rejectionMessages.length, 1);
  assert.equal(rejectionMessages[0].content, 'No realicé la acción.');
  assert.doesNotMatch(rejectionMessages[0].content, /Approval|APPROVAL_REJECTED/);

  const duplicateSeed = [...messages, { ...messages[0], id: 'stale-duplicate' }];
  const deduplicated = mergeTaskAssistantMessages(duplicateSeed, [cartTask, rejectedTask]);
  assert.equal(deduplicated.filter((message) => message.taskId === cartTask.id).length, 1);
  assert.equal(deduplicated.filter((message) => message.taskId === rejectedTask.id).length, 1);
  for (const message of deduplicated) {
    assert.doesNotMatch(message.content, /authContextId|123e4567-e89b-12d3-a456-426614174000|[{].*[}]/i);
  }
}

// Sticky-bottom decisions preserve user control and re-arm after jumping to latest.
{
  assert.equal(isNearScrollBottom({ scrollTop: 804, scrollHeight: 1000, clientHeight: 100 }), true);
  assert.equal(isNearScrollBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 100 }), false);
  assert.equal(shouldAutoScroll(false), false);
  assert.equal(shouldAutoScroll(true), true);
}

// 3. A delegated HotelSearchAgent task projects with its Supervisor parent.
{
  const child = {
    id: 'hotel-child',
    parentTaskId: second.id,
    conversationId: 'conversation-fixture',
    agentName: 'HotelSearchAgent',
    goal: 'Busca hoteles en Mérida para dos personas',
    status: 'running',
    createdAt: '2026-09-18T10:01:01.000Z',
  };
  const allTasks = [first, second, child];

  for (const selectedId of [second.id, child.id]) {
    const scoped = scopeTasksToTurn(allTasks, selectedId);
    const steps = deriveAgentActivity(scoped);
    assert.deepEqual(scoped.map((task) => task.id), [second.id, child.id]);
    assert.deepEqual(steps.map((step) => step.agentLabel), ['Supervisor', 'Agente de hoteles']);
    assert.match(steps[1].text, /Mérida/);
  }
}

// 4. A third turn cannot mix tasks from either prior turn.
{
  const scoped = scopeTasksToTurn([first, second, third], third.id);
  const steps = deriveAgentActivity(scoped);
  assert.deepEqual(scoped.map((task) => task.id), [third.id]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].status, 'failed');
}

// 5. User-facing activity fields contain no internal identifiers or raw payload data.
{
  const internalUuid = '123e4567-e89b-12d3-a456-426614174000';
  const events = [{
    id: 'event-fixture',
    conversationId: 'conversation-fixture',
    type: 'tool.called',
    seq: 1,
    occurredAt: '2026-09-18T10:03:00.000Z',
    payload: {
      action: 'search_hotels',
      taskId: first.id,
      authContextId: internalUuid,
      argsPreview: [{ name: 'destination', value: `authContextId ${internalUuid} {"secret":true}` }],
    },
  }];
  const steps = deriveAgentActivity(scopeTasksToTurn([first], first.id), events);

  for (const step of steps) {
    const rendered = `${step.agentLabel} ${step.text}`;
    assert.doesNotMatch(rendered, /[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    assert.doesNotMatch(rendered, /authContextId/i);
    assert.doesNotMatch(rendered, /[{[]|"secret"/i);
  }
}

// 6. Eight task events in one debounce window produce one tasks refresh and no approvals refresh.
{
  assert.equal(getStateRefreshKind('approval.requested'), 'tasks-and-approvals');
  assert.equal(getStateRefreshKind('supervisor.delegated'), 'tasks-and-approvals');
  assert.equal(getStateRefreshKind('tool.called'), null);

  let taskRefreshes = 0;
  let approvalRefreshes = 0;
  const scheduler = createStateRefreshScheduler({
    delayMs: 10,
    refreshTasks: () => { taskRefreshes += 1; },
    refreshApprovals: () => { approvalRefreshes += 1; },
  });

  for (let index = 0; index < 8; index += 1) {
    const kind = getStateRefreshKind(index % 2 === 0 ? 'task.started' : 'task.completed');
    assert.equal(kind, 'tasks');
    scheduler.schedule(kind, 'conversation-fixture');
  }

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(taskRefreshes, 1);
  assert.equal(approvalRefreshes, 0);

  scheduler.schedule('tasks', 'conversation-fixture');
  scheduler.schedule('tasks-and-approvals', 'conversation-fixture');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(taskRefreshes, 2);
  assert.equal(approvalRefreshes, 1);
  scheduler.cancel();
}

// Strict Mode-style duplicate setup acquires the initializer only once.
{
  const guard = createStartGuard();
  let subscriptions = 0;
  if (guard.tryStart()) subscriptions += 1;
  if (guard.tryStart()) subscriptions += 1;
  assert.equal(subscriptions, 1);
}

console.log('[test-conversation-request-volume-and-activity] PASS');
