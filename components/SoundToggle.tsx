'use client';

import { Volume2, VolumeX } from 'lucide-react';

interface SoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export default function SoundToggle({ enabled, onToggle }: SoundToggleProps) {
  return (
    <button
      onClick={onToggle}
      title={enabled ? 'Mute sounds' : 'Enable sounds'}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium
        border-2 transition-all duration-150
        ${enabled
          ? 'bg-[#4ECDC4] border-[#4ECDC4] text-white shadow-md'
          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
        }
      `}
    >
      {enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
      <span className="hidden sm:inline">{enabled ? 'Sound on' : 'Sound off'}</span>
    </button>
  );
}
