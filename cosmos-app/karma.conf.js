/**
 * Configuracion de Karma de la aplicacion movil.
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
      // Medido el 09/09/2026 con 74 casos: 25.1 / 5.0 / 19.9 / 24.9.
      //
      // Es, con diferencia, la parte mas floja de los tres proyectos: un 4% de
      // ramas significa que las suites existentes recorren el camino feliz y
      // poco mas. El umbral se fija en la medida para que no baje, y subirlo es
      // el trabajo pendiente que QA_PLAN.md marca como prioritario.
      //
      // Objetivo declarado del proyecto: 85 / 75 / 85 / 85.
      check: {
        global: {
          statements: 24,
          branches: 4,
          functions: 19,
          lines: 24,
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
