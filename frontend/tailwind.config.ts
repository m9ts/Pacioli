import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta "papel e café": tons pastéis de marrom claro usados em
        // toda a interface (a variável mantém o nome navy por compatibilidade).
        navy: {
          50: '#faf7f2',
          100: '#f4ecdf',
          200: '#e8d8c3',
          300: '#d6bd9c',
          400: '#c09c72',
          500: '#a87c53',
          600: '#8a6240',
          700: '#6f4e33',
          800: '#573d29',
          900: '#452f1f',
          950: '#332318',
        },
        // Caramelo suave para destaques, botões secundários e acentos.
        gold: {
          50: '#fdf8ef',
          100: '#f9edd6',
          200: '#f2d9ad',
          300: '#e8bf7d',
          400: '#dca754',
          500: '#c98f3d',
          600: '#a97433',
          700: '#85582b',
          800: '#6a4726',
          900: '#573b23',
        },
      },
      fontFamily: {
        display: ['var(--font-baloo)', 'var(--font-nunito)', 'cursive'],
        body: ['var(--font-nunito)', 'sans-serif'],
      },
      fontSize: {
        h1: ['2rem', { lineHeight: '2.5rem' }],
        h2: ['1.5rem', { lineHeight: '2rem' }],
        'body-sm': ['0.875rem', { lineHeight: '1.35rem' }],
        body: ['1rem', { lineHeight: '1.55rem' }],
        'body-lg': ['1.125rem', { lineHeight: '1.75rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(69, 47, 31, 0.06), 0 4px 16px rgba(69, 47, 31, 0.08)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'draw-in': {
          from: { 'stroke-dashoffset': '1200' },
          to: { 'stroke-dashoffset': '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s ease-out both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'draw-in': 'draw-in 2.2s ease-out 0.15s both',
      },
    },
  },
  plugins: [],
};

export default config;
