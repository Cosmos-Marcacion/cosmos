import { convertToParamMap } from '@angular/router';
import { identificationParams, readIdentification } from './mark-identification';

describe('mark-identification', () => {
  it('va y vuelve por la URL con su puntuacion', () => {
    const params = identificationParams({ method: 'rostro', score: 0.31 });

    expect(params).toEqual({ metodo: 'rostro', puntuacion: 0.31 });
    expect(readIdentification(convertToParamMap({ metodo: 'rostro', puntuacion: '0.31' })))
      .toEqual({ method: 'rostro', score: 0.31 });
  });

  it('sin puntuacion solo lleva el metodo', () => {
    expect(identificationParams({ method: 'documento' })).toEqual({ metodo: 'documento' });
    expect(readIdentification(convertToParamMap({ metodo: 'qr' }))).toEqual({ method: 'qr' });
  });

  it('ignora un metodo desconocido o ausente', () => {
    expect(readIdentification(convertToParamMap({ metodo: 'telepatia' }))).toBeNull();
    expect(readIdentification(convertToParamMap({}))).toBeNull();
  });
});
