# W12 Cloudflare compatibility proof

Non-production only. This directory exists to answer the commercial-hosting compatibility question without changing or deploying the current Vercel production system.

## Scope

- API: bundle the existing Node `IncomingMessage` / `ServerResponse` handler behind Cloudflare Workers `httpServerHandler`.
- Web: run `vinext check` against the existing Next.js 16 application.
- No Cloudflare deployment.
- No domain changes.
- No production environment variables or provider credentials.
- No database writes or migrations.

## What a passing dry run proves

A successful Worker bundle proves that the current API dependency graph can be packaged for the current Workers runtime with Node compatibility. A successful `vinext check` is a compatibility signal for the Web application. Neither result proves production capacity, latency, database pooling behavior, provider credentials, or release readiness; those require an isolated preview environment and runtime tests before any migration.

## Production remains unchanged

The production Vercel entrypoints, project configuration, domains, and deployment SHA are not modified by this proof.
