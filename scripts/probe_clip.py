#!/usr/bin/env python3
"""Run a clip through the deployed GPU function directly, bypassing HTTP.

    .venv/bin/python scripts/probe_clip.py data/videos/session-001.mp4 --height 178

Calling the Modal function from here avoids the long-request redirect the web
endpoint issues, which is a transport problem and has nothing to do with what
the measurement is doing.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import modal


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("video", type=Path)
    ap.add_argument("--height", type=float, required=True)
    ap.add_argument("--out", type=Path, default=Path("out/probe.json"))
    a = ap.parse_args()

    measurer = modal.Cls.from_name("sartoria-engine", "Measurer")()
    body = measurer.measure.remote(
        clip=a.video.read_bytes(), height_cm=a.height,
        session_id=a.video.stem, suffix=a.video.suffix or ".mp4", debug=True)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(body, indent=2))
    print(f"wrote {a.out}")

    pr = body.get("diagnostics", {}).get("probe") or {}
    print("\nmesh bbox (cm)  :", pr.get("mesh_bbox_cm"))
    print("after arm strip :", pr.get("mesh_bbox_after_strip_cm"))
    print("joint fractions :", json.dumps(pr.get("joint_height_fraction", {}))[:160])
    h = pr.get("seat_hull_xz") or []
    print(f"\nseat hull, {len(h)} vertices (x, z in cm):")
    for p in h:
        print("   ", p)
    for s in pr.get("slices", []):
        print(f"  {s['level']:<12} pts={s['points']:>4}->{s['after_specks']:>4} "
              f"x={s['x_cm']} z={s['z_cm']} girth={s['girth_cm']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
