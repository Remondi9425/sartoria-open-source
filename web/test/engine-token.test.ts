import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/engine-token/route";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });
const request = () => new NextRequest("https://app.test/api/engine-token", {
  method: "POST", headers: { "x-forwarded-for": "198.51.100.7" },
});

test("production never issues an open ticket without a secret", async () => {
  delete process.env.SARTORIA_TOKEN_SECRET;
  process.env.SARTORIA_ENV = "production";
  process.env.SARTORIA_ALLOW_INSECURE_DEV = "1";
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("default configuration fails closed", async () => {
  delete process.env.SARTORIA_TOKEN_SECRET;
  delete process.env.SARTORIA_ALLOW_INSECURE_DEV;
  assert.equal((await POST(request())).status, 503);
});

test("tokens issued in the same second are different", async () => {
  process.env.SARTORIA_TOKEN_SECRET = "synthetic-test-secret";
  const a = await (await POST(request())).json();
  const b = await (await POST(request())).json();
  assert.equal(a.open, false);
  assert.notEqual(a.token, b.token);
});
