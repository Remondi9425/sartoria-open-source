"use client";

import { Body, Button, Eyebrow, Footer, Note, Screen, Title } from "@/components/ui";
import type { CaptureRejected } from "@/lib/engine/types";

/** The refusal is a first-class screen, not an alert. It names one cause and
 *  offers the way that does not need a camera at all. */
export function Rejected({
  result, onRetry, onWardrobe,
}: { result: CaptureRejected; onRetry: () => void; onWardrobe: () => void }) {
  return (
    <Screen>
      <Body>
        <Eyebrow>We stopped — here is why</Eyebrow>
        <Title>That one won&rsquo;t work.</Title>

        <div className="mt-6 rounded-2xl border-l-[3px] border-rust bg-paper px-5 py-4">
          <p className="text-[14px] leading-[1.55]">{result.reason}</p>
        </div>

        <dl className="mt-6 space-y-2.5 text-[12px]">
          {[
            ["Head in frame", result.capture_quality.head_visible],
            ["Feet in frame", result.capture_quality.feet_visible],
            ["Whole body in frame", result.capture_quality.body_in_frame],
          ].map(([label, ok]) => (
            <div key={String(label)} className="flex justify-between border-b
                                                border-line-soft pb-2.5">
              <dt className="text-mute">{label as string}</dt>
              <dd className={ok ? "text-ink" : "font-semibold text-rust"}>
                {ok === null ? "—" : ok ? "yes" : "no"}
              </dd>
            </div>
          ))}
          <div className="flex justify-between border-b border-line-soft pb-2.5">
            <dt className="text-mute">Turn covered</dt>
            <dd className="figure">
              {Math.round(result.capture_quality.rotation_coverage * 100)}%
            </dd>
          </div>
        </dl>

        <div className="pt-6">
          <Note>
            We do not guess from a bad capture. A number we are not sure of is
            worse than no number, because you would act on it.
          </Note>
        </div>
      </Body>

      <Footer>
        <Button onClick={onRetry}>Film again</Button>
        <div className="pt-2.5 text-center">
          <button type="button" onClick={onWardrobe}
                  className="text-[12.5px] text-navy underline underline-offset-4 hover:text-rust">
            Or tell us a pair you already own
          </button>
        </div>
      </Footer>
    </Screen>
  );
}
