'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Lightning, Check, SpinnerGap } from '@phosphor-icons/react';

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
}

const PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '£3.99',
    period: '/month',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY,
    badge: null,
    afterTrial: 'then £3.99/mo',
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: '£39.99',
    period: '/year',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY,
    badge: 'Save 16%',
    afterTrial: 'then £39.99/yr',
  },
];

const FEATURES = [
  'Unlimited extractions',
  'YouTube, PDFs & pasted text',
  'TikTok carousel export',
  'Shareable deck links',
  'Priority support',
];

export default function PaywallModal({ open, onClose }: PaywallModalProps) {
  const [loading, setLoading] = useState<string | null>(null);

  if (!open) return null;

  const handleCheckout = async (priceId: string | undefined, planId: string) => {
    if (!priceId) return;
    setLoading(planId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const { url, error } = await res.json();
      if (url) {
        window.location.href = url;
      } else {
        console.error('Checkout error:', error);
        setLoading(null);
      }
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-3xl shadow-2xl p-8">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#4A90D9] to-[#6C63FF] flex items-center justify-center">
            <Lightning size={28} weight="fill" className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Start your free trial</h2>
          <p className="text-sm text-gray-500">
            You&apos;ve used all 3 free extractions. Try Popcard Pro free for 7 days — cancel anytime.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              onClick={() => handleCheckout(plan.priceId, plan.id)}
              disabled={loading !== null}
              className={`
                relative rounded-2xl border-2 p-5 text-left transition-all
                ${plan.id === 'yearly'
                  ? 'border-[#4A90D9] bg-blue-50/50'
                  : 'border-gray-200 hover:border-gray-300'
                }
                disabled:opacity-60
              `}
            >
              {plan.badge && (
                <span className="absolute -top-2.5 right-3 bg-[#4A90D9] text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {plan.badge}
                </span>
              )}
              <p className="text-sm font-semibold text-gray-700 mb-1">{plan.name}</p>
              <p className="text-2xl font-bold text-gray-900">
                7 days free
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{plan.afterTrial}</p>
              {loading === plan.id && (
                <SpinnerGap size={20} className="animate-spin text-[#4A90D9] mt-2" />
              )}
            </button>
          ))}
        </div>

        {/* Features */}
        <ul className="space-y-2 mb-6">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
              <Check size={16} weight="bold" className="text-green-500 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        <p className="text-xs text-gray-400 text-center">
          No charge for 7 days. Cancel anytime. Payments secured by Stripe.
        </p>
      </div>
    </div>
  );
}
