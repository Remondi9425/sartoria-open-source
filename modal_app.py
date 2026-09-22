"""The measurement engine on Modal.

    .venv/bin/modal deploy modal_app.py

Two things live here. The SMPL engine needs a GPU and half a gigabyte of
weights, so it runs as its own class; the web layer in front of it is a plain
container. Keeping them apart means an HTTP request that never reaches the
model does not pay for a GPU.

Nothing heavy is ever installed on a laptop: torch and the NLF weights exist
only inside these images.

Licence: the NLF code is MIT, but the released weights are for **noncommercial
research use**. Correct for a Project Work; a blocker for a business, and one
to settle deliberately rather than discover later.
"""
from __future__ import annotations

import os
from pathlib import Path

import modal

MODEL_DIR = "/opt/models"
NLF_PATH = f"{MODEL_DIR}/nlf_l_multi.torchscript"

# Just the Vercel project name. serve.py builds the preview-URL pattern from it
# with re.escape — a regex with backslashes cannot survive being carried into a
# container image as an environment variable, because the Dockerfile parser
# rejects the escape sequences before Python ever sees them.
VERCEL_PROJECT = os.environ.get("SARTORIA_VERCEL_PROJECT", "")
ALLOWED_ORIGINS = os.environ.get(
    "SARTORIA_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)

# How long an idle GPU container stays up. Every scan that finds no container
# running pays about two minutes — scheduling a T4, pulling the image, loading
# the weights, warming TorchScript — against 17 s of actual work. Fifteen
# minutes covers a person recording twice, or a demo with pauses.
SCALEDOWN_S = int(os.environ.get("SARTORIA_SCALEDOWN_S", "900"))
# Set to 1 for a demo or a test session: a container is kept warm even when
# nobody has scanned for a while, and nobody waits two minutes. It bills for
# the idle GPU, so the default is zero.
MIN_CONTAINERS = int(os.environ.get("SARTORIA_MIN_CONTAINERS", "0"))

# Select a container region; this does not guarantee input/output data residency.
# Operators must verify the provider's storage and retention terms (PRIVACY.md).
REGION = os.environ.get("SARTORIA_REGION", "eu")

# Which deployment this is. Production is the one real people reach; the
# diagnostic endpoint that renders a body is not registered there at all.
SARTORIA_ENV = os.environ.get("SARTORIA_ENV", "production")

COMMON_ENV = {
    "SARTORIA_ALLOWED_ORIGINS": ALLOWED_ORIGINS,
    "SARTORIA_VERCEL_PROJECT": VERCEL_PROJECT,
    "SARTORIA_NLF_MODEL": NLF_PATH,
    "SARTORIA_ENV": SARTORIA_ENV,
}


# Where the weights come from, pinned with their size and hash. It lives here
# and not in spike/: this module is imported inside the image-build container,
# before the project source is mounted, so it cannot import the project.
NLF_WEIGHTS_URL = ("https://github.com/isarandi/nlf/releases/download/"
                   "v0.3.2/nlf_l_multi_0.3.2.torchscript")
# Size comes from the GitHub release metadata; the digest does not, because
# that release does not publish one. The hash below is recorded from the first
# build and checked on every later one, so a silently changed file is caught
# even though there is nothing upstream to compare against.
NLF_BYTES = 493_117_974
# Recorded from the build that downloaded it, and checked on every later one.
# Not taken from upstream, because that release publishes no digest — so this
# catches a file that changes under us, not a file that was wrong to begin with.
NLF_SHA256: str | None = (
    "52bee28edb6ea9148691331df87cfc238d7e3d9134dc60104a5aaed282a9ddad")


def _bake_nlf(url: str) -> None:
    """Fetch the NLF weights at image build time.

    Half a gigabyte on the critical path of every cold start would be most of
    the wait, on a service that scales to zero.

    Takes the URL as an argument rather than importing it, so this layer does
    not depend on the project source and survives a code change.
    """
    import hashlib
    import pathlib
    from urllib.request import urlopen

    p = pathlib.Path(NLF_PATH)
    p.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with urlopen(url) as r, open(p, "wb") as f:
        while chunk := r.read(1 << 22):
            f.write(chunk)
            digest.update(chunk)

    size, got = p.stat().st_size, digest.hexdigest()
    print(f"baked NLF weights: {size} bytes, sha256 {got}")
    if size != NLF_BYTES:
        raise RuntimeError(f"weights are {size} bytes, expected {NLF_BYTES}")
    if NLF_SHA256 and got != NLF_SHA256:
        raise RuntimeError(f"weights hash {got}, expected {NLF_SHA256}")


# The project source is mounted last, and mounted rather than copied. Anything
# added before it is cached across code changes; when the source sat before
# the torch layer, every edit to spike/ reinstalled torch and re-downloaded the
# weights on deploy.
deps = (
    modal.Image.debian_slim(python_version="3.12")
    # OpenCV needs these even headless; without them `import cv2` fails at
    # container start with a bare ImportError.
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install_from_requirements(str(Path(__file__).with_name("requirements-runtime.txt")))
    .env(COMMON_ENV)
)

base = deps.add_local_python_source("spike")

gpu_image = (
    deps.pip_install(
        "torch==2.5.1", "torchvision==0.20.1",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .run_function(_bake_nlf, args=(NLF_WEIGHTS_URL,))
    .add_local_python_source("spike")
)

app = modal.App("sartoria-engine", image=base)


@app.cls(
    image=gpu_image,
    gpu="T4",             # the weights are a ViT-L; a T4 runs a clip in seconds
    memory=16384,
    timeout=600,
    scaledown_window=SCALEDOWN_S,
    min_containers=MIN_CONTAINERS,
    max_containers=2,
    region=REGION,
)
class Measurer:
    """One GPU container: the model is loaded and warmed once, then reused."""

    @modal.enter()
    def load(self) -> None:
        """Load the weights and run the model twice on a blank frame.

        TorchScript profiles the graph on its first call and optimises it on
        the second, and on a ViT-L that is tens of seconds. Done here, it
        happens while the container starts rather than inside somebody's scan.
        """
        import time

        import numpy as np
        import torch

        from spike import nlf

        t0 = time.perf_counter()
        self.model = nlf.load_model(NLF_PATH)
        t1 = time.perf_counter()
        # A portrait phone frame, which is what the app sends.
        blank = np.zeros((1920, 1080, 3), dtype=np.uint8)
        t = torch.from_numpy(blank).permute(2, 0, 1)
        if torch.cuda.is_available():
            t = t.cuda()
        with torch.inference_mode():
            for _ in range(2):
                self.model.detect_smpl_batched(t.unsqueeze(0))
        t2 = time.perf_counter()
        print(f"model loaded in {t1 - t0:.1f} s, warmed in {t2 - t1:.1f} s")

    @modal.method()
    def measure(self, clip: bytes, height_cm: float, session_id: str,
                suffix: str = ".mp4", debug: bool = False,
                inference: dict | None = None) -> dict:
        """One clip in, one twin — or a refusal with a named cause."""
        import json
        import os
        import tempfile
        import time
        from pathlib import Path

        from spike import twin as T
        from spike.pipeline_smpl import run

        # mkstemp hands back an open descriptor as well as a path; taking only
        # the path leaks it, and a container is reused across calls.
        fd, name = tempfile.mkstemp(suffix=suffix)
        tmp = Path(name)
        t0 = time.perf_counter()
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(clip)
            from spike.nlf import Inference
            inf = Inference(**inference) if inference else None
            out = run(tmp, height_cm, session_id, self.model, debug=debug, inf=inf)
            if out.twin is not None:
                body = json.loads(out.twin.to_json())
                body["status"] = "ok"
            else:
                body = json.loads(T.refused(session_id, height_cm, out.verdict, out.quality))
            # Counts and spreads are cheap and carry nothing identifying, so
            # they travel with every answer. The probe and the per-frame table
            # do not.
            body["diagnostics"] = {
                "frames_read": out.frames_read,
                "meshes": out.meshes,
                "measured_frames": out.measured,
                "scale_correction": out.scale_correction,
                "mean_vertex_uncertainty": out.mean_uncertainty,
                # How far the frames disagree, per site. With no tape measure
                # inside the pipeline this is the only evidence a number is real.
                "spread_cm": out.spreads,
                "engine_seconds": round(time.perf_counter() - t0, 1),
            }
            if debug:
                body["diagnostics"]["probe"] = out.probe
                body["diagnostics"]["per_frame"] = out.frame_detail
            return body
        finally:
            tmp.unlink(missing_ok=True)


@app.function(
    image=base,
    cpu=1.0,
    memory=2048,
    timeout=120,
    scaledown_window=300,
    # The shared secret the front end's server signs tokens with. Absent, the
    # endpoint refuses to start without configured authentication.
    secrets=[modal.Secret.from_name("sartoria-token", required_keys=["SARTORIA_TOKEN_SECRET"])],
    region=REGION,
)
@modal.asgi_app()
def engine():
    """The HTTP front. Cheap, and it never waits for the GPU."""
    from spike.serve import make_app

    measurer = Measurer()

    async def submit(clip: bytes, height_cm: float, session_id: str, suffix: str,
                     debug: bool = False) -> str:
        # The async form: the blocking one held the whole ASGI app for the
        # seconds it took to hand the clip over.
        call = await measurer.measure.spawn.aio(
            clip=clip, height_cm=height_cm, session_id=session_id,
            suffix=suffix, debug=debug)
        return call.object_id

    def poll(job_id: str):
        call = modal.FunctionCall.from_id(job_id)
        try:
            return call.get(timeout=0)
        except TimeoutError:
            return None

    return make_app(submit_fn=submit, poll_fn=poll)
