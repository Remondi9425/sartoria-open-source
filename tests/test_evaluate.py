"""The evaluation, which is the only thing that will ever say whether this works.

It had a metric that reported "about 0.0 cm once the per-site bias is removed"
from a single body. A number that decides whether a project continues deserves
tests more than the geometry does.
"""
import math

import pytest

from spike.evaluate import (MIN_FOR_CALIBRATION, SiteResult, compare,
                            leave_one_out_mae, load_truth, verdict)


def site(name, errors, **kw):
    absd = [abs(e) for e in errors]
    return SiteResult(
        name=name, n=len(errors),
        bias_cm=sum(errors) / len(errors),
        mae_cm=sum(absd) / len(absd),
        p50_cm=sorted(absd)[len(absd) // 2],
        within_1cm=sum(x <= 1 for x in absd) / len(absd),
        within_2cm=sum(x <= 2 for x in absd) / len(absd),
        mae_after_calibration_cm=leave_one_out_mae(errors),
        errors=errors, **kw)


def test_one_person_cannot_be_calibrated_against_themselves():
    """The old formula, |MAE − |bias||, returned 0.0 here however big the error."""
    assert leave_one_out_mae([5.0]) is None
    assert leave_one_out_mae([5.0] * (MIN_FOR_CALIBRATION - 1)) is None


def test_a_pure_offset_calibrates_away():
    assert leave_one_out_mae([3.0] * 6) == pytest.approx(0.0, abs=1e-9)


def test_scatter_does_not_calibrate_away():
    """Removing an offset cannot remove disagreement, and the number must
    not pretend otherwise."""
    errors = [3.0, -3.0, 3.0, -3.0, 3.0, -3.0]
    assert leave_one_out_mae(errors) > 3.0


def test_the_offset_is_never_fitted_to_the_body_it_scores():
    """One outlier must not be able to absorb itself."""
    errors = [1.0, 1.0, 1.0, 1.0, 1.0, 11.0]
    naive = sum(abs(e - sum(errors) / len(errors)) for e in errors) / len(errors)
    assert leave_one_out_mae(errors) > naive


def test_verdict_refuses_below_five_people():
    out = verdict([site("waist", [1.5]), site("inseam", [-2.2])])
    assert "NO VERDICT" in out and "1 person" in out


def test_verdict_needs_both_deciding_sites():
    assert "NO VERDICT" in verdict([site("waist", [0.5] * 8)])


def test_verdict_holds_when_the_raw_error_is_small_enough():
    out = verdict([site("waist", [0.4] * 8), site("inseam", [-0.6] * 8)])
    assert out.startswith("VIDEO ROUTE HOLDS")


def test_verdict_reports_the_held_out_number_not_a_fitted_one():
    out = verdict([site("waist", [3.0] * 8), site("inseam", [3.0] * 8)])
    assert "AFTER CALIBRATION" in out and "held out of its own fit" in out


def test_verdict_fails_when_the_error_is_large_and_not_an_offset():
    out = verdict([site("waist", [6.0, -6.0] * 4), site("inseam", [0.2] * 8)])
    assert "FAILS" in out or "BORDERLINE" in out


def test_ground_truth_file_ignores_its_own_instructions(tmp_path):
    """The template starts with comments, and csv.DictReader took the first of
    them as the header — the file parsed to nothing at all."""
    f = tmp_path / "truth.csv"
    f.write_text("# how to measure: see the README\n"
                 "# leave a cell empty if you did not measure it\n"
                 "session_id,height_cm,waist,inseam\n"
                 "a,168,88,79\n")
    assert load_truth(f) == {"a": {"waist": 88.0, "inseam": 79.0}}


def test_a_rejected_capture_is_missing_not_perfect():
    truth = {"a": {"waist": 88.0}, "b": {"waist": 90.0}}
    twins = {"a": {"session_id": "a", "measurements_cm": {"waist": 89.0}}}
    results, summary = compare(truth, twins)
    assert summary["sessions_rejected_or_missing"] == 1
    assert results[0].n == 1
