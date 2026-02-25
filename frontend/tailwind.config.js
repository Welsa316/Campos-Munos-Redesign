/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#003F8D',
          red: '#CE1D1D'
        }
      },
      fontFamily: {
        sans: ['system-ui', 'ui-sans-serif', 'Segoe UI', 'sans-serif']
      },
      boxShadow: {
        'soft-card': '0 18px 45px rgba(15, 23, 42, 0.12)'
      },
      transitionTimingFunction: {
        'soft-ease': 'cubic-bezier(0.23, 0.6, 0.25, 0.95)'
      }
    }
  },
  plugins: []
};

