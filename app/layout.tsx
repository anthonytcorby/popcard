import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

const SITE_URL = 'https://popcard-eta.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Popcard — Watch less. Know more.',
    template: '%s | Popcard',
  },
  description:
    'Turn YouTube videos, Spotify podcasts, and ebooks into crisp, interactive knowledge cards with AI. Save time and learn faster.',
  keywords: [
    'YouTube summary',
    'AI knowledge cards',
    'video summarizer',
    'YouTube to notes',
    'AI study tool',
    'Popcard',
    'learn faster',
    'video notes',
    'Spotify podcast summary',
    'PDF summary',
    'ebook summary',
    'podcast to notes',
  ],
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Popcard — Watch less. Know more.',
    description:
      'Turn YouTube videos, Spotify podcasts, and ebooks into crisp, interactive knowledge cards with AI.',
    url: SITE_URL,
    siteName: 'Popcard',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'Popcard — AI-powered YouTube knowledge cards' }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Popcard — Watch less. Know more.',
    description:
      'Turn YouTube videos, Spotify podcasts, and ebooks into crisp, interactive knowledge cards with AI.',
    images: [`${SITE_URL}/og-image.png`],
  },
  icons: { icon: '/favicon.ico' },
  other: {
    'theme-color': '#4A90D9',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4A90D9',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Popcard',
  description:
    'Turn YouTube videos, Spotify podcasts, and ebooks into crisp, interactive knowledge cards with AI.',
  url: SITE_URL,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
