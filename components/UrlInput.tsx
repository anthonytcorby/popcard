'use client';

import { useState, useRef, useCallback } from 'react';
import { Link2, Sparkles, X, Upload, FileText } from 'lucide-react';

export type SourceMode = 'link' | 'upload' | 'paste';

export interface SubmitPayload {
  mode: SourceMode;
  /** YouTube URL */
  url?: string;
  /** Uploaded file */
  file?: File;
  /** Pasted raw text */
  text?: string;
}

interface UrlInputProps {
  onSubmit: (payload: SubmitPayload) => void;
  loading?: boolean;
}

function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/.test(trimmed);
}

const TABS: { id: SourceMode; label: string; icon: typeof Link2 }[] = [
  { id: 'link', label: 'Link', icon: Link2 },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'paste', label: 'Paste', icon: FileText },
];

const ACCEPTED_FILES = '.pdf,.txt,.md';

export default function UrlInput({ onSubmit, loading = false }: UrlInputProps) {
  const [mode, setMode] = useState<SourceMode>('link');
  const [urlValue, setUrlValue] = useState('');
  const [pasteValue, setPasteValue] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    setError('');

    if (mode === 'link') {
      if (!urlValue.trim()) {
        setError('Paste a YouTube link to get started!');
        return;
      }
      if (!isValidUrl(urlValue)) {
        setError("That doesn't look like a valid YouTube link.");
        return;
      }
      onSubmit({ mode: 'link', url: urlValue.trim() });
    } else if (mode === 'upload') {
      if (!file) {
        setError('Select a PDF or TXT file to upload.');
        return;
      }
      onSubmit({ mode: 'upload', file });
    } else if (mode === 'paste') {
      if (!pasteValue.trim() || pasteValue.trim().length < 100) {
        setError('Paste at least 100 characters of text.');
        return;
      }
      onSubmit({ mode: 'paste', text: pasteValue.trim() });
    }
  }, [mode, urlValue, pasteValue, file, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClear = () => {
    setUrlValue('');
    setPasteValue('');
    setFile(null);
    setError('');
    inputRef.current?.focus();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setError('');
      setMode('upload');
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Source tabs */}
      <div className="flex justify-center gap-1 mb-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setMode(tab.id); setError(''); }}
            disabled={loading}
            className={`
              flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
              ${mode === tab.id
                ? 'bg-[#4A90D9] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }
              disabled:opacity-50
            `}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Link mode ──────────────────────────────── */}
      {mode === 'link' && (
        <div
          className={`
            flex items-center gap-3 bg-white rounded-full px-5 py-3
            shadow-lg border-2 transition-all duration-200
            ${error ? 'border-red-400 shadow-red-100' : 'border-gray-200 hover:border-blue-300 focus-within:border-blue-400 focus-within:shadow-blue-100'}
          `}
        >
          {/* Source icon */}
          <Link2 className="text-gray-400 shrink-0" size={20} />

          <input
            ref={inputRef}
            type="url"
            value={urlValue}
            onChange={(e) => { setUrlValue(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="Paste a YouTube link..."
            disabled={loading}
            className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 text-base outline-none min-w-0 disabled:opacity-50"
          />

          {urlValue && !loading && (
            <button onClick={handleClear} className="text-gray-300 hover:text-gray-500 transition-colors shrink-0">
              <X size={16} />
            </button>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            aria-label="Submit"
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm bg-[#4A90D9] text-white hover:bg-[#3a7fc8] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Popping...
              </span>
            ) : (
              <>
                <Sparkles size={15} />
                Pop it
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Upload mode ────────────────────────────── */}
      {mode === 'upload' && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className={`
            bg-white rounded-3xl px-6 py-8 shadow-lg border-2 border-dashed transition-all duration-200
            ${error ? 'border-red-400' : 'border-gray-200 hover:border-blue-300'}
          `}
        >
          <div className="flex flex-col items-center gap-3">
            {file ? (
              <>
                <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-5 py-3 w-full max-w-sm">
                  <FileText size={20} className="text-[#4A90D9] shrink-0" />
                  <span className="text-sm font-medium text-gray-700 truncate flex-1">{file.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                  {!loading && (
                    <button onClick={() => { setFile(null); setError(''); }} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm bg-[#4A90D9] text-white hover:bg-[#3a7fc8] active:scale-95 disabled:opacity-60 transition-all"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Pop it
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <Upload size={28} className="text-gray-300" />
                <p className="text-sm text-gray-500">
                  Drag & drop a file, or{' '}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-[#4A90D9] font-semibold hover:underline"
                  >
                    browse
                  </button>
                </p>
                <p className="text-xs text-gray-400">PDF, TXT (max 25 MB)</p>
              </>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_FILES}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setFile(f); setError(''); }
            }}
          />
        </div>
      )}

      {/* ── Paste mode ─────────────────────────────── */}
      {mode === 'paste' && (
        <div
          className={`
            bg-white rounded-3xl px-5 py-4 shadow-lg border-2 transition-all duration-200
            ${error ? 'border-red-400' : 'border-gray-200 focus-within:border-blue-400'}
          `}
        >
          <textarea
            value={pasteValue}
            onChange={(e) => { setPasteValue(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="Paste article text, transcript, notes, or any content..."
            disabled={loading}
            rows={5}
            className="w-full bg-transparent text-gray-800 placeholder-gray-400 text-sm outline-none resize-none disabled:opacity-50 leading-relaxed"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">
              {pasteValue.length.toLocaleString()} chars
            </span>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-full font-semibold text-sm bg-[#4A90D9] text-white hover:bg-[#3a7fc8] active:scale-95 disabled:opacity-60 transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Popping...
                </span>
              ) : (
                <>
                  <Sparkles size={15} />
                  Pop it
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Inline error */}
      {error && (
        <p className="mt-2 text-sm text-red-500 text-center animate-fadeIn">
          {error}
        </p>
      )}

      {/* Source hints */}
      {mode === 'link' && !error && (
        <div className="flex items-center justify-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" style={{ color: '#FF0000' }}>
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
              <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white" />
            </svg>
            YouTube
          </span>
        </div>
      )}
    </div>
  );
}
