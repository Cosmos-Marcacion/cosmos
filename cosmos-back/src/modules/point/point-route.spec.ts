import { routeEnds } from './point-route'

describe('routeEnds', () => {
  it('con ordenes con huecos (1 y 5) encuentra entrada y salida', () => {
    // Estado real tras reducir el recorrido de 8 a 2 puntos. La cuenta
    // anterior (`order === points.length`) buscaba el 2 y no habia salida.
    const ingreso = { id: 'ingreso', order: 1 }
    const salida = { id: 'salida', order: 5 }
    expect(routeEnds([ingreso, salida])).toEqual({ start: ingreso, end: salida })
  })

  it('no depende del orden en que llegan los puntos', () => {
    const a = { id: 'a', order: 3 }
    const b = { id: 'b', order: 9 }
    const c = { id: 'c', order: 2 }
    expect(routeEnds([a, b, c])).toEqual({ start: c, end: b })
  })

  it('al agregar un punto despues de la salida, ese pasa a ser la salida', () => {
    const points = [
      { id: 'ingreso', order: 1 },
      { id: 'salida', order: 5 },
      { id: 'nuevo', order: 6 },
    ]
    expect(routeEnds(points).end?.id).toBe('nuevo')
  })

  it('con un solo punto, entrada y salida son el mismo', () => {
    const unico = { id: 'unico', order: 4 }
    expect(routeEnds([unico])).toEqual({ start: unico, end: unico })
  })

  it('sin puntos no hay extremos', () => {
    expect(routeEnds([])).toEqual({ start: undefined, end: undefined })
  })
})
