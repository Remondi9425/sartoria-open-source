/**
 * The real engine, over HTTP.
 *
 * Implements exactly the same interface as the stub, so nothing above it
 * changes. The Python worker returns the twin shape defined in types.ts — the
 * two files are the same contract in two languages, which is why neither has a
 * translation layer.
 */
import { parseRejection, parseTwin } from "./contract";
import type {
  AnalyseInput, CaptureQuality, CaptureResult, MeasurementEngine,
} from "./types";

/** What the worker is doing while it works. It cannot tell us, so this is an
 *  honest guess at the shape of the wait, not a report of progress. */
const PHASES: [number, string][] = [
  [0.00, "Sending your clip"],
  [0.15, "Looking for you in the frames"],
  [0.40, "Checking head and feet are in shot"],
  [0.62, "Fitting a body to the frames"],
  [0.82, "Measuring round the mesh"],
];

const POLL_MS = 2_000;
const MAX_POLLS = 150;          // five minutes, well past a cold start
const MAX_CONSECUTIVE_FAILURES = 5;

/** Cleans up after itself: polling calls this 150 times against one signal,
 *  and a listener per call is a listener per call. */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    // Checked before listening. An "abort" event that has already fired will
    // not fire again, so a cancellation that happened while we were somewhere
    // else — inside a fetch, between two steps — went unnoticed and the loop
    // carried on to its own timeout.
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const UNKNOWN_QUALITY: CaptureQuality = {
  head_visible: null, feet_visible: null, body_in_frame: null,
  usable_frames: 0, rotation_coverage: 0,
  frontal_yaw_deg: null, profile_yaw_deg: null,
};

/** A refusal the worker produced — validated, not cast. */
function asRejection(body: Record<string, unknown>): CaptureResult {
  try {
    return { status: "capture_rejected", ...parseRejection(body) };
  } catch {
    return rejected("That capture could not be used, and the engine did not "
                    + "say why in a form we could read.");
  }
}


function rejected(reason: string, quality = UNKNOWN_QUALITY): CaptureResult {
  return {
    status: "capture_rejected",
    reason,
    all_reasons: [reason],
    coaching: [],
    capture_quality: quality,
  };
}

type Ticket =
  | { kind: "token"; token: string }
  | { kind: "open" }
  | { kind: "refused"; message: string };

/** A token from our own server, which is the only side that holds the secret.
 *
 *  Its failures are told apart on purpose. Swallowing them into `null` meant a
 *  429 here surfaced as a 401 from the engine two calls later — the person was
 *  told the app was not authorised when in fact they had simply asked too
 *  often. */
async function engineTicket(signal?: AbortSignal): Promise<Ticket> {
  let res: Response;
  try {
    res = await fetch("/api/engine-token", { method: "POST", signal });
  } catch (e) {
    // An abort is the caller changing their mind, not a service being down.
    // Swallowing it told someone who had just started a second scan that the
    // app was unreachable.
    if ((e as Error)?.name === "AbortError") throw e;
    return { kind: "refused", message:
      "We could not reach this app's own server to start a scan." };
  }
  if (res.status === 429) {
    return { kind: "refused", message:
      "That is a lot of scans in a short time. Give it a few minutes." };
  }
  if (!res.ok) {
    return { kind: "refused", message:
      "This app could not authorise a scan. Its shared secret is probably "
      + "missing or out of date." };
  }
  const body = await res.json().catch(() => ({}));
  if (body.token) return { kind: "token", token: body.token };
  if (body.open) return { kind: "open" };
  return { kind: "refused", message:
    "This app could not authorise a scan." };
}


/** Timing, injectable so the retry behaviour can be tested in milliseconds
 *  rather than in the minutes it takes in real life. */
export interface HttpEngineOptions {
  pollMs?: number;
  maxPolls?: number;
}

export function createHttpEngine(baseUrl: string,
                                 opts: HttpEngineOptions = {}): MeasurementEngine {
  const pollMs = opts.pollMs ?? POLL_MS;
  const maxPolls = opts.maxPolls ?? MAX_POLLS;
  return {
    name: `http:${baseUrl}`,
    isStub: false,

    async analyse({ heightCm, video, onProgress, signal }: AnalyseInput): Promise<CaptureResult> {
      if (!video) {
        return rejected(
          "No video reached us. Allow camera access and record again.");
      }

      const began = Date.now();
      const tick = (fraction: number) => {
        const hint = [...PHASES].reverse().find(([at]) => fraction >= at)?.[1]
                     ?? PHASES[0][1];
        onProgress?.({ fraction, hint });
      };

      try {
        // Upload first. The server answers as soon as it has the bytes — it
        // does not hold the connection open while a GPU works, because a
        // request kept alive for two minutes does not survive the round trip.
        const form = new FormData();
        const ext = video.type.includes("mp4") ? "mp4"
                  : video.type.includes("quicktime") ? "mov" : "webm";
        form.append("video", video, `clip.${ext}`);
        form.append("height_cm", String(heightCm));

        tick(0.05);
        const ticket_ = await engineTicket(signal);
        if (ticket_.kind === "refused") return rejected(ticket_.message);
        const auth: HeadersInit = ticket_.kind === "token"
          ? { authorization: `Bearer ${ticket_.token}` } : {};

        const submit = await fetch(`${baseUrl}/analyse`, {
          method: "POST", body: form, headers: auth, signal,
        });
        if (submit.status === 401) {
          // Two very different causes used to give one message, so neither
          // could be told from the other: no secret configured here, or a
          // secret the engine disagrees with.
          return rejected(ticket_.kind === "open"
            ? "This app has no shared secret configured, so it sent no token "
              + "— and the engine requires one. Set SARTORIA_TOKEN_SECRET "
              + "where the app is deployed, then redeploy."
            : "The engine rejected this app's token. The two are configured "
              + "with different secrets, or the token did not survive the "
              + "trip.");
        }
        if (submit.status === 429) {
          return rejected(
            "That is a lot of scans in a short time. Give it a few minutes.");
        }
        if (!submit.ok && submit.status !== 202) {
          return rejected(
            `The measurement engine answered ${submit.status}. Check the Modal ` +
            `deployment is up: modal app list`);
        }
        const ticket = await submit.json();
        if (ticket.status === "capture_rejected") return asRejection(ticket);
        if (typeof ticket.job_id !== "string" || !ticket.job_id) {
          return rejected("The engine accepted the clip but gave us nothing to wait on.");
        }

        if (ticket_.kind === "token" &&
            (typeof ticket.result_token !== "string" || !ticket.result_token)) {
          return rejected("The engine did not authorise access to this scan's result. Please try again.");
        }
        const pollAuth: HeadersInit = {
          ...auth,
          ...(typeof ticket.result_token === "string"
            ? { "x-sartoria-result-token": ticket.result_token } : {}),
        };

        // Then wait. A cold container takes about two minutes; a warm one
        // twenty seconds. The bar reflects elapsed time honestly and stops
        // short of the end, because we are not told how far along it is.
        let consecutiveFailures = 0;
        for (let i = 0; i < maxPolls; i++) {
          await sleep(pollMs, signal);
          tick(Math.min(0.94, 0.05 + (Date.now() - began) / 150_000));

          const res = await fetch(`${baseUrl}/result/${encodeURIComponent(ticket.job_id)}`,
                                  { headers: pollAuth, signal, cache: "no-store" });
          // A token that has expired or a limit that has been hit will not fix
          // itself by asking again for five minutes.
          if (res.status === 401 || res.status === 403) {
            return rejected("The scan lost its authorisation partway through. "
                            + "Please try again.");
          }
          if (res.status === 429) {
            return rejected("That is a lot of scans in a short time. Give it "
                            + "a few minutes.");
          }
          if (!res.ok) {
            if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              return rejected("We lost contact with the measuring service "
                              + "while it was working. Please try again.");
            }
            continue;
          }
          // Reset only once something readable has arrived. Resetting on the
          // status code alone meant a 200 carrying malformed JSON counted as
          // progress, and the loop would sit there for the full five minutes.
          const body = await res.json().catch(() => null);
          if (body === null || typeof body !== "object") {
            if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              return rejected("The measuring service is answering with "
                              + "something we cannot read. Please try again.");
            }
            continue;
          }
          consecutiveFailures = 0;
          if (body.status === "working") continue;

          onProgress?.({ fraction: 1, hint: "Done" });
          if (body.status === "capture_rejected") return asRejection(body);
          try {
            return { status: "ok", twin: parseTwin(body), coaching: [] };
          } catch (bad) {
            // A response we cannot read is not a measurement. Better to refuse
            // than to hand a half-built twin to the size calculator.
            console.error("engine response failed the contract:", bad);
            return rejected(
              "The measurement came back in a form we could not read. Please " +
              "record again — and if it keeps happening, the engine and the " +
              "app are out of step.");
          }
        }
        return rejected(
          "The measurement is taking longer than it should. Try again in a moment.");
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw e;
        return rejected(
          "We could not reach the measurement engine. Check it is running on " +
          `${baseUrl}.`);
      }
    },
  };
}
