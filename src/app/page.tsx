'use client';

import { FormEvent, useEffect, useState } from 'react';
import { clearAccessToken, getAccessToken, signIn } from '../auth/auth';
import type { AgentTask, ApprovalRequest } from '../contracts';
import { useChatSession } from '../hooks/useChatSession';
import { deriveAgentActivity, type AgentActivityStep } from '../view-models/agentActivity';

function ActivityCard({
  steps,
  isSending,
}: {
  steps: AgentActivityStep[];
  isSending: boolean;
}) {
  if (steps.length === 0) return null;

  const isRunning = isSending || steps.some((s) => s.status === 'running');

  return (
    <div className="max-w-xl bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-md space-y-2.5">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-sky-400 animate-pulse' : 'bg-emerald-400'
            }`}
          />
          <span className="font-semibold text-xs text-slate-300 uppercase tracking-wide">
            Actividad de Agentes
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          {isRunning ? 'En progreso...' : 'Completado'}
        </span>
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id} className="flex items-start gap-2.5 text-xs">
            <span className="mt-0.5 shrink-0">
              {step.status === 'completed' && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold text-[10px]">
                  ✓
                </span>
              )}
              {step.status === 'running' && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-950 text-sky-400 border border-sky-800 animate-pulse text-[10px]">
                  ●
                </span>
              )}
              {step.status === 'pending' && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                  ·
                </span>
              )}
              {step.status === 'failed' && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-950 text-rose-400 border border-rose-800 font-bold text-[10px]">
                  ✕
                </span>
              )}
            </span>
            <div className="flex-1 leading-snug">
              <span className="font-semibold text-slate-200">
                {step.agentLabel}
              </span>
              <span className="text-slate-500 mx-1.5">—</span>
              <span className={step.status === 'running' ? 'text-sky-300' : 'text-slate-300'}>
                {step.text}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({
  approval,
  submittingApprovalId,
  decideApproval,
}: {
  approval: ApprovalRequest;
  submittingApprovalId: string | null;
  decideApproval: (id: string, decision: 'approve' | 'reject') => Promise<void>;
}) {
  return (
    <div className="max-w-xl bg-slate-800/90 border border-amber-600/40 rounded-xl p-4 shadow-lg space-y-3">
      <div className="flex items-center justify-between border-b border-slate-700 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="font-semibold text-xs text-amber-300 tracking-wide uppercase">
            Aprobación Humana Requerida
          </span>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded font-medium ${
            approval.status === 'pending'
              ? 'bg-amber-950 text-amber-400 border border-amber-800'
              : approval.status === 'approved'
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              : 'bg-red-950 text-red-300 border border-red-800'
          }`}
        >
          {approval.status}
        </span>
      </div>

      <p className="text-xs text-slate-300">{approval.summary}</p>

      {/* Allowlisted Preview Fields */}
      <div className="bg-slate-900/80 rounded-lg p-2.5 border border-slate-800 space-y-1 text-xs">
        {approval.inputPreview.map((field, idx) => (
          <div key={idx} className="flex justify-between items-center py-0.5">
            <span className="text-slate-400">{field.label}:</span>
            <span
              className={`font-medium ${
                field.emphasis === 'warning'
                  ? 'text-amber-300 font-semibold'
                  : 'text-slate-200'
              }`}
            >
              {field.value}
            </span>
          </div>
        ))}
      </div>

      {/* Action Controls */}
      {approval.status === 'pending' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => decideApproval(approval.id, 'approve')}
            disabled={submittingApprovalId === approval.id}
            className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition shadow cursor-pointer"
          >
            {submittingApprovalId === approval.id ? 'Aprobando...' : 'Aprobar'}
          </button>
          <button
            onClick={() => decideApproval(approval.id, 'reject')}
            disabled={submittingApprovalId === approval.id}
            className="flex-1 py-1.5 px-3 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition shadow cursor-pointer"
          >
            {submittingApprovalId === approval.id ? 'Rechazando...' : 'Rechazar'}
          </button>
        </div>
      )}

      {approval.status === 'approved' && (
        <div className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
          ✓ Aprobado. Acción ejecutada en el adaptador de carrito.
        </div>
      )}

      {approval.status === 'rejected' && (
        <div className="text-xs text-rose-400 flex items-center gap-1 font-medium">
          ✕ Rechazado. Ninguna acción fue ejecutada en el adaptador.
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getAccessToken());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'agents' | 'tasks' | 'activity'>('agents');

  const {
    messages,
    tasks,
    approvals,
    events,
    isInitializing,
    isSending,
    submittingApprovalId,
    error: chatError,
    sseStatus,
    initConversation,
    sendMessage,
    decideApproval,
  } = useChatSession();

  const activitySteps = deriveAgentActivity(tasks, events);

  useEffect(() => {
    if (getAccessToken()) {
      void initConversation();
    }
  }, [initConversation]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const ok = await signIn(email, password);
      if (ok) {
        setIsAuthenticated(true);
        await initConversation();
      } else {
        setLoginError('Credenciales incorrectas o problema de autenticación.');
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Error de inicio de sesión');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearAccessToken();
    setIsAuthenticated(false);
    setEmail('');
    setPassword('');
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isSending) return;
    const msg = inputMessage;
    setInputMessage('');
    await sendMessage(msg);
  };

  const handleQuickPrompt = (prompt: string) => {
    if (isSending) return;
    void sendMessage(prompt);
  };

  // Find any active pending or related approvals
  const getApprovalForTask = (taskId?: string): ApprovalRequest | undefined => {
    if (!taskId) return undefined;
    return approvals.find((a) => a.taskId === taskId);
  };

  const isLatestMessageAssistant =
    messages.length > 0 && messages[messages.length - 1].role === 'assistant';
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant');

  // Approvals not yet attached to an assistant message in the feed
  const unattachedApprovals = approvals.filter(
    (a) => !messages.some((m) => m.taskId === a.taskId),
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">Noktos Agent V2</h1>
            <p className="text-sm text-slate-400 mt-1">Inicia sesión con tu cuenta de Supabase</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="viajero@ejemplo.com"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {loginError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-red-200 text-xs">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium rounded-lg shadow transition focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {isLoggingIn ? 'Iniciando sesión...' : 'Entrar a la Demo'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-700/60 text-center text-xs text-slate-500">
            Sesión temporal en memoria (V2-A Demo Baseline)
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 px-6 flex items-center justify-between backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg text-white tracking-tight">Noktos Agent</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-900/60 text-sky-400 border border-sky-700/50">
            V2-A Demo
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {/* SSE Badge */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                sseStatus === 'connected'
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                  : sseStatus === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-400'
              }`}
            />
            <span className="text-slate-400 capitalize">
              {sseStatus === 'connected' ? 'SSE Conectado' : sseStatus}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="px-2.5 py-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left / Central Column: Conversational Chat */}
        <section className="flex-1 flex flex-col border-r border-slate-800 bg-slate-900/40">
          {/* Quick Prompts Bar */}
          <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-slate-400 font-medium mr-1">Escenarios de demo:</span>
            <button
              onClick={() => handleQuickPrompt('demo:greeting')}
              disabled={isSending || isInitializing}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs rounded transition"
            >
              demo:greeting
            </button>
            <button
              onClick={() => handleQuickPrompt('demo:hotel-delegation')}
              disabled={isSending || isInitializing}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs rounded transition"
            >
              demo:hotel-delegation
            </button>
            <button
              onClick={() => handleQuickPrompt('demo:add-reservation-to-cart')}
              disabled={isSending || isInitializing}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-800/60 text-xs rounded transition"
            >
              demo:add-reservation-to-cart
            </button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isInitializing && (
              <div className="text-center py-8 text-sm text-slate-400 animate-pulse">
                Conectando con el agente y abriendo conversación...
              </div>
            )}

            {messages.length === 0 && !isInitializing && (
              <div className="text-center py-16 text-slate-500 text-sm max-w-sm mx-auto">
                Escribe un mensaje o presiona uno de los escenarios de demo superiores para iniciar la interacción.
              </div>
            )}

            {messages.map((msg, idx) => {
              const approval = getApprovalForTask(msg.taskId);
              const isTargetAssistantForActivity =
                isLatestMessageAssistant && idx === lastAssistantIndex;

              return (
                <div key={msg.id} className="space-y-3">
                  {/* Inline Agent Activity rendered right before the assistant response */}
                  {isTargetAssistantForActivity && activitySteps.length > 0 && (
                    <ActivityCard steps={activitySteps} isSending={isSending} />
                  )}

                  {/* Contextual Approval Card inside the Chat flow */}
                  {approval && (
                    <ApprovalCard
                      approval={approval}
                      submittingApprovalId={submittingApprovalId}
                      decideApproval={decideApproval}
                    />
                  )}

                  <div
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-xl rounded-2xl px-4 py-3 text-sm shadow-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-sky-600 text-white rounded-tr-none'
                          : 'bg-slate-800 border border-slate-700/80 text-slate-100 rounded-tl-none whitespace-pre-wrap'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })}

            {chatError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-red-300 text-xs">
                {chatError}
              </div>
            )}

            {/* If no assistant message has arrived yet (in progress or awaiting approval), render activity card here */}
            {!isLatestMessageAssistant && activitySteps.length > 0 && (
              <ActivityCard steps={activitySteps} isSending={isSending} />
            )}

            {/* Any unattached approvals (e.g. pending approval before task completion) */}
            {unattachedApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                submittingApprovalId={submittingApprovalId}
                decideApproval={decideApproval}
              />
            ))}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-900 flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Escribe tu consulta o instrucción..."
              disabled={isSending || isInitializing}
              className="flex-1 px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="submit"
              disabled={isSending || isInitializing || !inputMessage.trim()}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium text-sm rounded-xl transition shadow"
            >
              {isSending ? 'Enviando...' : 'Enviar'}
            </button>
          </form>
        </section>

        {/* Right Column: Multi-Agent Activity & Inspection Panel */}
        <aside className="w-80 border-l border-slate-800 bg-slate-900/60 flex flex-col">
          {/* Tab Switcher */}
          <div className="flex border-b border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('agents')}
              className={`flex-1 py-2.5 font-medium transition ${
                activeTab === 'agents'
                  ? 'text-sky-400 border-b-2 border-sky-500 bg-slate-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Agentes
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex-1 py-2.5 font-medium transition ${
                activeTab === 'tasks'
                  ? 'text-sky-400 border-b-2 border-sky-500 bg-slate-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tareas ({tasks.length})
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex-1 py-2.5 font-medium transition ${
                activeTab === 'activity'
                  ? 'text-sky-400 border-b-2 border-sky-500 bg-slate-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              SSE ({events.length})
            </button>
          </div>

          {/* Tab Content: Human-Readable Agents Panel */}
          {activeTab === 'agents' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Agent Roles Card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Agentes Participantes
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200">Supervisor</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800">
                      Coordinador
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200">Agente de hoteles</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      Búsqueda mock
                    </span>
                  </div>
                </div>
              </div>

              {/* Step Progression */}
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Progreso de Ejecución
                </div>
                {activitySteps.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    Envía una búsqueda para ver la coordinación de agentes en tiempo real.
                  </div>
                ) : (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 space-y-3">
                    {activitySteps.map((step) => (
                      <div key={step.id} className="flex items-start gap-2.5 text-xs">
                        <span className="mt-0.5 shrink-0">
                          {step.status === 'completed' && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold text-[10px]">
                              ✓
                            </span>
                          )}
                          {step.status === 'running' && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-950 text-sky-400 border border-sky-800 animate-pulse text-[10px]">
                              ●
                            </span>
                          )}
                          {step.status === 'pending' && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                              ·
                            </span>
                          )}
                          {step.status === 'failed' && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-950 text-rose-400 border border-rose-800 font-bold text-[10px]">
                              ✕
                            </span>
                          )}
                        </span>
                        <div className="flex-1 leading-snug">
                          <span className="font-semibold text-slate-200">
                            {step.agentLabel}
                          </span>
                          <span className="text-slate-500 mx-1.5">—</span>
                          <span className={step.status === 'running' ? 'text-sky-300' : 'text-slate-300'}>
                            {step.text}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab Content: Tasks Panel */}
          {activeTab === 'tasks' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {tasks.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500">
                  No hay tareas registradas aún.
                </div>
              ) : (
                tasks.map((task: AgentTask) => {
                  const isChild = !!task.parentTaskId;

                  return (
                    <div
                      key={task.id}
                      className={`p-3 rounded-lg border text-xs transition ${
                        isChild
                          ? 'ml-3 bg-slate-900/90 border-slate-800'
                          : 'bg-slate-850 bg-slate-800/70 border-slate-700/60 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {isChild && (
                            <span className="text-slate-500 text-[10px]">↳</span>
                          )}
                          <span className="font-semibold text-slate-200">
                            {task.agentName}
                          </span>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                            task.status === 'completed'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : task.status === 'running'
                              ? 'bg-sky-950 text-sky-400 border border-sky-800'
                              : task.status === 'awaiting_human_approval'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800 animate-pulse'
                              : task.status === 'failed'
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {task.status === 'awaiting_human_approval'
                            ? 'Aprobación'
                            : task.status}
                        </span>
                      </div>

                      <p className="text-slate-300 line-clamp-2">{task.goal}</p>

                      {task.result?.summary && (
                        <p className="mt-1.5 text-[11px] text-slate-400 italic">
                          Resumen: {task.result.summary}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab Content: Activity / SSE Debug Panel */}
          {activeTab === 'activity' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[11px]">
              {events.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  Esperando eventos por el stream SSE...
                </div>
              ) : (
                events.map((evt) => (
                  <div
                    key={evt.id || `${evt.seq}-${evt.type}`}
                    className="p-2 bg-slate-900 border border-slate-800 rounded text-slate-300"
                  >
                    <div className="flex justify-between items-center text-slate-500 text-[10px] mb-0.5">
                      <span>seq: {evt.seq}</span>
                      <span>{new Date(evt.occurredAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="font-semibold text-sky-400 text-xs">
                      {evt.type}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
