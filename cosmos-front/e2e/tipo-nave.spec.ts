import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * El tipo de nave que envía Cosmos (`code_type_vessel` de ListarNombradas)
 * decide el formato. Ya no hay selector: la nombrada muestra el tipo tal como
 * llega y el formato que le toca, y solo ET, GR y ME pueden emitir.
 *
 * El backend que resuelve el tipo está probado en
 * `cosmos-back/test/nombradas-y-formatos.int-spec.ts`; aquí se prueba lo que
 * ve y puede hacer quien usa el panel.
 */

const API = 'http://localhost:3024/api/v1';

const TIPOS = [
  { id: 'ETHANOL', label: 'Ethanol', capacity: 16, onePageCapacity: 16 },
  { id: 'GRANEL', label: 'Granel', capacity: 61, onePageCapacity: 16 },
  { id: 'MERCADERIA_GENERAL', label: 'Mercadería general', capacity: 73, onePageCapacity: 16 },
  { id: 'CONTAINERO', label: 'Containero', capacity: 73, onePageCapacity: 16 },
  { id: 'BIG_BAG', label: 'Big bag', capacity: 73, onePageCapacity: 16 },
];

const tipo = (code: string, description: string, formatType: string, source = 'api') => ({
  code,
  description,
  formatType,
  accepted: Boolean(formatType),
  source,
});

function detalle(vesselType: ReturnType<typeof tipo>) {
  return {
    named: {
      staffTransmissionId: 3541,
      staffVesselId: 880,
      staffVesselNumber: '880',
      vesselDescription: 'NAVE DE PRUEBA',
      voyageNumber: 'V-1',
      locationId: 'PAI',
      pierDescription: 'Muelle 1',
      berthDescription: 'Amarradero A',
      workerDate: '10/09/2026',
      workerDateIso: '2026-09-10',
      shiftDescription: '07:00 - 15:00',
    },
    vesselType,
    record: null,
    points: [],
    staff: [],
    talks: [],
    formats: [],
    summary: { staffCount: 0, presentCount: 0, completeCount: 0, entryCount: 0 },
  };
}

async function abrirDetalle(page: Page, vesselType: ReturnType<typeof tipo>, pdf = false) {
  await mockApi(page);
  await page.route(`${API}/named/detail/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detalle(vesselType)) })
  );
  await page.route(`${API}/format/types`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TIPOS) })
  );
  await page.route(`${API}/format/pdf/status`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: pdf, version: 'LibreOffice 7' }) })
  );
  await signIn(page, ['marcaciones']);
  await page.goto('/marcaciones/nombrada/3541?date=2026-09-10');
  await esperarPantalla(page.getByRole('button', { name: 'Descargar Excel' }));
}

test.describe('tipo de nave en la nombrada', () => {
  test('ET: muestra el tipo, el formato Ethanol y deja descargar', async ({ page }) => {
    await abrirDetalle(page, tipo('ET', 'ETANOL', 'ETHANOL'));

    await expect(page.locator('.nd-header')).toContainText('ET · ETANOL');
    await expect(page.getByRole('button', { name: 'Descargar Excel' })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Imprimir' })).not.toHaveAttribute('aria-disabled', 'true');

    // La tarjeta de formato ya no abre un selector: enseña el dato de Cosmos.
    await page.getByRole('button', { name: /Formato/ }).first().click();
    await expect(page.getByTestId('nd-vessel-type')).toContainText('ET · ETANOL');
    await expect(page.getByTestId('nd-vessel-type')).toContainText('Formato Ethanol');
    await expect(page.locator('#nd-format-type')).toHaveCount(0);
    await expect(page.locator('select')).toHaveCount(0);
  });

  for (const [code, description, formatType, label] of [
    ['CO', 'CONTAINER', 'CONTAINERO', 'Containero'],
    ['BB', 'BIG BAGS', 'BIG_BAG', 'Big bag'],
  ]) {
    test(`${code}: tiene formato ${label} y deja descargar`, async ({ page }) => {
      await abrirDetalle(page, tipo(code, description, formatType));

      await expect(page.locator('.nd-header')).toContainText(`${code} · ${description}`);
      await expect(page.getByRole('button', { name: 'Descargar Excel' })).toBeEnabled();

      await page.getByRole('button', { name: /Formato/ }).first().click();
      await expect(page.getByTestId('nd-vessel-type')).toContainText(`Formato ${label}`);
    });
  }

  for (const [code, description] of [
    ['VA', 'VARILLAS'],
  ]) {
    test(`${code}: sin formato, no deja descargar ni imprimir y lo explica`, async ({ page }) => {
      await abrirDetalle(page, tipo(code, description, ''), true);

      await expect(page.locator('.nd-header')).toContainText(`${code} · ${description}`);
      await expect(page.getByRole('button', { name: 'Descargar Excel' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled();
      await expect(page.getByRole('link', { name: 'Imprimir' })).toHaveAttribute('aria-disabled', 'true');

      await page.getByRole('button', { name: /Formato/ }).first().click();
      await expect(page.getByTestId('nd-vessel-type')).toContainText('Sin formato');
      await expect(page.locator('.nd-modal__body')).toContainText('Solo tienen formato los tipos ET (Etanol), GR (Granel), ME (Mercadería), CO (Container) y BB (Big bags)');
    });
  }

  test('sin tipo de nave: lo dice y no deja descargar', async ({ page }) => {
    await abrirDetalle(page, tipo('', '', ''));
    await expect(page.locator('.nd-header')).toContainText('Sin tipo de nave');
    await expect(page.getByRole('button', { name: 'Descargar Excel' })).toBeDisabled();
  });

  test('nombrada copiada antes del campo: usa el formato elegido antes y lo avisa', async ({ page }) => {
    await abrirDetalle(page, tipo('', '', 'GRANEL', 'record'));
    await expect(page.getByRole('button', { name: 'Descargar Excel' })).toBeEnabled();
    await page.getByRole('button', { name: /Formato/ }).first().click();
    await expect(page.locator('.nd-modal__body')).toContainText('Cosmos aún no envió el tipo de nave');
  });

  test('el PDF solo se ofrece si el servidor tiene convertidor', async ({ page }) => {
    await abrirDetalle(page, tipo('GR', 'GRANEL', 'GRANEL'), false);
    await expect(page.getByRole('button', { name: 'Descargar PDF' })).toHaveCount(0);
  });

  test('con convertidor, el PDF se ofrece y se descarga', async ({ page }) => {
    await abrirDetalle(page, tipo('GR', 'GRANEL', 'GRANEL'), true);
    let pedido = '';
    await page.route(`${API}/format/3541/pdf**`, (route) => {
      pedido = route.request().url();
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'Content-Disposition, X-Format-Type',
          'content-disposition': 'attachment; filename="formato.pdf"',
          'x-format-type': 'GRANEL',
        },
        contentType: 'application/pdf',
        body: '%PDF-1.4',
      });
    });
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar PDF' }).click();
    await descarga;
    expect(pedido).toContain('/format/3541/pdf');
  });
});

test.describe('tipo de nave en el tablero de marcaciones', () => {
  const fila = (id: number, vesselType: ReturnType<typeof tipo>) => ({
    staffTransmissionId: id,
    staffVesselId: id,
    staffVesselNumber: String(id),
    vesselDescription: `NAVE ${id}`,
    voyageNumber: 'V-1',
    locationId: 'PAI',
    pierDescription: '2-A',
    workerDate: '18/09/2026',
    workerDateIso: '2026-09-18',
    shiftDescription: '07:00 - 15:00',
    staffCount: 10,
    assistCount: 1,
    formatType: vesselType.formatType,
    vesselType,
    jefeCubierta: null,
    supervisorOperaciones: null,
    supervisorSsoma: null,
    talkType: '',
    talkTopicsCount: 0,
    talksCount: 0,
    lastFormat: null,
    ready: false,
  });

  test('cada tarjeta dice su tipo y la que no tiene formato no descarga', async ({ page }) => {
    await mockApi(page);
    await page.route(`${API}/named/board`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([fila(7001, tipo('ET', 'ETANOL', 'ETHANOL')), fila(7002, tipo('VA', 'VARILLAS', ''))]),
      })
    );
    await page.route(`${API}/format/types`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TIPOS) })
    );
    let descargas = 0;
    await page.route(/\/api\/v1\/format\/\d+(\?.*)?$/, (route) => {
      descargas++;
      return route.fulfill({ status: 200, body: '' });
    });
    await signIn(page, ['marcaciones']);
    await page.goto('/marcaciones');

    // La tarjeta entera, no un elemento `nb-card__…` de dentro.
    const tarjeta = `xpath=ancestor::*[contains(concat(' ', @class, ' '), ' nb-card ')][1]`;
    const etanol = page.getByRole('button', { name: /Abrir nombrada 7001/ }).locator(tarjeta);
    const varillas = page.getByRole('button', { name: /Abrir nombrada 7002/ }).locator(tarjeta);
    await esperarPantalla(etanol);

    await expect(etanol).toContainText('ET · ETANOL');
    await expect(varillas).toContainText('VA · VARILLAS');
    await expect(varillas).toContainText('sin formato');

    await varillas.getByRole('button', { name: 'Descargar formato' }).click();
    await expect(page.locator('app-notification')).toContainText('no tiene formato');
    expect(descargas).toBe(0);
    // No abre la nombrada: no hay nada que elegir allí.
    await expect(page).toHaveURL(/\/marcaciones(\?.*)?$/);
  });
});

test.describe('formato impreso (CKI03)', () => {
  test('la casilla NAVE de Ethanol lleva la nave, no al jefe de cubierta', async ({ page }) => {
    await mockApi(page);
    const documento = fs.readFileSync(path.join(__dirname, 'fixtures', 'format-ETHANOL.json'), 'utf8');
    await page.route(`${API}/format/123/document**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: documento })
    );
    await signIn(page, ['marcaciones']);
    await page.goto('/formatos/imprimir/123?workerDate=12/05/2026');
    const hoja = page.locator('.fd-sheet').first();
    await esperarPantalla(hoja);

    const nave = hoja.getByText('NAVE:', { exact: true });
    await expect(nave).toBeVisible();
    // La casilla que sigue al rótulo es la del dato.
    const siguiente = nave.locator('xpath=following::*[normalize-space()][1]');
    await expect(siguiente).toHaveText('CMA CGM VOLTAIRE');
  });
});
