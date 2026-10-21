import {
  DEFAULT_CAMERA_FACING,
  describeCameraError,
  hasSeveralCameras,
  openCameraStream,
  openFacingCamera,
  otherFacing,
  stopStream,
} from './camera-stream';
import { canAskCameraPermission } from './camera-permissions.service';
import { describePermissionState } from '../components/permission-dialog/permission-dialog.component';

function domError(name: string): DOMException {
  return new DOMException('fallo', name);
}

function fakeStream() {
  const track = jasmine.createSpyObj<MediaStreamTrack>('track', ['stop']);
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

describe('describeCameraError', () => {
  it('distingue permiso denegado', () => {
    expect(describeCameraError(domError('NotAllowedError')).kind).toBe('denied');
    expect(describeCameraError(domError('SecurityError')).kind).toBe('denied');
    expect(describeCameraError(domError('NotAllowedError')).hint).toContain('Ajustes');
  });

  it('una camara ocupada no se presenta como falta de permiso', () => {
    const info = describeCameraError(domError('NotReadableError'));
    expect(info.kind).toBe('busy');
    expect(info.title).not.toContain('permiso');
    expect(describeCameraError(domError('AbortError')).kind).toBe('busy');
  });

  it('distingue la falta de camara', () => {
    expect(describeCameraError(domError('NotFoundError')).kind).toBe('missing');
    expect(describeCameraError(domError('OverconstrainedError')).kind).toBe('missing');
  });

  it('cualquier otro fallo queda como desconocido', () => {
    expect(describeCameraError(new Error('x')).kind).toBe('unknown');
    expect(describeCameraError(null).kind).toBe('unknown');
    expect(describeCameraError(undefined).kind).toBe('unknown');
  });
});

describe('openCameraStream', () => {
  let getUserMedia: jasmine.Spy;

  beforeEach(() => {
    getUserMedia = spyOn(navigator.mediaDevices, 'getUserMedia');
  });

  it('devuelve el stream si la pantalla sigue viva', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.and.resolveTo(stream);
    expect(await openCameraStream({ video: true }, () => true)).toBe(stream);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('para las pistas si la pantalla se destruyo mientras esperaba', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.and.resolveTo(stream);
    expect(await openCameraStream({ video: true }, () => false)).toBeNull();
    expect(track.stop).toHaveBeenCalled();
  });

  it('propaga el error original con su name', async () => {
    getUserMedia.and.rejectWith(domError('NotReadableError'));
    await expectAsync(openCameraStream({ video: true }, () => true)).toBeRejectedWith(
      jasmine.objectContaining({ name: 'NotReadableError' })
    );
  });

  it('stopStream tolera null', () => {
    expect(() => stopStream(null)).not.toThrow();
  });
});

describe('camara trasera o delantera', () => {
  let getUserMedia: jasmine.Spy;

  beforeEach(() => {
    getUserMedia = spyOn(navigator.mediaDevices, 'getUserMedia');
  });

  const facingOf = (call: number) =>
    (getUserMedia.calls.argsFor(call)[0].video as MediaTrackConstraints).facingMode;

  it('por defecto se abre la trasera', () => {
    expect(DEFAULT_CAMERA_FACING).toBe('environment');
  });

  it('el boton alterna entre las dos', () => {
    expect(otherFacing('environment')).toBe('user');
    expect(otherFacing('user')).toBe('environment');
  });

  it('pide la cara exacta', async () => {
    const { stream } = fakeStream();
    getUserMedia.and.resolveTo(stream);
    expect(await openFacingCamera('environment', () => true)).toBe(stream);
    expect(facingOf(0)).toEqual({ exact: 'environment' });
  });

  it('si el equipo no tiene esa camara abre la que haya', async () => {
    const { stream } = fakeStream();
    getUserMedia.and.callFake(async (c: MediaStreamConstraints) => {
      const facing = (c.video as MediaTrackConstraints).facingMode as ConstrainDOMStringParameters;
      if (facing.exact) throw domError('OverconstrainedError');
      return stream;
    });
    expect(await openFacingCamera('environment', () => true)).toBe(stream);
    expect(facingOf(1)).toEqual({ ideal: 'environment' });
  });

  it('no reintenta si la pantalla ya se cerro', async () => {
    getUserMedia.and.rejectWith(domError('OverconstrainedError'));
    expect(await openFacingCamera('user', () => false)).toBeNull();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('otros fallos no se tapan con el reintento', async () => {
    getUserMedia.and.rejectWith(domError('NotReadableError'));
    await expectAsync(openFacingCamera('environment', () => true)).toBeRejectedWith(
      jasmine.objectContaining({ name: 'NotReadableError' })
    );
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('cuenta las camaras del equipo', async () => {
    const cam = (id: string) => ({ kind: 'videoinput', deviceId: id }) as MediaDeviceInfo;
    const mic = { kind: 'audioinput', deviceId: 'm' } as MediaDeviceInfo;
    const enumerate = spyOn(navigator.mediaDevices, 'enumerateDevices');
    enumerate.and.resolveTo([cam('a'), mic]);
    expect(await hasSeveralCameras()).toBeFalse();
    enumerate.and.resolveTo([cam('a'), cam('b'), mic]);
    expect(await hasSeveralCameras()).toBeTrue();
    enumerate.and.rejectWith(new Error('x'));
    expect(await hasSeveralCameras()).toBeFalse();
  });
});

describe('estado del permiso de camara', () => {
  it('se puede pedir tambien con prompt-with-rationale', () => {
    expect(canAskCameraPermission('prompt')).toBeTrue();
    expect(canAskCameraPermission('prompt-with-rationale')).toBeTrue();
    expect(canAskCameraPermission('granted')).toBeFalse();
    expect(canAskCameraPermission('denied')).toBeFalse();
  });

  it('cada estado tiene su texto', () => {
    expect(describePermissionState('granted').text).toBe('Permitido');
    expect(describePermissionState('denied').text).toBe('Denegado');
    expect(describePermissionState('limited').tone).toBe('ok');
    expect(describePermissionState('prompt-with-rationale').text).toBe('Sin decidir');
  });
});
