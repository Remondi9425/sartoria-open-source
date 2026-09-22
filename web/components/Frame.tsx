"use client";

import type { ReactNode } from "react";

/** On a phone the app is the whole screen. On a desktop — where it will be
 *  demonstrated — it sits in a phone so the proportions stay honest. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper sm:p-8">
      <div className="relative h-dvh w-full overflow-hidden bg-card
                      sm:h-[812px] sm:max-h-[92vh] sm:w-[375px] sm:rounded-[2.4rem]
                      sm:shadow-[0_30px_80px_-20px_rgba(26,28,46,.3)]
                      sm:ring-1 sm:ring-black/5">
        {children}
      </div>
    </main>
  );
}
