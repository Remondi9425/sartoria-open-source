"""SMPL body estimation with NLF, and the nine measurements taken off the mesh.

Runs only where torch and the weights are — that means Modal, not a laptop. The
measuring itself lives in mesh.py, which is plain numpy and tested on shapes
whose girth is known in closed form.

Licence: the NLF code is MIT, but the released weights are for **noncommercial
research use**. Fine for a Project Work; not fine for a business, and that has
to be settled before SartorIA is one.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import config as C
from . import mesh as M
from . import skeleton as S

# The weights URL, size and hash are pinned in modal_app.py, where they are
# used at image build time.

# Which body model's joint ordering this file reads. The only line that has to
# change to measure from a different one — see skeleton.py for why that matters.
SKELETON = S.SMPL

# A slice this thick, in cm, around each measurement height. Thin enough not to
# smear a taper, thick enough to catch points on a 6890-vertex body.
BAND_CM = 1.2

# How far from the arm's own bones to discard mesh points, in cm. An upper arm
# is about 5 cm thick; the margin covers a sleeve and the pose model's slack
# without reaching the ribcage at the heights we measure.
ARM_RADIUS_CM = 8.0
# How far the subject may move between sampled frames, and how much their
# apparent size may change, before the frame is treated as somebody else.
# Both are fractions of the body's own height, so they hold at any distance.
SUBJECT_JUMP = 0.35
SUBJECT_RESIZE = 0.15
# The chain ends mid-palm, but SMPL packs roughly eight hundred vertices into
# each hand and the fingers reach well past that joint. Left behind, they sit
# at hip height — which is why the seat and thigh were the only measurements
# wrong, while the knee below and the waist above were right.
HAND_REACH_CM = 14.0
# Fingers splay, so the palm is cleared as a sphere rather than a tube.
HAND_SPHERE_CM = 15.0


def _arm_chain(lm: "S.Landmarks", side: str) -> np.ndarray:
    """The arm's bones, continued past the palm to cover the fingers."""
    pts = lm.chain(f"shoulder_{side}", f"elbow_{side}",
                   f"wrist_{side}", f"hand_{side}")
    reach = pts[3] - pts[2]
    n = float(np.linalg.norm(reach))
    if n > 1e-6:
        pts = np.vstack([pts, pts[3] + reach / n * HAND_REACH_CM])
    return pts


@dataclass
class FrameMesh:
    """One frame's body, already upright and in centimetres."""
    points: np.ndarray            # (6890, 3)
    joints: np.ndarray            # (24, 3)
    uncertainty: float            # mean predicted vertex uncertainty
    scale_factor: float           # how far the model's size guess was off
    outside_frame: dict            # which image edges the body ran past
    raw_bbox: list                 # extents as the model emitted them
    rot_bbox: list                 # extents after standing the body upright
    raw_p98: list                  # the same extents ignoring the outer 1%
    height_cm: float = 0.0         # the stature the mesh was scaled to
    yaw: float = 0.0               # 0 square to the camera, ±90 side-on
    betas: list | None = None      # SMPL shape vector, as the model regressed it
    # Which ordering `joints` is in. Carried on the frame rather than assumed
    # by the code that measures it, so a body model swap is a value not an edit.
    skeleton: "S.Skeleton" = S.SMPL

    @property
    def marks(self) -> "S.Landmarks":
        """This body's joints, addressed by name."""
        return self.skeleton.of(self.joints)


def load_model(path: str | Path):
    import torch
    import torchvision  # noqa: F401 — the TorchScript graph will not load without it
    model = torch.jit.load(str(path))
    return model.cuda().eval() if torch.cuda.is_available() else model.eval()


# What the loaded weights actually expose. The demo notebook advertises a
# parametric head — pose, betas, trans — but a given release's TorchScript
# graph need not carry it, and asking is cheaper than assuming.
CANDIDATE_KEYS = (
    "betas", "pose", "trans", "shape", "smpl_betas", "body_shape",
    "vertices3d", "joints3d", "vertices2d", "joints2d",
    "vertices3d_nonparam", "joints3d_nonparam",
    "vertex_uncertainties", "joint_uncertainties",
)
LAST_OUTPUT_KEYS: dict | None = None


def model_api(model) -> dict:
    """What the loaded TorchScript graph can be asked to do.

    NLF is a *localizer field*: in the paper it answers for any point on a
    canonical body, not only a fixed vertex set. Whether a given release's
    exported graph still offers that is a question about the file we actually
    have, not about the paper.
    """
    methods, sigs = [], {}
    for n in dir(model):
        if n.startswith("_"):
            continue
        try:
            attr = getattr(model, n)
        except Exception:
            continue                      # torch raises on some properties
        if not callable(attr):
            continue
        methods.append(n)
        try:
            sigs[n] = str(attr.schema)
        except Exception:
            pass
    return {"methods": sorted(methods), "signatures": sigs}


def _note_output_keys(pred) -> None:
    """Record which of the advertised outputs this graph really returns."""
    global LAST_OUTPUT_KEYS
    found = {}
    try:
        found["_listed"] = sorted(str(k) for k in pred.keys())
    except Exception as e:                       # a TorchScript Dict may refuse
        found["_listed"] = f"keys() unavailable: {type(e).__name__}"
    for k in CANDIDATE_KEYS:
        try:
            v = pred.get(k)
        except Exception as e:
            found[k] = f"error: {type(e).__name__}"
            continue
        if v is None:
            found[k] = None
        else:
            try:
                found[k] = list(v[0][0].shape) if len(v) and len(v[0]) else "empty"
            except Exception:
                found[k] = "present"
    LAST_OUTPUT_KEYS = found
    print("NLF output keys:", found)


@dataclass
class Inference:
    """The knobs on NLF's own call, with the defaults the graph ships with.

    They are here rather than inline because every one of them is a claim
    about the person being measured, and the shipped defaults are claims we
    did not make deliberately.
    """
    # How hard the SMPL fit is pulled toward the average body. At the default
    # of 10 the released graph returns a shape vector whose last eight of ten
    # dimensions are zero to four decimal places: the individual is being
    # regularised away, and we then measure the result.
    beta_regularizer: float = 10.0
    beta_regularizer2: float = 0.0
    # Test-time augmentation. The model runs this many perturbed crops and
    # averages. Costs GPU time linearly and attacks per-frame noise at the
    # source rather than by reconciling it afterwards.
    num_aug: int = 1
    antialias_factor: int = 1
    # Assumed field of view, used only when no intrinsic matrix is given — and
    # we give none. A phone is not 55 degrees, and a wrong focal length bends
    # the reconstructed depth, which is the axis we already cannot see.
    default_fov_degrees: float = 55.0


def meshes_from_frames(model, images: list[np.ndarray], height_cm: float,
                       stride: int = 4,
                       inf: "Inference | None" = None) -> list[FrameMesh]:
    """Run NLF over a sample of frames and return each body, upright and scaled.

    Every frame is measured on its own and the results reconciled later. A
    single mesh from a single frame is one opinion; the median of many is a
    measurement.
    """
    import torch

    inf = inf or Inference()
    out: list[FrameMesh] = []
    detections: list[list[float]] = []
    tracked: tuple[np.ndarray, float] | None = None
    skipped = 0
    for img in images[::stride]:
        t = torch.from_numpy(np.ascontiguousarray(img[:, :, ::-1])).permute(2, 0, 1)
        if torch.cuda.is_available():
            t = t.cuda()
        with torch.inference_mode():
            pred = model.detect_smpl_batched(
                t.unsqueeze(0),
                beta_regularizer=inf.beta_regularizer,
                beta_regularizer2=inf.beta_regularizer2,
                num_aug=inf.num_aug,
                antialias_factor=inf.antialias_factor,
                default_fov_degrees=inf.default_fov_degrees)

        if not out and not detections:
            _note_output_keys(pred)
        verts = pred["vertices3d"]
        if verts is None or len(verts) == 0 or len(verts[0]) == 0:
            continue                                    # nobody in this frame

        # The model is multi-person: a room can hold a second person, and a
        # poster of one. Choosing the tallest in every frame independently
        # means the subject can change halfway through a clip and the
        # measurements average two bodies.
        #
        # So the tallest is chosen once, and after that the detection nearest
        # to where the subject was a moment ago. A frame whose best candidate
        # has jumped, or changed size, is dropped rather than guessed at.
        people = verts[0]
        centres = [pv.mean(axis=0).float().cpu().numpy() for pv in people]
        heights = [float(pv[:, 1].max() - pv[:, 1].min()) for pv in people]
        detections.append([round(h, 1) for h in heights])

        if tracked is None:
            who = int(np.argmax(heights))
        else:
            prev_centre, prev_height = tracked
            moved = [float(np.linalg.norm(c - prev_centre)) for c in centres]
            who = int(np.argmin(moved))
            jumped = moved[who] > SUBJECT_JUMP * prev_height
            resized = abs(heights[who] - prev_height) > SUBJECT_RESIZE * prev_height
            if jumped or resized:
                skipped += 1
                continue
        tracked = (centres[who], heights[who])

        v = people[who].float().cpu().numpy()
        j = pred["joints3d"][0][who].float().cpu().numpy()
        lm = SKELETON.of(j)        # raises if this is not the skeleton we index

        unc = pred.get("vertex_uncertainties")
        u = float(unc[0][who].float().mean().cpu()) if unc is not None else float("nan")

        # NLF also regresses the SMPL shape vector. We do not measure from it
        # yet — see the README — but a body's shape does not change during a
        # clip, so how far these disagree is a direct read on how much of the
        # per-frame spread is the model changing its mind about the body
        # rather than about the pose.
        bt = pred.get("betas")
        b = (bt[0][who].float().cpu().numpy().tolist() if bt is not None else None)

        # NLF completes a body that runs past the frame, so a projected vertex
        # outside the image is the model inferring rather than seeing.
        v2d = pred["vertices2d"][0][who].float().cpu().numpy()
        h, w = img.shape[:2]
        outside = {
            "top": bool((v2d[:, 1] < 0).any()), "bottom": bool((v2d[:, 1] > h).any()),
            "left": bool((v2d[:, 0] < 0).any()), "right": bool((v2d[:, 0] > w).any()),
        }

        up = M.upright(v, lm["pelvis"], lm["neck"])
        jf = M.upright(j, lm["pelvis"], lm["neck"])
        pts, k = M.rescale_to_height(up, height_cm)
        # max-minus-min is decided by the two most extreme vertices, so it
        # cannot tell a genuinely deep body from a handful of stray ones.
        raw_bbox = [float(np.ptp(v[:, i])) for i in range(3)]
        raw_p98 = [float(np.percentile(v[:, i], 99) - np.percentile(v[:, i], 1))
                   for i in range(3)]
        # Measured before standing the body upright, so it keeps its relation
        # to where the camera was.
        yaw = M.yaw_deg(*lm.pair("hip"))
        rot_bbox = [float(np.ptp(up[:, i])) for i in range(3)]
        out.append(FrameMesh(pts, jf * k, u, k, outside, raw_bbox, rot_bbox,
                             raw_p98, height_cm, yaw, b))
    if detections:
        most = max(len(d) for d in detections)
        print(f"detections per frame: up to {most}; "
              f"{skipped} frame(s) dropped for an unstable subject")
    return out


def _chains(lm: "S.Landmarks") -> list[np.ndarray]:
    """Arms, legs and spine, in the order the labels use."""
    return [
        _arm_chain(lm, "l"),                                    # 0
        _arm_chain(lm, "r"),                                    # 1
        lm.chain("hip_l", "knee_l", "ankle_l"),                 # 2
        lm.chain("hip_r", "knee_r", "ankle_r"),                 # 3
        lm.chain("pelvis", "neck"),                             # 4
    ]


ARM, LEG_L, LEG_R = (0, 1), 2, 3


def _without_arms(points: np.ndarray, lm: "S.Landmarks") -> np.ndarray:
    """Everything whose nearest bone is not an arm."""
    lab = M.label_by_nearest_chain(points, _chains(lm))
    return points[~np.isin(lab, ARM)]


def _one_leg(points: np.ndarray, lm: "S.Landmarks", which: int) -> np.ndarray:
    lab = M.label_by_nearest_chain(points, _chains(lm))
    return points[lab == which]


def measure_one(fm: FrameMesh) -> dict[str, float] | None:
    """The nine measurements from a single body.

    The levels are found on the body rather than assumed from stature: the
    natural waist is the narrowest girth above the hips, the seat the widest
    below them. With a real cross-section those are measurable, which they were
    not from a silhouette.
    """
    lm = fm.marks
    # A horizontal slice through a standing body catches the torso and both
    # arms, and a hull drawn round that measures the person's whole width. On
    # the first real recording it turned an 85 cm waist into 149 cm.
    p = _without_arms(fm.points, lm)

    leg = _one_leg(fm.points, lm, LEG_L)     # one leg, whole, and only it

    heel = float(p[:, 1].min())
    y_hip = lm.level("hip")
    y_knee = lm.level("knee")
    y_ankle = lm.level("ankle")
    y_shoulder = lm.level("shoulder")

    crotch = M.crotch_height(p, *lm.pair("hip"), lm["pelvis"], fm.height_cm)

    def profile(lo: float, hi: float, limb: bool, n: int = 26):
        """Girth at n heights, with the height each came from."""
        out = []
        for y in np.linspace(lo, hi, n):
            g = M.girth_at(leg if limb else p, y, BAND_CM)
            if g is not None:
                out.append((g, float(y)))
        return out

    def pick(prof, q: float):
        """A quantile of the profile rather than its extreme.

        The seat is the widest girth below the hips and the waist the narrowest
        above them — but a raw max or min is decided by whichever single slice
        went wrong, and on the first real recording that produced a 197 cm hip.
        A quantile keeps the anatomy and drops the artefact.
        """
        if not prof:
            return None, None
        vals = np.array([g for g, _ in prof])
        target = float(np.quantile(vals, q))
        return min(prof, key=lambda gy: abs(gy[0] - target))

    waist, y_waist = pick(profile(y_hip, y_hip + 0.55 * (y_shoulder - y_hip), False), 0.10)

    # Start clear of the crotch. A slice level with it still cuts both
    # thighs, and taking the widest reading then selects precisely those —
    # which is how a 95 cm seat read 185.
    seat, _ = pick(profile(crotch + 0.35 * (y_hip - crotch),
                           y_hip + 0.25 * (y_hip - crotch), False), 0.90)
    # Likewise below it: right at the crotch the thigh is still merging
    # into the buttock.
    thigh = M.girth_at(leg, crotch - 0.16 * (crotch - y_knee), BAND_CM)
    knee = M.girth_at(leg, y_knee, BAND_CM)
    calf, _ = pick(profile(y_knee - 0.18 * (y_knee - y_ankle), y_ankle, True), 0.90)
    ankle, _ = pick(profile(y_ankle - 0.05 * (y_knee - y_ankle),
                            y_ankle + 0.22 * (y_knee - y_ankle), True), 0.10)

    if None in (waist, seat, thigh, knee, calf, ankle, y_waist):
        return None

    inseam = crotch - heel
    outseam = y_waist - heel
    return {
        "waist": waist, "hip": seat, "thigh": thigh, "knee": knee,
        "calf": calf, "ankle": ankle,
        "inseam": inseam, "outseam": outseam, "rise": outseam - inseam,
        # Not a measurement: where the waist landed, so the leg cloud can be
        # cropped at the same place the outseam was taken from.
        "_y_waist": y_waist,
    }


# How many surface points to send back.
#
# Every leg vertex, in practice: the cap is above what the region holds. With
# fewer, the discs that close the cloud into a surface have to be wide enough
# to bridge the gaps, and a body built from wide discs looks like it is built
# from discs. Denser points mean smaller ones. Around 4000 costs 80 KB, which
# is less than one of the photographs on the product screen.
CLOUD_POINTS = 6000


def leg_cloud(fm: FrameMesh, y_waist: float) -> list[list[float]] | None:
    """The customer's legs as a cloud of surface points, in centimetres.

    Only the legs. The mesh NLF returns is a whole body including a head, and
    the product is about how trousers fit — so the part above the waist is
    dropped rather than sent to a browser and cropped there. What is not
    transmitted cannot be mishandled, and this is a scan of a person.

    No faces: the triangles that would turn these points into a surface belong
    to the SMPL model files, which carry a licence we deliberately avoided
    needing. A dense enough point cloud reads as a limb anyway.
    """
    pts = _without_arms(fm.points, fm.marks)   # hands hang to mid-thigh
    keep = pts[pts[:, 1] <= y_waist + 2.0]
    if len(keep) < 200:
        return None

    if len(keep) > CLOUD_POINTS:
        # Shuffled, not strided. The mesh is ordered in rings, so taking every
        # Nth vertex drops whole rings and the render came out in horizontal
        # bands. Seeded, so the same clip gives the same body twice.
        idx = np.random.default_rng(0).permutation(len(keep))[:CLOUD_POINTS]
        keep = keep[np.sort(idx)]

    # Centred on the hips and standing on zero, so the browser receives
    # something it can draw without knowing anything about our frame.
    centre = np.array([
        float(np.median(keep[:, 0])), float(keep[:, 1].min()),
        float(np.median(keep[:, 2])),
    ])
    return [[round(float(v), 1) for v in p] for p in (keep - centre)]


def weights_from_uncertainty(uncertainties: list[float],
                             exponent: float = None) -> np.ndarray | None:
    """Turn NLF's per-frame vertex uncertainty into reconciliation weights.

    `exponent` 2 is inverse-variance weighting, which is the right arithmetic
    *if* the uncertainty is a standard deviation. It is a predicted one, so
    that is an assumption, not a fact.

    All or nothing: if any frame's uncertainty is unusable the whole clip falls
    back to equal weights, because treating "unknown" as "average" is a
    weighting nobody chose and it would hide the gap.
    """
    e = C.UNCERTAINTY_EXPONENT if exponent is None else exponent
    if e <= 0:
        return None
    u = np.asarray(uncertainties, dtype=float)
    if u.size == 0 or not np.isfinite(u).all() or (u <= 0).any():
        return None
    return u ** (-float(e))


def _sideness(yaws: list[float]) -> np.ndarray:
    """How side-on each frame is, 0 face-on to 1 square to the side.

    Folded, because +90 and −90 are the same pose seen from the same camera.
    """
    y = np.asarray(yaws, dtype=float)
    return np.abs(((y + 90.0) % 180.0) - 90.0) / 90.0


def weights_from_angle(yaws: list[float], exponent: float = None
                       ) -> np.ndarray | None:
    """Weight frames by where the camera was standing.

    exp(exponent * sideness): positive favours the side views, negative the
    frontal ones. Exponential rather than a power so that no frame is ever
    driven to zero weight — a face-on frame is not worthless, it is
    knowledgeable about a different axis.

    Which end deserves the weight is not something this function knows. A
    camera square to the body measures its width and infers its depth; side-on
    it measures the depth and infers the width. A girth needs both, and a
    single frame never has both.
    """
    e = C.ANGLE_EXPONENT if exponent is None else exponent
    if e == 0:
        return None
    y = np.asarray(yaws, dtype=float)
    if y.size == 0 or not np.isfinite(y).all():
        return None
    return np.exp(float(e) * _sideness(y))


def weights_from_coverage(yaws: list[float],
                          buckets: int = M.COVERAGE_BUCKETS) -> np.ndarray | None:
    """One vote per sector of the turn, however long the clip lingered there.

    The reconciled figure is otherwise a mixture whose proportions are set by
    how the person moved rather than by anything about their body: pause facing
    the camera and the frontal answer wins on headcount alone. This asserts
    nothing about which view is right — only that neither should win by
    standing still.
    """
    y = np.asarray(yaws, dtype=float)
    if y.size == 0 or not np.isfinite(y).all():
        return None
    idx = np.clip((_sideness(y) * buckets).astype(int), 0, buckets - 1)
    counts = np.bincount(idx, minlength=buckets).astype(float)
    return 1.0 / counts[idx]


def frame_weights(uncertainties: list[float], yaws: list[float]
                  ) -> np.ndarray | None:
    """Every enabled weighting, multiplied together.

    They answer independent questions — how sure the model was, and what the
    camera could see — so the evidence multiplies. All of them are off by
    default; see config.py for what turning one on is and is not worth.
    """
    parts = [w for w in (weights_from_uncertainty(uncertainties),
                         weights_from_angle(yaws),
                         weights_from_coverage(yaws) if C.ANGLE_BALANCE else None)
             if w is not None]
    if not parts:
        return None
    out = parts[0].astype(float).copy()
    for w in parts[1:]:
        out *= w
    total = out.sum()
    return out / total if np.isfinite(total) and total > 0 else None


def _weighted_quantile(values: np.ndarray, weights: np.ndarray | None,
                       q: float) -> float:
    """Quantile of a weighted sample.

    Each sample sits at the middle of the stretch of axis its weight occupies,
    so one carrying twice the weight spans twice as much. At q=0.5 and equal
    weights this is exactly numpy's median; the 16th and 84th differ from
    numpy's default estimator by a fraction of a sample, which is why the
    unweighted path uses this function too — otherwise switching weighting on
    would change two things at once.
    """
    v = np.asarray(values, dtype=float)
    order = np.argsort(v)
    v = v[order]
    w = (np.ones_like(v) if weights is None
         else np.asarray(weights, dtype=float)[order])
    total = float(w.sum())
    if not np.isfinite(total) or total <= 0:
        return float(np.median(v))
    p = (np.cumsum(w) - 0.5 * w) / total
    return float(np.interp(q, p, v))


def reconcile(per_frame: list[dict[str, float]],
              weights: np.ndarray | None = None
              ) -> tuple[dict[str, float], dict[str, str], dict[str, float]]:
    """Weighted median across frames, with the spread deciding the confidence.

    Agreement between independent views is the only evidence available that a
    number is right — there is no tape measure inside the pipeline.

    `weights` lets a frame the model was surer of count for more. Note what
    that does and does not buy: NLF's uncertainty says how confident the model
    is, not how much of the body the camera actually saw. Those come apart
    precisely in a frontal view, where depth is the model's prior and it is
    confident about it.
    """
    out: dict[str, float] = {}
    conf: dict[str, str] = {}
    spreads: dict[str, float] = {}
    for site in C.ALL_MEASUREMENTS:
        keep = [i for i, m in enumerate(per_frame) if site in m]
        if not keep:
            continue
        vals = np.array([per_frame[i][site] for i in keep], dtype=float)
        w = None if weights is None else np.asarray(weights, float)[keep]
        med = _weighted_quantile(vals, w, 0.5)
        out[site] = round(med, 1)
        spread = ((_weighted_quantile(vals, w, 0.84)
                   - _weighted_quantile(vals, w, 0.16)) / 2
                  if len(vals) > 3 else float("inf"))
        rel = spread / med if med else float("inf")
        lo, hi = C.PLAUSIBLE_CM[site]
        conf[site] = ("low" if not lo <= med <= hi or rel > 0.05
                      else "medium" if rel > 0.02 else "high")
        spreads[site] = round(spread, 2) if np.isfinite(spread) else None
    return out, conf, spreads


# ── evidence, not guesses ───────────────────────────────────────────────────
# The diagnostic used to carry its own copy of the joint numbering, which is
# two places to be wrong about which row is the left shoulder. It reads the
# skeleton now, so a body model swap moves this too.


def probe(fm: FrameMesh) -> dict:
    """What one frame's body actually looks like to the measuring code.

    Reports the joints by height fraction so the skeleton's ordering can be
    checked rather than assumed, and the extent of each slice so an inflated
    girth can be traced to something wide being in it.
    """
    lm = fm.marks
    raw = fm.points
    stripped = _without_arms(raw, lm)

    lo, hi = float(raw[:, 1].min()), float(raw[:, 1].max())
    span = hi - lo or 1.0
    joints = {name: round((float(lm[name][1]) - lo) / span, 3)
              for name in sorted(lm.skeleton.rows)}

    y_hip = lm.level("hip")
    y_knee = lm.level("knee")
    crotch = M.crotch_height(stripped, *lm.pair("hip"), lm["pelvis"],
                             fm.height_cm)

    def look(y: float, label: str) -> dict:
        sl = M.slice_at(stripped, y, BAND_CM)
        kept = M.drop_specks(sl) if len(sl) >= 8 else sl
        return {
            "level": label,
            "height_frac": round((y - lo) / span, 3),
            "points": int(len(sl)),
            "after_specks": int(len(kept)),
            "x_cm": round(float(np.ptp(kept[:, 0])), 1) if len(kept) else None,
            "z_cm": round(float(np.ptp(kept[:, 1])), 1) if len(kept) else None,
            "girth_cm": round(M.girth_at(stripped, y, BAND_CM), 1)
                        if len(kept) >= 8 else None,
        }

    slices = []
    if crotch is not None:
        for f, label in ((0.0, "crotch"), (0.35, "mid pelvis"), (1.0, "hip joint")):
            slices.append(look(crotch + f * (y_hip - crotch), label))
    slices.append(look(y_hip + 0.30 * (lm.level("shoulder") - y_hip),
                       "waist band"))

    # Where the depth actually comes from. A standing body should be about
    # 25 cm deep at every height; whichever band is not tells us what the mesh
    # is really doing.
    ys = raw[:, 1]
    lo_y, hi_y = float(ys.min()), float(ys.max())
    bands = []
    for f in np.linspace(0, 1, 11)[:-1]:
        y0, y1 = lo_y + f * (hi_y - lo_y), lo_y + (f + 0.1) * (hi_y - lo_y)
        sel = raw[(ys >= y0) & (ys < y1)]
        bands.append({
            "from_frac": round(f, 1),
            "n": int(len(sel)),
            "x_cm": round(float(np.ptp(sel[:, 0])), 1) if len(sel) else None,
            "z_cm": round(float(np.ptp(sel[:, 2])), 1) if len(sel) else None,
        })

    def bbox(a):
        return {"x": round(float(np.ptp(a[:, 0])), 1),
                "y": round(float(np.ptp(a[:, 1])), 1),
                "z": round(float(np.ptp(a[:, 2])), 1)}

    # The hull the hip measurement actually draws, so its shape can be seen
    # instead of inferred from one number.
    hull = []
    if crotch is not None:
        y_seat = crotch + 0.6 * (y_hip - crotch)
        sl = M.slice_at(stripped, y_seat, BAND_CM)
        if len(sl) >= 8:
            hull = [[round(float(a), 1), round(float(b), 1)]
                    for a, b in M.convex_hull(M.drop_specks(sl))]

    return {
        "views_png": _draw(raw, stripped),
        "points_before_arm_strip": int(len(raw)),
        "points_after": int(len(stripped)),
        "bbox_as_model_emitted": [round(x, 1) for x in fm.raw_bbox],
        "bbox_middle_98_percent": [round(x, 1) for x in fm.raw_p98],
        "bbox_after_upright": [round(x, 3) for x in fm.rot_bbox],
        "depth_by_height_band": bands,
        "mesh_bbox_cm": bbox(raw),
        "mesh_bbox_after_strip_cm": bbox(stripped),
        "seat_hull_xz": hull,
        "joint_height_fraction": joints,
        "crotch_height_frac": round((crotch - lo) / span, 3) if crotch else None,
        "slices": slices,
    }


def _draw(raw: np.ndarray, stripped: np.ndarray, size: int = 420) -> str:
    """The mesh as a picture, front and side, as a data URI.

    Numbers said the body was 75 cm deep and every explanation for that was
    wrong in a different way. A scatter of the vertices settles in one look
    what another diagnostic column would only narrow down.
    """
    import base64

    import cv2

    def panel(pts: np.ndarray, a: int, b: int, title: str) -> np.ndarray:
        img = np.full((size, size // 2, 3), 250, np.uint8)
        if not len(pts):
            return img
        u, v = pts[:, a], pts[:, b]
        lo_u, hi_u = float(u.min()), float(u.max())
        lo_v, hi_v = float(v.min()), float(v.max())
        span = max(hi_u - lo_u, hi_v - lo_v) or 1.0
        cu = ((u - (lo_u + hi_u) / 2) / span * (size * 0.42) + size // 4).astype(int)
        cv_ = (size - 10 - (v - lo_v) / span * (size * 0.9)).astype(int)
        for x, y in zip(cu, cv_):
            if 0 <= x < size // 2 and 0 <= y < size:
                img[y, x] = (90, 60, 40)
        cv2.putText(img, title, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.42,
                    (40, 40, 40), 1, cv2.LINE_AA)
        return img

    grid = np.hstack([
        panel(raw, 0, 1, "front x-y (all)"),
        panel(raw, 2, 1, "side z-y (all)"),
        panel(stripped, 2, 1, "side z-y (no arms)"),
    ])
    ok, buf = cv2.imencode(".png", grid)
    return ("data:image/png;base64," + base64.b64encode(buf).decode()) if ok else ""
