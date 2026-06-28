/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef7ee',
          100: '#fdedd3',
          200: '#f9d7a5',
          300: '#f5ba6d',
          400: '#f09333',
          500: '#ed7a0e',
          600: '#de6009',
          700: '#b8480a',
          800: '#923910',
          900: '#763110',
        },
      },
    },
  },
  plugins: [],
};
