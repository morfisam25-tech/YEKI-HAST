import type { NextConfig } from 'next';
import { resolve } from 'node:path';

// The public pages remain statically optimizable, but Web also owns server-side
// POST Route Handlers for Email OTP/session proxying. Keep the normal Next.js
// server runtime enabled so those handlers are available in production.
//
// This app lives in an npm workspace whose runtime dependencies are hoisted to
// the repository root. Trace from that monorepo root so Vercel's prebuilt output
// references the actual lock-installed dependency locations instead of assuming
// every traced package exists under apps/web/node_modules.
const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
};

export default nextConfig;
