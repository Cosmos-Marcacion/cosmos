import { buildSearchFilter, escapeRegex } from './search';

/**
 * Este helper nacio de un fallo real que destapo el test de integracion de
 * puertos: `?search=(` devolvia un 500 porque el texto del usuario entraba tal
 * cual en un `$regex`. Los casos de aqui son los tres sintomas de aquello.
 */
describe('escapeRegex', () => {
  it('deja el texto normal intacto', () => {
    expect(escapeRegex('Callao')).toBe('Callao');
  });

  it('escapa los metacaracteres que rompen la expresion', () => {
    expect(escapeRegex('(')).toBe('\\(');
    expect(escapeRegex('a.b')).toBe('a\\.b');
    expect(escapeRegex('a*b')).toBe('a\\*b');
  });

  it('lo escapado sigue casando con el texto literal', () => {
    const literal = 'Muelle (norte) 1+2';

    expect(new RegExp(escapeRegex(literal)).test(literal)).toBe(true);
  });

  it('un patron escapado ya no es un comodin', () => {
    expect(new RegExp(escapeRegex('.*')).test('cualquier cosa')).toBe(false);
  });

  it('escapa tambien la barra invertida', () => {
    expect(() => new RegExp(escapeRegex('c:\\'))).not.toThrow();
  });
});

describe('buildSearchFilter', () => {
  it('sin busqueda devuelve un filtro vacio', () => {
    expect(buildSearchFilter('', ['name'])).toEqual({});
  });

  it('trata undefined y null como si no hubiera busqueda', () => {
    expect(buildSearchFilter(undefined, ['name'])).toEqual({});
    expect(buildSearchFilter(null, ['name'])).toEqual({});
  });

  it('una busqueda de solo espacios no filtra nada', () => {
    // Es lo que llega cuando alguien pulsa la barra espaciadora en el buscador:
    // debe devolver la lista entera, no cero resultados.
    expect(buildSearchFilter('   ', ['name'])).toEqual({});
  });

  it('sin campos donde buscar devuelve filtro vacio', () => {
    expect(buildSearchFilter('callao', [])).toEqual({});
  });

  it('busca en todos los campos con un $or', () => {
    expect(buildSearchFilter('callao', ['name', 'email'])).toEqual({
      $or: [
        { name: { $regex: 'callao', $options: 'i' } },
        { email: { $regex: 'callao', $options: 'i' } },
      ],
    });
  });

  it('ignora mayusculas y minusculas', () => {
    const filtro = buildSearchFilter('callao', ['name']) as {
      $or: { name: { $options: string } }[];
    };

    expect(filtro.$or[0].name.$options).toBe('i');
  });

  it('recorta los espacios del termino', () => {
    const filtro = buildSearchFilter('  callao  ', ['name']) as {
      $or: { name: { $regex: string } }[];
    };

    expect(filtro.$or[0].name.$regex).toBe('callao');
  });

  it('escapa el termino antes de meterlo en el filtro', () => {
    const filtro = buildSearchFilter('a.b', ['name']) as {
      $or: { name: { $regex: string } }[];
    };

    expect(filtro.$or[0].name.$regex).toBe('a\\.b');
  });

  it('un comodin deja de comportarse como comodin', () => {
    const filtro = buildSearchFilter('.*', ['name']) as {
      $or: { name: { $regex: string } }[];
    };

    // Sin escapar, `?search=.*` devolvia la coleccion entera: el parametro que
    // deberia acotar hacia lo contrario.
    expect(new RegExp(filtro.$or[0].name.$regex).test('Callao')).toBe(false);
  });

  it('un patron con anidamiento no llega a Mongo como expresion', () => {
    const filtro = buildSearchFilter('(a+)+$', ['name']) as {
      $or: { name: { $regex: string } }[];
    };

    // Es la forma clasica de ReDoS: sin escapar, quien la envie decide cuanto
    // tiempo ocupa al servidor.
    expect(filtro.$or[0].name.$regex).toBe('\\(a\\+\\)\\+\\$');
  });
});
