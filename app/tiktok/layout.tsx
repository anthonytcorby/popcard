import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TikTok Slides Generator',
  description:
    'Turn YouTube videos into branded TikTok carousel slides with AI. Download ready-to-post slides with captions.',
  openGraph: {
    title: 'Popcard — TikTok Slides Generator',
    description:
      'Turn YouTube videos into branded TikTok carousel slides with AI.',
  },
};

export default function TikTokLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
