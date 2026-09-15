/** @type {import('tailwindcss').Config} */
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: withAlpha('--c-bg'),
        'bg-soft': withAlpha('--c-bg-soft'),
        surface: withAlpha('--c-surface'),
        'surface-2': withAlpha('--c-surface-2'),
        'surface-3': withAlpha('--c-surface-3'),
        line: withAlpha('--c-border'),
        'line-strong': withAlpha('--c-border-strong'),
        ink: withAlpha('--c-text'),
        'ink-soft': withAlpha('--c-text-soft'),
        muted: withAlpha('--c-muted'),
        brand: {
          DEFAULT: withAlpha('--c-brand'),
          soft: withAlpha('--c-brand-soft'),
          ink: withAlpha('--c-brand-ink'),
        },
        warn: withAlpha('--c-warn'),
        danger: withAlpha('--c-danger'),
        info: withAlpha('--c-info'),
        violet: withAlpha('--c-violet'),
        // Rangli plastinka ustidagi matn uchun to'q variantlar
        'warn-ink': withAlpha('--c-warn-ink'),
        'danger-ink': withAlpha('--c-danger-ink'),
        'info-ink': withAlpha('--c-info-ink'),
        'violet-ink': withAlpha('--c-violet-ink'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)',
        pop: '0 8px 40px -12px rgb(0 0 0 / 0.35)',
        glow: '0 0 0 1px rgb(var(--c-brand) / 0.35), 0 8px 30px -10px rgb(var(--c-brand) / 0.35)',
      },
      backgroundImage: {
        'aurora':
          'radial-gradient(60% 80% at 10% 0%, rgb(var(--c-brand) / 0.16) 0%, transparent 60%), radial-gradient(50% 70% at 90% 10%, rgb(var(--c-violet) / 0.14) 0%, transparent 60%)',
        'brand-grad': 'linear-gradient(135deg, rgb(var(--c-brand)) 0%, rgb(var(--c-brand-2)) 100%)',
        'sheen': 'linear-gradient(180deg, rgb(255 255 255 / 0.06) 0%, transparent 40%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.25)', opacity: '0' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
