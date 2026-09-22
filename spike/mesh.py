"""Measuring a body from a cloud of surface points.

No MediaPipe, no torch, no body-model files — just numpy over points, so this is
testable on a shape whose answers are known. The neural part lives in nlf.py and
only produces the points.

The central choice here is the convex hull. A tape measure pulled round a thigh
spans the dips; it does not sink into them. So the girth of a cross-section is
the perimeter of its convex hull, not of the outline itself. That is also why
this is better than the ellipse it replaces: an ellipse assumed a shape, a hull
measures the one that is there.
"""
from __future__ import annotations

import numpy as np

Points = np.ndarray            # (N, 3), metres, +Y up after canonicalise()


# ── hull ────────────────────────────────────────────────────────────────────
def convex_hull(xz: np.ndarray) -> np.ndarray:
    """Andrew's monotone chain. Returns the hull in order, counter-clockwise."""
    if len(xz) < 3:
        return xz
    p = xz[np.lexsort((xz[:, 1], xz[:, 0]))]
    cross = lambda o, a, b: ((a[0] - o[0]) * (b[1] - o[1])
                             - (a[1] - o[1]) * (b[0] - o[0]))

    def half(pts):
        out: list[np.ndarray] = []
        for q in pts:
            while len(out) >= 2 and cross(out[-2], out[-1], q) <= 0:
                out.pop()
            out.append(q)
        return out[:-1]

    return np.array(half(p) + half(p[::-1]))


def perimeter(poly: np.ndarray) -> float:
    if len(poly) < 3:
        return 0.0
    d = poly - np.roll(poly, -1, axis=0)
    return float(np.hypot(d[:, 0], d[:, 1]).sum())


# ── slicing ─────────────────────────────────────────────────────────────────
def _point_segment_distance(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Distance from every point in p to the segment ab."""
    ab = b - a
    denom = float(ab @ ab)
    if denom < 1e-12:
        return np.linalg.norm(p - a, axis=1)
    t = np.clip((p - a) @ ab / denom, 0.0, 1.0)[:, None]
    return np.linalg.norm(p - (a + t * ab), axis=1)


def _limb_split(xs: np.ndarray) -> float | None:
    """Where a slice falls into two limbs, in x. None if it is one body.

    These are surface points, so a single cross-section is a closed loop with
    nothing inside it — "is the middle empty" cannot tell one limb from two.
    What does is the gap in the x projection: within one loop the points are
    spread evenly, and between two loops there is an interval containing
    nothing at all.

    Compared against the spread of the other gaps rather than against the
    body's width, so it holds for any units and any build. An absolute
    threshold does not: real thighs can sit two centimetres apart.
    """
    if len(xs) < 12:
        return None
    # Distinct positions only. Several layers of a slice project onto the same
    # x, and those zero gaps drag the percentile down until an ordinary ring's
    # widest angular step looks like a gap between two limbs.
    xs = np.unique(xs)
    if len(xs) < 12:
        return None
    gaps = np.diff(xs)
    if not len(gaps):
        return None
    typical = float(np.percentile(gaps, 95))
    i = int(np.argmax(gaps))
    if typical <= 0 or gaps[i] < 5 * typical:
        return None
    if (i + 1) < 4 or (len(xs) - i - 1) < 4:      # need a real limb either side
        return None
    return float((xs[i] + xs[i + 1]) / 2)


def slice_at(points: Points, y: float, band: float,
             near_x: float | None = None) -> np.ndarray:
    """Points within ±band of height y, projected to the horizontal plane."""
    m = np.abs(points[:, 1] - y) <= band
    sel = points[m][:, [0, 2]]
    if near_x is None or len(sel) == 0:
        return sel
    cut = _limb_split(sel[:, 0])
    if cut is None:
        return sel
    return sel[sel[:, 0] > cut] if near_x > cut else sel[sel[:, 0] < cut]


def _chain_distance(points: Points, chain: np.ndarray) -> np.ndarray:
    """Distance from every point to the nearest segment of a joint chain."""
    chain = np.asarray(chain, float)
    d = np.full(len(points), np.inf)
    for a, b in zip(chain[:-1], chain[1:]):
        d = np.minimum(d, _point_segment_distance(points, a, b))
    return d


def girth_at(points: Points, y: float, band: float,
             near_x: float | None = None) -> float | None:
    """Circumference at height y, in the units the points are in."""
    sl = slice_at(points, y, band, near_x)
    if len(sl) < 8:
        return None
    return perimeter(convex_hull(drop_specks(sl)))


# ── clusters ────────────────────────────────────────────────────────────────
def drop_specks(xz: np.ndarray, min_fraction: float = 0.08,
                min_points: int = 6, link_factor: float = 3.5,
                sample_cap: int = 1500) -> np.ndarray:
    """Remove small detached groups from a slice, keeping the substantial ones.

    A convex hull is decided entirely by its extremes, so it has no robustness
    at all: a handful of fingertip vertices surviving the arm removal put the
    hull round the hand too, and a 98 cm seat read 197.

    Keeping only the *largest* group would be the obvious fix and is wrong.
    Stripping the arms can cut a torso slice into two arcs, and a leg slice is
    sometimes two pieces; keeping one of them under-measures instead of
    over-measuring, which is worse, because it looks reasonable.

    Connectivity is resolved on a grid rather than pairwise. A real slice holds
    a few hundred points, but a dense shape can hold twenty thousand, and an
    all-pairs distance matrix over those is three gigabytes — which is how this
    first hung a test rather than failing it.
    """
    n = len(xz)
    if n < 8:
        return xz

    # Spacing from a sample, so the estimate costs the same whatever the size.
    idx = (np.random.default_rng(0).choice(n, sample_cap, replace=False)
           if n > sample_cap else np.arange(n))
    s = xz[idx]
    d = np.linalg.norm(s[:, None, :] - s[None, :, :], axis=2)
    np.fill_diagonal(d, np.inf)

    # An upper quantile, not the median: several points of a mesh can project
    # onto the same spot in a slice, which drags a median nearest-neighbour
    # distance to zero and collapses the linking distance to nothing.
    nn = d.min(axis=1)
    nn = nn[np.isfinite(nn)]
    extent = float(max(np.ptp(xz[:, 0]), np.ptp(xz[:, 1])))
    if extent <= 0:
        return xz
    eps = max(float(np.quantile(nn, 0.75)) * link_factor if len(nn) else 0.0,
              0.02 * extent)          # floor tied to the slice's own size

    cells = np.floor(xz / eps).astype(np.int64)
    order = np.lexsort((cells[:, 1], cells[:, 0]))
    uniq, inverse = np.unique(cells, axis=0, return_inverse=True)
    lookup = {(int(a), int(b)): i for i, (a, b) in enumerate(uniq)}

    parent = list(range(len(uniq)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, (a, b) in enumerate(uniq):
        for da in (0, 1):
            for db in (-1, 0, 1):
                if da == 0 and db <= 0:
                    continue
                k = lookup.get((int(a) + da, int(b) + db))
                if k is not None:
                    ri, rk = find(i), find(k)
                    if ri != rk:
                        parent[ri] = rk

    roots = np.array([find(i) for i in range(len(uniq))])[inverse]
    vals, counts = np.unique(roots, return_counts=True)
    floor = max(min_points, int(min_fraction * n))
    keep = set(vals[counts >= floor].tolist())
    if not keep:                       # nothing substantial: trust the slice
        return xz
    return xz[np.isin(roots, list(keep))]


# ── canonicalise ────────────────────────────────────────────────────────────
def upright(points: Points, pelvis: np.ndarray, neck: np.ndarray) -> Points:
    """Rotate so the body's own spine is vertical.

    The camera is never level and the person is never square to it. Slicing a
    tilted body horizontally would cut ellipses through the limbs and read every
    girth too large.
    """
    up = neck - pelvis
    n = np.linalg.norm(up)
    if n < 1e-6:
        return points
    up = up / n
    target = np.array([0.0, 1.0, 0.0])
    v = np.cross(up, target)
    c = float(np.dot(up, target))
    if np.linalg.norm(v) < 1e-8:
        return points if c > 0 else -points
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    R = np.eye(3) + vx + vx @ vx * (1 / (1 + c))
    return points @ R.T


def rescale_to_height(points: Points, height_cm: float) -> tuple[Points, float]:
    """Monocular depth is ambiguous, so the model's absolute size is a prior,
    not a measurement. The one number the person typed replaces it.

    Returns the points in centimetres and the factor applied, which is worth
    reporting: a factor far from 1 means the model's guess at this body was poor.
    """
    extent = float(points[:, 1].max() - points[:, 1].min())
    if extent < 1e-6:
        raise ValueError("degenerate mesh: no vertical extent")
    k = height_cm / extent
    return points * k, k


def crotch_height(points: Points, hip_l: np.ndarray, hip_r: np.ndarray,
                  pelvis: np.ndarray, height_cm: float,
                  below_hip_frac: float = 0.028,
                  half_width: float = 1.2) -> float:
    """Where the leg begins.

    Taken from the hip joints and checked against the body, not derived from it.
    Three geometric detectors were tried and all three failed on real bodies:

      · a gap in the x projection appears inside the torso too, ten centimetres
        too high, and then the thigh gets measured across the hips;
      · the distance between the two halves is indistinguishable from the
        spacing of the points when the thighs nearly touch, which on most
        people they do;
      · the lowest point on the mid-line is only the crotch when there is air
        under it, and often there is not.

    So the level comes from anthropometry — the crotch sits a little under the
    hip joint — and geometry is used only to reject an answer that is clearly
    wrong. **This fraction is calibration target number one**, and a single
    tape measurement of one inseam is what moves it.
    """
    y_hip = (float(hip_l[1]) + float(hip_r[1])) / 2.0
    estimate = y_hip - below_hip_frac * height_cm

    # If the mid-line genuinely is air below some level, prefer what the body
    # says — but only when it lands somewhere plausible.
    axis = np.asarray(hip_r, float) - np.asarray(hip_l, float)
    n = float(np.linalg.norm(axis))
    if n > 1e-6:
        along = points @ (axis / n)
        centre = float(np.asarray(pelvis, float) @ (axis / n))
        midline = points[np.abs(along - centre) <= half_width]
        if len(midline) >= 8:
            seen = float(midline[:, 1].min())
            if abs(seen - estimate) <= 0.05 * height_cm:
                return seen
    return estimate


# ── limbs that are not being measured ───────────────────────────────────────
def label_by_nearest_chain(points: Points,
                           chains: list[np.ndarray]) -> np.ndarray:
    """Which bone each vertex belongs to: the nearest one.

    Replaces removing limbs by proximity, which cannot work. A hand hangs
    beside a thigh, so any sphere wide enough to clear the fingers also eats
    the outside of the leg — on the synthetic body it removed half of it, and
    on the real recording that is why the thigh was wrong in both directions
    at once, too small in some frames and too large in others.

    Ownership has no such conflict: a point on the thigh is nearer the femur
    than the forearm, however close the two happen to be.
    """
    d = np.stack([_chain_distance(points, c) for c in chains], axis=1)
    return np.argmin(d, axis=1)


def strip_chains(points: Points, chains: list[np.ndarray],
                 radius: float) -> Points:
    """Drop points lying near a chain of joints — in practice, the arms.

    A horizontal slice through a standing body catches the torso and both arms,
    and a hull drawn round that measures the person's whole width. On the first
    real recording it read a 149 cm waist. Clustering alone cannot fix it: a
    hand resting against a thigh is touching it.

    Removing them by their own joint positions works whether or not they touch,
    and it is data the pose model already hands us.
    """
    if not len(points):
        return points
    keep = np.ones(len(points), dtype=bool)
    for chain in chains:
        chain = np.asarray(chain, float)
        if len(chain) == 1:                    # a lone joint is a sphere
            keep &= np.linalg.norm(points - chain[0], axis=1) > radius
            continue
        for a, b in zip(chain[:-1], chain[1:]):
            keep &= _point_segment_distance(points, a, b) > radius
    return points[keep]


# ── how far round the body turned ───────────────────────────────────────────
def yaw_deg(hip_l: np.ndarray, hip_r: np.ndarray) -> float:
    """Body rotation about the vertical, in the camera's frame.

    0 is square to the camera, ±90 is side-on. Taken from the hip axis rather
    than the shoulders, because arms swing and shoulders roll while the pelvis
    holds the direction the body is actually facing.
    """
    d = np.asarray(hip_r, float) - np.asarray(hip_l, float)
    return float(np.degrees(np.arctan2(d[2], d[0])))


COVERAGE_BUCKETS = 6            # 15 degrees each, over a quarter turn


def rotation_coverage(yaws: list[float]) -> float:
    """How much of the sweep from face-on to side-on the clip shows, 0..1.

    Bucketed on how side-on the body is, not on which way it turned: +90 and
    −90 are the same pose seen from the same camera, and bucketing on the
    signed angle counted them as two — so a front and a side, with nothing
    between, scored as though the body had swept through a third of the turn.
    """
    if not yaws:
        return 0.0
    folded = (abs(((v + 90.0) % 180.0) - 90.0) for v in yaws)
    seen = {min(COVERAGE_BUCKETS - 1, max(0, int(y / (90.0 / COVERAGE_BUCKETS))))
            for y in folded}
    return len(seen) / COVERAGE_BUCKETS
