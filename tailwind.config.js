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
        // 语义色 — 命名即用途
        app: {
          bg:      'var(--app-bg)',
          sidebar: 'var(--sidebar-bg)',
          surface: 'var(--surface-bg)',
          raised:  'var(--raised-bg)',
        },
        edge: {
          DEFAULT: 'var(--border-color)',
          hover:   'var(--border-hover)',
        },
        fg: {
          DEFAULT: 'var(--fg-color)',
          muted:   'var(--fg-muted)',
          subtle:  'var(--fg-subtle)',
        },
      },
      fontFamily: {
        ui: ['var(--font-ui)'],
        mono: ['var(--font-mono)'],
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.625rem',
        xl: '0.75rem',
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
  safelist: [
    // 设计系统工具类 — 样式文件中 @apply 使用，确保 JIT 生成
    { pattern: /^(bg|text|border)-app-(bg|sidebar|surface|raised)$/ },
    { pattern: /^(bg|text|border)-fg(-muted|-subtle)?$/ },
    { pattern: /^border-edge(-hover)?$/ },
  ],
};
