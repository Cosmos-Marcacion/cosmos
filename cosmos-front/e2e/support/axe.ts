import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Auditoria de accesibilidad de una pantalla.
 *
 * Se comprueban las reglas WCAG 2.1 nivel A y AA, que son las exigibles y las
 * que corresponden a fallos reales de uso: contraste insuficiente en una garita
 * a pleno sol, un campo sin etiqueta que el lector de pantalla no anuncia, un
 * boton al que no se llega con el teclado.
 *
 * Axe no encuentra todos los problemas de accesibilidad —muchos solo los ve una
 * persona—, pero los que encuentra son ciertos: no hay falsos positivos que
 * discutir, y por eso puede ser un gate y no un informe.
 *
 * ## Por que hay una linea base
 *
 * El panel arranca con incumplimientos ya presentes. Exigir cero desde el
 * primer dia dejaria el gate en rojo permanente, y un gate que lleva semanas en
 * rojo deja de leerse. Se aplica el mismo trinquete que a la cobertura y al
 * lint: se anota cuantos elementos incumple cada regla hoy, y el gate falla si
 * **aparece una regla nueva o si el recuento sube**. La deuda existente no
 * bloquea; crearla si.
 *
 * Cuando se arregle un incumplimiento, hay que bajar el numero aqui. Un
 * recuento por debajo de la linea base no falla, pero avisa.
 */

/** Recuento de elementos que incumple cada regla, por pantalla. Solo baja. */
export type LineaBase = Record<string, number>;

export async function comprobarAccesibilidad(
  page: Page,
  testInfo: TestInfo,
  opciones: {
    /** Selector al que acotar el analisis. Por defecto, la pagina entera. */
    dentroDe?: string;
    /** Incumplimientos ya presentes el 09/09/2026. Vacio = tolerancia cero. */
    lineaBase?: LineaBase;
  } = {}
) {
  const lineaBase = opciones.lineaBase ?? {};

  let constructor = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ]);

  if (opciones.dentroDe) {
    constructor = constructor.include(opciones.dentroDe);
  }

  const resultado = await constructor.analyze();

  // El informe completo se adjunta siempre, pase o falle: es lo que convierte
  // "hay 4 problemas" en "este boton, esta regla, este enlace a la explicacion".
  await testInfo.attach('accesibilidad.json', {
    body: JSON.stringify(resultado.violations, null, 2),
    contentType: 'application/json',
  });

  const actual: LineaBase = {};
  for (const violacion of resultado.violations) {
    actual[violacion.id] = violacion.nodes.length;
  }

  const regresiones: string[] = [];
  for (const violacion of resultado.violations) {
    const permitidos = lineaBase[violacion.id] ?? 0;
    if (violacion.nodes.length > permitidos) {
      const detalle = violacion.nodes
        .map((n) => `      ${n.target.join(' ')}\n        ${n.html.slice(0, 120)}`)
        .join('\n');
      regresiones.push(
        `${violacion.id} (${violacion.impact}): ${violacion.help}\n` +
          `    permitidos ${permitidos}, encontrados ${violacion.nodes.length}\n` +
          `    ${violacion.helpUrl}\n${detalle}`
      );
    }
  }

  const mejoras = Object.entries(lineaBase)
    .filter(([regla, permitidos]) => (actual[regla] ?? 0) < permitidos)
    .map(([regla, permitidos]) => `${regla}: ${permitidos} -> ${actual[regla] ?? 0}`);

  if (mejoras.length > 0) {
    // No falla: avisa. Es la senal para bajar el numero y que no pueda volver.
    testInfo.annotations.push({
      type: 'accesibilidad-mejorada',
      description: `Baja la linea base en accesibilidad.spec.ts: ${mejoras.join(', ')}`,
    });
  }

  expect(regresiones, `Accesibilidad:\n${regresiones.join('\n')}`).toEqual([]);
}
