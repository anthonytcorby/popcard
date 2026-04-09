'use client';

import { forwardRef } from 'react';
import { CardType } from '@/types/card';

/* ─── Constants ──────────────────────────────────────────── */
const FONT = "'Poppins', 'Helvetica Neue', Arial, sans-serif";

/* ─── Popcard logo ───────────────────────────────────────── */
const LOGO_COLORS = ['#FF6B6B', '#4ECDC4', '#6C63FF', '#FFD93D', '#FF9A3C', '#4A90D9', '#FF8ED4'];
const LOGO_LETTERS = ['P', 'o', 'p', 'c', 'a', 'r', 'd'];

function PopcardLogo({ size = 12 }: { size?: number }) {
  return (
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.03em', fontFamily: FONT }}>
      {LOGO_LETTERS.map((l, i) => (
        <span key={i} style={{ color: LOGO_COLORS[i] }}>{l}</span>
      ))}
    </span>
  );
}

/* ─── Editorial type labels ──────────────────────────────── */
const EDITORIAL_LABELS: Record<string, string> = {
  KEY_INSIGHT: 'KEY TAKEAWAY',
  ACTIONABLE_TIP: 'ACTION STEP',
  STAT_OR_DATA: 'THE DATA',
  QUOTE: 'DIRECT QUOTE',
  WATCH_OUT: 'WATCH OUT',
  TOOL_MENTIONED: 'TOOL',
  RESOURCE_LINK: 'RESOURCE',
  KEY_THEME: 'BIG PICTURE',
};

/* ─── Parse *emphasis* markers in headlines ───────────────── */
function EmphasisHeadline({ text, textColor, fontSize }: {
  text: string;
  textColor: string;
  fontSize: number;
}) {
  // Split on *word* patterns — render those as uppercase bold
  const parts = text.split(/\*([^*]+)\*/g);
  return (
    <span style={{ fontSize, fontWeight: 600, color: textColor, lineHeight: 1.2, letterSpacing: '-0.02em', fontFamily: FONT }}>
      {parts.map((part, i) => {
        // Odd indices are the captured groups (inside *)
        if (i % 2 === 1) {
          return (
            <span key={i} style={{ fontWeight: 900, textTransform: 'uppercase' as const }}>
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/* ─── Auto-bold numbers in body text ─────────────────────── */
function BodyText({ text, boldPhrase, textColor }: {
  text: string;
  boldPhrase?: string;
  textColor: string;
}) {
  let segments: Array<{ text: string; bold: boolean }> = [{ text, bold: false }];

  if (boldPhrase && text.includes(boldPhrase)) {
    segments = [];
    const parts = text.split(boldPhrase);
    parts.forEach((part, i) => {
      if (part) segments.push({ text: part, bold: false });
      if (i < parts.length - 1) segments.push({ text: boldPhrase, bold: true });
    });
  }

  // Auto-bold numbers/percentages
  const finalSegments: Array<{ text: string; bold: boolean }> = [];
  for (const seg of segments) {
    if (seg.bold) { finalSegments.push(seg); continue; }
    const parts = seg.text.split(/(\$?[\d,]+\.?\d*[%xXkKmMbB]?)/g);
    for (const part of parts) {
      if (!part) continue;
      finalSegments.push({ text: part, bold: /^\$?[\d,]+\.?\d*[%xXkKmMbB]/.test(part) });
    }
  }

  return (
    <span style={{ fontSize: 10, color: textColor, lineHeight: 1.6, fontWeight: 400, fontFamily: FONT, opacity: 0.85 }}>
      {finalSegments.map((seg, i) => (
        <span key={i} style={seg.bold ? { fontWeight: 700, opacity: 1 } : undefined}>{seg.text}</span>
      ))}
    </span>
  );
}

/* ─── Rotating slide colors (no repeats until all used) ──── */
const SLIDE_PALETTE = [
  { bg: '#6C63FF', text: 'white' },   // indigo
  { bg: '#4ECDC4', text: 'white' },   // mint
  { bg: '#FF6B6B', text: 'white' },   // coral
  { bg: '#FFD93D', text: '#1a1a1a' }, // amber
  { bg: '#FF9A3C', text: 'white' },   // orange
  { bg: '#4A90D9', text: 'white' },   // blue
  { bg: '#FF8ED4', text: 'white' },   // pink
  { bg: '#34D399', text: 'white' },   // emerald
  { bg: '#A78BFA', text: 'white' },   // purple
  { bg: '#F472B6', text: 'white' },   // rose
];

export function getSlideColor(index: number) {
  return SLIDE_PALETTE[index % SLIDE_PALETTE.length];
}

/* ─── Types ──────────────────────────────────────────────── */
export interface SlideData {
  id: string;
  variant: 'hook' | 'content' | 'cta';
  cardType?: CardType;
  headline?: string;
  body?: string;
  boldPhrase?: string;
  timestamp?: string;
  hookLine?: string;
  videoTitle?: string;
  channelName?: string;
  thumbnailDataUrl?: string;
  /** Index into SLIDE_PALETTE for this slide's color */
  colorIndex?: number;
  slideNumber: number;
  totalSlides: number;
}

/* ─── Dimensions ─────────────────────────────────────────── */
export const SLIDE_W = 270;
export const SLIDE_H = 480;
const IMG_H = 136; // 16:9 at full width
const PAD = 14;

/* ─── Component ──────────────────────────────────────────── */
const TikTokSlide = forwardRef<HTMLDivElement, { slide: SlideData }>(
  ({ slide }, ref) => {
    // Get rotating color for this slide (not tied to card type)
    const palette = slide.colorIndex != null ? getSlideColor(slide.colorIndex) : { bg: '#1a1a2e', text: 'white' };
    const bgColor = palette.bg;
    const textColor = palette.text;
    const isQuote = slide.cardType === 'QUOTE';
    const editorialLabel = slide.cardType ? EDITORIAL_LABELS[slide.cardType] ?? '' : '';

    // Hook slide uses dark bg
    const hookBg = '#1a1a2e';

    const resolvedBg = slide.variant === 'hook' ? hookBg
      : slide.variant === 'cta' ? '#1a1a2e'
      : bgColor;

    return (
      <div
        ref={ref}
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 10,
          fontFamily: FONT,
          color: slide.variant === 'content' ? textColor : 'white',
        }}
      >
        {/* Solid background layer — rendered as a real element so html-to-image always captures it */}
        <div aria-hidden="true" style={{
          position: 'absolute',
          top: 0, left: 0, width: SLIDE_W, height: SLIDE_H,
          backgroundColor: resolvedBg,
        }} />
        {/* Content wrapper — sits above the background layer */}
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* ═══ HOOK SLIDE ════════════════════════════════════ */}
        {slide.variant === 'hook' && (
          <>
            {/* Top bar: channel LEFT, Popcard RIGHT */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px 6px',
            }}>
              <span style={{
                fontSize: 7, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)',
                maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {slide.channelName || ''}
              </span>
              <PopcardLogo size={11} />
            </div>

            {/* 16:9 Screenshot — full quality */}
            <div style={{
              width: SLIDE_W - PAD * 2, height: IMG_H,
              margin: `6px ${PAD}px 0`, borderRadius: 6,
              overflow: 'hidden', position: 'relative', background: '#111',
            }}>
              {slide.thumbnailDataUrl ? (
                <img src={slide.thumbnailDataUrl} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: '#222' }} />
              )}
            </div>

            {/* Video title */}
            <div style={{
              padding: `10px ${PAD}px 0`,
              fontSize: 8, fontWeight: 500, color: 'rgba(255,255,255,0.45)',
              lineHeight: 1.3,
            }}>
              {slide.videoTitle && slide.videoTitle.length > 65
                ? slide.videoTitle.slice(0, 65) + '...'
                : slide.videoTitle}
            </div>

            {/* HOOK HEADLINE with *emphasis* */}
            <div style={{ padding: `8px ${PAD}px 0`, textAlign: 'left' }}>
              <EmphasisHeadline
                text={slide.hookLine || slide.videoTitle || ''}
                textColor="white"
                fontSize={18}
              />
            </div>

            {/* Key takeaways context */}
            {slide.channelName && (
              <div style={{
                padding: `10px ${PAD}px 0`,
                fontSize: 8, fontWeight: 500, color: 'rgba(255,255,255,0.4)',
                fontStyle: 'italic',
                lineHeight: 1.4,
              }}>
                Key takeaways from {slide.channelName}&apos;s{slide.videoTitle ? ` "${slide.videoTitle.length > 50 ? slide.videoTitle.slice(0, 50) + '...' : slide.videoTitle}"` : ' latest episode'}
              </div>
            )}

            {/* Bottom bar */}
            <div style={{
              position: 'absolute', bottom: 12, left: PAD, right: PAD,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                Swipe for takeaways &rarr;
              </span>
              <span style={{ fontSize: 7, fontWeight: 500, color: 'rgba(255,255,255,0.2)' }}>
                {slide.slideNumber}/{slide.totalSlides}
              </span>
            </div>
          </>
        )}

        {/* ═══ CONTENT SLIDE ═════════════════════════════════ */}
        {slide.variant === 'content' && (
          <>
            {/* Top bar: channel LEFT, Popcard RIGHT */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px 6px',
            }}>
              <span style={{
                fontSize: 7, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: textColor, opacity: 0.5,
                maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {slide.channelName || ''}
              </span>
              <PopcardLogo size={10} />
            </div>

            {/* 16:9 Screenshot with timestamp */}
            <div style={{
              width: SLIDE_W - PAD * 2, height: IMG_H,
              margin: `4px ${PAD}px 0`, borderRadius: 6,
              overflow: 'hidden', position: 'relative', background: '#111',
            }}>
              {slide.thumbnailDataUrl ? (
                <img src={slide.thumbnailDataUrl} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: '#222' }} />
              )}
              {slide.timestamp && (
                <div style={{
                  position: 'absolute', bottom: 5, right: 5,
                  background: 'rgba(0,0,0,0.75)', borderRadius: 4,
                  padding: '2px 6px', fontSize: 7, fontWeight: 700, color: '#fff',
                }}>
                  {slide.timestamp}
                </div>
              )}
            </div>

            {/* Editorial type label */}
            <div style={{
              padding: `10px ${PAD}px 0`,
              fontSize: 7, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.14em', color: textColor, opacity: 0.6,
            }}>
              {editorialLabel}
            </div>

            {/* HEADLINE with *emphasis* */}
            <div style={{ padding: `5px ${PAD}px 0`, textAlign: 'left' }}>
              <EmphasisHeadline
                text={slide.headline || ''}
                textColor={textColor}
                fontSize={slide.headline && slide.headline.length > 40 ? 13 : 15}
              />
            </div>

            {/* BODY */}
            {slide.body && (
              <div style={{ padding: `8px ${PAD}px 0`, textAlign: 'left' }}>
                {isQuote ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{
                      width: 2.5, minHeight: 16, borderRadius: 3,
                      backgroundColor: textColor, opacity: 0.4,
                      flexShrink: 0, marginTop: 2,
                    }} />
                    <p style={{
                      fontSize: 10, fontStyle: 'italic', color: textColor,
                      lineHeight: 1.6, margin: 0, fontFamily: FONT, opacity: 0.85,
                    }}>
                      &ldquo;{slide.body.replace(/^[""\u201C]+|[""\u201D]+$/g, '')}&rdquo;
                    </p>
                  </div>
                ) : (
                  <p style={{ margin: 0 }}>
                    <BodyText text={slide.body} boldPhrase={slide.boldPhrase} textColor={textColor} />
                  </p>
                )}
              </div>
            )}

            {/* Slide counter */}
            <div style={{
              position: 'absolute', bottom: 10, right: PAD,
              fontSize: 7, fontWeight: 500, color: textColor, opacity: 0.25,
            }}>
              {slide.slideNumber}/{slide.totalSlides}
            </div>
          </>
        )}

        {/* ═══ CTA / PROMO SLIDE ═════════════════════════════ */}
        {slide.variant === 'cta' && (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', padding: `0 ${PAD + 10}px`,
          }}>
            <PopcardLogo size={30} />

            <p style={{
              fontSize: 14, fontWeight: 700, color: 'white',
              lineHeight: 1.3, marginTop: 16, marginBottom: 4, fontFamily: FONT,
            }}>
              Turn any video into<br />knowledge cards.
            </p>

            <p style={{
              fontSize: 9, color: 'rgba(255,255,255,0.5)',
              lineHeight: 1.5, marginBottom: 20, maxWidth: '85%', fontFamily: FONT,
            }}>
              AI-powered summaries from YouTube, Spotify &amp; books. Free to use.
            </p>

            <div style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '9px 24px', borderRadius: 30,
              backgroundColor: 'white', color: '#1a1a2e',
              fontSize: 11, fontWeight: 800, fontFamily: FONT,
            }}>
              Try it free &rarr;
            </div>

            <p style={{
              fontSize: 12, fontWeight: 700, color: 'white',
              marginTop: 16, fontFamily: FONT, letterSpacing: '0.01em',
            }}>
              www.popcard.me
            </p>

            <span style={{
              position: 'absolute', bottom: 10, right: PAD,
              fontSize: 7, fontWeight: 500, color: 'rgba(255,255,255,0.2)',
            }}>
              {slide.slideNumber}/{slide.totalSlides}
            </span>
          </div>
        )}
        </div>{/* end content wrapper */}
      </div>
    );
  }
);

TikTokSlide.displayName = 'TikTokSlide';
export default TikTokSlide;
