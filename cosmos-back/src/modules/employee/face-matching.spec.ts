import {
  FACE_MATCH_MARGIN,
  FACE_MATCH_THRESHOLD,
  faceDistance,
  findConflictingFace,
  matchFace,
} from './face-matching';

/** Un rostro de 128 valores desplazado `offset` en la primera componente. */
const rostro = (offset = 0) =>
  Array.from({ length: 128 }, (_, i) => (i === 0 ? i / 128 + offset : i / 128));

describe('face-matching', () => {
  it('mantiene el umbral estricto de siempre', () => {
    // 0.45 separa "es esta persona" de "se le parece". Subirlo convierte el
    // marcaje facial en una puerta abierta.
    expect(FACE_MATCH_THRESHOLD).toBe(0.45);
  });

  it('mide la distancia euclidea', () => {
    expect(faceDistance(rostro(), rostro(0.3))).toBeCloseTo(0.3);
  });

  it('reconoce al candidato claramente mas cercano', () => {
    const match = matchFace(rostro(), [
      { id: 'pedro', descriptor: rostro(0.4) },
      { id: 'gerardo', descriptor: rostro(0.1) },
    ]);

    expect(match).toMatchObject({ status: 'match', id: 'gerardo' });
    expect(match.distance).toBeCloseTo(0.1);
  });

  it('un empate entre dos fichas es dudoso, no se elige a una', () => {
    const match = matchFace(rostro(), [
      { id: 'gerardo', descriptor: rostro(0.2) },
      { id: 'pedro', descriptor: rostro(0.2 + FACE_MATCH_MARGIN / 2) },
    ]);

    expect(match.status).toBe('ambiguous');
  });

  it('el mismo rostro copiado en dos fichas es dudoso', () => {
    const match = matchFace(rostro(), [
      { id: 'gerardo', descriptor: rostro() },
      { id: 'pedro', descriptor: rostro() },
    ]);

    expect(match.status).toBe('ambiguous');
  });

  it('varios rostros de la misma ficha no la hacen dudar de si misma', () => {
    const match = matchFace(rostro(), [
      { id: 'gerardo', descriptor: rostro(0.1) },
      { id: 'gerardo', descriptor: rostro(0.11) },
    ]);

    expect(match).toMatchObject({ status: 'match', id: 'gerardo' });
  });

  it('nadie por debajo del umbral es "no reconocido"', () => {
    expect(matchFace(rostro(), [{ id: 'pedro', descriptor: rostro(0.6) }]).status).toBe('unknown');
    expect(matchFace(rostro(), []).status).toBe('unknown');
  });

  it('detecta la misma cara ya registrada en otra ficha', () => {
    const candidatos = [
      { id: 'gerardo', descriptor: rostro() },
      { id: 'pedro', descriptor: rostro(0.2) },
    ];

    const conflicto = findConflictingFace(rostro(), candidatos, 'gerardo');
    expect(conflicto?.id).toBe('pedro');
    expect(conflicto?.distance).toBeCloseTo(0.2);
    expect(findConflictingFace(rostro(), candidatos, 'otro')).toMatchObject({ id: 'gerardo' });
  });

  it('deja registrar a dos personas parecidas', () => {
    // Bloquearlo dejaria a una sin rostro propio, que es justo la que el
    // reconocimiento confunde con su parecido.
    expect(
      findConflictingFace(rostro(), [{ id: 'pedro', descriptor: rostro(0.4) }], 'gerardo')
    ).toBeNull();
  });

  it('dos parecidos registrados se distinguen al marcar', () => {
    const candidatos = [
      { id: 'gerardo', descriptor: rostro() },
      { id: 'pedro', descriptor: rostro(0.4) },
    ];

    expect(matchFace(rostro(0.1), candidatos)).toMatchObject({ status: 'match', id: 'gerardo' });
  });
});
