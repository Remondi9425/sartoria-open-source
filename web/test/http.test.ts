/**
 * How the client behaves when things go wrong on the wire.
 *
 * Both cases here were real: a cancelled request reported as a broken service,
 * and a 200 carrying unreadable JSON keeping the loop alive for five minutes.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createHttpEngine } from "../lib/engine/http";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const clip = new Blob([new Uint8Array(32)], { type: "video/mp4" });
const engine = () => createHttpEngine("https://engine.test",
                                      { pollMs: 1, maxPolls: 200 });

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}

/** 200, but the body is not JSON — which is not the same as a 500. */
function unreadable(): Response {
  return new Response("<!doctype html><h1>502 Bad Gateway</h1>", {
    status: 200, headers: { "content-type": "text/html" },
  });
}

test("cancelling a scan does not tell the person the service is down", async () => {
  const control = new AbortController();
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")), { once: true });
    })) as typeof fetch;

  const running = engine().analyse({ heightCm: 168, video: clip,
                                     signal: control.signal });
  control.abort();

  // Starting a second scan cancels the first. The first must not surface as
  // "we could not reach this app's own server" — the caller cancelled it.
  await assert.rejects(running, (e: Error) => e.name === "AbortError");
});

test("a cancel during polling propagates too", async () => {
  const control = new AbortController();
  let calls = 0;
  globalThis.fetch = ((url: string) => {
    calls++;
    if (String(url).includes("engine-token")) return Promise.resolve(reply({ token: "t" }));
    if (String(url).includes("/analyse")) return Promise.resolve(reply({ job_id: "j", result_token: "job-capability" }, 202));
    queueMicrotask(() => control.abort());
    return Promise.resolve(reply({ status: "working" }));
  }) as typeof fetch;

  await assert.rejects(
    engine().analyse({ heightCm: 168, video: clip, signal: control.signal }),
    (e: Error) => e.name === "AbortError");
  assert.ok(calls >= 3);
});

test("a 200 carrying unreadable JSON gives up instead of waiting out the clock",
     async () => {
  let polls = 0;
  globalThis.fetch = ((url: string) => {
    if (String(url).includes("engine-token")) return Promise.resolve(reply({ token: "t" }));
    if (String(url).includes("/analyse")) return Promise.resolve(reply({ job_id: "j", result_token: "job-capability" }, 202));
    polls++;
    return Promise.resolve(unreadable());
  }) as typeof fetch;

  const out = await engine().analyse({ heightCm: 168, video: clip });
  assert.equal(out.status, "capture_rejected");
  assert.match(out.reason, /cannot read/);
  // The counter used to reset on the status code, so this ran to maxPolls.
  assert.ok(polls <= 6, `gave up after ${polls} polls, not 200`);
});

test("an unreadable body between good ones does not end the scan", async () => {
  let polls = 0;
  globalThis.fetch = ((url: string) => {
    if (String(url).includes("engine-token")) return Promise.resolve(reply({ token: "t" }));
    if (String(url).includes("/analyse")) return Promise.resolve(reply({ job_id: "j", result_token: "job-capability" }, 202));
    polls++;
    if (polls === 2 || polls === 5) return Promise.resolve(unreadable());
    if (polls < 8) return Promise.resolve(reply({ status: "working" }));
    return Promise.resolve(reply({ status: "capture_rejected", reason: "done",
      all_reasons: ["done"], coaching: [],
      capture_quality: {
        head_visible: true, feet_visible: true, body_in_frame: true,
        usable_frames: 20, rotation_coverage: 1, frontal_yaw_deg: 0,
        profile_yaw_deg: 90,
      } }));
  }) as typeof fetch;

  const out = await engine().analyse({ heightCm: 168, video: clip });
  assert.equal(out.status, "capture_rejected");
  assert.equal(out.reason, "done", "a blip must not be treated as a dead service");
});

test("401 while polling stops immediately rather than retrying", async () => {
  let polls = 0;
  globalThis.fetch = ((url: string) => {
    if (String(url).includes("engine-token")) return Promise.resolve(reply({ token: "t" }));
    if (String(url).includes("/analyse")) return Promise.resolve(reply({ job_id: "j", result_token: "job-capability" }, 202));
    polls++;
    return Promise.resolve(reply({ detail: "not authorised" }, 401));
  }) as typeof fetch;

  const out = await engine().analyse({ heightCm: 168, video: clip });
  assert.equal(out.status, "capture_rejected");
  assert.match(out.reason, /authorisation/);
  assert.equal(polls, 1, "an expired token does not fix itself by asking again");
});

test("a 429 from token issuance is not reported as an authorisation failure",
     async () => {
  globalThis.fetch = ((url: string) => {
    if (String(url).includes("engine-token")) {
      return Promise.resolve(reply({ error: "too many requests" }, 429));
    }
    throw new Error("should never reach the engine");
  }) as typeof fetch;

  const out = await engine().analyse({ heightCm: 168, video: clip });
  assert.equal(out.status, "capture_rejected");
  assert.match(out.reason, /a lot of scans/);
});

test("polling sends the result capability only in the header", async () => {
  let polls = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).includes("engine-token")) return reply({ token: "t" });
    if (String(url).includes("/analyse")) return reply({ job_id: "j", result_token: "cap" }, 202);
    polls++;
    assert.equal(String(url), "https://engine.test/result/j");
    assert.equal(new Headers(init?.headers).get("x-sartoria-result-token"), "cap");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer t");
    assert.equal(init?.cache, "no-store");
    return reply({ detail: "forbidden" }, 403);
  }) as typeof fetch;
  const result = await engine().analyse({ heightCm: 175, video: clip });
  assert.equal(result.status, "capture_rejected");
  assert.match(result.reason, /authorisation/);
  assert.equal(polls, 1);
});

test("a secure submission without a result capability never polls", async () => {
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("engine-token")) return reply({ token: "t" });
    if (String(url).includes("/analyse")) return reply({ job_id: "j" }, 202);
    assert.fail("must not poll without a result capability");
  }) as typeof fetch;
  const result = await engine().analyse({ heightCm: 175, video: clip });
  assert.equal(result.status, "capture_rejected");
  assert.match(result.reason, /authorise access/);
});
