"""Constants for the measurement engine.

Everything here is a calibration target, not a truth. Finding out which of these
numbers are wrong, and by how much, is what the first real recordings are for.
"""
import os

# ── capture gates ───────────────────────────────────────────────────────────
# Below this there is nothing to reconcile across frames, and agreement
# between three or four of them is not evidence of anything. Applied both to
# the bodies found and to the frames that survive measuring.
MIN_USABLE_FRAMES = 12
# How many frames may lose the crown past the frame edge before the scale is
# unsupported. NLF completes a body that runs out of shot, so a vertex landing
# outside the image is the model inferring rather than seeing.
CROWN_TOLERANCE = 0.4
# Sample at most this many frames from a clip.
TARGET_FRAMES = 90

# Turning. A body model returns a full 3-D mesh from a single frontal view, but
# its depth there is the model's prior, not an observation of this person — and
# frontal frames agree with each other, so agreement would report high
# confidence in a number nobody measured. A side view is what makes depth real.
FRONTAL_YAW_TOL_DEG = 25.0      # |yaw| under this counts as facing the camera
PROFILE_YAW_MIN_DEG = 55.0      # |yaw| over this counts as side-on
# Six 15-degree buckets from face-on to side-on. A smooth turn fills all of
# them; a coarse one about five; a front and a side with nothing between fills
# two, and that is two poses rather than a body rotating.
ROTATION_COVERAGE_MIN = 0.75    # below this, advise turning more slowly
ROTATION_COVERAGE_FLOOR = 0.5   # below this, it was not a turn

# ── plausibility envelope ───────────────────────────────────────────────────
# cm, generous adult ranges — outside these we refuse rather than guess.
PLAUSIBLE_CM = {
    "waist":   (55.0, 160.0),
    "hip":     (70.0, 170.0),
    "thigh":   (35.0, 95.0),
    "knee":    (28.0, 60.0),
    "calf":    (25.0, 60.0),
    "ankle":   (16.0, 38.0),
    "inseam":  (55.0, 105.0),
    "outseam": (80.0, 135.0),
    "rise":    (18.0, 42.0),
}

# ── reconciling frames ──────────────────────────────────────────────────────
# How hard to lean on the model's own confidence when combining frames.
# 0 is equal weight for every frame; 2 is inverse-variance weighting, which is
# the right arithmetic if NLF's vertex uncertainty is a standard deviation.
# Read what it buys before raising it: the uncertainty says how sure the model
# is, not how much of the body the camera saw, and those two come apart exactly
# in a frontal view — where depth is the prior and the model is confident.
UNCERTAINTY_EXPONENT = float(os.environ.get("SARTORIA_UNCERTAINTY_EXPONENT", "0"))

# How hard to lean on where the camera was standing. A frame's weight is
# exp(ANGLE_EXPONENT * s), where s runs 0 face-on to 1 side-on: positive
# favours the side views, negative the frontal ones, 0 treats them alike.
# Neither end is obviously right. A camera square to the body measures its
# width and infers its depth; side-on it measures depth and infers width. Both
# halves of a girth are needed, and every single frame only ever has one.
ANGLE_EXPONENT = float(os.environ.get("SARTORIA_ANGLE_EXPONENT", "0"))
# Give every 15-degree sector of the turn the same say, whatever share of the
# clip it happened to occupy. This one asserts nothing about which view is
# better; it removes the effect of lingering face-on before starting to turn.
ANGLE_BALANCE = os.environ.get("SARTORIA_ANGLE_BALANCE", "0") not in ("", "0", "false", "False")

CIRCUMFERENCES = ("waist", "hip", "thigh", "knee", "calf", "ankle")
LENGTHS = ("inseam", "outseam", "rise")
ALL_MEASUREMENTS = CIRCUMFERENCES + LENGTHS

# Overridable so a container can bake the weights in at build time rather than
# fetch half a gigabyte on every cold start.
NLF_MODEL_PATH = os.environ.get(
    "SARTORIA_NLF_MODEL", "models/nlf_l_multi.torchscript")
