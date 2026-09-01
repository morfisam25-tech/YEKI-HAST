import type { NextConfig } from 'next';

// The public pages remain statically optimizable, but Web also owns server-side
// POST Route Handlers for Email OTP/session proxying. Keep the normal Next.js
// server runtime enabled so those handlers are available in production.
const nextConfig: NextConfig = {};

export default nextConfig;
