import { PopCard, CARD_LABELS } from '@/types/card';

function timestampToSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function timestampLink(videoUrl: string | undefined, ts: string | undefined): string | null {
  if (!videoUrl || !ts) return null;
  const secs = timestampToSeconds(ts);
  const ytMatch = videoUrl.match(/(?:youtu\.be\/|[?&]v=)([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return null;
  return `https://youtu.be/${ytMatch[1]}?t=${secs}`;
}

export function toObsidian(cards: PopCard[], videoUrl?: string): string {
  const lines: string[] = [];
  const date = new Date().toISOString().split('T')[0];

  lines.push(`---`);
  lines.push(`tags: [popcard, video-notes]`);
  lines.push(`created: ${date}`);
  if (videoUrl) lines.push(`source: "${videoUrl}"`);
  lines.push(`---\n`);
  lines.push(`# Video Notes\n`);

  // TL;DR first
  const tldr = cards.find(c => c.type === 'TLDR');
  if (tldr) lines.push(`> ${tldr.body}\n`);

  for (const card of cards) {
    if (card.type === 'TLDR') continue;

    if (card.type === 'SECTION_HEADER') {
      lines.push(`\n## ${card.headline}\n`);
      continue;
    }

    lines.push(`### [${CARD_LABELS[card.type]}] ${card.headline}`);
    if (card.body) lines.push(`${card.body}`);
    if (card.url) lines.push(`🔗 ${card.url}`);
    if (card.warning) lines.push(`⚠ ${card.warning}`);

    const link = timestampLink(videoUrl, card.timestamp);
    if (link) lines.push(`> 🕐 [${card.timestamp}](${link})`);
    else if (card.timestamp) lines.push(`> 🕐 ${card.timestamp}`);

    lines.push('');
  }

  return lines.join('\n');
}
