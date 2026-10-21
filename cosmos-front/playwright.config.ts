import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo del panel.
 *
 * El backend no se levanta: cada prueba monta el suyo con `mockApi()`, que
 * responde a `environment.api` desde el propio proceso de Playwright. Asi el
 * flujo del maestro de formatos se puede llevar a los sitios donde falla —un
 * 500 al guardar, un borrador atrasado, una definicion invalida— sin tener que
 * dejar la base de datos en ese estado.
 *
 * La suite tiene tres capas, separadas por etiqueta para poder correrlas
 * sueltas:
 *
 *  - sin etiqueta: flujos funcionales.
 *  - `@a11y`: accesibilidad con axe (WCAG 2.1 A y AA) y navegacion por teclado.
 *  - `@visual`: regresion de pixel con el comparador nativo de Playwright.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],

  /**
   * Un solo reintento en CI, ninguno en local.
   *
   * Reintentar esconde inestabilidad, asi que el numero es deliberadamente
   * bajo: con uno, un fallo intermitente sigue apareciendo en el informe como
   * "flaky" —que es informacion— en vez de desaparecer. Subirlo a tres seria
   * dejar de enterarse.
   */
  retries: process.env['CI'] ? 1 : 0,
  /**
   * En local, la cuarta parte de los nucleos.
   *
   * El reparto por defecto es la mitad, que en un portatil de 20 nucleos son
   * diez navegadores arrancando a la vez su propia copia de la aplicacion. No
   * es la maquina la que se queda corta de nucleos, es que cada proceso pide
   * memoria y disco al mismo tiempo: las mismas pruebas que tardan 5 s con dos
   * procesos tardaban mas de 40 con diez, y se pasaban del tope de 30 s.
   *
   * Un fallo por reparto no dice nada del codigo y ademas cambia de prueba en
   * cada ejecucion, que es como una suite deja de leerse.
   */
  workers: process.env['CI'] ? 1 : '25%',
  reporter: process.env['CI']
    ? [['github'], ['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: {
    timeout: 7_000,
    // Margen para la interpolacion de fuentes, que difiere entre el portatil y
    // el runner del CI. Sin el, la suite visual esta siempre en rojo.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env['CI'] ? 'retain-on-failure' : 'off',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  /**
   * El panel se construye y se sirve como ficheros estaticos, no con
   * `ng serve`.
   *
   * El servidor de desarrollo transforma los modulos segun se los piden. La
   * primera visita a cada pantalla pagaba esa transformacion, y los diez
   * procesos de Playwright se la pedian a la vez al mismo servidor: las
   * pruebas que llegaban primero se pasaban de su tope de tiempo y la suite
   * salia en rojo en cada arranque en frio, en pruebas distintas cada vez. Un
   * fallo que cambia de sitio se deja de mirar, y con el se dejan de mirar los
   * de verdad.
   *
   * `reuseExistingServer` queda en falso a proposito, tambien en local. Con el
   * activado, la suite se cuelga de lo que haya escuchando en el puerto: un dia
   * fue otra aplicacion, y las cincuenta pruebas fallaron contra su pagina de
   * error sin que nada dijera que el panel ni se habia levantado.
   */
  webServer: {
    command:
      'node node_modules/@angular/cli/bin/ng.js build --configuration development && node e2e/support/static-server.mjs dist/cosmos-front/browser 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
