/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts,scss}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta corporativa Cosmos, derivada del color del logotipo (#003d53,
        // matiz 196deg). Disponible como `bg-cosmos-700`, `text-cosmos-900`, etc.
        cosmos: {
          50: '#f3f8f9',
          100: '#e3f0f4',
          200: '#c6e4ee',
          300: '#96d3e9',
          400: '#4cc1eb',
          500: '#06adea',
          600: '#0087b8',
          700: '#006387',
          800: '#004d69',
          900: '#003d53',
          950: '#002736',
        },
        // La interfaz ya usaba la familia `blue` de Tailwind en decenas de
        // sitios. Se reasigna a la rampa corporativa para que todas esas clases
        // pasen a ser de marca sin tener que tocar el marcado.
        blue: {
          50: '#f3f8f9',
          100: '#e3f0f4',
          200: '#c6e4ee',
          300: '#96d3e9',
          400: '#4cc1eb',
          500: '#06adea',
          600: '#0087b8',
          700: '#006387',
          800: '#004d69',
          900: '#003d53',
          950: '#002736',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
