"""Exercise HTTP authorisation without network, recordings or GPU calls."""
import pytest
from fastapi.testclient import TestClient

from spike import serve
from spike.auth import mint

SECRET = "synthetic-test-secret-not-for-deployment"


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv("SARTORIA_TOKEN_SECRET", SECRET)
    monkeypatch.setenv("SARTORIA_ENV", "production")
    monkeypatch.setattr(serve, "decodes_to_a_frame", lambda *_: True)
    polled = []
    jobs = []

    async def submit(**kwargs):
        jobs.append(kwargs)
        return f"job-{len(jobs)}"

    def poll(job_id):
        polled.append(job_id)
        return {"status": "ok", "synthetic": True}

    with TestClient(serve.make_app(submit, poll)) as client:
        yield client, polled, jobs


def upload(client, token):
    response = client.post(
        "/analyse", headers={"authorization": f"Bearer {token}"},
        data={"height_cm": "175", "session_id": "SamplePerson"},
        files={"video": ("ignored.mp4", b"\x00\x00\x00\x20ftypisom" + b"\x00" * 10000)},
    )
    assert response.status_code == 202
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def headers(token, result_token):
    return {"authorization": f"Bearer {token}",
            "x-sartoria-result-token": result_token}


def test_submitter_can_poll_and_user_labels_are_not_forwarded(api):
    client, polled, jobs = api
    token = mint(SECRET)
    ticket = upload(client, token)
    response = client.get(f"/result/{ticket['job_id']}",
                          headers=headers(token, ticket["result_token"]))
    assert response.status_code == 200
    assert response.json()["synthetic"] is True
    assert response.headers["cache-control"] == "no-store"
    assert polled == [ticket["job_id"]]
    assert jobs[0]["session_id"] == ticket["session_id"] != "SamplePerson"


def test_other_token_cannot_read_result_even_with_its_capability(api):
    client, polled, _ = api
    ticket = upload(client, mint(SECRET))
    other = mint(SECRET)
    response = client.get(f"/result/{ticket['job_id']}",
                          headers=headers(other, ticket["result_token"]))
    assert response.status_code == 403
    assert polled == []


def test_capability_for_one_job_cannot_poll_another(api):
    client, polled, _ = api
    token = mint(SECRET)
    first, second = upload(client, token), upload(client, token)
    response = client.get(f"/result/{second['job_id']}",
                          headers=headers(token, first["result_token"]))
    assert response.status_code == 403
    assert polled == []


@pytest.mark.parametrize("capability", ["", "forged", "expired"])
def test_missing_invalid_or_expired_capability_is_denied(api, capability):
    from spike.auth import token_handle
    client, polled, _ = api
    token = mint(SECRET)
    ticket = upload(client, token)
    if capability == "expired":
        capability = mint(SECRET, ttl_seconds=-1, purpose=f"result:{ticket['job_id']}",
                          who=token_handle(token))
    response = client.get(f"/result/{ticket['job_id']}", headers=headers(token, capability))
    assert response.status_code == 403
    assert polled == []


@pytest.mark.parametrize("env,allow", [("production", "1"), ("dev", "0"), ("staging", "1")])
def test_missing_secret_prevents_startup(monkeypatch, env, allow):
    monkeypatch.setenv("SARTORIA_TOKEN_SECRET", "  ")
    monkeypatch.setenv("SARTORIA_ENV", env)
    monkeypatch.setenv("SARTORIA_ALLOW_INSECURE_DEV", allow)
    with pytest.raises(RuntimeError, match="SARTORIA_TOKEN_SECRET"):
        serve.make_app(lambda **_: "job", lambda **_: None)


def test_open_mode_requires_explicit_local_development(monkeypatch):
    monkeypatch.delenv("SARTORIA_TOKEN_SECRET", raising=False)
    monkeypatch.setenv("SARTORIA_ENV", "dev")
    monkeypatch.setenv("SARTORIA_ALLOW_INSECURE_DEV", "1")
    with TestClient(serve.make_app(lambda **_: "job", lambda **_: None)) as client:
        assert client.get("/result/synthetic-job").json() == {"status": "working"}


def test_removing_secret_after_startup_fails_closed(api, monkeypatch):
    client, polled, _ = api
    monkeypatch.delenv("SARTORIA_TOKEN_SECRET")
    monkeypatch.setenv("SARTORIA_ALLOW_INSECURE_DEV", "1")
    assert client.get("/result/job").status_code == 503
    assert polled == []
