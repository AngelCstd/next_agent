# HANDOFF — next_agent (Noktos Agent Workspace, V2 frontend)

**Repo:** `next_agent` · **Remote:** `AngelCstd/next_agent` · **Branch:** `main`
**Baseline HEAD as of this handoff:** `de944f8` — `fix: stabilize chat auto-scroll and compact approval cards`

> This file is the canonical, git-tracked handoff for this repo. It does not depend on anything
> outside this repository (no workspace-root `PROGRESS.md`/`HANDOFF.md`). The companion backend
> repo (`noktos-agent-backend`) has its own canonical docs at `docs/workspace/PROGRESS.md` and
> `docs/workspace/HANDOFF.md` — read both when working across the two.

---

## 1. What this product actually is

**Noktos Agent Workspace** — not a generic multi-agent chatbot. It is a conversational and
operational interface where:

- a **Supervisor** agent coordinates specialized Noktos agents;
- the user converses normally, in natural language;
- the user can observe agent operational activity (who's working, on what, and its status);
- tasks/subagents execute observably, tracked as `AgentTask`s with parent/child correlation;
- sensitive actions require **human approval** before any real side effect;
- **OpenAI is a real, live LLM** (not scripted) behind the Supervisor and specialist agents;
- domain data (hotels, reservations) currently comes from **mocks** — Noktos Core does not exist as
  a real service anywhere in this workspace yet; real Noktos integration is a later milestone.

## 2. What's implemented and validated in this repo

- Supabase login (memory-only session — no `localStorage`, no cookies for the access token).
- Chat over the backend's HTTP + SSE API (`fetch` + `ReadableStream`, not `EventSource`, so a
  custom `Authorization` header and `Last-Event-ID` replay both work).
- Tasks and approvals projected from the backend's authoritative snapshots (SSE only *invalidates*;
  HTTP GET remains the source of truth).
- **Inline agent activity, strictly turn-scoped**: each assistant message resolves its own task
  family via `taskId`/`parentTaskId` (`scopeTasksToTurn`/`scopeTasksToLatestTurn` in
  `src/view-models/agentActivity.ts`) — never `agentName`, never "the latest task globally". While a
  turn is running it shows a compact live list; once done it collapses to one line
  (`✓ Actividad de agentes · N pasos`), expand/collapse per turn, closed by default.
  (`src/view-models/inlineActivity.ts`)
- **Approval cards**, same compact/collapsible pattern: full and actionable while `pending` (up to 4
  allowlisted `inputPreview` fields, Approve/Reject, submitting disables both buttons, no optimistic
  fake status), collapse to one line automatically once terminal (`approved`/`rejected`/`expired`/
  `superseded`), each card's expand state is fully independent.
  (`src/view-models/approvalPresentation.ts`)
- **Fixed-height chat layout with real internal scroll**: `.messages-feed` is the actual scroll
  container (not the page) — see `src/app/globals.css` for the `height`/`min-height: 0` chain.
- **Sticky-bottom auto-scroll** that survives its own smooth-scroll animation: a
  `isProgrammaticScrollRef` flag + the native `scrollend` event (with a timeout fallback) stop the
  scroll listener from mistaking the app's own animated scroll for the user scrolling away; a real
  wheel/touch/scrollbar interaction hands control back immediately. A discrete "↓ Ir al último
  mensaje" button appears when sticky-bottom is off. (`src/view-models/scrollBehavior.ts`,
  wired in `src/app/page.tsx`)
- **No demo buttons in the UI** — the "Escenarios de demo" block was removed from the visible
  chat. Typing `demo:greeting`, `demo:hotel-delegation`, or `demo:add-reservation-to-cart` directly
  into the message box still works (the backend's `demo:` prefix short-circuit is untouched;
  nothing about that fallback capability was removed, only its dedicated UI buttons).
- **Natural Spanish chat copy** (no more `"Fictional mock hotel search queued with
  HotelSearchAgent."` verbatim in chat) — see the backend's own HANDOFF for where this text
  actually lives (`SupervisorTaskProcessor`'s `data.text`); this repo's projection
  (`src/view-models/chatProjection.ts`) already prefers `data.text` over `summary` whenever
  present, unconditionally on `result.kind`.
- **Request coalescing**: `src/hooks/stateRefresh.ts` classifies SSE events (`task.*` → tasks-only
  refresh, `approval.*`/`supervisor.*` → tasks+approvals) and debounces bursts (125ms) instead of
  firing a fresh `GET` pair per event; `sendMessage`/`decideApproval` no longer also fire an
  immediate redundant refresh — the SSE stream drives it.
- **Dev-mode double-init guard**: `initConversation()` won't create a second conversation/SSE
  connection if React Strict Mode double-invokes the mount effect (`createStartGuard` in
  `src/hooks/stateRefresh.ts`).
- **Assistant-message dedupe by `taskId`**: `mergeTaskAssistantMessages`
  (`src/view-models/chatMessages.ts`) replaces (never duplicates) a task's projected message on
  repeated refreshes, and cleans up any stale duplicate it finds.
- Basic Markdown rendering in chat messages (bold/italic/inline code/paragraphs/one-level lists;
  dependency-free, plain React text nodes — no `dangerouslySetInnerHTML`, so no new XSS surface).

None of this claims production-readiness. It is a functional, validated demo baseline.

## 3. How to run it

```bash
npm install         # if node_modules isn't already present
npm run dev          # http://localhost:3001 (fixed port, see package.json)
```

Other scripts: `npm run build` (runs `verify:contracts` then `next build`), `npm test` (runs the
`.mjs` suites under `scripts/` via `tsx`), `npm run lint`.

### Required environment (`.env.local`, gitignored — never commit real values, never write them
into this or any other doc)

```
NEXT_PUBLIC_SUPABASE_URL=<your Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon/public key — never the service_role key>
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
```

All three are read in `src/auth/auth.ts` and `src/hooks/useChatSession.ts`. Any value prefixed
`NEXT_PUBLIC_` is bundled into client JS — never put a secret behind that prefix.

### Connecting to the backend

Point `NEXT_PUBLIC_BACKEND_URL` at a running `noktos-agent-backend` (see that repo's own
`docs/workspace/HANDOFF.md` for how to start it, including the `LLM_PROVIDER=openai` vs
`LLM_PROVIDER=demo-provider` choice). This repo has no fallback if the backend isn't reachable —
`initConversation()` will surface an error.

## 4. Known pre-existing environment quirk (not a bug, don't "fix" it)

`npm run verify:contracts` / `npm run build` report the 7 vendored `src/contracts/*.ts` files as
"MODIFIED" on a fresh Windows checkout. This repo has no `.gitattributes` (unlike the other three
Noktos repos), so `core.autocrlf` converts the vendored contracts to CRLF on checkout while
`contracts.lock`'s hashes were computed against LF bytes. Confirmed harmless: `git diff` against
`src/contracts/` shows zero real content drift. If this becomes annoying, the correct fix is adding
a `.gitattributes` normalizing `src/contracts/**` (and ideally everything) to LF — that's a `D-017`
(contracts-governance)-adjacent decision belonging to a human, not something to silently patch.

## 5. Smoke test (manual, current)

1. Login with a Supabase test user.
2. Send a plain message ("hola") — Supervisor responds, activity shows compact then collapses.
3. Send "Busca hoteles en Cancún para dos personas" — Supervisor delegates
   (`HotelSearchAgent` appears in activity while running), hotel results render naturally in chat
   once the child task completes, activity for that turn collapses.
4. Trigger a cart approval — approval card appears compact and actionable; Approve → mock cart
   executes exactly once, approval card collapses, a natural-language confirmation appears in chat
   exactly once.
5. Trigger another approval, Reject — no mock execution, a clear natural-language "no se realizó la
   acción" style message appears exactly once.
6. Confirm throughout: no UUID, `authContextId`, `approvalId`, `taskId`, `payloadHash`, raw JSON, or
   chain-of-thought is ever visible in the chat or activity UI.
7. Send enough messages to exceed the visible chat height: the *page* must not grow — only
   `.messages-feed` scrolls internally; scrolling up suspends auto-scroll and shows "↓ Ir al último
   mensaje"; clicking it returns to bottom and re-arms auto-follow.

## 6. Out of scope right now (deliberately deferred, see backend's canonical PROGRESS.md for the
full cross-repo list and rationale)

Multi-turn memory (next milestone after concurrency), entity/result selection ("el segundo hotel"),
`TravelerAgent`/`ReservationAgent`, LangGraph/LangChain, MCP, real Noktos integration, durable
persistence, multi-provider LLM, RAG/embeddings, full branding, production hardening, advanced
RBAC, production observability.

---

## RESUME FROM HERE

**NEXT ACTION: implement non-blocking conversation / concurrent turns.**

This is the next and only immediate milestone. It is already decided — do not re-open the roadmap
discussion, do not ask what to build next.

**FIRST**, read, in this order: this repo's `CLAUDE.md` and `AGENTS.md` (governance — Claude Code
is Supervisor/Orchestrator here, not the product-code implementer; use Codex CLI for product code
per the pattern already established in this repo's git history), this file in full, and the
backend's `noktos-agent-backend/docs/workspace/PROGRESS.md` + `docs/workspace/HANDOFF.md` (the
canonical cross-repo product-decision record).

**THEN, before writing any code**: inspect what's actually there.
- Does the current UI/state model already tolerate sending a new message while a prior turn's child
  task (e.g. `HotelSearchAgent`) is still `running`? Check `useChatSession.ts` (is `sendMessage`
  gated on `isSending` in a way that blocks a *new* root task, or only in a way that prevents
  double-submitting the *same* message?) and `page.tsx` (is the input actually disabled while a
  background task runs, beyond the already-fixed `isInitializing`-only disable?).
- Does the activity/message projection already correctly attribute an async child-task result
  arriving *after* a later message was sent, to its *original* turn? (`scopeTasksToTurn` keys by
  the specific message's own `taskId` + `parentTaskId` already — this may already be correct;
  verify with a concrete scenario before assuming it needs a change.)

**Concrete target scenario to validate against** (from the product owner, verbatim intent):

```
User: "Busca hoteles en Cancún."
Supervisor: "Estoy buscando opciones..."
Activity: ● Agente de hoteles — buscando...
[while still running]
User: "¿Sigues ahí?"
Supervisor: "Sí, sigo aquí. El agente de hoteles continúa trabajando."
[later]
HotelSearchAgent completes -> its result renders attached to the ORIGINAL search turn,
not mixed into "¿Sigues ahí?"'s turn.
```

**Design principles** (do not violate any of these):
- A running child task must never block the message input.
- Each user message may create its own root (`SupervisorAgent`) task.
- Every turn keeps its own root task id; children relate via `parentTaskId` (this already exists on
  `AgentTask` — no new contract field expected, but confirm before assuming).
- Async results return to the correct originating turn — never "the latest task globally", never
  keyed by `agentName`.
- No duplicate messages from repeated SSE-triggered refreshes (the existing `mergeTaskAssistantMessages`
  dedupe-by-`taskId` should already cover this — verify it still holds under concurrency, don't
  assume it silently breaks).

**Do NOT regress anything already working**: `de944f8` and its ancestors (scroll fixes, compact/
collapsible activity and approval cards, request coalescing, dev double-init guard, natural chat
copy). Re-run the existing test suites and the smoke test above after any change, not just new
tests for concurrency.

**Use Codex CLI (`codex exec --sandbox workspace-write`) for any actual product-code
implementation**, per this repo's own `CLAUDE.md`/`AGENTS.md` — you (Claude Code) inspect, scope,
launch, review diffs, run verification yourself independently (don't just trust the implementer's
own self-reported test results — this session found and had to send back a real Nest DI wiring bug
in the backend that `tsc`+tests didn't catch, only actually booting the app did; apply the same
"trust but verify" discipline here), and commit only once everything is green.

**On the backend side of this same milestone** (only if the frontend milestone actually needs a
backend change — inspect before assuming): check whether `noktos-agent-backend` already supports
multiple concurrent root tasks per `conversationId` (look at `MessageSubmissionService`, `TaskQueueService`,
`SupervisorTaskProcessor`, the task/conversation stores, and whether anything serializes processing
per-conversation rather than per-task). If it already does, don't redesign it. If there's artificial
serialization, make the minimal change — and keep the execution chokepoint
(`ToolInvoker`/`PolicyEngine`/`ApprovalEngine`/`ExecutorRegistry`) exactly as-is regardless.

**Explicitly do NOT, in this pass**: start multi-turn memory, add MCP, add LangGraph/LangChain, or
refactor anything unrelated to concurrency. Stop once the concurrency milestone is green (existing
tests + new concurrency tests + manual smoke test), report, and let the human decide when to start
memory.

### Roadmap after this milestone (decided, sequenced — do not collapse into one pass)

1. **Non-blocking conversation / concurrent turns** ← you are here
2. Multi-turn memory, minimal, in-memory (already implemented once for hotel-search grounding in
   the backend, commit `30b400c`/`594468e` on `loop/agent-backend` — this next step is about
   extending/confirming it holds under concurrent turns, not building it from zero)
3. Entity/result selection ("el segundo", "ese hotel")
4. `TravelerAgent`
5. `ReservationAgent` (full)
6. Durable persistence
7. Real Noktos integration

MCP (a future `Noktos MCP Server` as a standard capabilities layer, reached via `ToolInvoker` →
`MCP Client` → `Noktos MCP Server` — **never** LLM → MCP directly, which would bypass the
chokepoint) is a later architectural direction, not scheduled before memory. Do not implement it
now.

---

## NEXT CHAT STARTER PROMPT

Copy-paste this to start the next session:

> Lee `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md` de `next_agent` y de `noktos-agent-backend`
> (`docs/workspace/PROGRESS.md` + `docs/workspace/HANDOFF.md`). Usa Git (`git log`, `git status`,
> `git branch --show-current`) como autoridad para el HEAD y estado real de cada repo — no asumas
> que los hashes en la documentación siguen siendo el HEAD actual. Sigue la sección "RESUME FROM
> HERE" de `next_agent/HANDOFF.md` al pie de la letra. No revises el roadmap desde cero ni me
> preguntes qué sigue: el próximo milestone ya está decidido — **non-blocking conversation /
> concurrent turns**. Actúa como Supervisor/Orchestrator (no implementes código de producto tú
> mismo), usa Codex CLI para cualquier cambio de código real en ambos repos, verifica todo de forma
> independiente (no confíes solo en el self-report del implementer — arrancar la app de verdad
> importa, no solo compilar/testear), y repórtame solo al final.
