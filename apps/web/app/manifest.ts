import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'یکی هست',
    short_name: 'یکی هست',
    description: 'گفت‌وگوی صوتی اینترنتی با یک شنونده واقعی',
    start_url: '/talk',
    display: 'standalone',
    background_color: '#fffaf3',
    theme_color: '#1e1a17',
    lang: 'fa',
    dir: 'rtl',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
