"use client";

import { LegDiagram } from "@/components/art/LegDiagram";
import { LegScan } from "@/components/art/LegScan";
import { Body, Button, Eyebrow, Footer, Note, Screen, StubBadge, Title } from "@/components/ui";
import type { DigitalTwin } from "@/lib/engine/types";

/**
 * What the tier can honestly claim.
 *
 * It says how well this video agreed with itself, which is the only evidence
 * the pipeline has: there is no tape measure inside it. Whether that agreement
 * means the numbers are *right* is a separate question, and the answer so far
 * is one person — `scripts/evaluate.py` refuses to give a verdict below five.
 *
 * "Good enough to pick a size" was a claim about accuracy made from a
 * consistency check.
 */
const TIER_NOTE: Record<string, string> = {
  A: "The waist, seat and leg lengths came out the same in every frame.",
  B: "Consistent across this video, with a couple of the smaller numbers softer.",
  C: "The frames disagreed enough that we would rather you checked one of "
     + "these yourself.",
};

/** Which measurements the frames actually disagreed on.
 *
 *  Tier C used to send everyone to check their waist, whichever number was
 *  the soft one — so a reader whose waist was fine learned nothing and
 *  trusted the tier a little less. */
function shaky(twin: DigitalTwin): string[] {
  return Object.entries(twin.measurement_confidence)
    .filter(([, c]) => c === "low")
    .map(([site]) => site);
}

export function Measurements({
  twin, seconds, onNext,
}: { twin: DigitalTwin; seconds: number; onNext: () => void }) {
  // The contract carries its own provenance, so no screen needs a flag that
  // somebody could forget to flip when the real engine lands.
  const stub = twin.processing_method.startsWith("stub");
  return (
    <Screen>
      <Body>
        <Eyebrow>Done — {seconds} seconds</Eyebrow>
        <Title>These are your numbers.</Title>

        {stub && (
          <div className="pt-4">
            <StubBadge />
            <p className="pt-2.5 text-[12px] leading-[1.5] text-mute">
              Nothing was measured — the video was never looked at. Fixed
              values, so the flow can be walked through before the measurement
              engine exists.
            </p>
          </div>
        )}

        {/* The scan when there is one, the drawing when there is not. The
            drawing is a generic body with the numbers attached to it; the scan
            is the person's own legs, which is what the measurements were
            actually taken from. */}
        {twin.leg_cloud_cm?.length ? (
          <div className="pt-5">
            <div className="rounded-2xl bg-paper py-4">
              <LegScan points={twin.leg_cloud_cm} className="h-[300px] w-full" />
            </div>
            <p className="pt-2 text-center text-[11px] text-faint">
              Your legs, as measured · drag to turn
            </p>
            <div className="grid grid-cols-4 gap-2 pt-4">
              {(["waist", "hip", "thigh", "inseam"] as const).map((site) => (
                <div key={site} className="rounded-lg bg-paper px-2 py-2.5 text-center">
                  <p className="figure text-[15px] font-semibold leading-none">
                    {twin.measurements_cm[site]}
                  </p>
                  <p className="pt-1 text-[8.5px] uppercase tracking-[.12em] text-faint">
                    {site}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="pt-6">
            <LegDiagram twin={twin} />
          </div>
        )}

        <div className="rounded-xl bg-paper px-4 py-3">
          <p className="text-[12px] leading-[1.5] text-mute">
            <span className="font-semibold text-ink">
              Consistency {twin.data_quality_tier}.
            </span>{" "}
            {TIER_NOTE[twin.data_quality_tier]}{" "}
            {twin.data_quality_tier === "C" && shaky(twin).length > 0 && (
              <span className="text-ink">
                Softest here: {shaky(twin).join(", ")}.{" "}
              </span>
            )}
            How close any of this is to a tape measure is still being
            established.
          </p>
        </div>

        <div className="pt-4 pb-2">
          <Note>
            Nothing is stored yet — close this and the numbers are gone. When a
            profile exists it will be yours to see, export and delete.
          </Note>
        </div>
      </Body>

      <Footer>
        <Button onClick={onNext}>Show me jeans that fit</Button>
      </Footer>
    </Screen>
  );
}
