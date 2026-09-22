"""Tokens for the endpoint that starts GPUs."""
import time

import pytest

from spike.auth import RateLimit, TokenError, caller_id, mint, verify

SECRET = "a-secret-that-never-reaches-the-bundle"


def test_a_token_we_minted_verifies():
    assert verify(mint(SECRET), SECRET)["p"] == "measure"


def test_a_token_from_another_secret_does_not():
    with pytest.raises(TokenError):
        verify(mint("someone else's secret"), SECRET)


def test_a_tampered_payload_does_not():
    token = mint(SECRET)
    body, sig = token.split(".", 1)
    with pytest.raises(TokenError):
        verify(f"{body[:-2]}XY.{sig}", SECRET)


def test_an_expired_token_does_not():
    with pytest.raises(TokenError):
        verify(mint(SECRET, ttl_seconds=-1), SECRET)


def test_a_token_for_another_purpose_does_not():
    with pytest.raises(TokenError):
        verify(mint(SECRET, purpose="debug"), SECRET, purpose="measure")


@pytest.mark.parametrize("junk", ["", "nonsense", "a.b", "....", "x." * 40])
def test_junk_is_refused_rather_than_crashing(junk):
    with pytest.raises(TokenError):
        verify(junk, SECRET)


def test_the_rate_limit_lets_a_normal_run_through_and_stops_a_flood():
    r = RateLimit(limit=3, window_seconds=60)
    assert [r.allow("1.2.3.4") for _ in range(3)] == [True, True, True]
    assert r.allow("1.2.3.4") is False
    assert r.allow("5.6.7.8") is True, "one caller must not block another"


def test_the_window_slides():
    r = RateLimit(limit=1, window_seconds=1)
    assert r.allow("x") is True
    assert r.allow("x") is False
    time.sleep(1.05)
    assert r.allow("x") is True


def test_polling_is_not_budgeted_like_starting_a_job():
    """One scan polls dozens of times. Sharing a budget with the endpoint that
    starts GPUs made a single normal run look like an attack — it did, to me,
    within a minute of the limit going in."""
    starts = RateLimit(limit=10, window_seconds=600)
    polls = RateLimit(limit=1200, window_seconds=600)
    assert all(polls.allow("1.2.3.4") for _ in range(60))
    assert starts.allow("1.2.3.4") is True


def test_a_token_is_no_use_from_another_address():
    """It cannot say who a person is — the app hands one to anybody who asks —
    but it can say the holder is not who it was issued to."""
    mine = caller_id("203.0.113.7", SECRET)
    theirs = caller_id("198.51.100.9", SECRET)
    token = mint(SECRET, who=mine)
    assert verify(token, SECRET, who=mine)["w"] == mine
    with pytest.raises(TokenError):
        verify(token, SECRET, who=theirs)


def test_an_unbound_token_still_works_anywhere():
    """Binding narrows a token; it is not a second secret, and an old token
    without a handle must not start failing."""
    assert verify(mint(SECRET), SECRET, who=caller_id("203.0.113.7", SECRET))


def test_a_bound_token_fails_closed_when_the_caller_is_unknown():
    """Omitting the caller must not skip the check. It did, and the binding
    sat in the codebase doing nothing at all."""
    token = mint(SECRET, who=caller_id("203.0.113.7", SECRET))
    with pytest.raises(TokenError):
        verify(token, SECRET)


def test_the_caller_handle_is_keyed_not_a_lookup_table():
    """There are four billion IPv4 addresses. A bare digest of one is
    reversible by trying them all."""
    import hashlib
    ip = "203.0.113.7"
    assert caller_id(ip, SECRET) != hashlib.sha256(ip.encode()).hexdigest()[:16]
    assert caller_id(ip, SECRET) != caller_id(ip, "another secret")


def test_the_address_itself_is_never_written_into_the_token():
    """The token travels through a browser. An IP is personal data that does
    not need to go with it."""
    token = mint(SECRET, who=caller_id("203.0.113.7", SECRET))
    assert "203.0.113.7" not in token
    import base64
    body = base64.urlsafe_b64decode(token.split(".")[0] + "==").decode()
    assert "203.0.113" not in body
