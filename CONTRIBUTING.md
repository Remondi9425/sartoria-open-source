# Contributing

Use Python 3.12, uv and Node.js 24. Start with the setup commands in README.md.
Run Python tests and the frontend test, lint, typecheck and build commands before
opening a pull request. CI uses synthetic inputs and needs no cloud secrets.

Keep geometry independent of provider-specific inference. Update Python and
TypeScript contracts together when changing measurement responses. Add regression
tests for behavioural fixes, especially access controls and numerical edge cases.

Never include recordings of people, real measurements, credentials or private
research documents in a contribution. Use synthetic fixtures and explain their
construction. Do not infer accuracy from the small example dataset.

After changing Python dependencies, run:

```sh
uv lock
uv export --locked --no-dev --no-emit-project --no-hashes --output-file requirements-runtime.txt
uv sync --locked
```

Commit both the lock and exported runtime requirements. The Modal image consumes
the export; CI checks it against the lock. For frontend changes, use npm and commit
`web/package-lock.json`. Discuss large model/runtime changes before implementing them.

Describe the problem, resulting behaviour, tests and relevant limitations in PRs.
Contributions are provided under this repository's MIT licence. Report security
issues privately using the process in SECURITY.md.
