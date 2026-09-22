# Privacy engineering notes

This document describes the code, not a final legal notice or a guarantee about
cloud-provider retention. An operator must establish their own processing and
retention arrangements before collecting recordings from people.

## Data flow

In demo mode, measurements are synthetic and the stub does not upload the clip.
In real-engine mode, the browser sends a video and typed height to the configured
engine. The CPU endpoint checks the upload and starts a GPU job; the browser
polls for measurements, confidence indicators and a body point cloud used for
visualisation. Those outputs can also be personal data.

The HTTP service generates an opaque session ID and ignores client-supplied
labels. Local research scripts can still use labels to match private datasets.
Temporary video files used for decoding and GPU processing are deleted in
`finally` blocks, including failure paths.

The application does not intentionally persist recordings or measurements in its
own database. This does **not** mean nothing is stored: the cloud provider handles
job inputs, outputs, queues and logs under its own terms. Provider retention,
backups, regions and deletion guarantees must be verified for each deployment.
The Modal region setting alone is not proof of end-to-end data residency.

## Access controls

A signed short-lived submission token is required unless a developer explicitly
enables unauthenticated local development. Production cannot use that mode.
A result also requires a signed capability tied to both the job and the original
submission token. Responses carry `Cache-Control: no-store`; result capabilities
are sent in headers rather than URLs. Treat both tokens as credentials.

Debug rendering is absent by default and disabled in production. Ordinary
measurement responses still contain body-derived data. Debug controls are not a
substitute for consent and access control.

The token issuer does not authenticate a person. Rate limits are per process,
not global quotas. Before an unrestricted public launch, add an access policy,
shared quotas and a validated proxy/IP trust configuration.

## Other flows

Preferences are held in browser memory to rank the fictional catalogue.
Marketing consent is separate and optional. The subscription endpoint currently
returns 503 because no store is implemented; it does not claim a successful signup.
Adding persistence requires a retention period, deletion path and updated notices.

## Research and source distribution

Only synthetic examples belong in the public source tree. Recordings, real tape
measurements, private research notes and unpublished presentations are excluded.
Tests generate their own video and geometry. Historical Git commits may contain
private material even when the current tree is clean; distribute only a reviewed
snapshot or a separately verified clean history.

Before real-world use, review participant information and consent, access for
minors, processors, retention, deletion and the accuracy claims in the UI.
