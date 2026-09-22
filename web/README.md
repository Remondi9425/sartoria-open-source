# SartorIA customer app

Next.js frontend with two measurement modes:

- **Demo (default):** `NEXT_PUBLIC_ENGINE_URL` is empty; the engine returns synthetic
  measurements. Size recommendation and preference ranking use real deterministic logic.
- **Research engine:** set the URL and the server-side shared secret in `.env.local`.
  The browser records a clip, uploads it to that engine and polls for the result.

Use Node.js 24 and run `npm ci`, then `npm run dev`. To configure the real engine,
copy `.env.example` to `.env.local` and follow [deployment](../docs/deployment.md).
The URL is bundled at build time; secrets must never use the `NEXT_PUBLIC_` prefix.

Checks: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
`npm run fit-table` prints recommendations across the fictional catalogue.

Demo refusal scenarios: `/?demo=no-head`, `/?demo=no-turn`, `/?demo=unsure`.
`/scan-preview` is a renderer development bench, not a measurement endpoint.

The `lib/engine/` contract isolates the screens from HTTP and stub implementations.
API tokens are issued by `app/api/engine-token/route.ts`. Each submission returns a
separate result capability, sent in a header during polling. Deploy backend and
frontend together when changing this protocol; older clients cannot poll the new API.

The marketing signup endpoint is an explicit placeholder: without a configured
store it returns 503 and does not save addresses. Checkout is a demo, not a payment service.
