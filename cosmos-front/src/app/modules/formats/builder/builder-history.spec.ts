import { BuilderHistory } from './builder-history';

/**
 * Deshacer y rehacer.
 *
 * Editar sobre el documento invita a probar, y sin deshacer probar da miedo.
 * Lo que hay que demostrar es que el historial no se lía en los casos que se
 * dan de verdad: deshacer varias veces, rehacer, y editar después de haber
 * deshecho.
 */
describe('BuilderHistory', () => {
  let history: BuilderHistory<{ n: number }>;

  beforeEach(() => {
    history = new BuilderHistory<{ n: number }>();
    history.reset({ n: 0 });
  });

  it('el punto de partida no se puede deshacer', () => {
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it('deshace el último cambio', () => {
    history.push({ n: 1 });
    expect(history.canUndo).toBe(true);
    expect(history.undo()).toEqual({ n: 0 });
  });

  it('deshace varios pasos en orden inverso', () => {
    history.push({ n: 1 });
    history.push({ n: 2 });
    history.push({ n: 3 });

    expect(history.undo()).toEqual({ n: 2 });
    expect(history.undo()).toEqual({ n: 1 });
    expect(history.undo()).toEqual({ n: 0 });
    expect(history.canUndo).toBe(false);
  });

  it('rehace lo deshecho', () => {
    history.push({ n: 1 });
    history.push({ n: 2 });
    history.undo();

    expect(history.canRedo).toBe(true);
    expect(history.redo()).toEqual({ n: 2 });
  });

  it('editar después de deshacer abandona lo que se había deshecho', () => {
    history.push({ n: 1 });
    history.push({ n: 2 });
    history.undo();
    history.push({ n: 99 });

    // La rama que se abandona no se puede rehacer: llevaría a un estado que ya
    // no encaja con lo que hay delante.
    expect(history.canRedo).toBe(false);
  });

  it('ignora un cambio que no cambia nada', () => {
    history.push({ n: 0 });
    expect(history.canUndo).toBe(false);
  });

  it('devuelve copias, no la referencia guardada', () => {
    history.push({ n: 1 });
    const undone = history.undo()!;
    undone.n = 77;
    history.redo();
    expect(history.undo()).toEqual({ n: 0 });
  });

  it('no crece sin límite', () => {
    const corto = new BuilderHistory<{ n: number }>(3);
    corto.reset({ n: 0 });
    for (let i = 1; i <= 10; i++) {
      corto.push({ n: i });
    }
    // Con el límite en 3, sólo se pueden deshacer tres pasos.
    let pasos = 0;
    while (corto.canUndo) {
      corto.undo();
      pasos++;
    }
    expect(pasos).toBe(3);
  });

  it('reiniciar borra el historial', () => {
    history.push({ n: 1 });
    history.reset({ n: 50 });
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it('deshacer sin nada que deshacer no rompe', () => {
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });
});
