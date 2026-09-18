# PROGRESS — next_agent

Local, git-tracked progress log for this repo. For cross-repo product decisions (`P-xxx`) and the
full V2 milestone history, the canonical record is
`noktos-agent-backend/docs/workspace/PROGRESS.md` — this file does not repeat that history, only
this repo's own state, so a session opening `next_agent` alone still has what it needs.

## Current state (2026-09-18)

**HEAD:** `de944f8` on `main` (`AngelCstd/next_agent`). Working tree clean at the time of writing —
confirm with `git status`/`git log -5 --oneline` before trusting this, per the resume instructions
in `HANDOFF.md`.

**Status: functional demo baseline, UX-hardened.** V2-A (Next.js chat/tasks/approvals/activity
against the real backend) has been complete for a while; this session's work was a UX/reliability
pass on top of it, not new features:

| Commit | What |
|---|---|
| `de944f8` | Fix: sticky-bottom auto-scroll no longer confused by its own smooth-scroll animation; approval cards compact while pending, collapse automatically once terminal. |
| `f79bdb3` | Fix: chat viewport is a real fixed-height, internally-scrolling container (`.messages-feed`) instead of growing the whole page with message history. |
| `7ad7738` | Feat: removed visible demo buttons; compact/collapsible turn-scoped activity; friendlier approval/rejection chat copy; dedupe-safe message merging; first pass at sticky-bottom auto-scroll. |
| `6e4d13d` | Fix: eliminated an SSE-event-driven request storm (event classification + debouncing) and a stale-activity bug (`.find()` always returning turn 1's task — replaced with `scopeTasksToTurn`/`scopeTasksToLatestTurn`, keyed by `taskId`/`parentTaskId`, never `agentName`). |
| `6d630ac` | Fix: Markdown rendering in chat, input focus retained after sending, auto-scroll (first attempt), removed the raw SSE debug tab. |

See each commit message for full detail — they're written to be self-contained.

## What's implemented (see `HANDOFF.md` §2 for the authoritative, current list)

Login, chat, SSE, turn-scoped compact/collapsible activity, compact/collapsible approvals, fixed
internal chat scroll with reliable sticky-bottom, natural Spanish chat copy, request coalescing,
dev double-init guard, per-`taskId` message dedupe. All validated against a real running backend
with `LLM_PROVIDER=openai` during this session (not just the demo-scripted provider).

## What's NOT implemented yet (in order — see `HANDOFF.md`'s RESUME FROM HERE for the immediate one)

1. **Non-blocking conversation / concurrent turns** — next, immediate milestone.
2. Multi-turn memory extended/confirmed under concurrency (a minimal in-memory version already
   exists backend-side for hotel-search grounding — `loop/agent-backend@30b400c`/`594468e`).
3. Entity/result selection ("el segundo", "ese hotel").
4. `TravelerAgent`, then full `ReservationAgent`.
5. Durable persistence, real Noktos integration, MCP (`Noktos MCP Server`) — all later, unscheduled
   in detail yet.

Not started, not scheduled soon: LangGraph/LangChain, multi-LLM-provider support, RAG/embeddings,
full branding, production hardening, RBAC, production observability.

## Process note on how recent fixes were made

Every product-code change in the commits above was implemented by a scoped Codex CLI session
(`codex exec --sandbox workspace-write`), directed and independently verified by a Claude Code
supervisor session — per this repo's own `CLAUDE.md`/`AGENTS.md` (Claude Code is
Supervisor/Orchestrator, never the product-code implementer). Verification was NOT limited to
trusting the implementer's own self-reported test/build results: the supervising session
independently re-ran lint/tsc/tests/`next build` for every change, and for the paired backend fixes
in this same period, independently booted the compiled backend (`node dist/main.js`) rather than
trusting `tsc`+unit tests alone — which is exactly what caught a real Nest DI wiring break that
would otherwise have shipped broken (see `noktos-agent-backend/docs/workspace/HANDOFF.md`). Keep
applying that same discipline going forward: a green build/test run is necessary, not sufficient.

## Resume instructions

See `HANDOFF.md` → **RESUME FROM HERE**. That section, not this one, is the authoritative next
action.
