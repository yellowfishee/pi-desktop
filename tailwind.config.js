/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
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
        surface: {
          light: '#ffffff',
          dark: '#1e1e2e',
        },
        sidebar: {
          light: '#f8fafc',
          dark: '#181825',
        },
        chat: {
          light: '#ffffff',
          dark: '#1e1e2e',
        },
        input: {
          light: '#f1f5f9',
          dark: '#313244',
        },
      },
      fontFamily: {
        ui: ['var(--font-ui)'],
        mono: ['var(--font-mono)'],
      },
    },
    // 覆盖默认字号，用 CSS 变量实现全局缩放
    fontSize: {
      'xxs': ['var(--font-xs)',  { lineHeight: '1.25rem' }],
      'xs':  ['var(--font-sm)',  { lineHeight: '1.25rem' }],
      'sm':  ['var(--font-base)', { lineHeight: '1.5rem' }],
      'base':['var(--font-lg)',  { lineHeight: '1.5rem' }],
      'lg':  ['var(--font-xl)',  { lineHeight: '1.75rem' }],
      'xl':  ['1.25rem',         { lineHeight: '1.75rem' }],
      '2xl': ['1.5rem',          { lineHeight: '2rem' }],
      '3xl': ['1.875rem',        { lineHeight: '2.25rem' }],
      '4xl': ['2.25rem',         { lineHeight: '2.5rem' }],
      '5xl': ['3rem',            { lineHeight: '1' }],
    },
  },
  plugins: [],
};
