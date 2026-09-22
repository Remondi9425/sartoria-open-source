/**
 * Keeping in touch, and the taste that shapes a recommendation.
 *
 * Two things arrive here and they are deliberately not one thing:
 *
 *  - **Taste** — cut, wash, how close it should sit. Volunteered to get the
 *    recommendation the customer came for. It needs a notice, not a tick.
 *  - **Marketing** — an address, and permission to write to it. Optional,
 *    unticked, and never a condition of being measured. Consent is not freely
 *    given if the service is withheld without it, so the measurement flow does
 *    not pass through this route at all.
 *
 * The taste alone never reaches a server: it stays in the browser and reorders
 * the shelf there. This route exists for the address, which is the only part
 * that has to be kept. See PRIVACY.md.
 */
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 4096;

// Per-instance and reset by every cold start, exactly like the token route.
// It blunts a loop from one address; it is not a defence against a determined
// caller, and saying so is better than implying otherwise.
const seen = new Map<string, number[]>();

/** Deliberately not a clever one. The only test that means anything is
 *  whether a message arrives, and a regex that rejects valid addresses to look
 *  thorough costs real subscribers. */
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

function callerId(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || "unknown";
}

function tooMany(id: string): boolean {
  const now = Date.now();
  const recent = (seen.get(id) ?? []).filter((t) => now - t < SIGNUP_WINDOW_MS);
  if (recent.length >= SIGNUP_LIMIT) {
    seen.set(id, recent);
    return true;
  }
  recent.push(now);
  seen.set(id, recent);
  return false;
}

export interface Subscription {
  email: string;
  /** True only if the customer ticked it themselves. Never defaulted. */
  marketing: boolean;
  at: string;
}

/**
 * Where a subscription goes.
 *
 * Nothing yet, and it refuses rather than pretending. A route that accepts an
 * address and drops it tells the customer they subscribed when they did not,
 * which is worse than telling them the door is shut.
 *
 * Choosing a store is the moment this application stops being stateless, and
 * statelessness is currently its strongest privacy property — retention is
 * "the request" because there is nowhere for anything to stay. Whatever is
 * chosen brings a retention period, a deletion path, and a processor to have
 * an agreement with. That is a decision, not a dependency.
 */
async function store(sub: Subscription): Promise<void> {
  void sub; // Replace this stub only with a documented retention/deletion policy.
  throw new Error("no subscription store configured");
}

export async function POST(req: NextRequest) {
  if (tooMany(callerId(req))) {
    return NextResponse.json(
      { error: "Too many sign-ups from here just now. Try again shortly." },
      { status: 429 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "That request is too large." },
                             { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "That was not valid JSON." },
                             { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const marketing = b.marketing === true;

  if (!PLAUSIBLE_EMAIL.test(email) || email.length > 254) {
    return NextResponse.json(
      { error: "That does not look like an email address." }, { status: 400 });
  }

  // The tick is the whole point of the route. Without it there is no purpose
  // to keep an address for, so keeping one would be collecting data we have no
  // basis for.
  if (!marketing) {
    return NextResponse.json(
      { error: "We only keep your address if you ask us to." },
      { status: 400 });
  }

  try {
    await store({ email, marketing, at: new Date().toISOString() });
  } catch (e) {
    // The address is not logged, here or anywhere. An error line carrying the
    // thing we failed to store is a copy of it in a place with no retention.
    console.error("subscription failed:", (e as Error).message);
    return NextResponse.json(
      { error: "We cannot take sign-ups yet. Nothing was saved." },
      { status: 503 });
  }

  return NextResponse.json({ status: "subscribed" }, { status: 201 });
}
