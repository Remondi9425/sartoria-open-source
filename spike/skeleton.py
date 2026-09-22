"""Which row of a joint array is which part of a body.

`mesh.py` — the hulls, the slices, the crotch, the limb separation — names the
places it needs and never indexes a skeleton. `nlf.py` used to do both, and the
model's joint ordering leaked through it into everything downstream. This
module is the seam: a body model declares where its joints live, and every
caller above works in names.

The point is not tidiness. Both halves of the current stack — the NLF weights
and the SMPL model they regress — are licensed for noncommercial research, so a
SartorIA that sells anything has to stand on a different body model. When that
day comes the work should be writing one `Skeleton` and checking it, not
rereading the geometry to find out which of `j[16]` and `j[17]` was the left
shoulder.

Sixteen joints are all the measuring ever asks for, and no human body model
lacks them.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

import numpy as np

# The joints that come in pairs, and the two that do not.
SIDED = ("hip", "knee", "ankle", "shoulder", "elbow", "wrist", "hand")
CENTRED = ("pelvis", "neck")
REQUIRED: tuple[str, ...] = CENTRED + tuple(
    f"{site}_{side}" for site in SIDED for side in ("l", "r"))


class UnknownSkeleton(ValueError):
    """A joint array that is not the skeleton we were promised.

    Raised rather than tolerated. Every measurement site is indexed against
    this ordering, so a model that returns a different one does not measure
    something slightly wrong — it measures somebody else's shoulder.
    """


@dataclass(frozen=True)
class Skeleton:
    """A body model's joint ordering, named."""

    name: str
    n_joints: int
    rows: Mapping[str, int]

    def __post_init__(self) -> None:
        missing = [k for k in REQUIRED if k not in self.rows]
        if missing:
            raise UnknownSkeleton(
                f"{self.name} does not say where these joints are: "
                f"{', '.join(missing)}")
        outside = {k: v for k, v in self.rows.items()
                   if not 0 <= int(v) < self.n_joints}
        if outside:
            raise UnknownSkeleton(
                f"{self.name} places {outside} outside its own "
                f"{self.n_joints} joints")

    def of(self, joints: np.ndarray) -> "Landmarks":
        """Address this frame's joints by name, checking the shape first."""
        if len(joints) != self.n_joints:
            raise UnknownSkeleton(
                f"expected the {self.n_joints}-joint {self.name} skeleton, got "
                f"{len(joints)} — the measurement sites are indexed against "
                f"{self.name} and would be wrong")
        return Landmarks(joints, self)


class Landmarks:
    """One body's joints, addressed by name rather than by row."""

    __slots__ = ("joints", "skeleton")

    def __init__(self, joints: np.ndarray, skeleton: Skeleton) -> None:
        self.joints = joints
        self.skeleton = skeleton

    def __getitem__(self, name: str) -> np.ndarray:
        try:
            return self.joints[self.skeleton.rows[name]]
        except KeyError:
            raise UnknownSkeleton(
                f"{self.skeleton.name} has no joint called {name!r}") from None

    def pair(self, site: str) -> tuple[np.ndarray, np.ndarray]:
        """Left and right, in that order."""
        return self[f"{site}_l"], self[f"{site}_r"]

    def height(self, *names: str) -> float:
        """The mean height of the named joints, which is what a level is."""
        return float(np.mean([self[n][1] for n in names]))

    def level(self, site: str) -> float:
        """The height of a paired joint — hips, knees, shoulders."""
        return self.height(f"{site}_l", f"{site}_r")

    def chain(self, *names: str) -> np.ndarray:
        """The named joints as a polyline, for measuring distance to a bone."""
        return np.stack([self[n] for n in names])


# SMPL's 24-joint kinematic tree. These are the numbers that were spelled out
# inline in nlf.py; tests/test_skeleton.py pins them against that list, so this
# file cannot quietly disagree with the code it replaced.
SMPL = Skeleton("smpl", 24, {
    "pelvis": 0,
    "hip_l": 1, "hip_r": 2,
    "knee_l": 4, "knee_r": 5,
    "ankle_l": 7, "ankle_r": 8,
    "neck": 12,
    "shoulder_l": 16, "shoulder_r": 17,
    "elbow_l": 18, "elbow_r": 19,
    "wrist_l": 20, "wrist_r": 21,
    "hand_l": 22, "hand_r": 23,
})
