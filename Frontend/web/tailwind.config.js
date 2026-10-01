// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f2f6f4',   // page background tint
          100: '#d4e9e2',
          200: '#a9d3c5',
          300: '#7ebca8',
          400: '#53a58b',
          500: '#1a7a5e',   // HERO_GREEN — main brand color
          600: '#166851',
          700: '#14604a',   // HERO_DARK — hover / deep accent
          800: '#0e4535',
          900: '#082b21',
        },
      },
    },
  },
  plugins: [],
};