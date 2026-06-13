/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        ui: ['var(--font-ui)'],
        mono: ['var(--font-mono)'],
      },
    },
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
