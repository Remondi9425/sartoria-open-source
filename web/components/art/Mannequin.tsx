"use client";

import { CHALK, PointCloud } from "@/components/art/PointCloud";
import { mannequinCloud } from "@/components/art/bodyCloud";

/**
 * A stand-in body, turning.
 *
 * It is drawn by the same code and in the same idiom as the scan at the end
 * of the measurement, so the instructions and the answer are recognisably the
 * same thing — and it admits in advance what that answer will be: points, not
 * a photograph.
 */
export function Mannequin({ className = "" }: { className?: string }) {
  return (
    <PointCloud points={mannequinCloud()} tint={CHALK} turnSeconds={16}
                className={className} />
  );
}
