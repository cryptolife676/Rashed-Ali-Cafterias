import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* App primary actions — brand blue */
        brand: {
          50:  '#eef7ff',
          100: '#d9ecff',
          500: '#2f7bff',
          600: '#1f63e0',
          700: '#1a4fb3',
          900: '#0f2a5e',
        },
        /* Rashed Ali brand — gold */
        gold: {
          100: '#fdf6e3',
          200: '#f5e4a8',
          300: '#e8c96a',
          400: '#d4a93a',
          500: '#c9a227',
          600: '#b08a1a',
          700: '#8d6d10',
          800: '#6b5009',
          900: '#3e2e04',
        },
        /* Brand black */
        ink: {
          DEFAULT: '#0c0b09',
          soft:    '#1a1814',
          card:    '#211f1b',
        },
      },
      fontFamily: {
        sans:    ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
