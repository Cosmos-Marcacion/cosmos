import { fillAfter, fillBlank, markOption, overlay } from './preprinted-text'

/** Fila 8 de la hoja CHARLA, copiada de la plantilla tal cual. */
const TIPOS =
  '        Inducción            Capacitación                Entrenamiento                        Simulacro de Emergencia                            TOOLBOX                                    Otros:______º'

/** Fila 16. */
const ANUAL = '                       SI                          NO'

describe('preprinted-text', () => {
  describe('overlay', () => {
    it('sustituye sin cambiar la longitud', () => {
      expect(overlay('abcdef', 2, 'XY')).toBe('abXYef')
      expect(overlay('abcdef', 2, 'XY')).toHaveLength(6)
    })

    it('deja el texto intacto si la posicion no existe', () => {
      expect(overlay('abc', -1, 'X')).toBe('abc')
      expect(overlay('abc', 9, 'X')).toBe('abc')
    })
  })

  describe('markOption', () => {
    it('marca la opcion sin mover las demas', () => {
      const marcado = markOption(TIPOS, 'Entrenamiento')

      expect(marcado).toHaveLength(TIPOS.length)
      expect(marcado.indexOf('Inducción')).toBe(TIPOS.indexOf('Inducción'))
      expect(marcado.indexOf('TOOLBOX')).toBe(TIPOS.indexOf('TOOLBOX'))
      expect(marcado).toContain('X Entrenamiento')
    })

    it('marca la primera y la ultima opcion de la fila', () => {
      expect(markOption(TIPOS, 'Inducción')).toContain('X Inducción')
      expect(markOption(TIPOS, 'Otros')).toContain('X Otros:')
    })

    it('marca SI o NO en el programa anual', () => {
      expect(markOption(ANUAL, 'SI')).toContain('X SI')
      expect(markOption(ANUAL, 'SI')).not.toContain('X NO')
      expect(markOption(ANUAL, 'NO')).toContain('X NO')
      expect(markOption(ANUAL, 'NO')).toHaveLength(ANUAL.length)
    })

    it('no toca el texto cuando la etiqueta no esta', () => {
      expect(markOption(TIPOS, 'CHARLA DE SEGURIDAD')).toBe(TIPOS)
    })

    it('no pisa texto cuando no hay hueco delante de la etiqueta', () => {
      expect(markOption('Inducción', 'Inducción')).toBe('Inducción')
      expect(markOption('AInducción', 'Inducción')).toBe('AInducción')
    })
  })

  describe('fillBlank', () => {
    it('escribe el valor centrado en el hueco de subrayados', () => {
      const relleno = fillBlank('N° Horas: ___________  ', '8')

      expect(relleno).toHaveLength('N° Horas: ___________  '.length)
      expect(relleno).toContain('8')
      expect(relleno.startsWith('N° Horas: ')).toBe(true)
    })

    it('recorta lo que no cabe en el hueco', () => {
      expect(fillBlank('Horas: ___', '123456')).toBe('Horas: 123')
    })

    it('deja el texto intacto sin hueco o sin valor', () => {
      expect(fillBlank('Horas:', '8')).toBe('Horas:')
      expect(fillBlank('Horas: ___', '  ')).toBe('Horas: ___')
    })
  })

  describe('fillAfter', () => {
    const RESPONSABLE =
      'Nombre:                                                                              Fecha: '

    it('escribe en los espacios que siguen a la etiqueta', () => {
      const relleno = fillAfter(RESPONSABLE, 'Nombre:', 'MORAN PERALTA CARLOS')

      expect(relleno).toContain('Nombre: MORAN PERALTA CARLOS')
      // La etiqueta siguiente no se mueve.
      expect(relleno.indexOf('Fecha:')).toBe(RESPONSABLE.indexOf('Fecha:'))
      expect(relleno).toHaveLength(RESPONSABLE.length)
    })

    it('anade el valor cuando la etiqueta cierra el texto', () => {
      const relleno = fillAfter(RESPONSABLE, 'Fecha:', '10/09/2025')

      expect(relleno.endsWith('Fecha: 10/09/2025')).toBe(true)
    })

    it('recorta lo que no cabe antes de la etiqueta siguiente', () => {
      const relleno = fillAfter('Cargo:     Firma:', 'Cargo:', 'SUPERVISOR DE OPERACIONES')

      expect(relleno).toHaveLength('Cargo:     Firma:'.length)
      expect(relleno.indexOf('Firma:')).toBe('Cargo:     Firma:'.indexOf('Firma:'))
    })

    it('deja el texto intacto sin etiqueta o sin valor', () => {
      expect(fillAfter(RESPONSABLE, 'Cargo:', 'X')).toBe(RESPONSABLE)
      expect(fillAfter(RESPONSABLE, 'Nombre:', '   ')).toBe(RESPONSABLE)
    })
  })
})
