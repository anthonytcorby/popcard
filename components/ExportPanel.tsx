'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowSquareDown, CaretDown, Check, Copy } from '@phosphor-icons/react';
import { PopCard } from '@/types/card';
import { toMarkdown } from '@/lib/exporters/markdown';
import { toObsidian } from '@/lib/exporters/obsidian';

interface ExportPanelProps {
  cards: PopCard[];
  videoUrl?: string;
}

type ExportOption = 'markdown' | 'obsidian' | 'notion' | 'googledocs' | 'evernote' | 'plaintext' | 'copy';

// ─── Brand SVG icons ────────────────────────────────────────────────────────

function ObsidianIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 100 100" fill="none">
      <path d="M59.5 5.5C52 1 43 0.5 36 4L14 16C7 20 3 28 3 36.5V63.5C3 72 7 80 14 84L36 96C43 99.5 52 99 59.5 94.5L82 81C89 77 93 69 93 60.5V39.5C93 31 89 23 82 19L59.5 5.5Z" fill="#7C3AED"/>
      <path d="M42 20L28 50L42 80L65 65V35L42 20Z" fill="white" fillOpacity="0.9"/>
      <path d="M65 35L58 50L65 65" stroke="white" strokeWidth="3" strokeOpacity="0.5"/>
    </svg>
  );
}

function NotionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="14" fill="#fff"/>
      <path d="M12 14.5C12 11.5 14.5 9 17.5 9H67.5L88 29.5V85.5C88 88.5 85.5 91 82.5 91H17.5C14.5 91 12 88.5 12 85.5V14.5Z" fill="white" stroke="#E5E5E5" strokeWidth="2"/>
      <text x="28" y="64" fontFamily="Georgia, serif" fontSize="44" fontWeight="bold" fill="#1a1a1a">N</text>
    </svg>
  );
}

function EvernoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="50" fill="#00A82D"/>
      <path d="M62 24C56 22 50 28 50 28C44 22 32 22 28 32C24 42 30 52 30 52L28 70C28 74 32 76 36 74L48 68H60C68 68 72 62 72 54V38C72 30 68 26 62 24ZM48 60H38L40 50C36 46 34 40 36 34C38 28 44 26 50 30C50 30 52 34 54 36H62C64 36 66 38 66 40V54C66 58 62 60 60 60H48Z" fill="white"/>
    </svg>
  );
}

function GoogleDocsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 100 100">
      <path d="M18 6H62L82 26V94H18V6Z" fill="#4285F4"/>
      <path d="M62 6L82 26H62V6Z" fill="#2563EB"/>
      <rect x="28" y="40" width="44" height="4" rx="2" fill="white"/>
      <rect x="28" y="52" width="44" height="4" rx="2" fill="white"/>
      <rect x="28" y="64" width="32" height="4" rx="2" fill="white"/>
    </svg>
  );
}

function MarkdownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="8" fill="#1a1a2e"/>
      <text x="50" y="68" textAnchor="middle" fontFamily="monospace" fontSize="38" fontWeight="bold" fill="white">MD</text>
    </svg>
  );
}

function PlainTextIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 100 100">
      <rect x="12" y="8" width="76" height="84" rx="8" fill="#6B7280"/>
      <rect x="24" y="28" width="52" height="5" rx="2.5" fill="white"/>
      <rect x="24" y="42" width="52" height="5" rx="2.5" fill="white"/>
      <rect x="24" y="56" width="38" height="5" rx="2.5" fill="white"/>
      <rect x="24" y="70" width="46" height="5" rx="2.5" fill="white"/>
    </svg>
  );
}

// ─── Plain text exporter ─────────────────────────────────────────────────────

function toPlainText(cards: PopCard[], videoUrl?: string): string {
  const lines: string[] = [];
  if (videoUrl) lines.push(`Source: ${videoUrl}\n`);
  for (const card of cards) {
    lines.push(`[${card.type.replace(/_/g, ' ')}] ${card.headline}`);
    lines.push(card.body);
    if (card.timestamp) lines.push(`⏱ ${card.timestamp}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExportPanel({ cards, videoUrl }: ExportPanelProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<ExportOption | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = async (type: ExportOption) => {
    let content = '';
    let filename = '';
    let download = false;

    switch (type) {
      case 'markdown':
        content = toMarkdown(cards, videoUrl);
        filename = 'popcard-notes.md';
        download = true;
        break;
      case 'obsidian':
        content = toObsidian(cards, videoUrl);
        filename = 'popcard-notes.md';
        download = true;
        break;
      case 'notion':
        content = toMarkdown(cards, videoUrl); // Notion accepts markdown paste
        break;
      case 'googledocs':
        content = toPlainText(cards, videoUrl);
        break;
      case 'evernote':
        content = toPlainText(cards, videoUrl);
        break;
      case 'plaintext':
        content = toPlainText(cards, videoUrl);
        filename = 'popcard-notes.txt';
        download = true;
        break;
      case 'copy':
        content = toMarkdown(cards, videoUrl);
        break;
    }

    if (download) {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      try {
        await navigator.clipboard.writeText(content);
      } catch {
        // Fallback: create a textarea, select, and copy
        const ta = document.createElement('textarea');
        ta.value = content;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    }

    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
    setOpen(false);
  };

  const options: Array<{ type: ExportOption; label: string; icon: React.ReactNode; hint?: string }> = [
    { type: 'markdown',  label: 'Markdown',     icon: <MarkdownIcon />,    hint: 'Download .md' },
    { type: 'obsidian',  label: 'Obsidian',      icon: <ObsidianIcon />,    hint: 'Download .md' },
    { type: 'notion',     label: 'Notion',       icon: <NotionIcon />,      hint: 'Copy & paste' },
    { type: 'googledocs', label: 'Google Docs',  icon: <GoogleDocsIcon />,  hint: 'Copy & paste' },
    { type: 'evernote',  label: 'Evernote',       icon: <EvernoteIcon />,    hint: 'Copy & paste' },
    { type: 'plaintext', label: 'Plain text',     icon: <PlainTextIcon />,   hint: 'Download .txt' },
    { type: 'copy',      label: 'Copy all',        icon: <Copy size={14} />, hint: 'Clipboard' },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-white border-2 border-gray-200 text-gray-700 hover:border-gray-300 transition-all duration-150"
      >
        <ArrowSquareDown size={15} weight="bold" />
        Export
        <CaretDown size={14} weight="bold" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-20 animate-fadeIn">
          {options.map(opt => (
            <button
              key={opt.type}
              onClick={() => handleExport(opt.type)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-100 text-left"
            >
              <span className="flex-shrink-0">
                {copied === opt.type ? <Check size={14} className="text-green-500" weight="bold" /> : opt.icon}
              </span>
              <span className="flex-1 font-medium">{opt.label}</span>
              {opt.hint && (
                <span className="text-xs text-gray-400">{opt.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
