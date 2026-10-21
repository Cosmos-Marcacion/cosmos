import { Locator, Page, expect, test } from '@playwright/test';
import { FakeApi, mockApi, signIn } from './support/api';
import { esperarPantalla } from './support/arranque';

/**
 * El flujo del maestro de formatos, de punta a punta.
 *
 * Se comprueba la cadena entera —cargar, editar sobre el documento, guardar,
 * publicar— y sobre todo qué pasa cuando algo va mal: los fallos de esta
 * pantalla no se ven, se descubren cuando alguien firma un documento que no era
 * el que creía haber publicado.
 */

let api: FakeApi;

test.beforeEach(async ({ page }) => {
  await signIn(page);
  api = await mockApi(page);
  await page.goto('/formatos/maestro');
  await esperarPantalla(page.locator('app-format-builder'));
});

/** La casilla del documento por el texto fijo que lleva escrito. */
function cell(page: Page, text: string): Locator {
  return page.locator('.fb-cell', { hasText: text }).first();
}

/** La casilla que imprime un dato de la jornada. */
function dataCell(page: Page, label: string): Locator {
  return page.locator('.fb-cell', {
    has: page.locator('.fb-data', { hasText: new RegExp(`^${label}$`) }),
  }).first();
}

/** El diálogo de confirmación, que es global. */
const dialog = (page: Page) => page.locator('app-confirmation');

/** Edita la primera casilla y deja la pantalla con cambios sin guardar. */
async function editSomething(page: Page, text = 'BUQUE') {
  await cell(page, 'NAVE').click();
  await page.locator('.fb-inspector textarea').fill(text);
  await expect(page.locator('.fm-dirty')).toBeVisible();
}

test.describe('carga', () => {
  test('abre el primer tipo con sus documentos como pestañas', async ({ page }) => {
    await expect(page.locator('.fm-tab')).toHaveText(['ATS', 'Asistencia']);
    await expect(page.locator('.fm-tab--on')).toHaveText('ATS');
    await expect(cell(page, 'NAVE')).toBeVisible();
  });

  test('cambia de documento sin perder el tipo', async ({ page }) => {
    await page.locator('.fm-tab', { hasText: 'Asistencia' }).click();
    await expect(cell(page, 'FECHA')).toBeVisible();
    await expect(page.locator('.fm-select').first()).toHaveValue('granel');
  });

  test('un fallo al cargar la definición se explica en la pantalla, y una sola vez', async ({ page }) => {
    api.fail('GET', '/format/definitions/ethanol', 500, { message: 'connect ECONNREFUSED' });
    await page.locator('.fm-select').first().selectOption('ethanol');

    await expect(page.locator('.fm-note--error')).toContainText('No se pudo cargar el formato');
    // El aviso genérico con el mensaje del servidor no sale encima: la pantalla
    // ya lo explica con lo que hay que hacer.
    await expect(page.locator('app-notification')).toHaveCount(0);
  });

  test('si no se puede traer el catálogo de bloques, lo dice donde se usa', async ({ page }) => {
    api.fail('GET', '/definitions/catalog', 500);
    await page.reload();
    await esperarPantalla(page.locator('app-format-builder'));

    await page.locator('.fm-more summary').click();
    await expect(page.locator('.fm-more__warn')).toContainText('Puedes seguir editando');
  });
});

test.describe('edición', () => {
  test('escribir en una casilla la marca sin guardar y guarda lo escrito', async ({ page }) => {
    await editSomething(page);
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.locator('.fm-note--ok')).toContainText('Borrador guardado');
    await expect(page.locator('.fm-dirty')).toHaveCount(0);

    const [saved] = api.bodiesOf('PUT', '/draft');
    expect(JSON.stringify(saved)).toContain('BUQUE');
  });

  test('deshacer devuelve el texto anterior', async ({ page }) => {
    await editSomething(page);
    await expect(cell(page, 'BUQUE')).toBeVisible();

    await page.getByRole('button', { name: /Deshacer/ }).click();
    await expect(page.locator('.fb-cell', { hasText: 'BUQUE' })).toHaveCount(0);
  });

  test('partir una casilla deja la fila sumando 100%', async ({ page }) => {
    await cell(page, 'NAVE').click();
    await cell(page, 'NAVE').locator('.fb-split').click();

    const row = page.locator('.fb-row').first();
    await expect(row.locator('.fb-cell')).toHaveCount(3);
    const template = await row.evaluate((node) => (node as HTMLElement).style.gridTemplateColumns);
    const total = template
      .split(' ')
      .map((part) => Number(part.replace('%', '')))
      .reduce((sum, value) => sum + value, 0);
    expect(Math.round(total)).toBe(100);
  });

  test('una casilla enlazada a un dato imprime su nombre, no el origen', async ({ page }) => {
    await dataCell(page, 'Nave').click();
    await expect(page.locator('.fb-inspector .fb-bound .fb-data')).toHaveText('Nave');
    await expect(page.locator('.fb-inspector textarea')).toBeDisabled();
  });

  test('elegir "Texto fijo" no enlaza ningún dato', async ({ page }) => {
    await page.locator('.fb-cell').filter({ hasText: '—' }).first().click();
    await page.locator('.fb-inspector select[name="bind"]').selectOption('');

    // `Number('')` es 0: elegir "Texto fijo" enlazaba el primer dato de la
    // lista —la nave— en una casilla que se acababa de escribir a mano.
    await expect(page.locator('.fb-inspector .fb-bound')).toHaveCount(0);
    await expect(page.locator('.fm-dirty')).toHaveCount(0);
  });

  test('Ctrl+Z dentro de un campo de texto no deshace el documento entero', async ({ page }) => {
    // Último cambio del documento: una fila nueva, hecha con el botón.
    const rows = page.locator('.fb-rowwrap');
    const before = await rows.count();
    await page.locator('.fb-insert', { hasText: '+ Fila' }).first().click();
    await expect(rows).toHaveCount(before + 1);

    // Ctrl+Z con el cursor dentro del campo es del campo, no del documento.
    await page.locator('.fb-inspector textarea').click();
    await page.keyboard.press('Control+z');

    await expect(rows).toHaveCount(before + 1);
  });

  test('una acción que no cambia nada no deja la pantalla como sin guardar', async ({ page }) => {
    // Subir la primera fila no puede subir más: no hay cambio que guardar.
    await page.locator('.fb-rowtools button[title="Subir"]').first().click({ force: true });
    await expect(page.locator('.fm-dirty')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Deshacer/ })).toBeDisabled();
  });
});

test.describe('guardar y publicar', () => {
  test('publicar sube la versión y lo dice', async ({ page }) => {
    await editSomething(page);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.fm-note--ok')).toContainText('Borrador guardado');

    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.locator('.fm-note--ok')).toContainText('Publicada la versión 4');
  });

  test('publicar con cambios sin guardar publica lo que se está viendo', async ({ page }) => {
    await editSomething(page);
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.locator('.fm-note--ok')).toContainText('Publicada la versión 4');

    // Publicar toma el borrador del servidor: sin guardar antes, lo que se
    // emitía era la versión anterior y nadie se enteraba.
    const saved = api.bodiesOf('PUT', '/draft');
    expect(JSON.stringify(saved)).toContain('BUQUE');
    expect(JSON.stringify(api.types['granel'].published)).toContain('BUQUE');
  });

  test('un fallo al guardar se explica sin dejar el cambio por perdido', async ({ page }) => {
    api.fail('PUT', '/draft', 500, { message: 'connect ETIMEDOUT' });
    await editSomething(page);
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.locator('.fm-note--error')).toContainText('sigue en pantalla');
    await expect(page.locator('.fm-dirty')).toBeVisible();
    await expect(cell(page, 'BUQUE')).toBeVisible();
    await expect(page.locator('app-notification')).toHaveCount(0);
  });

  test('si falla el guardado previo, no se publica nada', async ({ page }) => {
    api.fail('PUT', '/draft', 500);
    await editSomething(page);
    await page.getByRole('button', { name: 'Publicar' }).click();

    await expect(page.locator('.fm-note--error')).toBeVisible();
    expect(api.bodiesOf('POST', '/publish').length).toBe(0);
  });

  test('la definición inválida no se puede publicar y dice qué hacer', async ({ page }) => {
    api.types['granel'].issues = [{ path: 'ats.s1.f1', message: 'La fila f1 no suma 100%' }];
    await page.reload();
    await esperarPantalla(page.locator('app-format-builder'));

    await expect(page.locator('.fm-issues summary')).toContainText('Una cosa impide publicar');
    await expect(page.locator('.fm-issues summary')).toContainText('guarda el borrador');
    await expect(page.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });

  test('cada cosa que impide publicar dice dónde está y lleva hasta ella', async ({ page }) => {
    api.types['granel'].issues = [
      { path: 'documents[1].sections[0].rows[0]', message: 'la fila no tiene columnas' },
    ];
    await page.reload();
    await esperarPantalla(page.locator('app-format-builder'));

    await page.locator('.fm-issues summary').click();
    await expect(page.locator('.fm-issue__where')).toHaveText(
      'Asistencia › Datos de la jornada › fila 1'
    );

    // Y abre el documento donde está, que con cuatro documentos es media tarde
    // buscándola a mano.
    await page.locator('.fm-issue').click();
    await expect(page.locator('.fm-tab--on')).toHaveText('Asistencia');
  });

  test('un fallo al publicar dice que no se emitió ninguna versión', async ({ page }) => {
    api.fail('POST', '/publish', 500);
    await page.getByRole('button', { name: 'Publicar' }).click();

    await expect(page.locator('.fm-note--error')).toContainText('No se ha emitido ninguna versión');
  });
});

test.describe('cambios sin guardar', () => {
  test('cambiar de tipo pregunta antes de tirar el trabajo', async ({ page }) => {
    await editSomething(page);
    await page.locator('.fm-select').first().selectOption('ethanol');

    await expect(dialog(page)).toContainText('cambios sin guardar');
    await dialog(page).getByRole('button', { name: 'Seguir aquí' }).click();

    // Se queda donde estaba, con el cambio intacto y el desplegable en su sitio.
    await expect(page.locator('.fm-select').first()).toHaveValue('granel');
    await expect(cell(page, 'BUQUE')).toBeVisible();
    await expect(page.locator('.fm-dirty')).toBeVisible();
  });

  test('descartar y abrir otro tipo sí cambia de formato', async ({ page }) => {
    await editSomething(page);
    await page.locator('.fm-select').first().selectOption('ethanol');
    await dialog(page).getByRole('button', { name: 'Descartar y abrir' }).click();

    await expect(page.locator('.fm-select').first()).toHaveValue('ethanol');
    await expect(cell(page, 'PRODUCTO')).toBeVisible();
    await expect(page.locator('.fm-dirty')).toHaveCount(0);
  });

  test('salir de la pantalla con cambios sin guardar avisa', async ({ page }) => {
    await editSomething(page);
    await page.locator('li[title="Marcaciones"]').first().click();

    await expect(dialog(page)).toContainText('cambios sin guardar');
    await dialog(page).getByRole('button', { name: 'Seguir aquí' }).click();

    await expect(page).toHaveURL(/formatos\/maestro/);
    await expect(cell(page, 'BUQUE')).toBeVisible();
  });

  test('confirmando el aviso se sale de la pantalla', async ({ page }) => {
    await editSomething(page);
    await page.locator('li[title="Marcaciones"]').first().click();
    await dialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();

    await expect(page).toHaveURL(/marcaciones/);
  });

  test('sin cambios se sale sin preguntar', async ({ page }) => {
    await page.locator('li[title="Marcaciones"]').first().click();
    await expect(page).toHaveURL(/marcaciones/);
  });
});

test.describe('acciones destructivas', () => {
  test('descartar el borrador pide confirmación y dice qué se pierde', async ({ page }) => {
    await editSomething(page);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.fm-note--ok')).toBeVisible();

    await page.locator('.fm-more summary').click();
    await page.getByRole('button', { name: 'Descartar el borrador' }).click();

    await expect(dialog(page)).toContainText('¿Descartar el borrador?');
    await expect(dialog(page)).toContainText('no se puede deshacer');

    await dialog(page).getByRole('button', { name: 'Conservarlo' }).click();
    expect(api.calls.filter((call) => call.method === 'DELETE').length).toBe(0);
  });

  test('confirmando, el borrador se descarta y se vuelve a lo publicado', async ({ page }) => {
    await editSomething(page);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.fm-note--ok')).toBeVisible();

    await page.locator('.fm-more summary').click();
    await page.getByRole('button', { name: 'Descartar el borrador' }).click();
    await dialog(page).getByRole('button', { name: 'Descartar el borrador' }).click();

    await expect(page.locator('.fm-note--ok')).toContainText('Borrador descartado');
    await expect(cell(page, 'NAVE')).toBeVisible();
    await expect(page.locator('.fb-cell', { hasText: 'BUQUE' })).toHaveCount(0);
  });

  test('restaurar de fábrica pide confirmación', async ({ page }) => {
    await page.locator('.fm-more summary').click();
    await page.getByRole('button', { name: 'Restaurar de fábrica' }).click();

    await expect(dialog(page)).toContainText('plantillas del cliente');
    await expect(dialog(page)).toContainText('historial');
  });

  test('un fallo al descartar dice que el borrador sigue ahí', async ({ page }) => {
    api.fail('DELETE', '/draft', 500);
    await editSomething(page);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.fm-note--ok')).toBeVisible();

    await page.locator('.fm-more summary').click();
    await page.getByRole('button', { name: 'Descartar el borrador' }).click();
    await dialog(page).getByRole('button', { name: 'Descartar el borrador' }).click();

    await expect(page.locator('.fm-note--error')).toContainText('Sigue guardado');
  });
});

test.describe('borrador atrasado', () => {
  test('avisa del borrador que se quedó atrás y deja cargarlo', async ({ page }) => {
    api.types['granel'].staleDraft = api.types['granel'].published;
    await page.reload();

    const notice = page.locator('.fm-stale');
    await esperarPantalla(notice);
    await expect(notice).toContainText('se quedó atrás');

    await notice.getByRole('button', { name: 'Cargar el borrador' }).click();
    await expect(page.locator('.fm-note--ok')).toContainText('Borrador recuperado');
    await expect(notice).toHaveCount(0);
  });

  test('descartar el borrador atrasado también pregunta', async ({ page }) => {
    api.types['granel'].staleDraft = api.types['granel'].published;
    await page.reload();
    await esperarPantalla(page.locator('.fm-stale'));

    await page.locator('.fm-stale').getByRole('button', { name: 'Descartarlo' }).click();
    await expect(dialog(page)).toContainText('¿Descartar el borrador?');
  });
});

test.describe('historial', () => {
  test('lista las publicaciones y sus cambios', async ({ page }) => {
    await page.getByRole('button', { name: /Historial/ }).click();
    const panel = page.locator('app-format-history');
    await expect(panel.locator('.fh-entry')).toHaveCount(3);

    await panel.locator('.fh-entry__head').first().click();
    await expect(panel.locator('.fh-change')).toHaveCount(1);
  });

  test('cargar una versión anterior avisa de que reemplaza el borrador', async ({ page }) => {
    await editSomething(page);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.fm-note--ok')).toBeVisible();

    await page.getByRole('button', { name: /Historial/ }).click();
    await page.locator('app-format-history .fh-entry')
      .filter({ hasText: 'v2' })
      .getByRole('button', { name: 'Cargar' })
      .click();

    await expect(dialog(page)).toContainText('Reemplaza el borrador actual');
    await dialog(page).getByRole('button', { name: /Cargar la versión 2/ }).click();
    await expect(page.locator('.fm-note--ok')).toContainText('Revísala antes de publicar');
  });

  test('un fallo al comparar no deja la entrada girando', async ({ page }) => {
    api.fail('GET', '/changes', 500);
    await page.getByRole('button', { name: /Historial/ }).click();
    await page.locator('app-format-history .fh-entry__head').first().click();

    await expect(page.locator('.fh-error')).toContainText('No se pudieron cargar');
  });

  test('si el historial no se puede traer, no dice que nunca se publicó', async ({ page }) => {
    api.fail('GET', '/versions', 500);
    await page.reload();
    await esperarPantalla(page.locator('app-format-builder'));

    await page.getByRole('button', { name: /Historial/ }).click();
    await expect(page.locator('app-format-history')).toContainText('No se pudo cargar el historial');
  });
});

test.describe('sesión', () => {
  test('una sesión caducada lo dice en cristiano y lleva al login', async ({ page }) => {
    api.fail('PUT', '/draft', 401, { message: 'Unauthorized' });
    await editSomething(page);
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.locator('app-notification')).toContainText('Tu sesión ha caducado');
    await expect(page).toHaveURL(/login/);
  });
});
