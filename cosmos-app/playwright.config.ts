import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo de la app de marcación, en el navegador.
 *
 * Como en el panel, el backend no se levanta: cada prueba simula
 * `environment.api` desde Playwright, y la app se construye y se sirve como
 * ficheros estáticos (ver `e2e/support/static-server.mjs` y la nota del panel
 * sobre por qué no `ng serve`).
 *
 * La cámara es la falsa de Chromium: da vídeo de verdad sin un dispositivo, y
 * sobre ella se puede retrasar o hacer fallar `getUserMedia` para reproducir
 * lo que pasa en el móvil. Lo que depende del hardware y del sistema (modelos
 * concretos, el permiso de Android) sigue siendo prueba en dispositivo.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 1 : '25%',
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: 'http://localhost:4310',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    permissions: ['camera'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command:
      'node node_modules/@angular/cli/bin/ng.js build --configuration development && node e2e/support/static-server.mjs dist/cosmos-app/browser 4310',
    url: 'http://localhost:4310',
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
