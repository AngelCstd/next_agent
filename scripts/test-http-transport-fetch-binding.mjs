import assert from "node:assert/strict";
import { HttpTransport } from "../src/infrastructure/api/HttpTransport";

const originalFetch = globalThis.fetch;
let bound = false;

// Mimics browser brand-check
globalThis.fetch = function mockFetch() {
  if (this !== globalThis) {
    throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
  }
  bound = true;
  return Promise.resolve(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
};

try {
  const transport = new HttpTransport({ baseUrl: "http://test.local" });
  await transport.fetchImplementation("http://test.local/probe");
  assert.equal(bound, true, "fetch must be called with globalThis receiver");
  console.log(
    "[test-http-transport-fetch-binding] PASS - fetchImplementation preserves the globalThis receiver in Next.js.",
  );
} finally {
  globalThis.fetch = originalFetch;
}
