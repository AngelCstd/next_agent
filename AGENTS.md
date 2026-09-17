# Noktos Agent Next — Rules for Every Agent

1. **The token never leaks:** Memory-only session (`auth.ts`). No `localStorage`, no `sessionStorage`, no cookies for access tokens.
2. **The frontend is not the authorization boundary:** Backend is the single authority. UI must behave properly even if forged requests occur.
3. **Render only declared-safe data:** Approval cards use allowlisted `inputPreview` only. Never render chain-of-thought, internal UUIDs as primary UX, or raw payloads.
4. **Contracts are vendored and read-only:** `src/contracts/` and `contracts.lock` are authoritative copies of `noktos-agent-backend/contracts/`.
5. **Event stream discipline:** Use `fetch` + `ReadableStream` with `Authorization: Bearer <token>`. Do not use `EventSource`. Track `seq` and send `Last-Event-ID` on reconnect.
6. **Approvals:** Every decision generates an `idempotencyKey` (UUID). Buttons disable while in-flight.
