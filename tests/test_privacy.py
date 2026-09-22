"""What happens to a recording of a person, asserted rather than intended.

The engine is stateless by construction — no database, no volume, no bucket —
and that is a privacy property worth defending with tests rather than leaving
as a happy accident the next feature quietly reverses.
"""
import contextlib
import importlib
import os
import pathlib
import re

import pytest

from spike import serve


@contextlib.contextmanager
def deployed_as(**env):
    """serve.py re-imported under a different environment, and put back after.

    A context manager rather than a function: `importlib.reload` mutates the
    one module object, so a helper that restores the environment before the
    caller looks at the module hands back the state it was meant to replace.
    """
    was = {k: os.environ.get(k) for k in env}
    for k, v in env.items():
        os.environ[k] = v
    try:
        yield importlib.reload(serve)
    finally:
        for k, v in was.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        importlib.reload(serve)


def an_app(module):
    return module.make_app(submit_fn=lambda **k: "job", poll_fn=lambda **k: None)


def paths(app):
    return {r.path for r in app.routes}


# ── the endpoint that renders a body ────────────────────────────────────────

def test_the_debug_route_does_not_exist_by_default(monkeypatch):
    monkeypatch.setenv("SARTORIA_ALLOW_INSECURE_DEV", "1")
    """It returns a rendering of somebody's body. Off is the default, and off
    means absent rather than present-and-refusing."""
    assert "/debug" not in paths(an_app(serve))


def test_the_debug_route_can_be_turned_on_for_development():
    with deployed_as(SARTORIA_DEBUG_ENDPOINT="1", SARTORIA_ENV="dev", SARTORIA_ALLOW_INSECURE_DEV="1") as m:
        assert "/debug" in paths(an_app(m))


def test_production_refuses_the_debug_route_even_when_asked_for_it():
    """The whole point. One environment variable used to stand between a
    stranger and a picture of a customer; in production the code path is not
    registered at all, so the variable has nothing to switch."""
    with deployed_as(SARTORIA_DEBUG_ENDPOINT="1", SARTORIA_ENV="production", SARTORIA_TOKEN_SECRET="test-only-secret") as m:
        assert m.DEBUG_ENABLED is False
        assert "/debug" not in paths(an_app(m))


def test_production_still_serves_the_real_endpoints():
    with deployed_as(SARTORIA_ENV="production", SARTORIA_TOKEN_SECRET="test-only-secret") as m:
        assert {"/health", "/analyse", "/result/{job_id}"} <= paths(an_app(m))


# ── the label the caller chooses ────────────────────────────────────────────

def test_even_identifier_shaped_labels_are_replaced():
    for label in ("synthetic-001", "SamplePerson", "web-4f2a91bc"):
        assert serve._safe_session_id(label) != label


@pytest.mark.parametrize("given", [
    "Sample Person",                 # a name is the thing we must not write down
    "person@example.test",
    "../../etc/passwd",
    "x" * 41,                         # longer than any identifier we issue
    "", "   ",
    "note: measured after lunch, waist felt tight",
])
def test_anything_that_is_not_an_identifier_is_replaced(given):
    """This string is logged and returned on the twin. A name typed into it
    would be personal data nobody asked for, and then ours to account for."""
    out = serve._safe_session_id(given)
    assert out != given.strip()
    assert re.fullmatch(r"web-[0-9a-f]{32}", out)


def test_two_unlabelled_sessions_do_not_collide():
    assert serve._safe_session_id("") != serve._safe_session_id("")


# ── the clip does not outlive the request ───────────────────────────────────

def test_the_decode_check_leaves_no_file_behind():
    """It writes the upload to a temp file to see whether a decoder can read
    it. Retention starts with a file somebody forgot to delete."""
    before = set(pathlib.Path("/tmp").glob("*")) if os.path.isdir("/tmp") else set()
    serve.decodes_to_a_frame(b"not a video at all" * 100, ".mp4")
    after = set(pathlib.Path("/tmp").glob("*")) if os.path.isdir("/tmp") else set()
    assert not (after - before), "the decode check left a temp file behind"


def test_the_worker_deletes_the_clip_even_when_measuring_raises():
    """The deletion is in a `finally` in modal_app.py. Read rather than run,
    because running it needs a GPU — but an unprotected unlink would be a
    retention policy of 'until the container dies'."""
    src = pathlib.Path("modal_app.py").read_text()
    body = src[src.index("def measure("):]
    assert "finally:" in body
    finally_block = body[body.index("finally:"):]
    assert "unlink(missing_ok=True)" in finally_block.split("\n\n")[0]


def test_nothing_in_the_engine_writes_to_a_database_or_a_bucket():
    """Stateless is the current privacy position. If this test ever fails,
    somebody added storage, and retention stopped being 'the request'."""
    joined = "\n".join(
        p.read_text() for p in pathlib.Path("spike").glob("*.py"))
    for forbidden in ("modal.Volume", "boto3", "s3.", "psycopg", "sqlite3",
                      "sqlalchemy", "redis."):
        assert forbidden not in joined, f"{forbidden} introduces storage"
