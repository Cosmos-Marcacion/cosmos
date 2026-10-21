import { expect, test, type Page } from '@playwright/test';

/**
 * Hallazgos de la app en `Cosmos_CheckIn_Hallazgos.pdf`.
 *
 * - CKI16: la búsqueda por documento solo arrancaba con 8 dígitos exactos, sin
 *   botón ni estados, y un documento inexistente no decía nada.
 * - CKI17: si se salía de la cámara antes de que encendiera, el stream quedaba
 *   huérfano y la siguiente vez daba `NotReadableError`, que la app mostraba
 *   como "sin permiso".
 */

const API = 'http://localhost:3024/api/v1';

/** El backend simulado: la búsqueda por documento y lo demás vacío. */
async function mockApi(page: Page, buscar: (dni: string) => { status: number; body: unknown }) {
  const pedidos: string[] = [];
  await page.route(`${API}/**`, async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/employee\/search\/(\d+)$/);
    const headers = { 'access-control-allow-origin': '*' };
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': '*' } });
    }
    if (match) {
      pedidos.push(match[1]);
      const { status, body } = buscar(match[1]);
      return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body: '[]' });
  });
  return pedidos;
}

test.describe('buscar por documento (CKI16)', () => {
  test('el botón Buscar solo se activa con 8 a 12 dígitos y descarta letras', async ({ page }) => {
    await mockApi(page, () => ({ status: 404, body: { message: 'No encontrado' } }));
    await page.goto('/#/dni');
    const input = page.locator('#dni-input');
    const buscar = page.getByRole('button', { name: 'Buscar' });
    await expect(input).toBeVisible({ timeout: 30_000 });

    await expect(input).toHaveAttribute('inputmode', 'numeric');
    await input.fill('1234567');
    await expect(buscar).toBeDisabled();

    await input.fill('12ab34cd5678');
    await expect(input).toHaveValue('12345678');
    await expect(buscar).toBeEnabled();

    // Carné de extranjería: hasta 12 dígitos, ninguno más.
    await input.fill('1234567890123');
    await expect(input).toHaveValue('123456789012');
    await expect(buscar).toBeEnabled();
  });

  test('un documento inexistente lo dice, con Enter y sin salir de la pantalla', async ({ page }) => {
    const pedidos = await mockApi(page, () => ({ status: 404, body: { message: 'No encontrado' } }));
    await page.goto('/#/dni');
    const input = page.locator('#dni-input');
    await expect(input).toBeVisible({ timeout: 30_000 });

    await input.fill('44556677');
    await input.press('Enter');

    await expect(page.locator('#dni-status')).toContainText('No encontramos a nadie con el documento 44556677');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(pedidos).toEqual(['44556677']);
    await expect(page).toHaveURL(/\/dni$/);

    // Al corregir, el aviso desaparece.
    await input.fill('4455667');
    await expect(page.locator('#dni-status')).not.toContainText('No encontramos');
  });

  test('un fallo de red se distingue de "no existe" y se puede reintentar', async ({ page }) => {
    let intentos = 0;
    await mockApi(page, () => (++intentos === 1 ? { status: 500, body: {} } : { status: 404, body: {} }));
    await page.goto('/#/dni');
    const input = page.locator('#dni-input');
    await expect(input).toBeVisible({ timeout: 30_000 });

    await input.fill('70000001');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.locator('#dni-status')).toContainText('No se pudo consultar el documento');

    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.locator('#dni-status')).toContainText('No encontramos a nadie');
    expect(intentos).toBe(2);
  });

  test('un documento registrado abre su validación', async ({ page }) => {
    await mockApi(page, (dni) => ({ status: 200, body: { _id: 'emp-1', document: dni, firstName: 'ANA', lastName: 'PEREZ' } }));
    await page.goto('/#/dni');
    const input = page.locator('#dni-input');
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill('70000001');
    await page.getByRole('button', { name: 'Buscar' }).click();
    // Sin sesión, el guardia la manda al ingreso; lo que importa es que salió de /dni.
    await expect(page).not.toHaveURL(/\/dni$/);
  });
});

/**
 * Instrumenta `getUserMedia`: guarda cada stream que entrega y permite
 * retrasarlo o hacerlo fallar como en el móvil.
 *
 * Simula además un móvil con dos cámaras: anota qué cara pide la app y quita
 * `facingMode` antes de ir a la cámara falsa de Chromium, que no tiene ninguna.
 */
async function instrumentarCamara(page: Page, modo: 'ok' | 'lenta' | 'ocupada' | 'denegada') {
  await page.addInitScript((modoInicial) => {
    const w = window as any;
    w.__camara = { modo: modoInicial, llamadas: 0, streams: [] as MediaStream[], caras: [] as unknown[] };
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async () =>
      ['trasera', 'delantera'].map(
        (label) => ({ kind: 'videoinput', label, deviceId: label, groupId: label }) as MediaDeviceInfo
      );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      w.__camara.llamadas++;
      const video = constraints?.video;
      if (video && typeof video === 'object') {
        const { facingMode, ...resto } = video;
        w.__camara.caras.push(facingMode);
        constraints = { ...constraints, video: resto };
      }
      const modo = w.__camara.modo;
      if (modo === 'ocupada') throw new DOMException('Could not start video source', 'NotReadableError');
      if (modo === 'denegada') throw new DOMException('Permission denied', 'NotAllowedError');
      if (modo === 'lenta') await new Promise((resolve) => setTimeout(resolve, 2_000));
      const stream = await real(constraints);
      w.__camara.streams.push(stream);
      return stream;
    };
  }, modo);
}

/** Pistas de vídeo que siguen encendidas. */
const pistasVivas = (page: Page) =>
  page.evaluate(() =>
    ((window as any).__camara.streams as MediaStream[])
      .flatMap((stream) => stream.getTracks())
      .filter((track) => track.readyState === 'live').length
  );

/**
 * Sale de la pantalla como el botón atrás del móvil. La app va con rutas por
 * hash: cambiar el hash lo atiende el router de Angular sin recargar, así que
 * el componente se destruye de verdad y la página sigue viva para comprobar la
 * cámara.
 */
async function salirDeLaCamara(page: Page) {
  await page.evaluate(() => {
    location.hash = '#/dni';
  });
  await expect(page.locator('#dni-input')).toBeVisible({ timeout: 30_000 });
}

test.describe('cámara (CKI17)', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, () => ({ status: 404, body: {} }));
  });

  test('al salir de la pantalla la cámara se apaga', async ({ page }) => {
    await instrumentarCamara(page, 'ok');
    await page.goto('/#/face-mark');
    await expect.poll(() => pistasVivas(page), { timeout: 45_000 }).toBe(1);

    await salirDeLaCamara(page);
    await expect.poll(() => pistasVivas(page)).toBe(0);
  });

  test('salir antes de que la cámara encienda no la deja ocupada', async ({ page }) => {
    await instrumentarCamara(page, 'lenta');
    await page.goto('/#/face-mark');
    // Se sale mientras getUserMedia todavía está esperando.
    await expect.poll(() => page.evaluate(() => (window as any).__camara.llamadas), { timeout: 45_000 }).toBe(1);
    await salirDeLaCamara(page);

    // Cuando por fin resuelve, el stream se apaga en vez de quedar huérfano.
    await expect.poll(() => page.evaluate(() => (window as any).__camara.streams.length), { timeout: 10_000 }).toBe(1);
    await expect.poll(() => pistasVivas(page)).toBe(0);
  });

  test('cámara ocupada no se confunde con falta de permiso, y se puede reintentar', async ({ page }) => {
    await instrumentarCamara(page, 'ocupada');
    await page.goto('/#/face-mark');
    await expect(page.getByText('La cámara está en uso.')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/no tiene permiso/)).toHaveCount(0);

    await page.evaluate(() => ((window as any).__camara.modo = 'ok'));
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect.poll(() => pistasVivas(page)).toBe(1);
    await expect(page.getByText('La cámara está en uso.')).toHaveCount(0);
  });

  test('abre la trasera y el botón pasa a la delantera y vuelve', async ({ page }) => {
    await instrumentarCamara(page, 'ok');
    await page.goto('/#/face-mark');
    await expect.poll(() => pistasVivas(page), { timeout: 45_000 }).toBe(1);
    const caras = () => page.evaluate(() => (window as any).__camara.caras);
    expect(await caras()).toEqual([{ exact: 'environment' }]);

    await page.getByRole('button', { name: 'Cambiar a la cámara delantera' }).click();
    await expect.poll(caras).toEqual([{ exact: 'environment' }, { exact: 'user' }]);
    // La trasera se cierra antes de abrir la delantera: solo queda una encendida.
    await expect.poll(() => pistasVivas(page)).toBe(1);

    await page.getByRole('button', { name: 'Cambiar a la cámara trasera' }).click();
    await expect.poll(caras).toEqual([{ exact: 'environment' }, { exact: 'user' }, { exact: 'environment' }]);
    await expect.poll(() => pistasVivas(page)).toBe(1);
  });

  test('sin permiso lo dice como falta de permiso', async ({ page }) => {
    await instrumentarCamara(page, 'denegada');
    await page.goto('/#/face-mark');
    await expect(page.getByText('La app no tiene permiso para usar la cámara.')).toBeVisible({ timeout: 45_000 });
  });
});
