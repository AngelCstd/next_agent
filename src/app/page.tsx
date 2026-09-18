'use client';

import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { clearAccessToken, getAccessToken, signIn } from '../auth/auth';
import type { AgentTask, ApprovalRequest } from '../contracts';
import { useChatSession } from '../hooks/useChatSession';
import {
  deriveAgentActivity,
  scopeTasksToLatestTurn,
  scopeTasksToTurn,
  type AgentActivityStep,
} from '../view-models/agentActivity';

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const tokens = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g);

  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={key}>{token.slice(1, -1)}</code>;
    }

    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }

    if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }

    return token;
  });
}

function renderMarkdown(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    if (lines[index].trim() === '') {
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(lines[index])) {
      const items: string[] = [];

      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ''));
        index += 1;
      }

      const blockKey = `list-${blocks.length}`;
      blocks.push(
        <ul key={blockKey}>
          {items.map((item, itemIndex) => (
            <li key={`${blockKey}-${itemIndex}`}>
              {renderInlineMarkdown(item, `${blockKey}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !/^[-*]\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    const blockKey = `paragraph-${blocks.length}`;
    blocks.push(
      <p key={blockKey}>
        {renderInlineMarkdown(paragraphLines.join('\n'), blockKey)}
      </p>,
    );
  }

  return blocks;
}

function StepMark({ status }: { status: AgentActivityStep['status'] }) {
  const marks: Record<AgentActivityStep['status'], string> = {
    completed: '✓',
    running: '●',
    pending: '·',
    failed: '×',
  };

  return <span className={`step-mark ${status}`}>{marks[status]}</span>;
}

function ActivitySteps({ steps }: { steps: AgentActivityStep[] }) {
  return (
    <div className="activity-steps">
      {steps.map((step) => (
        <div key={step.id} className="activity-step">
          <StepMark status={step.status} />
          <div>
            <span className="step-agent">{step.agentLabel}</span>
            <span className="step-divider">—</span>
            <span className={`step-text ${step.status}`}>{step.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityCard({
  steps,
  isSending,
}: {
  steps: AgentActivityStep[];
  isSending: boolean;
}) {
  if (steps.length === 0) return null;

  const isRunning = isSending || steps.some((step) => step.status === 'running');

  return (
    <div className="activity-card">
      <div className="activity-header">
        <span className="activity-title">Actividad de Agentes</span>
        <span className="activity-state">
          {isRunning ? 'En progreso...' : 'Completado'}
        </span>
      </div>
      <ActivitySteps steps={steps} />
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
    <div className="approval-card">
      <div className="approval-header">
        <span className="approval-title">! Aprobación Humana Requerida</span>
        <span className="approval-status">{approval.status}</span>
      </div>

      <div className="approval-body">
        <p className="approval-summary">{approval.summary}</p>

        {/* Only declared-safe, allowlisted preview fields are rendered here. */}
        <div className="approval-preview">
          {approval.inputPreview.map((field, idx) => (
            <div key={idx} className="preview-row">
              <span className="preview-label">{field.label}:</span>
              <span
                className={`preview-value ${
                  field.emphasis === 'warning' ? 'warning' : ''
                }`}
              >
                {field.value}
              </span>
            </div>
          ))}
        </div>

        {approval.status === 'pending' && (
          <div className="approval-actions">
            <button
              type="button"
              onClick={() => decideApproval(approval.id, 'reject')}
              disabled={submittingApprovalId === approval.id}
              className="approval-button reject"
            >
              {submittingApprovalId === approval.id ? 'Rechazando...' : 'Rechazar'}
            </button>
            <button
              type="button"
              onClick={() => decideApproval(approval.id, 'approve')}
              disabled={submittingApprovalId === approval.id}
              className="approval-button"
            >
              {submittingApprovalId === approval.id ? 'Aprobando...' : 'Aprobar'}
            </button>
          </div>
        )}

        {approval.status === 'approved' && (
          <div className="approval-result">
            ✓ Aprobado. Acción ejecutada en el adaptador de carrito.
          </div>
        )}

        {approval.status === 'rejected' && (
          <div className="approval-result">
            × Rechazado. Ninguna acción fue ejecutada en el adaptador.
          </div>
        )}
      </div>
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
  const [activeTab, setActiveTab] = useState<'agents' | 'tasks'>('agents');
  const messagesFeedRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

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

  const latestTurnActivitySteps = deriveAgentActivity(scopeTasksToLatestTurn(tasks), events);
  const sidebarActivitySteps = deriveAgentActivity(tasks, events);

  useEffect(() => {
    if (getAccessToken()) {
      void initConversation();
    }
  }, [initConversation]);

  useEffect(() => {
    const feed = messagesFeedRef.current;
    if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }
  }, [messages.length, approvals.length, latestTurnActivitySteps.length]);

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
    messageInputRef.current?.focus();
    try {
      await sendMessage(msg);
    } finally {
      messageInputRef.current?.focus();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    if (isSending) return;
    void sendMessage(prompt);
  };

  const getApprovalForTask = (taskId?: string): ApprovalRequest | undefined => {
    if (!taskId) return undefined;
    return approvals.find((approval) => approval.taskId === taskId);
  };

  const isLatestMessageAssistant =
    messages.length > 0 && messages[messages.length - 1].role === 'assistant';
  const unattachedApprovals = approvals.filter(
    (approval) => !messages.some((message) => message.taskId === approval.taskId),
  );

  if (!isAuthenticated) {
    return (
      <main className="login-screen">
        <section className="login-panel" aria-labelledby="login-title">
          <header className="login-header">
            <h1 id="login-title" className="login-title">Noktos Agent V2</h1>
            <p className="login-subtitle">Inicia sesión con tu cuenta de Supabase</p>
          </header>

          <form onSubmit={handleLogin} className="login-form">
            <div>
              <label htmlFor="email" className="field-label">Correo Electrónico</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="viajero@ejemplo.com"
                className="terminal-input"
              />
            </div>

            <div>
              <label htmlFor="password" className="field-label">Contraseña</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="terminal-input"
              />
            </div>

            {loginError && <div className="error-box">{loginError}</div>}

            <button type="submit" disabled={isLoggingIn} className="terminal-button">
              {isLoggingIn ? 'Iniciando sesión...' : 'Entrar a la Demo'}
            </button>
          </form>

          <footer className="login-footer">
            Sesión temporal en memoria (V2-A Demo Baseline)
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main className="terminal-shell">
      <header className="terminal-header">
        <div className="brand-lockup">
          <span className="brand">Noktos Agent</span>
          <span className="environment-tag">V2-A Demo</span>
        </div>

        <div className="header-actions">
          <div className="stream-status">
            <span className={`status-mark ${sseStatus}`} aria-hidden="true">
              {sseStatus === 'connected' ? '✓' : sseStatus === 'connecting' ? '●' : '×'}
            </span>
            <span>{sseStatus === 'connected' ? 'SSE Conectado' : sseStatus}</span>
          </div>
          <button type="button" onClick={handleLogout} className="text-button">
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="workspace">
        <section className="terminal-panel chat-panel" aria-labelledby="chat-heading">
          <h1 id="chat-heading" className="panel-label">Chat</h1>

          <div className="quick-prompts">
            <span className="quick-prompts-label">Escenarios de demo:</span>
            <button
              type="button"
              onClick={() => handleQuickPrompt('demo:greeting')}
              disabled={isSending || isInitializing}
              className="terminal-button quick-button"
            >
              demo:greeting
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt('demo:hotel-delegation')}
              disabled={isSending || isInitializing}
              className="terminal-button quick-button"
            >
              demo:hotel-delegation
            </button>
            <button
              type="button"
              onClick={() => handleQuickPrompt('demo:add-reservation-to-cart')}
              disabled={isSending || isInitializing}
              className="terminal-button quick-button approval-trigger"
            >
              demo:add-reservation-to-cart
            </button>
          </div>

          <div ref={messagesFeedRef} className="messages-feed" aria-live="polite">
            {isInitializing && (
              <div className="loading-state">
                Conectando con el agente y abriendo conversación...
              </div>
            )}

            {messages.length === 0 && !isInitializing && (
              <div className="empty-state">
                Escribe un mensaje o presiona uno de los escenarios de demo superiores para iniciar la interacción.
              </div>
            )}

            {messages.map((msg, idx) => {
              const approval = getApprovalForTask(msg.taskId);
              const turnActivitySteps = msg.role === 'assistant'
                ? deriveAgentActivity(scopeTasksToTurn(tasks, msg.taskId), events)
                : [];
              const isLatestMessage = idx === messages.length - 1;

              return (
                <div key={msg.id} className="message-group">
                  {turnActivitySteps.length > 0 && (
                    <ActivityCard
                      steps={turnActivitySteps}
                      isSending={isSending && isLatestMessage}
                    />
                  )}

                  {approval && (
                    <ApprovalCard
                      approval={approval}
                      submittingApprovalId={submittingApprovalId}
                      decideApproval={decideApproval}
                    />
                  )}

                  <div className={`message-row ${msg.role}`}>
                    <span className="message-author">
                      {msg.role === 'user' ? 'Tú:' : 'Noktos:'}
                    </span>
                    <div className="message-content">{renderMarkdown(msg.content)}</div>
                  </div>
                </div>
              );
            })}

            {chatError && <div className="error-box">{chatError}</div>}

            {!isLatestMessageAssistant && latestTurnActivitySteps.length > 0 && (
              <ActivityCard steps={latestTurnActivitySteps} isSending={isSending} />
            )}

            {unattachedApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                submittingApprovalId={submittingApprovalId}
                decideApproval={decideApproval}
              />
            ))}
          </div>

          <form onSubmit={handleSendMessage} className="chat-form">
            <input
              ref={messageInputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Escribe tu consulta o instrucción..."
              aria-label="Mensaje"
              disabled={isInitializing}
              className="terminal-input"
            />
            <button
              type="submit"
              disabled={isSending || isInitializing || !inputMessage.trim()}
              className="terminal-button"
            >
              {isSending ? 'Enviando...' : 'Enviar'}
            </button>
          </form>
        </section>

        <aside className="terminal-panel sidebar" aria-label="Inspección de agentes y actividad">
          <div className="panel-label">Agentes / Actividad</div>

          <div className="tabs" role="tablist" aria-label="Panel lateral">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'agents'}
              onClick={() => setActiveTab('agents')}
              className={`tab ${activeTab === 'agents' ? 'active' : ''}`}
            >
              Agentes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'tasks'}
              onClick={() => setActiveTab('tasks')}
              className={`tab ${activeTab === 'tasks' ? 'active' : ''}`}
            >
              Tareas ({tasks.length})
            </button>
          </div>

          {activeTab === 'agents' && (
            <div className="sidebar-content" role="tabpanel">
              <section className="sidebar-section">
                <h2 className="section-heading">Agentes Participantes</h2>
                <div className="boxed-list">
                  <div className="agent-row">
                    <span className="agent-name">Supervisor</span>
                    <span className="agent-role">Coordinador</span>
                  </div>
                  <div className="agent-row">
                    <span className="agent-name">Agente de hoteles</span>
                    <span className="agent-role">Búsqueda mock</span>
                  </div>
                </div>
              </section>

              <section className="sidebar-section">
                <h2 className="section-heading">Progreso de Ejecución</h2>
                {sidebarActivitySteps.length === 0 ? (
                  <div className="empty-state">
                    Envía una búsqueda para ver la coordinación de agentes en tiempo real.
                  </div>
                ) : (
                  <div className="boxed-list progress-list">
                    <ActivitySteps steps={sidebarActivitySteps} />
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="sidebar-content" role="tabpanel">
              {tasks.length === 0 ? (
                <div className="empty-state">No hay tareas registradas aún.</div>
              ) : (
                <div className="task-list">
                  {tasks.map((task: AgentTask) => {
                    const isChild = !!task.parentTaskId;

                    return (
                      <article key={task.id} className={`task-card ${isChild ? 'child' : ''}`}>
                        <div className="task-heading">
                          <span className="task-agent">
                            {isChild && '↳ '}{task.agentName}
                          </span>
                          <span
                            className={`task-status ${
                              task.status === 'awaiting_human_approval' ? 'approval' : ''
                            }`}
                          >
                            {task.status === 'awaiting_human_approval'
                              ? 'Aprobación'
                              : task.status}
                          </span>
                        </div>
                        <p className="task-goal">{task.goal}</p>
                        {task.result?.summary && (
                          <p className="task-summary">Resumen: {task.result.summary}</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </aside>
      </div>
    </main>
  );
}
