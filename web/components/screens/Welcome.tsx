"use client";

import { useRef, useState } from "react";
import { Body, Button, Footer, Note, PrivacyNote, Screen, StubBadge } from "@/components/ui";
import { engineConfigured } from "@/lib/engine";

export function Welcome({
  onStart, onUseFile,
}: {
  onStart: (heightCm: number) => void;
  onUseFile: (heightCm: number, clip: File) => void;
}) {
  const [height, setHeight] = useState(174);
  const file = useRef<HTMLInputElement>(null);
  const step = (d: number) => setHeight((h) => Math.min(210, Math.max(140, h + d)));

  return (
    <Screen>
      <Body>
        <div className="flex items-center justify-between pt-7">
          <p className="text-[15px] font-bold tracking-[.22em] text-ink">
            SARTOR<span className="text-rust">IA</span>
          </p>
          {!engineConfigured && <StubBadge />}
        </div>

        <h1 className="pt-16 text-[33px] leading-[1.12] font-bold tracking-[-.02em]">
          Your size,<br />from one video.
        </h1>
        <p className="pt-4 text-[14.5px] leading-[1.5] text-mute">
          Ten seconds of filming. No tape measure, no guessing between W30 and W32.
        </p>

        <p className="eyebrow pt-12 pb-3">How tall are you?</p>
        <div className="flex items-center justify-between rounded-2xl bg-white
                        px-6 py-5 shadow-[0_1px_2px_rgba(26,28,46,.06)]">
          <p className="figure text-[38px] font-semibold leading-none">
            {height}<span className="pl-1.5 text-[14px] font-normal text-mute">cm</span>
          </p>
          <div className="flex gap-2.5">
            {([["−", -1], ["+", 1]] as const).map(([sign, d]) => (
              <button key={sign} type="button" onClick={() => step(d)}
                      aria-label={d > 0 ? "taller" : "shorter"}
                      className="h-11 w-11 rounded-full border border-line text-xl
                                 leading-none text-navy transition hover:bg-paper">
                {sign}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-3">
          <Note>
            This is the only thing we ask you to type. It is what turns the video
            into centimetres.
          </Note>
        </div>
      </Body>

      <Footer>
        <Button onClick={() => onStart(height)}>Start filming</Button>
        <div className="pt-2.5 text-center">
          <button type="button" onClick={() => file.current?.click()}
                  className="text-[12.5px] text-navy underline underline-offset-4
                             hover:text-rust">
            Or use a video you already have
          </button>
          <input ref={file} type="file" accept="video/*" className="hidden"
                 onChange={(e) => {
                   const f = e.target.files?.[0];
                   if (f) onUseFile(height, f);
                 }} />
        </div>
        <PrivacyNote />
      </Footer>
    </Screen>
  );
}
