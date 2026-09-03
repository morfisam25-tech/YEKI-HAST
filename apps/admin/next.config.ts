import type { NextConfig } from 'next';
import { resolve } from 'node:path';

// Admin is also built inside the root npm workspace, so production runtime
// dependencies are hoisted above apps/admin. Trace from the monorepo root so
// Vercel's prebuilt deployment captures the lock-installed dependency paths.
const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
};

export default nextConfig;
