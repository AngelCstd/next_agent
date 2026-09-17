# Noktos Agent Backend - HTTP and SSE contract (frozen at v1.0.0)

All endpoints require `Authorization: Bearer <supabase_access_token>`.
The token is never accepted in a query string, never logged, never placed in an
event payload and never reaches a model prompt.

## Conversations

```
POST   /conversations                    -> 201  Conversation
POST   /conversations/:id/messages       -> 202  ChatResponse
GET    /conversations/:id/tasks          -> 200  AgentTask[]
GET    /conversations/:id/approvals      -> 200  ApprovalRequest[]
```

`POST /conversations/:id/messages` returns **202 Accepted** by contract. It
never blocks on delegated work; results arrive over the event stream.

## Events (SSE)

```
GET    /conversations/:id/events         -> 200  text/event-stream
```

- Client transport is `fetch` + `ReadableStream` so the `Authorization` header
  can be sent. `EventSource` is not used because it cannot set headers.
- Each frame carries `id: <seq>`. On reconnect the client sends
  `Last-Event-ID: <seq>` and the server replays from `seq + 1` out of a bounded
  per-conversation ring buffer.
- A gap in `seq` means events were evicted from the buffer; the client must
  resynchronize rather than silently continue.

## Approvals

```
POST   /approvals/:id/decision           -> 200  ApprovalRequest
```

Body: `ApprovalDecision`. A single endpoint rather than `/approve` + `/reject`
so idempotency and the state transition exist in exactly one place.

Rules enforced by the backend, never by the client:

- Only the `userId` that owns the conversation may decide. (V1 scope; role-based
  approval waits on the unresolved Noktos Auth role matrix.)
- `idempotencyKey` makes a repeated submission a no-op returning the same result.
- A decision on an approval that is not `pending` returns the current state and
  changes nothing.

## Agents

```
GET    /agents                           -> 200  AgentDescriptor[]
```

## Error envelope

Every error response uses:

```json
{ "error": { "code": "STABLE_CODE", "message": "Safe message", "requestId": "req_..." } }
```
