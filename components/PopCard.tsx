'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkle, Rocket, ChartBar, Quotes, Warning,
  Wrench, Books, ArrowsClockwise, Lightning,
  Copy, ArrowSquareOut, BookOpen,
} from '@phosphor-icons/react';
import { PopCard as PopCardType, CARD_COLORS, CARD_LABELS } from '@/types/card';

interface PopCardProps {
  card: PopCardType;
  index: number;
  videoUrl?: string;
}

const ICONS = {
  KEY_INSIGHT:    Sparkle,
  ACTIONABLE_TIP: Rocket,
  STAT_OR_DATA:   ChartBar,
  QUOTE:          Quotes,
  WATCH_OUT:      Warning,
  TOOL_MENTIONED: Wrench,
  RESOURCE_LINK:  Books,
  KEY_THEME:      ArrowsClockwise,
  TLDR:           Lightning,
  SECTION_HEADER: Lightning, // never rendered as a card
};

function renderBody(body: string, boldPhrase?: string, textColor = 'white') {
  if (!boldPhrase || !body.includes(boldPhrase)) {
    return <p className="text-sm leading-relaxed opacity-90">{body}</p>;
  }
  const parts = body.split(boldPhrase);
  return (
    <p className="text-sm leading-relaxed opacity-90">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <strong style={{ color: textColor === 'white' ? 'white' : '#1a1a1a' }} className="font-bold">
              {boldPhrase}
            </strong>
          )}
        </span>
      ))}
    </p>
  );
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
  } catch { /* ignore */ }
  return null;
}

function parseTimestampSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export default function PopCard({ card, index, videoUrl }: PopCardProps) {
  const { bg, text, pill } = CARD_COLORS[card.type];
  const Icon = ICONS[card.type];
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const refsText = card.references?.length ? `\n\nReferences:\n${card.references.map(r => `- ${r}`).join('\n')}` : '';
    const copyText = `${card.headline}\n${card.body}${refsText}`;
    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = copyText;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const timestampUrl = (() => {
    if (!card.timestamp || !videoUrl) return null;
    const videoId = extractVideoId(videoUrl);
    if (!videoId) return null;
    const seconds = parseTimestampSeconds(card.timestamp);
    return `https://youtube.com/watch?v=${videoId}&t=${seconds}`;
  })();

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        delay: index * 0.07,
        type: 'spring',
        stiffness: 400,
        damping: 15,
      }}
      role="article"
      style={{ backgroundColor: bg, borderRadius: 20 }}
      className="group relative flex flex-col gap-3 p-5 shadow-md hover:shadow-xl hover:-translate-y-1 transition-shadow duration-200 cursor-default"
    >
      {/* Copy button */}
      <button
        onClick={handleCopy}
        aria-label="Copy card text"
        className="absolute top-3 right-3 p-1.5 rounded-full opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity duration-200"
        style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
      >
        {copied ? (
          <span className="text-xs font-semibold px-1" style={{ color: text }}>Copied!</span>
        ) : (
          <Copy size={14} weight="bold" color={text === 'white' ? 'white' : '#1a1a1a'} />
        )}
      </button>

      {/* Type icon + label */}
      <div className="flex items-center gap-2">
        <div
          className="rounded-full p-1.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
        >
          <Icon size={14} weight="fill" color={text === 'white' ? 'white' : '#1a1a1a'} />
        </div>
        <span
          className="text-xs font-semibold uppercase tracking-wide opacity-80"
          style={{ color: text }}
        >
          {CARD_LABELS[card.type]}
        </span>
      </div>

      {/* Headline with optional multi-part series badge */}
      {(() => {
        const seriesMatch = card.headline.match(/^(.+?)\s*\((\d+\/\d+)\)\s*$/);
        if (seriesMatch) {
          return (
            <h3 className="text-base font-bold leading-snug flex items-center gap-2" style={{ color: text }}>
              <span>{seriesMatch[1]}</span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
                style={{ backgroundColor: 'rgba(255,255,255,0.25)', color: text }}
              >
                {seriesMatch[2]}
              </span>
            </h3>
          );
        }
        return (
          <h3 className="text-base font-bold leading-snug" style={{ color: text }}>
            {card.headline}
          </h3>
        );
      })()}

      {/* Body */}
      {card.body && (
        <div style={{ color: text }}>
          {card.type === 'QUOTE' ? (
            <blockquote className="text-sm leading-relaxed opacity-90 italic border-l-2 pl-3" style={{ borderColor: text === 'white' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)' }}>
              {card.body}
            </blockquote>
          ) : (
            renderBody(card.body, card.boldPhrase, text)
          )}
        </div>
      )}

      {/* URL link for tools/resources */}
      {card.url && (
        <a
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline opacity-70 hover:opacity-100 transition-opacity break-all"
          style={{ color: text }}
          onClick={e => e.stopPropagation()}
        >
          {card.url.replace(/^https?:\/\/(www\.)?/, '')}
        </a>
      )}

      {/* Warning note */}
      {card.warning && (
        <p
          className="text-xs leading-relaxed mt-1 px-2.5 py-1.5 rounded-xl"
          style={{ backgroundColor: 'rgba(0,0,0,0.18)', color: text, opacity: 0.85 }}
        >
          ⚠ {card.warning}
        </p>
      )}

      {/* References */}
      {card.references && card.references.length > 0 && (
        <div
          className="mt-1 px-3 py-2 rounded-xl"
          style={{ backgroundColor: 'rgba(0,0,0,0.12)' }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <BookOpen size={11} weight="bold" color={text === 'white' ? 'white' : '#1a1a1a'} />
            <span
              className="text-[10px] font-semibold uppercase tracking-wider opacity-70"
              style={{ color: text }}
            >
              References
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {card.references.map((ref, i) => {
              const isUrl = ref.startsWith('http://') || ref.startsWith('https://');
              return (
                <li key={i} className="text-xs leading-snug opacity-80" style={{ color: text }}>
                  {isUrl ? (
                    <a
                      href={ref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:opacity-100 transition-opacity break-all"
                      style={{ color: text }}
                      onClick={e => e.stopPropagation()}
                    >
                      {ref.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  ) : (
                    <span>{ref}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Timestamp chip */}
      {card.timestamp && (
        <div className="flex justify-end mt-auto pt-1">
          {timestampUrl ? (
            <a
              href={timestampUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs font-medium px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 hover:underline transition-opacity"
              style={{ backgroundColor: pill, color: text }}
            >
              {card.timestamp}
              <ArrowSquareOut size={10} weight="bold" />
            </a>
          ) : (
            <span
              className="text-xs font-medium px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: pill, color: text }}
            >
              {card.timestamp}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
