import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      boxShadow: {
        soft: '0 8px 30px rgba(0,0,0,0.10)',
        elev1: '0 1px 2px rgba(2,6,23,0.08), 0 4px 14px rgba(2,6,23,0.08)',
        elev2: '0 10px 30px rgba(2,6,23,0.16)',
      },
      borderRadius: {
        xl: '14px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
} satisfies Config;

