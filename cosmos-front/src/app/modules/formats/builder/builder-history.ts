/**
 * Deshacer y rehacer sobre la definición.
 *
 * Editar sobre el documento invita a probar: se pulsa una casilla, se cambia
 * una palabra, se arrastra un dato encima. Sin deshacer, probar da miedo, y una
 * pantalla que da miedo se usa mal o no se usa.
 *
 * Guarda copias enteras y no diferencias. Una definición ocupa unos 110 KB, y
 * cincuenta pasos son 5 MB de memoria en una pantalla de administración: es un
 * precio que se paga de sobra por no tener que razonar sobre cómo se invierte
 * cada operación. Las que hay son de todo tipo, incluidas las que desplazan
 * media retícula al insertar una columna.
 */
export class BuilderHistory<T> {
  private past: string[] = []
  private future: string[] = []
  private current: string | null = null

  constructor(private readonly limit = 50) { }

  /** Punto de partida. No cuenta como paso deshacible. */
  reset(state: T) {
    this.past = []
    this.future = []
    this.current = JSON.stringify(state)
  }

  /** Anota un estado nuevo. */
  push(state: T) {
    const next = JSON.stringify(state)
    if (next === this.current) {
      return
    }
    if (this.current !== null) {
      this.past.push(this.current)
      if (this.past.length > this.limit) {
        this.past.shift()
      }
    }
    this.current = next
    // Un cambio nuevo invalida lo que se había deshecho: es la rama que se
    // abandona, y conservarla llevaría a rehacer algo que ya no encaja.
    this.future = []
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  undo(): T | null {
    const previous = this.past.pop()
    if (previous === undefined || this.current === null) {
      return null
    }
    this.future.push(this.current)
    this.current = previous
    return JSON.parse(previous) as T
  }

  redo(): T | null {
    const next = this.future.pop()
    if (next === undefined || this.current === null) {
      return null
    }
    this.past.push(this.current)
    this.current = next
    return JSON.parse(next) as T
  }
}
