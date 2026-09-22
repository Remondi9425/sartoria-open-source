"use client";

import { useEffect, useRef } from "react";

export type Point3 = [number, number, number];

/** The lit edge of something being built: the amber of the scan line, warm
 *  for the tenth of the height below the front, and a point takes the last
 *  thirtieth of that to arrive. */
const EDGE: [number, number, number] = [224, 164, 88];
const EDGE_DEPTH = 0.1;
const ARRIVE = 0.035;
/** How far a point's own arrival strays from its height, so the front is a
 *  scatter of points settling rather than a shutter coming up. */
const STRAY = 0.05;

/** The two grounds this is ever drawn on: navy ink on the paper screens,
 *  warm white on the dark ones, where the figure should read as light rather
 *  than as paint. */
export const INK: [number, number, number] = [34, 58, 94];
export const CHALK: [number, number, number] = [240, 231, 217];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A fixed scatter for point i — the same every time, so a body does not
 *  rebuild itself in a different order when React re-renders. */
const noise = (i: number) => {
  const t = Math.sin(i * 12.9898) * 43758.5453;
  return t - Math.floor(t);
};

/** Where the front is really sent. A finished cloud sends it clear of the
 *  crown, so the last points arrive and the warmth leaves them of its own
 *  accord — nothing has to notice that the work is over and switch. */
const aim = (built: number) =>
  built >= 1 ? 1 + STRAY + EDGE_DEPTH : built;

/**
 * A body drawn as the points on its surface, turning — and, when asked, laid
 * down from the feet upwards as it is worked out, a point at a time.
 *
 * Canvas rather than a 3-D library: a few thousand points, one rotation matrix
 * and a painter's-algorithm sort do not need a renderer, and the app stays
 * free of a dependency it would use in two places.
 *
 * The scan the customer is given and the body shown while they wait are drawn
 * by the same code on purpose — the wait should look like the answer, so that
 * when the answer arrives it is recognisably the same thing.
 */
export function PointCloud({
  points,
  tint = [34, 58, 94],
  turnSeconds = 33,
  startTurn = 0.6,
  built = 1,
  draggable = false,
  label,
  className = "",
}: {
  points: Point3[];
  /** Dot colour, as r, g, b — navy on paper, warm white on the dark screen. */
  tint?: [number, number, number];
  /** Seconds for one full turn. */
  turnSeconds?: number;
  startTurn?: number;
  /** How much of the figure has been worked out, from the feet up. 1 is the
   *  whole cloud; at 0.5 the top half has not been laid down yet, and is not
   *  drawn at all — a shape waiting to be filled in is a shape we are
   *  claiming to know. */
  built?: number;
  draggable?: boolean;
  /** Given, the canvas is an image with this description; withheld, it is
   *  decoration and screen readers skip it. */
  label?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; spin: number } | null>(null);
  const spin = useRef(startTurn);
  // The engine reports where it has got to every two seconds, in jumps. The
  // drawn line chases that figure instead of taking it, so a body grows
  // rather than clicking upwards five times.
  const target = useRef(aim(built));
  const reached = useRef(aim(built));

  useEffect(() => { target.current = aim(built); }, [built]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fit the body to the canvas once; it does not change while it turns.
    let minY = Infinity, maxY = -Infinity, spread = 0;
    for (const [x, y, z] of points) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      spread = Math.max(spread, Math.abs(x), Math.abs(z));
    }
    const midY = (minY + maxY) / 2;
    const tall = maxY - minY || 1;
    // When each point arrives: its own height in the figure, 0 at the floor
    // and 1 at the crown, strayed a little so no two neighbours land at once.
    const height = points.map(([, y], i) =>
      (y - minY) / tall + (noise(i) - 0.5) * STRAY);
    const [r, g, b] = tint;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const perSecond = (2 * Math.PI) / turnSeconds;
    let frame = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const since = now - last;
      last = now;
      if (!drag.current && !still) spin.current += (since / 1000) * perSecond;
      reached.current += (target.current - reached.current)
                         * (1 - Math.exp(-since / 500));
      const line = reached.current;

      const scale = Math.min(h / tall, w / (spread * 2.6)) * 0.86;
      const cos = Math.cos(spin.current), sin = Math.sin(spin.current);

      // Painter's algorithm: far points first, so near ones cover them.
      const projected = points.map(([x, y, z], i): [number, number, number, number] => {
        const rx = x * cos + z * sin;
        const rz = z * cos - x * sin;
        return [w / 2 + rx * scale, h / 2 - (y - midY) * scale, rz, height[i]];
      });
      projected.sort((a, c) => a[2] - c[2]);

      for (const [px, py, depth, at] of projected) {
        // Nearer points are brighter and slightly larger — the only depth cue
        // a cloud has once it has no surface to catch light.
        const near = (depth / (spread || 1) + 1) / 2;
        const base = 0.16 + near * 0.62;
        let size = 1 + near * 1.4;

        const since = line - at;
        if (since <= 0) continue;                 // not laid down yet
        // Arriving: warm and heavy for a moment, then it is skin like the
        // rest. The two together read as points settling onto a surface.
        const arrived = Math.min(1, since / ARRIVE);
        const hot = since < EDGE_DEPTH ? 1 - since / EDGE_DEPTH : 0;
        if (hot === 0) {
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${base})`;
        } else {
          size += hot * 0.7;
          ctx.fillStyle =
            `rgba(${Math.round(mix(r, EDGE[0], hot))}, `
            + `${Math.round(mix(g, EDGE[1], hot))}, `
            + `${Math.round(mix(b, EDGE[2], hot))}, `
            + `${Math.min(1, base * arrived + hot * 0.4)})`;
        }
        ctx.fillRect(px, py, size, size);
      }
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [points, tint, turnSeconds]);

  const start = (x: number) => { drag.current = { x, spin: spin.current }; };
  const move = (x: number) => {
    if (!drag.current) return;
    spin.current = drag.current.spin + (x - drag.current.x) / 90;
  };
  const end = () => { drag.current = null; };

  return (
    <canvas
      ref={canvasRef}
      className={`select-none ${draggable ? "touch-none" : "pointer-events-none"} ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      {...(draggable ? {
        onPointerDown: (e: React.PointerEvent) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          start(e.clientX);
        },
        onPointerMove: (e: React.PointerEvent) => move(e.clientX),
        onPointerUp: end,
        onPointerCancel: end,
      } : {})}
    />
  );
}
