"""Combining frames into one number, and what weighting them changes.

The subject here is not the geometry — that is tests/test_mesh.py — but the
step after it: twenty-odd frames each with their own opinion, reduced to one
figure and a confidence.
"""
import numpy as np
import pytest

from spike import config as C
from spike.nlf import _weighted_quantile, reconcile, weights_from_uncertainty


def frames(**sites) -> list[dict]:
    """One dict per frame from parallel lists of per-site values."""
    n = len(next(iter(sites.values())))
    return [{s: vals[i] for s, vals in sites.items()} for i in range(n)]


# ── the estimator ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("vals", [
    [1.0, 2.0, 3.0],
    [1.0, 2.0, 3.0, 4.0],
    [5.0, 1.0, 4.0, 2.0, 3.0],
    [7.0],
    [2.0, 2.0],
])
def test_equal_weights_reproduce_the_plain_median(vals):
    """Switching weighting off must not move any number. Otherwise a comparison
    between weighted and unweighted measures two changes at once."""
    assert _weighted_quantile(np.array(vals), None, 0.5) == pytest.approx(
        float(np.median(vals)))


def test_uniform_weights_are_the_same_as_no_weights():
    vals = np.array([10.0, 12.0, 11.0, 15.0])
    assert (_weighted_quantile(vals, np.full(4, 0.25), 0.5)
            == pytest.approx(_weighted_quantile(vals, None, 0.5)))


def test_weight_moves_the_median_towards_the_heavier_frames():
    vals = np.array([70.0, 70.0, 80.0, 80.0])
    light = _weighted_quantile(vals, np.array([1.0, 1.0, 1.0, 1.0]), 0.5)
    heavy = _weighted_quantile(vals, np.array([9.0, 9.0, 1.0, 1.0]), 0.5)
    assert light == pytest.approx(75.0)
    assert heavy < 72.0


def test_a_frame_with_no_weight_is_as_good_as_absent():
    vals = np.array([70.0, 71.0, 72.0, 200.0])
    with_outlier = _weighted_quantile(vals, np.array([1.0, 1.0, 1.0, 0.0]), 0.5)
    without = _weighted_quantile(vals[:3], None, 0.5)
    assert with_outlier == pytest.approx(without)


def test_weights_that_sum_to_nothing_fall_back_to_the_median():
    vals = np.array([1.0, 2.0, 3.0])
    assert _weighted_quantile(vals, np.zeros(3), 0.5) == pytest.approx(2.0)


# ── turning uncertainty into weights ────────────────────────────────────────

def test_exponent_zero_means_no_weighting_at_all():
    assert weights_from_uncertainty([40.0, 50.0, 60.0], exponent=0) is None


def test_inverse_variance_weighting_is_the_square():
    w = weights_from_uncertainty([2.0, 4.0], exponent=2)
    assert w[0] / w[1] == pytest.approx(4.0)


def test_one_unusable_uncertainty_disables_weighting_for_the_whole_clip():
    """Treating 'unknown' as 'average' is a weighting nobody chose, and it
    would hide the fact that the information was missing."""
    assert weights_from_uncertainty([40.0, float("nan"), 60.0], exponent=2) is None
    assert weights_from_uncertainty([40.0, 0.0, 60.0], exponent=2) is None
    assert weights_from_uncertainty([], exponent=2) is None


def test_the_default_exponent_comes_from_config():
    w = weights_from_uncertainty([2.0, 4.0])
    if C.UNCERTAINTY_EXPONENT <= 0:
        assert w is None
    else:
        assert w[0] > w[1]


# ── the whole step ──────────────────────────────────────────────────────────

def test_reconcile_without_weights_is_unchanged_by_this_feature():
    per = frames(**{s: [50.0, 52.0, 54.0, 56.0, 58.0] for s in C.ALL_MEASUREMENTS})
    values, _, _ = reconcile(per)
    assert all(v == pytest.approx(54.0) for v in values.values())


def test_weighting_pulls_the_answer_towards_the_frames_the_model_trusted():
    """The point of the feature, stated as a test: two clusters, and the
    reported figure follows the one with the lower uncertainty."""
    waist = [72.0] * 5 + [78.0] * 5
    per = frames(**{s: waist for s in C.ALL_MEASUREMENTS})
    unsure = [40.0] * 5 + [80.0] * 5          # the 78 cluster is the doubtful one
    plain, _, _ = reconcile(per)
    weighted, _, _ = reconcile(per, weights_from_uncertainty(unsure, exponent=2))
    assert plain["waist"] == pytest.approx(75.0)
    assert weighted["waist"] < 73.0


def test_a_site_missing_from_some_frames_keeps_the_weights_lined_up():
    """The weights are indexed by frame; the values only by the frames that had
    that site. Lose the alignment and a waist gets weighted by another frame's
    uncertainty, silently and plausibly.

    Frame 0 has no waist and carries most of the weight, so a naive
    weights[:len(values)] would pull the answer to the light frame instead of
    the heavy one.
    """
    base = {s: 50.0 for s in C.ALL_MEASUREMENTS}
    per = [
        {**base, "hip": 95.0}, {**base, "waist": 70.0}, {**base, "waist": 80.0},
    ]
    del per[0]["waist"]
    values, _, _ = reconcile(per, np.array([100.0, 1.0, 50.0]))
    # Aligned, the waist is decided by frame 2 (weight 50) over frame 1
    # (weight 1). Misaligned, frame 0's weight of 100 would land on the 70.
    assert values["waist"] > 79.0


def test_spread_still_decides_the_confidence():
    tight = frames(**{s: [80.0, 80.1, 79.9, 80.0, 80.05] for s in C.ALL_MEASUREMENTS})
    loose = frames(**{s: [60.0, 80.0, 100.0, 70.0, 90.0] for s in C.ALL_MEASUREMENTS})
    _, tight_conf, _ = reconcile(tight)
    _, loose_conf, _ = reconcile(loose)
    assert tight_conf["waist"] == "high"
    assert loose_conf["waist"] == "low"


def test_an_implausible_figure_is_low_confidence_however_the_frames_agree():
    per = frames(**{s: [300.0] * 6 for s in C.ALL_MEASUREMENTS})
    _, conf, _ = reconcile(per)
    assert conf["waist"] == "low"


# ── weighting by where the camera was ───────────────────────────────────────

def test_angle_exponent_zero_means_no_weighting():
    from spike.nlf import weights_from_angle
    assert weights_from_angle([0.0, 45.0, 90.0], exponent=0) is None


def test_a_positive_exponent_favours_the_side_views():
    from spike.nlf import weights_from_angle
    w = weights_from_angle([0.0, 90.0], exponent=2)
    assert w[1] > w[0]


def test_a_negative_exponent_favours_the_frontal_views():
    from spike.nlf import weights_from_angle
    w = weights_from_angle([0.0, 90.0], exponent=-2)
    assert w[0] > w[1]


def test_no_frame_is_ever_driven_to_zero_weight():
    """A face-on frame is not worthless; it knows about a different axis. A
    power law would zero it and hand the whole measurement to a few frames."""
    from spike.nlf import weights_from_angle
    w = weights_from_angle([0.0, 30.0, 90.0], exponent=6)
    assert (w > 0).all()


def test_the_turn_is_folded_so_left_and_right_are_the_same_pose():
    from spike.nlf import weights_from_angle
    w = weights_from_angle([90.0, -90.0, 270.0], exponent=3)
    assert w[0] == pytest.approx(w[1]) == pytest.approx(w[2])


def test_coverage_balancing_gives_each_sector_one_vote():
    """Eight frames face-on and two side-on: after balancing, the two groups
    carry the same total weight, so lingering cannot win on headcount."""
    from spike.nlf import weights_from_coverage
    yaws = [0.0] * 8 + [90.0] * 2
    w = weights_from_coverage(yaws)
    assert w[:8].sum() == pytest.approx(w[8:].sum())


def test_coverage_balancing_is_neutral_when_the_turn_was_even():
    from spike.nlf import weights_from_coverage
    w = weights_from_coverage([5.0, 20.0, 40.0, 55.0, 70.0, 85.0])
    assert np.allclose(w, w[0])


def test_the_weightings_multiply_and_are_all_off_by_default():
    from spike.nlf import frame_weights
    assert frame_weights([40.0, 50.0], [0.0, 90.0]) is None


def test_reconcile_follows_the_angle_when_the_two_views_disagree():
    """The measured failure, as a test: frames facing the camera say one thing
    and side-on frames another, and the exponent picks which one is heard."""
    from spike.nlf import weights_from_angle
    waist = [75.0] * 6 + [72.0] * 6
    yaws = [0.0] * 6 + [90.0] * 6
    per = frames(**{s: waist for s in C.ALL_MEASUREMENTS})
    to_side, _, _ = reconcile(per, weights_from_angle(yaws, exponent=4))
    to_front, _, _ = reconcile(per, weights_from_angle(yaws, exponent=-4))
    assert to_side["waist"] < 73.0
    assert to_front["waist"] > 74.0
