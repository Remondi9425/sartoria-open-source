"use client";

import { CHALK, PointCloud } from "@/components/art/PointCloud";
import { legsCloud } from "@/components/art/bodyCloud";

/**
 * A pair of legs being laid down, point by point, while the video is measured.
 *
 * Legs and nothing else, because legs are what the engine works out and what
 * the next screen hands back — the wait is the answer arriving rather than a
 * figure keeping the customer company.
 *
 * Nothing above the front is drawn, not even faintly. An outline waiting to
 * be filled in would be a claim to already know the shape, which is the one
 * thing this screen cannot say: the points are a stand-in until the engine
 * answers with the customer's own.
 *
 * The feet arrive quicker than the figure says. A run reports elapsed time
 * rather than progress, and that number crawls at the start — taken straight
 * it left an empty screen for the first half-minute of a two-minute wait.
 * Bending it is no less honest than the guess it is bending.
 */
export function LegsForming({
  measured, className = "",
}: {
  /** How far the measurement has got, 0 to 1. */
  measured: number;
  className?: string;
}) {
  return (
    <PointCloud points={legsCloud()} tint={CHALK} turnSeconds={14}
                built={Math.pow(measured, 0.65)} className={className} />
  );
}
