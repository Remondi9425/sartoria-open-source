"""Measuring shapes whose girth is known in closed form.

Runs in milliseconds on any machine: no torch, no model weights, no GPU. The
neural part only produces points; everything judged here is what we do with them.
"""
import math

import numpy as np
import pytest

from spike import mesh as M


def ellipse_perimeter(a: float, b: float) -> float:
    """Ramanujan's second approximation — a reference value to check the hull
    against, not shipped code."""
    h = ((a - b) / (a + b)) ** 2
    return math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))


def cylinder(r_x: float, r_z: float, y0: float, y1: float,
             n_ring: int = 220, n_layer: int = 90, cx: float = 0.0) -> np.ndarray:
    """A vertical elliptical cylinder as a cloud of surface points."""
    th = np.linspace(0, 2 * np.pi, n_ring, endpoint=False)
    ys = np.linspace(y0, y1, n_layer)
    x = (cx + r_x * np.cos(th))[None, :].repeat(n_layer, 0).ravel()
    z = (r_z * np.sin(th))[None, :].repeat(n_layer, 0).ravel()
    y = ys[:, None].repeat(n_ring, 1).ravel()
    return np.stack([x, y, z], axis=1)


def test_hull_perimeter_of_a_circle_is_two_pi_r():
    pts = cylinder(10.0, 10.0, 0, 1)
    got = M.girth_at(pts, 0.5, band=0.6)
    assert got == pytest.approx(2 * math.pi * 10.0, rel=2e-3)


def test_hull_perimeter_matches_an_ellipse():
    a, b = 9.2, 8.0
    pts = cylinder(a, b, 0, 1)
    got = M.girth_at(pts, 0.5, band=0.6)
    assert got == pytest.approx(ellipse_perimeter(a, b), rel=3e-3)


def test_the_hull_spans_a_dent_the_way_a_tape_measure_does():
    """The reason for using a hull at all: a tape bridges concavities."""
    pts = cylinder(10.0, 10.0, 0, 1)
    dented = pts.copy()
    bite = (dented[:, 0] > 6) & (np.abs(dented[:, 2]) < 3)
    dented[bite, 0] -= 3.0                        # press a groove into one side
    assert M.girth_at(dented, 0.5, band=0.6) == pytest.approx(
        M.girth_at(pts, 0.5, band=0.6), rel=5e-3)


def test_upright_fixes_a_tilted_body_before_slicing():
    """A tilted body sliced horizontally reads every girth too large."""
    pts = cylinder(10.0, 10.0, 0, 100)
    t = math.radians(22)
    R = np.array([[math.cos(t), -math.sin(t), 0],
                  [math.sin(t), math.cos(t), 0], [0, 0, 1]])
    tilted = pts @ R.T
    pelvis, neck = np.array([0, 10.0, 0]) @ R.T, np.array([0, 90.0, 0]) @ R.T

    naive = M.girth_at(tilted, float(np.median(tilted[:, 1])), band=0.7)
    fixed = M.girth_at(M.upright(tilted, pelvis, neck), 50.0, band=0.7)
    truth = 2 * math.pi * 10.0

    assert naive > truth * 1.03, "the tilt should have inflated the naive reading"
    assert fixed == pytest.approx(truth, rel=5e-3)


def test_rescaling_uses_the_height_the_person_typed():
    pts = cylinder(0.10, 0.10, 0.0, 1.74)         # metres, as the model emits
    scaled, k = M.rescale_to_height(pts, 174.0)
    assert scaled[:, 1].max() - scaled[:, 1].min() == pytest.approx(174.0)
    assert k == pytest.approx(100.0, rel=1e-6)
    assert M.girth_at(scaled, 87.0, band=1.0) == pytest.approx(
        2 * math.pi * 10.0, rel=3e-3)


def test_a_leg_is_measured_alone_not_together_with_its_twin():
    left = cylinder(6.0, 6.0, 0, 80, cx=-12.0)
    right = cylinder(6.0, 6.0, 0, 80, cx=12.0)
    both = np.vstack([left, right])
    assert M.girth_at(both, 40.0, band=1.0, near_x=12.0) == pytest.approx(
        2 * math.pi * 6.0, rel=3e-3)
    # both legs are substantial, so neither is discarded as a speck; the hull
    # round the pair is what near_x exists to avoid
    assert M.girth_at(both, 40.0, band=1.0) > 2 * math.pi * 6.0 * 1.5


def test_crotch_sits_just_below_the_hip_joints():
    torso = cylinder(16.0, 11.0, 90, 140)
    left = cylinder(7.0, 7.0, 0, 90, cx=-9.0)
    right = cylinder(7.0, 7.0, 0, 90, cx=9.0)
    body = np.vstack([torso, left, right])
    y = M.crotch_height(body, hip_l=np.array([-9.0, 95.0, 0.0]),
                        hip_r=np.array([9.0, 95.0, 0.0]),
                        pelvis=np.array([0.0, 95.0, 0.0]), height_cm=140.0)
    # Either the anatomical estimate (91.1) or, where the mid-line really is
    # air, what the body itself shows — both are within a couple of cm.
    assert y == pytest.approx(90.5, abs=1.5)


def test_a_slice_with_nothing_in_it_returns_nothing_rather_than_zero():
    pts = cylinder(10.0, 10.0, 0, 10)
    assert M.girth_at(pts, 500.0, band=0.5) is None


# ── the arms ────────────────────────────────────────────────────────────────
def torso_with_arms():
    """A torso with an arm hanging beside it, as a body does when standing."""
    torso = cylinder(15.0, 11.0, 0, 100)
    # Arms hang outside the torso's own outline, which is why they matter.
    arm_l = cylinder(5.0, 5.0, 20, 95, cx=-21.0)
    arm_r = cylinder(5.0, 5.0, 20, 95, cx=21.0)
    return np.vstack([torso, arm_l, arm_r]), torso


def test_a_hull_round_a_slice_swallows_the_arms():
    """The failure this is all about: on a real recording the waist read 149 cm."""
    body, torso = torso_with_arms()
    naive = M.girth_at(body, 50.0, band=1.0)
    truth = M.girth_at(torso, 50.0, band=1.0)
    # The exact factor depends on how far the arms hang; the direction and the
    # scale of the error are the point. On the real clip it turned 85 cm into 149.
    assert naive > truth * 1.3, "expected the arms to inflate the reading"


def test_stripping_the_arm_chain_restores_the_torso():
    body, torso = torso_with_arms()
    # the joint chain the pose model gives us: shoulder, elbow, wrist
    arms = [np.array([[-21.0, 95, 0], [-21.0, 57, 0], [-21.0, 20, 0]]),
            np.array([[21.0, 95, 0], [21.0, 57, 0], [21.0, 20, 0]])]
    stripped = M.strip_chains(body, arms, radius=7.0)
    assert M.girth_at(stripped, 50.0, band=1.0) == pytest.approx(
        M.girth_at(torso, 50.0, band=1.0), rel=0.02)


def test_stripping_leaves_the_legs_alone():
    """Arm removal must not eat the thing being measured."""
    legs = np.vstack([cylinder(7.0, 7.0, 0, 80, cx=-10.0),
                      cylinder(7.0, 7.0, 0, 80, cx=10.0)])
    hands = np.vstack([cylinder(4.0, 4.0, 60, 80, cx=-26.0),
                       cylinder(4.0, 4.0, 60, 80, cx=26.0)])
    arms = [np.array([[-26.0, 80, 0], [-26.0, 60, 0]]),
            np.array([[26.0, 80, 0], [26.0, 60, 0]])]
    stripped = M.strip_chains(np.vstack([legs, hands]), arms, radius=7.0)
    assert M.girth_at(stripped, 70.0, band=1.0, near_x=10.0) == pytest.approx(
        2 * math.pi * 7.0, rel=0.03)


def test_a_few_stray_points_do_not_drag_the_hull_out():
    """A convex hull is decided by its extremes and has no robustness at all.

    Leftover fingertip vertices did this to the seat measurement: 98 cm read
    as 197.
    """
    torso = cylinder(15.0, 11.0, 40, 60)
    fingertips = np.array([[34.0, 50.0, 1.0], [35.0, 50.5, -1.0],
                           [-34.0, 50.0, 0.5], [-35.5, 49.6, 0.0]])
    truth = M.girth_at(torso, 50.0, band=1.0)
    polluted = M.girth_at(np.vstack([torso, fingertips]), 50.0, band=1.0)
    assert polluted == pytest.approx(truth, rel=0.03)


def test_specks_go_but_substantial_pieces_stay():
    """Keeping only the largest group would under-measure a torso that arm
    stripping had cut into two arcs — worse than over-measuring, because it
    looks reasonable."""
    rng = np.random.default_rng(0)
    left = rng.uniform(-1, 1, (120, 2)) + np.array([-20.0, 0.0])
    right = rng.uniform(-1, 1, (110, 2)) + np.array([20.0, 0.0])
    speck = np.array([[300.0, 300.0], [301.0, 300.0]])
    kept = M.drop_specks(np.vstack([left, right, speck]))
    assert len(kept) == 230, "both arcs should survive, the speck should not"


def test_every_vertex_belongs_to_the_bone_it_is_nearest():
    """The rule that replaced removing limbs by proximity.

    A hand hangs beside a thigh, so any sphere wide enough to clear the fingers
    also eats the outside of the leg. Ownership has no such conflict.
    """
    # Real spacing: a hand resting at the side overlaps the thigh in width,
    # which is exactly what defeats removing limbs by proximity.
    thigh = cylinder(8.6, 8.6, 60, 80, cx=-9.5, n_ring=40, n_layer=40)
    hand = cylinder(4.5, 4.5, 66, 78, cx=-21.0, n_ring=40, n_layer=40)
    arm = np.array([[-21.0, 100.0, 0.0], [-21.0, 72.0, 0.0]])
    leg = np.array([[-9.5, 88.0, 0.0], [-9.5, 50.0, 0.0]])

    pts = np.vstack([thigh, hand])
    label = M.label_by_nearest_chain(pts, [arm, leg])
    # Not perfect, and the residual is worth naming exactly: where a hand rests
    # against a thigh, about a fifth of that thigh's outer surface really is
    # nearer the hand's bone than the femur, and no purely geometric rule can
    # separate two surfaces that touch. The hull keeps its front and back
    # extremes, so the measured girth moves less than that fraction suggests.
    # Proximity removal got the same thing wrong by half a leg.
    assert (label[:len(thigh)] == 1).mean() > 0.78, "most of the thigh is a leg"
    assert (label[len(thigh):] == 0).mean() > 0.95, "the hand should stay an arm"
