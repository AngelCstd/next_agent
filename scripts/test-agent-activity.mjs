import assert from 'node:assert/strict';
import { deriveAgentActivity } from '../src/view-models/agentActivity.ts';

console.log('[test-agent-activity] Starting suite...');

// Test 1: Empty tasks
{
  const steps = deriveAgentActivity([], []);
  assert.equal(steps.length, 0, 'Should return empty array when no tasks');
}

// Test 2: Supervisor analyzing
{
  const tasks = [{
    id: 'task-sup-1',
    conversationId: 'conv-1',
    agentName: 'SupervisorAgent',
    goal: 'Busca hoteles en Cancún',
    status: 'running',
    createdAt: '2026-09-17T12:00:00.000Z',
  }];
  const steps = deriveAgentActivity(tasks, []);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].agentLabel, 'Supervisor');
  assert.equal(steps[0].text, 'Analizando solicitud...');
  assert.equal(steps[0].status, 'running');
}

// Test 3: HotelSearchAgent running (Supervisor analyzed, Hotel agent searching)
{
  const tasks = [
    {
      id: 'task-sup-1',
      conversationId: 'conv-1',
      agentName: 'SupervisorAgent',
      goal: 'Busca hoteles en Cancún',
      status: 'completed',
      createdAt: '2026-09-17T12:00:00.000Z',
    },
    {
      id: 'task-hotel-1',
      parentTaskId: 'task-sup-1',
      conversationId: 'conv-1',
      agentName: 'HotelSearchAgent',
      goal: 'Busca hoteles en Cancún para dos personas',
      status: 'running',
      createdAt: '2026-09-17T12:00:01.000Z',
    },
  ];
  const steps = deriveAgentActivity(tasks, []);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].agentLabel, 'Supervisor');
  assert.equal(steps[0].text, 'Analizando solicitud...');
  assert.equal(steps[0].status, 'completed');

  assert.equal(steps[1].agentLabel, 'Agente de hoteles');
  assert.equal(steps[1].text, 'Buscando hoteles en Cancún...');
  assert.equal(steps[1].status, 'running');
}

// Test 4: Full multi-agent delegation completed with 3 options
{
  const tasks = [
    {
      id: 'task-sup-1',
      conversationId: 'conv-1',
      agentName: 'SupervisorAgent',
      goal: 'Busca hoteles en Cancún',
      status: 'completed',
      createdAt: '2026-09-17T12:00:00.000Z',
    },
    {
      id: 'task-hotel-1',
      parentTaskId: 'task-sup-1',
      conversationId: 'conv-1',
      agentName: 'HotelSearchAgent',
      goal: 'Busca hoteles en Cancún para dos personas',
      status: 'completed',
      createdAt: '2026-09-17T12:00:01.000Z',
    },
  ];
  const steps = deriveAgentActivity(tasks, []);
  assert.equal(steps.length, 4);
  assert.equal(steps[0].agentLabel, 'Supervisor');
  assert.equal(steps[0].text, 'Analizando solicitud...');
  assert.equal(steps[0].status, 'completed');

  assert.equal(steps[1].agentLabel, 'Agente de hoteles');
  assert.equal(steps[1].text, 'Buscando hoteles en Cancún...');
  assert.equal(steps[1].status, 'completed');

  assert.equal(steps[2].agentLabel, 'Agente de hoteles');
  assert.equal(steps[2].text, '3 opciones encontradas');
  assert.equal(steps[2].status, 'completed');

  assert.equal(steps[3].agentLabel, 'Supervisor');
  assert.equal(steps[3].text, 'Respuesta preparada');
  assert.equal(steps[3].status, 'completed');

  // Verify safety: no UUIDs or secrets in user-facing texts
  for (const step of steps) {
    assert.ok(!step.text.includes('task-'), 'Step text must not leak UUIDs');
    assert.ok(!step.text.includes('conv-'), 'Step text must not leak UUIDs');
  }
}

// Test 5: Awaiting human approval step
{
  const tasks = [
    {
      id: 'task-sup-cart',
      conversationId: 'conv-1',
      agentName: 'SupervisorAgent',
      goal: 'demo:add-reservation-to-cart',
      status: 'awaiting_human_approval',
      createdAt: '2026-09-17T12:00:00.000Z',
    },
  ];
  const steps = deriveAgentActivity(tasks, []);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].agentLabel, 'Supervisor');
  assert.equal(steps[0].text, 'Analizando solicitud...');
  assert.equal(steps[0].status, 'completed');

  assert.equal(steps[1].agentLabel, 'Supervisor');
  assert.equal(steps[1].text, 'En espera de confirmación humana');
  assert.equal(steps[1].status, 'pending');
}

console.log('[test-agent-activity] PASS - All agent activity derivations are verified safe and correct.');

