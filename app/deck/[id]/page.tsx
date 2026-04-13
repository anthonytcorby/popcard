import { notFound } from 'next/navigation';
import CardGrid from '@/components/CardGrid';
import VideoHeaderCard from '@/components/VideoHeaderCard';
import TakeawaysSection from '@/components/TakeawaysSection';
import Logo from '@/components/Logo';
import { PopCard } from '@/types/card';

interface DeckData {
  title: string;
  cards: PopCard[];
  takeaways: string[];
  videoUrl?: string;
  thumbnailUrl?: string;
}

async function getDeck(id: string): Promise<DeckData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/deck?id=${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function SharedDeckPage({ params }: { params: { id: string } }) {
  const deck = await getDeck(params.id);
  if (!deck) notFound();

  const tldrCard = deck.cards.find(c => c.type === 'TLDR');
  const mainCards = deck.cards.filter(c => c.type !== 'TLDR');

  return (
    <div className="min-h-screen bg-dot-grid">
      <nav className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/"><Logo size="md" /></a>
          <a
            href="/"
            className="text-sm font-semibold text-[#4A90D9] hover:text-[#3a7fc8] transition-colors"
          >
            Try Popcard →
          </a>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10 pb-20">
        {deck.videoUrl && (
          <VideoHeaderCard
            title={deck.title}
            thumbnailUrl={deck.thumbnailUrl ?? null}
            videoUrl={deck.videoUrl}
          />
        )}

        {tldrCard && (
          <div className="col-span-full rounded-3xl p-5 mt-4 mb-2 shadow-md" style={{ backgroundColor: '#1a1a2e' }}>
            <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">TL;DR</p>
            <p className="text-sm leading-relaxed text-white/90">{tldrCard.body}</p>
          </div>
        )}

        <div className="mt-4">
          <CardGrid cards={mainCards} filter="ALL" videoUrl={deck.videoUrl} />
        </div>

        {deck.takeaways.length > 0 && <TakeawaysSection takeaways={deck.takeaways} />}

        <p className="text-center text-xs text-gray-400 mt-12">
          This deck was shared via Popcard · links expire after 7 days
        </p>
      </main>
    </div>
  );
}
