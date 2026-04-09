import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        coral:  '#FF6B6B',
        mint:   '#4ECDC4',
        indigo: '#6C63FF',
        amber:  '#FFD93D',
        orange: '#FF9A3C',
        popblue: '#4A90D9',
        pink:   '#FF8ED4',
      },
    },
  },
  plugins: [],
};
export default config;
