"""Whether the clip ever showed the side.

The pipeline used to hardcode rotation_coverage to zero and never look at it,
so a clip filmed entirely from the front passed — and because frontal frames
agree with one another, the depth the model had merely assumed came back
labelled high confidence.
"""
import pytest

from spike.pipeline_smpl import judge_turn


def turning(step=10):
    return [float(y) for y in range(-90, 91, step)]


def test_a_full_turn_passes():
    t = judge_turn(turning())
    assert t.blocking is None and t.coaching is None
    assert t.coverage > 0.9


def test_standing_still_facing_the_camera_is_blocked():
    t = judge_turn([1.0, -2.0, 0.5, 3.0] * 6)
    assert t.blocking is not None
    assert "from the side" in t.blocking
    assert t.coverage < 0.2


def test_filmed_only_from_the_side_is_blocked_too():
    t = judge_turn([88.0, 90.0, -89.0, 87.0] * 5)
    assert t.blocking is not None and "face on" in t.blocking


def test_two_poses_and_a_cut_is_not_a_turn():
    """A front and a side satisfy "we saw both" without the body ever having
    rotated — the case the review pointed at."""
    t = judge_turn([0.0, 1.0, 2.0, 89.0, 90.0, 88.0] * 3)
    assert t.blocking is not None and "not a turn" in t.blocking


def test_a_turn_with_gaps_gets_advice_not_a_block():
    t = judge_turn([0.0, 20.0, 40.0, 88.0] * 3)
    assert t.blocking is None
    assert t.coaching is not None and "more slowly" in t.coaching


def test_no_frames_is_blocked():
    assert judge_turn([]).blocking is not None


def test_yaw_is_folded_so_facing_away_counts_as_frontal():
    """Turning through 180 shows the back, which is as good as the front for
    width — what matters is that the camera saw the body square on."""
    t = judge_turn([179.0, -178.0, 95.0, 90.0, 120.0, 150.0])
    assert t.blocking is None


@pytest.mark.parametrize("yaws,covered", [
    ([0.0] * 30, 0.17),          # one bucket: never moved
    (turning(30), 0.67),          # 0, 30, 60 and 90 — four of six
    (turning(8), 1.0),
])
def test_coverage_counts_how_much_of_the_half_turn_was_seen(yaws, covered):
    assert judge_turn(yaws).coverage == pytest.approx(covered, abs=0.1)


def test_the_same_pose_from_either_side_is_not_two_poses():
    """+90 and −90 are one orientation seen by one camera. Counting them
    separately made a front and a side look like a third of a turn."""
    from spike.mesh import rotation_coverage
    assert rotation_coverage([90.0] * 8) == rotation_coverage([-90.0] * 8)
    assert rotation_coverage([90.0, -90.0] * 8) == rotation_coverage([90.0] * 8)
