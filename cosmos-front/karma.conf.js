/**
 * Configuracion de Karma del panel.
 *
 * El proyecto no tenia fichero propio: el builder de Angular generaba uno al
 * vuelo, y sin fichero no habia donde declarar umbrales de cobertura. Sin
 * umbrales, `--code-coverage` produce un informe que nadie mira y que nada
 * bloquea.
 *
 * Politica de los umbrales (ver QA_PLAN.md): son un trinquete. Se fijan en el
 * valor real medido, redondeado un punto hacia abajo, y solo suben. Poner el
 * objetivo en vez de la medida deja el CI en rojo permanente, y un CI que lleva
 * meses en rojo no lo mira nadie.
 */
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
    ],
    client: {
      jasmine: {
        // Orden aleatorio: un test que solo pasa porque otro corrio antes es
        // un test que no prueba lo que dice, y en serie eso no se nota nunca.
        random: true,
      },
      clearContext: false,
    },
    jasmineHtmlReporter: { suppressAll: true },

    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'lcovonly' },
        { type: 'json-summary' },
      ],
      // Medido el 09/09/2026 con 320 casos: 60.4 / 42.8 / 61.5 / 60.1.
      // Objetivo declarado del proyecto: 85 / 75 / 85 / 85.
      check: {
        global: {
          statements: 59,
          branches: 41,
          functions: 60,
          lines: 59,
        },
      },
    },

    reporters: ['progress', 'kjhtml'],
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        // El runner del CI corre como root dentro de un contenedor y Chrome se
        // niega a arrancar con el sandbox activo en ese entorno.
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
    restartOnFileChange: true,
  });
};
