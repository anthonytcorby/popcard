import { PopCard, CARD_LABELS } from '@/types/card';

/** Convert "MM:SS" or "H:MM:SS" to total seconds for YouTube ?t= links. */
function timestampToSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/** Build a clickable YouTube timestamp URL, or null if we can't. */
function timestampLink(videoUrl: string | undefined, ts: string | undefined): string | null {
  if (!videoUrl || !ts) return null;
  const secs = timestampToSeconds(ts);
  // Support youtu.be and youtube.com/watch formats
  const ytMatch = videoUrl.match(/(?:youtu\.be\/|[?&]v=)([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return null;
  return `https://youtu.be/${ytMatch[1]}?t=${secs}`;
}

export function toMarkdown(cards: PopCard[], videoUrl?: string): string {
  const lines: string[] = [];
  lines.push('# Popcard Export');
  if (videoUrl) lines.push(`\n> Source: ${videoUrl}\n`);
  lines.push(`> Generated: ${new Date().toLocaleDateString()}\n`);

  for (const card of cards) {
    if (card.type === 'SECTION_HEADER') {
      lines.push(`\n## ${card.headline}\n`);
      continue;
    }
    if (card.type === 'TLDR') {
      lines.push(`\n---\n### TL;DR\n\n${card.body}\n`);
      continue;
    }

    lines.push(`---\n`);
    lines.push(`### [${CARD_LABELS[card.type]}] ${card.headline}`);
    lines.push(`\n${card.body}`);
    if (card.url) lines.push(`\n🔗 ${card.url}`);
    if (card.warning) lines.push(`\n⚠ ${card.warning}`);

    const link = timestampLink(videoUrl, card.timestamp);
    if (link) lines.push(`\n*[${card.timestamp}](${link})*`);
    else if (card.timestamp) lines.push(`\n*Timestamp: ${card.timestamp}*`);

    lines.push('');
  }

  return lines.join('\n');
}
