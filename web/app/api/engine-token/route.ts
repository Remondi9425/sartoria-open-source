/**
 * Mints a short-lived token for the measurement engine.
 *
 * What this achieves, precisely: it stops someone who finds the engine's URL
 * from spending GPU time on it, and it ties the token to the address that
 * asked, so one lifted from a browser is no use elsewhere.
 *
 * What it does not achieve: authorising a person. This route hands a token to
 * anybody who asks, so whoever finds the app can still get one. That needs a
 * bot check or a signed-in session, and issuance limits that outlive a single
 * serverless instance. The limit below is per-instance and resets on every
 * cold start — it blunts a loop from one address, not a determined caller.
 */
import { createHmac, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = 900;
const ISSUE_LIMIT = 20;
const ISSUE_WINDOW_MS = 10 * 60 * 1000;

const issued = new Map<string, number[]>();

function b64url(raw: Buffer | string): string {
  return Buffer.from(raw).toString("base64url");
}

/** Matches spike/auth.py caller_id exactly, including the key.
 *
 *  Keyed rather than a bare digest: there are four billion IPv4 addresses, so
 *  a plain hash of one is reversible by trying them all. The address itself is
 *  never put in the token — that travels through a browser. */
function callerId(address: string | null, secret: string): string {
  return createHmac("sha256", secret).update(address || "unknown")
    .digest("hex").slice(0, 16);
}

/** Whether an address is one a remote worker could also observe. */
function routable(address: string | null): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  if (a === "::1" || a.startsWith("127.") || a.startsWith("fe80:")) return false;
  if (a.startsWith("10.") || a.startsWith("192.168.")) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return false;
  if (a.startsWith("::ffff:")) return routable(a.slice(7));
  return true;
}


function tooMany(who: string): boolean {
  const now = Date.now();
  const hits = (issued.get(who) ?? []).filter((t) => now - t < ISSUE_WINDOW_MS);
  if (hits.length >= ISSUE_LIMIT) {
    issued.set(who, hits);
    return true;
  }
  hits.push(now);
  issued.set(who, hits);
  return false;
}

export async function POST(request: NextRequest) {
  const secret = process.env.SARTORIA_TOKEN_SECRET?.trim();
  if (!secret) {
    const insecureDev = process.env.NODE_ENV === "development"
      && (process.env.SARTORIA_ENV ?? "dev") === "dev"
      && process.env.SARTORIA_ALLOW_INSECURE_DEV === "1";
    if (insecureDev) {
      return NextResponse.json({ token: null, open: true },
        { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "Scan authorisation is unavailable." },
      { status: 503, headers: { "cache-control": "no-store" } });
  }

  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
                  || null;
  // Bound only to an address the worker could also see.
  //
  // Binding works because both ends observe the same client from the public
  // internet. Running locally they do not: this server sees a loopback
  // address while the worker sees the browser's real one, and a token narrowed
  // to 127.0.0.1 is a token the worker must refuse. A private address is
  // positive evidence that we are not on the path the worker sees, so the
  // token is left unbound — a narrowing not taken, rather than a check that
  // quietly fails.
  const who = routable(address) ? callerId(address!, secret) : null;
  if (tooMany(who ?? "local")) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const payload = JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    p: "measure",
    nonce: randomUUID(),
    ...(who ? { w: who } : {}),
  });
  const body = b64url(payload);
  const sig = createHmac("sha256", secret).update(body).digest();

  return NextResponse.json({ token: `${body}.${b64url(sig)}`, open: false },
                           { headers: { "cache-control": "no-store" } });
}
