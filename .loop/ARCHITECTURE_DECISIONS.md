# Noktos Agent Next — Architecture Decisions

## D-001 - V2 Frontend Stack and Governance
- **Context:** Decided under P-001 and Q-P1 (2026-09-15).
- **Stack:** Next.js (App Router), TypeScript, React 18/19, `@supabase/supabase-js`.
- **Target Backend:** Talks directly to `noktos-agent-backend` via HTTP and SSE (`Q-P3`).
- **Session:** Memory-only session per `P-005`.
- **Assistant Projection:** Defensive narrowing under `Q-P2` (`isAnswerTextData` on `task.result.data.text` with fallback to `task.result.summary`).
- **Contracts:** Vendored read-only from `noktos-agent-backend/contracts/` (v1.0.0).
