'use client';

import Image from 'next/image';
import { Play, FileText, MusicNote } from '@phosphor-icons/react';

interface VideoHeaderCardProps {
  title: string;
  thumbnailUrl: string | null;
  videoUrl: string;
}

export default function VideoHeaderCard({ title, thumbnailUrl, videoUrl }: VideoHeaderCardProps) {
  const isSpotify = videoUrl.includes('spotify.com');
  const isDocument = !videoUrl || videoUrl.startsWith('paste-') || videoUrl.startsWith('doc-');
  const hasLink = videoUrl && !isDocument;

  const Wrapper = hasLink ? 'a' : 'div';
  const wrapperProps = hasLink
    ? { href: videoUrl, target: '_blank' as const, rel: 'noopener noreferrer' }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`col-span-full flex items-center gap-4 rounded-3xl p-5 shadow-md transition-all duration-200 ${
        hasLink ? 'hover:shadow-xl hover:-translate-y-1 cursor-pointer' : ''
      }`}
      style={{ backgroundColor: '#1a1a2e' }}
    >
      {/* Thumbnail or icon */}
      <div className="relative flex-shrink-0 w-28 h-16 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center">
        {thumbnailUrl ? (
          <>
            <Image
              src={thumbnailUrl}
              alt={title}
              fill
              sizes="112px"
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                {isSpotify ? (
                  <MusicNote size={14} weight="fill" color="#1DB954" />
                ) : (
                  <Play size={14} weight="fill" color="#1a1a2e" />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileText size={28} weight="duotone" color="rgba(255,255,255,0.4)" />
          </div>
        )}
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">
          {isSpotify ? 'Spotify Episode' : isDocument ? 'Document' : 'Now summarising'}
        </p>
        <h2 className="text-sm sm:text-base font-bold text-white leading-snug line-clamp-2">
          {title}
        </h2>
      </div>
    </Wrapper>
  );
}
