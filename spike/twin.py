"""Assemble the digital twin.

Deliberately a record, not an avatar: measurements, how sure we are of each,
what the capture looked like, and which method produced it. A picture of a body
cannot be audited; this can.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from . import config as C
from .capture import Verdict

METHOD = "nlf_smpl_hull_v1"


@dataclass
class Measurement:
    """One number, and how much to trust it."""
    cm: float
    quality: str                # high | medium | low
    note: str = ""


@dataclass
class CaptureQuality:
    head_visible: bool | None          # None when no person was detected at all
    feet_visible: bool | None
    body_in_frame: bool | None
    usable_frames: int
    rotation_coverage: float
    frontal_yaw_deg: float | None = None
    profile_yaw_deg: float | None = None


@dataclass
class DigitalTwin:
    session_id: str
    height_cm: float
    measurements_cm: dict[str, float]
    measurement_confidence: dict[str, str]
    measurement_notes: dict[str, str]
    capture_quality: CaptureQuality
    processing_method: str = METHOD
    data_quality_tier: str = "C"
    # The customer's legs as surface points, in centimetres, standing on zero
    # and centred on the hips. Legs only: the mesh the model returns includes a
    # head, and what is not transmitted cannot be mishandled.
    leg_cloud_cm: list[list[float]] | None = None
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))

    def to_json(self, indent: int = 2) -> str:
        d: dict[str, Any] = asdict(self)
        return json.dumps(d, indent=indent, ensure_ascii=False)


def tier(conf: dict[str, str]) -> str:
    """A: trust it. B: usable, say so. C: show it but ask for confirmation.

    Only the measurements that actually pick a jeans size are counted — a soft
    ankle reading should not drag down a good waist and inseam.
    """
    key = ("waist", "hip", "inseam", "rise")
    grades = [conf.get(k, "low") for k in key]
    if all(g == "high" for g in grades):
        return "A"
    if any(g == "low" for g in grades):
        return "C"
    return "B"


def build(session_id: str, height_cm: float, ms: dict[str, Measurement],
          quality: CaptureQuality,
          leg_cloud: list[list[float]] | None = None) -> DigitalTwin:
    conf = {k: v.quality for k, v in ms.items()}
    return DigitalTwin(
        session_id=session_id,
        height_cm=height_cm,
        measurements_cm={k: ms[k].cm for k in C.ALL_MEASUREMENTS},
        measurement_confidence=conf,
        measurement_notes={k: v.note for k, v in ms.items() if v.note},
        capture_quality=quality,
        data_quality_tier=tier(conf),
        leg_cloud_cm=leg_cloud,
    )


def refused(session_id: str, height_cm: float, verdict: Verdict,
            quality: CaptureQuality) -> str:
    """What comes back when a gate blocks. A cause, never a generic failure."""
    return json.dumps({
        "session_id": session_id,
        "height_cm": height_cm,
        "status": "capture_rejected",
        "reason": verdict.message(),
        "all_reasons": verdict.blocking,
        "coaching": verdict.coaching,
        "capture_quality": asdict(quality),
        "processing_method": METHOD,
    }, indent=2, ensure_ascii=False)
