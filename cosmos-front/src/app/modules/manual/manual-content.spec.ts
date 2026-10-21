import { GLOSSARY, PROBLEMS, ROLES } from './content/manual-general';
import { ARTICLES, AREAS, findArticle, normalize, plain, searchManual, segments, stepIds } from './manual-content';

describe('contenido del manual', () => {
  it('cada tema tiene un id único', () => {
    const ids = ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada grupo de pasos tiene un id único (con él se recuerda el avance)', () => {
    const ids = ARTICLES.flatMap(stepIds);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ningún enlace interno apunta a un tema que no existe', () => {
    const rotos: string[] = [];
    for (const a of ARTICLES) {
      for (const b of a.blocks) {
        if (b.t === 'related') b.ids.filter((id) => !findArticle(id)).forEach((id) => rotos.push(`${a.id} -> ${id}`));
      }
    }
    PROBLEMS.filter((p) => p.articleId && !findArticle(p.articleId)).forEach((p) => rotos.push(`${p.id} -> ${p.articleId}`));
    ROLES.flatMap((r) => r.tasks).filter((t) => !findArticle(t.articleId)).forEach((t) => rotos.push(`${t.label} -> ${t.articleId}`));
    expect(rotos).toEqual([]);
  });

  it('todas las áreas tienen temas y todo tema pertenece a un área', () => {
    for (const area of AREAS) {
      expect(ARTICLES.some((a) => a.area === area.id)).withContext(area.id).toBeTrue();
    }
    const areas = new Set(AREAS.map((a) => a.id));
    expect(ARTICLES.every((a) => areas.has(a.area))).toBeTrue();
  });

  it('cubre el panel web y la app', () => {
    expect(ARTICLES.filter((a) => a.area === 'web').length).toBeGreaterThan(10);
    expect(ARTICLES.filter((a) => a.area === 'app').length).toBeGreaterThan(10);
    expect(PROBLEMS.some((p) => p.area === 'web')).toBeTrue();
    expect(PROBLEMS.some((p) => p.area === 'app')).toBeTrue();
    expect(GLOSSARY.length).toBeGreaterThan(20);
  });

  it('las negritas están cerradas en todo el texto', () => {
    const abiertas = ARTICLES.flatMap((a) =>
      JSON.stringify(a.blocks)
        .split('"')
        .filter((t) => t.includes('**') && t.split('**').length % 2 === 0)
        .map((t) => `${a.id}: ${t}`),
    );
    expect(abiertas).toEqual([]);
  });
});

describe('texto con negrita', () => {
  it('parte en tramos normales y en negrita', () => {
    expect(segments('Pulsa **Guardar** y listo')).toEqual([
      { text: 'Pulsa ', strong: false },
      { text: 'Guardar', strong: true },
      { text: ' y listo', strong: false },
    ]);
  });

  it('quita las marcas para buscar', () => {
    expect(plain('Pulsa **Guardar**')).toBe('Pulsa Guardar');
  });

  it('normaliza tildes y mayúsculas', () => {
    expect(normalize('Marcación ÚNICA')).toBe('marcacion unica');
  });
});

describe('buscador del manual', () => {
  it('encuentra sin tildes y pone primero el tema cuyo título coincide', () => {
    const hits = searchManual('contrasena');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].article.id).toBe('web-ingreso');
  });

  it('exige todas las palabras', () => {
    const hits = searchManual('remate falta');
    expect(hits.map((h) => h.article.id)).toContain('app-detalle-empleado');
    expect(hits.every((h) => /remate/i.test(JSON.stringify(h.article)) || /remate/i.test(h.excerpt))).toBeTrue();
  });

  it('busca también en el asistente de problemas y en el glosario', () => {
    expect(searchManual('otg').map((h) => h.article.id)).toContain('problemas');
    expect(searchManual('amarradero').map((h) => h.article.id)).toContain('ref-glosario');
  });

  it('da un extracto con la frase donde aparece', () => {
    const hit = searchManual('trasera').find((h) => h.article.id === 'app-marcar-rostro');
    expect(hit?.excerpt.toLowerCase()).toContain('trasera');
  });

  it('una consulta vacía o de una letra no devuelve nada', () => {
    expect(searchManual('')).toEqual([]);
    expect(searchManual('a')).toEqual([]);
  });
});
