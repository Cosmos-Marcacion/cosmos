import { ShortTextPipe } from './short-text.pipe';

/**
 * Recorta textos que no caben en la pantalla del movil. El caso interesante no
 * es el recorte, es lo que hace con un valor ausente: en una lista que aun esta
 * cargando, la mitad de las celdas llegan vacias.
 */
describe('ShortTextPipe', () => {
  const pipe = new ShortTextPipe();

  it('deja intacto un texto que cabe', () => {
    expect(pipe.transform('Callao', 10)).toBe('Callao');
  });

  it('un texto de la longitud exacta no se recorta', () => {
    expect(pipe.transform('1234567890', 10)).toBe('1234567890');
  });

  it('recorta y anade puntos suspensivos', () => {
    expect(pipe.transform('Puerto del Callao', 10)).toBe('Puerto del...');
  });

  it('la longitud por defecto es diez', () => {
    expect(pipe.transform('Puerto del Callao')).toBe('Puerto del...');
  });

  it('un valor ausente devuelve cadena vacia, no "undefined"', () => {
    // La celda se queda en blanco mientras carga, que es lo correcto; devolver
    // el valor tal cual pintaria la palabra "undefined" en la lista.
    expect(pipe.transform(undefined as unknown as string)).toBe('');
    expect(pipe.transform(null as unknown as string)).toBe('');
  });

  it('una cadena vacia sigue vacia', () => {
    expect(pipe.transform('')).toBe('');
  });

  it('con longitud cero recorta todo', () => {
    expect(pipe.transform('Callao', 0)).toBe('...');
  });
});
