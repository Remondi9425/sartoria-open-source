"""measure_one, on a body whose measurements are known by construction.

This exists because the whole measurement function was being debugged through a
deploy cycle: three minutes to learn that a name was undefined. It is also the
test that would have caught exactly that — the seat assignment was deleted by a
bad edit and the container answered anyway, from a stale copy.

No torch here: FrameMesh is a plain dataclass, so the neural part is not needed
to test what we do with its output.
"""
import math

import numpy as np
import pytest

from spike.nlf import FrameMesh, measure_one


def tube(r_x, r_z, y0, y1, cx=0.0, cz=0.0, n_ring=48, n_layer=90):
    th = np.linspace(0, 2 * np.pi, n_ring, endpoint=False)
    ys = np.linspace(y0, y1, n_layer)
    x = (cx + r_x * np.cos(th))[None, :].repeat(n_layer, 0).ravel()
    z = (cz + r_z * np.sin(th))[None, :].repeat(n_layer, 0).ravel()
    y = ys[:, None].repeat(n_ring, 1).ravel()
    return np.stack([x, y, z], axis=1)


# A 168 cm body with the proportions of an average adult male.
TRUE = {"waist": 2 * math.pi * 13.0, "hip": 2 * math.pi * 15.5,
        "thigh": 2 * math.pi * 8.6, "knee": 2 * math.pi * 6.1,
        "calf": 2 * math.pi * 5.9, "ankle": 2 * math.pi * 3.5,
        "inseam": 78.0, "outseam": 103.0}


def body() -> FrameMesh:
    torso = np.vstack([
        tube(15.5, 15.5, 78, 96),            # seat
        tube(13.0, 13.0, 96, 112),           # waist
        tube(16.0, 16.0, 112, 140),          # chest
        tube(6.0, 6.0, 140, 152),            # neck
        tube(9.0, 9.0, 152, 168),            # head
    ])
    legs = np.vstack([
        tube(8.6, 8.6, 60, 78, cx=-9.5), tube(8.6, 8.6, 60, 78, cx=9.5),
        tube(6.1, 6.1, 40, 60, cx=-9.5), tube(6.1, 6.1, 40, 60, cx=9.5),
        tube(5.9, 5.9, 12, 40, cx=-9.5), tube(5.9, 5.9, 12, 40, cx=9.5),
        tube(3.5, 3.5, 0, 12, cx=-9.5), tube(3.5, 3.5, 0, 12, cx=9.5),
    ])
    # Arms hanging at the sides, hands at hip height — the arrangement that
    # broke the seat and thigh on the first real recording.
    arms = np.vstack([
        tube(5.0, 5.0, 100, 138, cx=-21.0), tube(5.0, 5.0, 100, 138, cx=21.0),
        tube(4.2, 4.2, 78, 100, cx=-21.0), tube(4.2, 4.2, 78, 100, cx=21.0),
        tube(5.5, 5.5, 66, 78, cx=-21.0), tube(5.5, 5.5, 66, 78, cx=21.0),
    ])
    # Joint heights follow what NLF actually reports on a real recording —
    # its hip joint sits at about 0.485 of stature, not at the textbook
    # trochanter — because that is what the measuring code consumes.
    joints = np.zeros((24, 3))
    joints[0] = [0, 86, 0]                                   # pelvis
    joints[1], joints[2] = [-9.5, 81.5, 0], [9.5, 81.5, 0]   # hips
    joints[4], joints[5] = [-9.5, 50, 0], [9.5, 50, 0]       # knees
    joints[7], joints[8] = [-9.5, 10, 0], [9.5, 10, 0]       # ankles
    joints[12] = [0, 142, 0]                                 # neck
    joints[15] = [0, 158, 0]                                 # head
    joints[16], joints[17] = [-19, 138, 0], [19, 138, 0]     # shoulders
    joints[18], joints[19] = [-21, 100, 0], [21, 100, 0]     # elbows
    joints[20], joints[21] = [-21, 78, 0], [21, 78, 0]       # wrists
    joints[22], joints[23] = [-21, 72, 0], [21, 72, 0]       # hands
    return FrameMesh(np.vstack([torso, legs, arms]), joints, 1.0, 1.0,
                     {"top": False, "bottom": False, "left": False, "right": False},
                     [0, 0, 0], [0, 0, 0], [0, 0, 0], 168.0)


@pytest.fixture(scope="module")
def measured():
    got = measure_one(body())
    assert got is not None, "measure_one refused a clean synthetic body"
    return got


def test_every_measurement_comes_back(measured):
    # Keys starting with an underscore are working values passed back to the
    # caller — where the waist landed, so the leg cloud can be cropped at the
    # same level — and are not measurements.
    public = {k for k in measured if not k.startswith("_")}
    assert public == {"waist", "hip", "thigh", "knee", "calf",
                      "ankle", "inseam", "outseam", "rise"}


def test_working_values_never_reach_the_reconciled_numbers(measured):
    from spike.config import ALL_MEASUREMENTS
    from spike.nlf import reconcile
    values, conf, _ = reconcile([measured])
    assert set(values) <= set(ALL_MEASUREMENTS)
    assert not any(k.startswith("_") for k in values)


@pytest.mark.parametrize("site,tol_pct", [
    ("waist", 6), ("hip", 8), ("thigh", 10),
    ("knee", 8), ("calf", 10), ("ankle", 12),
])
def test_girths_are_near_the_truth(measured, site, tol_pct):
    err = abs(measured[site] - TRUE[site]) / TRUE[site] * 100
    assert err < tol_pct, f"{site}: {measured[site]:.1f} vs {TRUE[site]:.1f} ({err:.0f}%)"


def test_the_arms_are_not_measured_as_part_of_the_body(measured):
    """The failure that turned an 80 cm waist into 149 and a seat into 185."""
    assert measured["waist"] < TRUE["waist"] * 1.25
    assert measured["hip"] < TRUE["hip"] * 1.25


def test_one_leg_is_measured_not_both(measured):
    assert measured["thigh"] < TRUE["thigh"] * 1.4
    assert measured["knee"] < TRUE["knee"] * 1.4


@pytest.mark.parametrize("site", ["inseam", "outseam"])
def test_lengths_are_near_the_truth(measured, site):
    assert measured[site] == pytest.approx(TRUE[site], abs=6.0)
