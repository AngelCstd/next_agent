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

// 1. A single Supervisor task projects only its own turn.
{
  const scoped = scopeTasksToTurn([first], first.id);
  const steps = deriveAgentActivity(scoped);
  assert.deepEqual(scoped.map((task) => task.id), [first.id]);
  assert.equal(steps[0].status, 'completed');
}

// 2. A second turn reflects the second task, never the first match in conversation order.
{
  const scoped = scopeTasksToTurn([first, second], second.id);
  const steps = deriveAgentActivity(scoped);
  assert.deepEqual(scoped.map((task) => task.id), [second.id]);
  assert.equal(steps[0].status, 'running');
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
