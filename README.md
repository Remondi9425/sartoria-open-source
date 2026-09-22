# SartorIA

SartorIA is a research prototype that estimates body measurements from a short
video and uses size charts to suggest a jeans size. It includes a Next.js demo,
a Python geometry and measurement pipeline, and an optional GPU worker on Modal.

**Status:** experimental. The demo uses synthetic measurements unless configured
with an engine URL. Measurement accuracy has not been validated on a sufficiently
large, representative sample. This is not a production-ready public scanning service.

## Try the demo

Use Node.js 24 (see `.nvmrc`) and npm. No account, model download or GPU is needed.

```sh
cd web
npm ci
npm run dev
```

Open http://localhost:3000. Leave `NEXT_PUBLIC_ENGINE_URL` unset to use the demo.
The catalogue and size charts are fictional. The camera can be used by the flow;
with the stub selected, recordings are not sent to the measurement engine.

## Work on the Python engine

Use Python 3.12 and [uv](https://docs.astral.sh/uv/getting-started/installation/).
From the repository root:

```sh
uv sync --locked
uv run --locked pytest tests/ -q
```

Tests use synthetic geometry and generated video; private recordings and GPU
weights are not required. Heavy model inference runs separately on Modal.

## Check the frontend

```sh
cd web
npm test
npm run lint
npm run typecheck
npm run build
```

## Layout

| Path | Purpose |
| --- | --- |
| `spike/mesh.py`, `spike/skeleton.py` | Geometry and named body landmarks |
| `spike/nlf.py`, `spike/pipeline_smpl.py` | NLF adapter and measurement pipeline |
| `spike/serve.py`, `spike/auth.py` | Upload, job access and polling API |
| `modal_app.py` | CPU/GPU deployment definition |
| `web/` | Demo, real HTTP client and size recommendation logic |
| `tests/`, `web/test/` | Synthetic unit and API tests |
| `data/ground_truth.example.csv` | Clearly labelled synthetic CSV example |
| `docs/` | Architecture, deployment and research protocol |

See [architecture](docs/architecture.md), [deployment](docs/deployment.md),
[research protocol](docs/research.md), [privacy](PRIVACY.md),
[contributing](CONTRIBUTING.md) and [security](SECURITY.md).

## Licence

Original SartorIA code and documentation are available under the [MIT licence](LICENSE).
External libraries and model assets retain their own terms. In particular,
released NLF weights are for noncommercial research; MIT licensing of this
repository does not grant commercial rights to those weights or SMPL assets.
See [third-party notices](THIRD_PARTY_NOTICES.md) before using the real engine.
