import { CapPipe } from './cap-pipe';

/**
 * El maestro de personal entrega los nombres en mayusculas. Este pipe es lo que
 * hace que en pantalla se lea "Ana" y no "ANA", asi que sus bordes —cadena
 * vacia, valor que no es texto— se ven directamente en la interfaz.
 */
describe('CapPipe', () => {
  const pipe = new CapPipe();

  it('pone la inicial en mayuscula y el resto en minuscula', () => {
    expect(pipe.transform('ANA')).toBe('Ana');
    expect(pipe.transform('ana')).toBe('Ana');
  });

  it('solo toca la primera letra de toda la cadena', () => {
    // Documenta el comportamiento real: no capitaliza cada palabra. Un nombre
    // compuesto sale como "Ana maria", que es lo que hoy se ve en pantalla.
    expect(pipe.transform('ANA MARIA')).toBe('Ana maria');
  });

  it('una cadena vacia sigue vacia y no revienta', () => {
    expect(pipe.transform('')).toBe('');
  });

  it('respeta las tildes', () => {
    expect(pipe.transform('MARÍA')).toBe('María');
  });

  it('deja pasar sin tocar lo que no es texto', () => {
    // El pipe se usa en plantillas donde el valor puede llegar nulo mientras
    // carga: convertirlo en cadena mostraria "Null" en la pantalla.
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeUndefined();
    expect(pipe.transform(42)).toBe(42);
  });
});
