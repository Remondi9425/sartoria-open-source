"use client";

import { INK, PointCloud, type Point3 } from "@/components/art/PointCloud";

/**
 * The customer's own legs, drawn from the surface points the body model
 * produced. Turns by itself, and follows a finger.
 *
 * A point cloud rather than a surface: the triangles that would join these
 * points belong to the SMPL model files, whose licence this project
 * deliberately avoided needing. At this density a leg reads as a limb anyway,
 * and it reads honestly — a scan looks like a scan, where a smooth surface
 * would imply a precision the measurement does not have.
 */
export function LegScan({
  points, className = "",
}: { points: Point3[]; className?: string }) {
  return (
    <PointCloud points={points} tint={INK} turnSeconds={33} draggable
                label="Your legs, as measured — drag to turn"
                className={className} />
  );
}
