'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { X } from 'lucide-react';
import { EnvelopeSimple, SpinnerGap } from '@phosphor-icons/react';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  message?: string;
}

export default function AuthModal({ open, onClose, message }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSending(true);
    try {
      const result = await signIn('email', { email: trimmed, redirect: false });
      if (result?.error) {
        setError('Something went wrong. Please try again.');
      } else {
        setSent(true);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setSent(false);
    setError('');
    setSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 bg-white rounded-3xl shadow-2xl p-8">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        {sent ? (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
              <EnvelopeSimple size={32} weight="duotone" className="text-[#4A90D9]" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 mb-6">
              We sent a magic link to <strong className="text-gray-700">{email}</strong>. Click it to sign in.
            </p>
            <button
              onClick={handleClose}
              className="text-sm text-[#4A90D9] font-medium hover:underline"
            >
              Done
            </button>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-1">Sign in to Popcard</h2>
            <p className="text-sm text-gray-500 mb-6">
              {message ?? 'Enter your email and we\'ll send you a magic link.'}
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                autoFocus
                disabled={sending}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-[#4A90D9] transition-colors disabled:opacity-50"
              />

              {error && (
                <p className="mt-2 text-xs text-red-500">{error}</p>
              )}

              <button
                type="submit"
                disabled={sending}
                className="w-full mt-4 py-3 rounded-xl bg-[#4A90D9] text-white font-semibold text-sm hover:bg-[#3a7fc8] active:scale-[0.98] disabled:opacity-60 transition-all flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <SpinnerGap size={16} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send magic link'
                )}
              </button>
            </form>

            <p className="mt-4 text-xs text-gray-400 text-center">
              No password needed. We&apos;ll email you a sign-in link.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
