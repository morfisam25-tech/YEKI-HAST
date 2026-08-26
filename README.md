# یکی هست — Yeki Hast

Iran-first, global-ready Human Listening Marketplace.

This repository contains the v0.8 backend foundation, including:
- PostgreSQL schema and migration tooling
- API foundation
- OTP/auth/security foundation
- caller waitlist and listener application flows
- domain billing logic
- Vercel-compatible serverless handler
- tests and foundation validation scripts

Current backend foundation status:
- Scratch Neon migration completed successfully on v0.7 schema
- Core money-integrity attack tests passed
- v0.8 refactors API routing into a shared handler for local Node and Vercel Functions

See `FOUNDATION_QA_REPORT_v0.8.md` and `docs/NEON_SCRATCH_SMOKE_v0.7.md` for the latest execution notes.
