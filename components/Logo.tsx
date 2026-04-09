'use client';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
}

const LETTER_COLORS = [
  '#FF6B6B', // P - coral
  '#4ECDC4', // o - mint
  '#6C63FF', // p - indigo
  '#FFD93D', // c - amber
  '#FF9A3C', // a - orange
  '#4A90D9', // r - blue
  '#FF8ED4', // d - pink
];

const LETTERS = ['P', 'o', 'p', 'c', 'a', 'r', 'd'];

const SIZE_CLASSES = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
  hero: 'text-4xl sm:text-5xl lg:text-6xl',
};

export default function Logo({ size = 'md', className = '' }: LogoProps) {
  return (
    <span
      className={`font-extrabold tracking-tight select-none ${SIZE_CLASSES[size]} ${className}`}
      style={{ fontFamily: 'Poppins, sans-serif' }}
    >
      {LETTERS.map((letter, i) => (
        <span key={i} style={{ color: LETTER_COLORS[i] }}>
          {letter}
        </span>
      ))}
      {size === 'hero' && <span style={{ color: LETTER_COLORS[6] }}>.</span>}
    </span>
  );
}
