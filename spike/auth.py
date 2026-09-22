"""Short-lived signed tokens for the measurement endpoint.

The engine's URL is in the front end's bundle — anything prefixed
NEXT_PUBLIC_ is, by definition — and the endpoint starts a GPU container. CORS
does not help: it is a rule browsers apply to other people's pages, not a
restriction on anyone holding a shell.

So the front end's server mints a token, the browser carries it, and the worker
checks it. The secret stays on the server at both ends and never reaches the
bundle.

**What this does and does not do.** It stops someone who finds the engine's URL
from using it, and it ties a token to the address that asked for one, so a
token lifted from a browser is no use elsewhere. It does *not* authorise a
person: the front end hands a token to any caller that asks, so anyone who
finds the app can still get one. Real protection needs a bot check or a signed-
in session, and rate limiting that outlives a container. This is a bounded
deterrent, and calling it more than that would be worse than not having it.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import json
import time


class TokenError(Exception):
    """Phrased for a log, not for a caller: never echo this back."""


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def caller_id(raw: str | None, secret: str) -> str:
    """A stable handle for whoever is asking, that cannot be read back.

    Keyed, not a bare digest. There are only four billion IPv4 addresses, so a
    plain SHA-256 of one is reversible by trying them all — which makes it a
    slow lookup table rather than a one-way function. The address itself never
    goes into a token: the token travels through a browser, and an address is
    personal data that has no reason to.
    """
    return hmac.new(secret.encode(), (raw or "unknown").encode(),
                    hashlib.sha256).hexdigest()[:16]


def mint(secret: str, ttl_seconds: int = 900, purpose: str = "measure",
         who: str | None = None) -> str:
    payload = {"exp": int(time.time()) + ttl_seconds, "p": purpose,
               "nonce": secrets.token_urlsafe(16)}
    if who:
        payload["w"] = who
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64(sig)}"


def verify(token: str, secret: str, purpose: str = "measure",
           who: str | None = None) -> dict:
    """The payload, or TokenError. Never returns a partially trusted result."""
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        raise TokenError("malformed token") from None

    try:
        given = _unb64(sig)
    except Exception:
        # Junk must be refused, not raise something the caller did not expect.
        raise TokenError("unreadable signature") from None

    expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    # Constant time: a check that leaks its comparison lets a signature be
    # discovered one byte at a time.
    if not hmac.compare_digest(given, expected):
        raise TokenError("bad signature")

    try:
        payload = json.loads(_unb64(body))
    except Exception:
        raise TokenError("unreadable payload") from None

    if not isinstance(payload, dict):
        raise TokenError("payload must be an object")
    if payload.get("p") != purpose:
        raise TokenError(f"wrong purpose: {payload.get('p')!r}")
    if type(payload.get("exp")) is not int:
        raise TokenError("no expiry")
    if payload["exp"] < time.time():
        raise TokenError("expired")
    # A token minted for one caller is no use to another. Fail closed: a
    # verifier that cannot say who is asking must not be able to skip the
    # check by omission, which is how the binding came to be dead code the
    # first time it went in.
    bound = payload.get("w")
    if bound:
        if not who:
            raise TokenError("token is bound but the caller is unknown")
        if not hmac.compare_digest(str(bound), who):
            raise TokenError("token was issued to a different caller")
    return payload


class RateLimit:
    """A sliding window per caller, held in memory.

    Deliberately modest: containers come and go, so this bounds one container's
    exposure rather than the service's. The token is the real gate; this stops
    a single holder from spending the whole budget in a minute.
    """

    def __init__(self, limit: int = 10, window_seconds: int = 600) -> None:
        self.limit = limit
        self.window = window_seconds
        self._seen: dict[str, list[float]] = {}

    def allow(self, who: str) -> bool:
        now = time.time()
        hits = [t for t in self._seen.get(who, []) if now - t < self.window]
        if len(hits) >= self.limit:
            self._seen[who] = hits
            return False
        hits.append(now)
        self._seen[who] = hits
        return True


def token_handle(token: str) -> str:
    """Bind a result capability to the exact token that submitted the job."""
    return hashlib.sha256(token.encode()).hexdigest()
