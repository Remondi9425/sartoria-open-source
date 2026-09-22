"""The seam between a body model's joint ordering and the code that measures.

The first test is the important one and the reason this file exists: it pins
the SMPL rows against the literal numbers that used to be spelled out inline in
nlf.py. A refactor that renames joints is worthless if it also renumbers one,
because the result is not an error — it is a plausible measurement of somebody
else's shoulder.
"""
import numpy as np
import pytest

from spike import nlf
from spike.skeleton import REQUIRED, SMPL, Landmarks, Skeleton, UnknownSkeleton

# Copied by hand from the constants nlf.py carried before skeleton.py existed:
#     J_PELVIS, J_HIP_L, J_HIP_R = 0, 1, 2
#     J_KNEE_L, J_KNEE_R = 4, 5
#     J_ANKLE_L, J_ANKLE_R = 7, 8
#     J_NECK, J_SHOULDER_L, J_SHOULDER_R = 12, 16, 17
#     J_ELBOW_L, J_ELBOW_R = 18, 19
#     J_WRIST_L, J_WRIST_R = 20, 21
#     J_HAND_L, J_HAND_R = 22, 23
AS_IT_WAS = {
    "pelvis": 0, "hip_l": 1, "hip_r": 2, "knee_l": 4, "knee_r": 5,
    "ankle_l": 7, "ankle_r": 8, "neck": 12, "shoulder_l": 16, "shoulder_r": 17,
    "elbow_l": 18, "elbow_r": 19, "wrist_l": 20, "wrist_r": 21,
    "hand_l": 22, "hand_r": 23,
}


def joints(n: int = 24) -> np.ndarray:
    """A skeleton whose every coordinate says which row it came from."""
    return np.arange(n * 3, dtype=float).reshape(n, 3)


def test_the_smpl_rows_are_exactly_the_numbers_that_were_inline():
    assert dict(SMPL.rows) == AS_IT_WAS
    assert SMPL.n_joints == 24


def test_nlf_still_reads_the_smpl_ordering():
    assert nlf.SKELETON is SMPL


def test_sixteen_joints_is_all_the_measuring_asks_for():
    """If this number grows, porting to another body model costs more. It is
    worth noticing when that happens."""
    assert len(REQUIRED) == 16
    assert set(REQUIRED) == set(AS_IT_WAS)


# ── addressing ──────────────────────────────────────────────────────────────

def test_a_name_returns_that_row():
    lm = SMPL.of(joints())
    for name, row in AS_IT_WAS.items():
        assert lm[name].tolist() == [row * 3, row * 3 + 1, row * 3 + 2]


def test_pair_is_left_then_right():
    lm = SMPL.of(joints())
    left, right = lm.pair("hip")
    assert left.tolist() == lm["hip_l"].tolist()
    assert right.tolist() == lm["hip_r"].tolist()


def test_a_level_is_the_mean_height_of_the_two_sides():
    lm = SMPL.of(joints())
    assert lm.level("hip") == pytest.approx((lm["hip_l"][1] + lm["hip_r"][1]) / 2)


def test_a_chain_keeps_the_order_it_was_asked_for():
    lm = SMPL.of(joints())
    chain = lm.chain("hip_l", "knee_l", "ankle_l")
    assert chain.shape == (3, 3)
    assert chain[0].tolist() == lm["hip_l"].tolist()
    assert chain[2].tolist() == lm["ankle_l"].tolist()


def test_an_unknown_joint_name_says_so_rather_than_returning_a_neighbour():
    with pytest.raises(UnknownSkeleton):
        SMPL.of(joints())["tail"]


# ── refusing the wrong skeleton ─────────────────────────────────────────────

def test_a_different_joint_count_is_refused_not_measured():
    """Every site is indexed against this ordering, so a model returning a
    different one does not measure something slightly wrong."""
    with pytest.raises(UnknownSkeleton):
        SMPL.of(joints(17))


def test_a_skeleton_missing_a_joint_cannot_be_built():
    with pytest.raises(UnknownSkeleton) as e:
        Skeleton("half", 24, {k: v for k, v in AS_IT_WAS.items() if k != "neck"})
    assert "neck" in str(e.value)


def test_a_skeleton_pointing_outside_itself_cannot_be_built():
    with pytest.raises(UnknownSkeleton):
        Skeleton("wrong", 12, AS_IT_WAS)


# ── the point of the exercise ───────────────────────────────────────────────

def test_another_body_model_is_a_value_and_not_an_edit():
    """The whole reason for this file. A different model's ordering is
    declared, not coded around, and everything above works unchanged."""
    reversed_rows = {k: 23 - v for k, v in AS_IT_WAS.items()}
    other = Skeleton("some-other-model", 24, reversed_rows)
    lm = other.of(joints())
    assert lm["pelvis"].tolist() == SMPL.of(joints())["hand_r"].tolist()
    # and the measuring code takes it without knowing which model it came from
    assert len(nlf._chains(lm)) == 5


def test_the_frame_carries_its_own_skeleton():
    fm = nlf.FrameMesh(points=np.zeros((10, 3)), joints=joints(), uncertainty=1.0,
                       scale_factor=1.0, outside_frame={}, raw_bbox=[],
                       rot_bbox=[], raw_p98=[])
    assert isinstance(fm.marks, Landmarks)
    assert fm.marks["pelvis"].tolist() == [0.0, 1.0, 2.0]
