/* یکی هست PWA service worker.
 * Authenticated pages, API responses, call signaling and wallet data are deliberately
 * not cached. The worker exists for installability/lifecycle only until an offline policy
 * is defined for non-sensitive public assets.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
