import type { NextConfig } from 'next';

// The public pages remain statically optimizable, but Web also owns server-side
// POST Route Handlers for Email OTP/session proxying. Do not use output:'export':
// static export has no runtime server for those handlers.
const nextConfig: NextConfig = {};

export default nextConfig;
