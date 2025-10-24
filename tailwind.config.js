/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        glass: 'rgba(255,255,255,0.25)'
      },
      backdropBlur: {
        xl: '30px'
      },
      boxShadow: {
        glass: '0 10px 30px rgba(15, 23, 42, 0.25)'
      }
    }
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/line-clamp')]
};
