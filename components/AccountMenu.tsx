'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { User, SignOut, CreditCard, CaretDown } from '@phosphor-icons/react';

const FREE_LIMIT = 3;

export default function AccountMenu({ onSignIn }: { onSignIn: () => void }) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (status === 'loading') {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
    );
  }

  if (!session) {
    return (
      <button
        onClick={onSignIn}
        className="text-sm font-medium text-gray-600 hover:text-[#4A90D9] transition-colors"
      >
        Sign in
      </button>
    );
  }

  const { extractionCount, subscriptionStatus } = session.user;
  const isSubscribed = subscriptionStatus === 'active' || subscriptionStatus === 'past_due';
  const remaining = Math.max(0, FREE_LIMIT - extractionCount);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#4A90D9] transition-colors"
      >
        <User size={18} weight="bold" />
        <CaretDown size={12} weight="bold" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-400">Signed in as</p>
            <p className="text-sm font-medium text-gray-700 truncate">{session.user.email}</p>
          </div>

          <div className="px-4 py-3 border-b border-gray-100">
            {isSubscribed ? (
              <p className="text-xs font-medium text-green-600">Pro plan active</p>
            ) : (
              <p className="text-xs font-medium text-gray-500">
                {remaining} of {FREE_LIMIT} free extraction{remaining !== 1 ? 's' : ''} remaining
              </p>
            )}
          </div>

          {isSubscribed && (
            <button
              onClick={async () => {
                setOpen(false);
                const res = await fetch('/api/stripe/portal', { method: 'POST' });
                const data = await res.json();
                if (data.url) {
                  window.location.href = data.url;
                } else {
                  console.error('Portal error:', data.error);
                }
              }}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <CreditCard size={16} />
              Manage subscription
            </button>
          )}

          <button
            onClick={() => { setOpen(false); signOut(); }}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <SignOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
