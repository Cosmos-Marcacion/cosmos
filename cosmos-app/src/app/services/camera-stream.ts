/**
 * Apertura de la camara con `getUserMedia` y lectura de sus fallos.
 *
 * Antes cualquier excepcion de `getUserMedia` se pintaba como "Revisa los
 * permisos". En la prueba del 18/09/2026 la app decia que no tenia permiso
 * mientras Android mostraba la camara concedida y con un acceso reciente: la
 * camara no estaba denegada, estaba ocupada. Las pantallas de rostro abren la
 * camara despues de cargar los modelos; si se salia antes de que resolviera
 * `getUserMedia`, `ngOnDestroy` ya habia corrido con el stream en `null` y ese
 * stream quedaba vivo, con la camara encendida y sin nadie que la cerrara. La
 * siguiente pantalla recibia `NotReadableError`.
 */

export type CameraErrorKind = 'denied' | 'busy' | 'missing' | 'unknown';

export interface CameraErrorInfo {
  kind: CameraErrorKind;
  /** Frase corta para el estado de la pantalla. */
  title: string;
  /** Que puede hacer la persona. */
  hint: string;
}

/** Traduce el `name` de un `DOMException` de `getUserMedia` a algo accionable. */
export function describeCameraError(error: unknown): CameraErrorInfo {
  const name = (error as { name?: string } | null)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        kind: 'denied',
        title: 'La app no tiene permiso para usar la cámara.',
        hint: 'Actívalo en Ajustes > Aplicaciones > Cosmos Check-In > Permisos > Cámara y vuelve a entrar.',
      };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return {
        kind: 'busy',
        title: 'La cámara está en uso.',
        hint: 'Cierra otras apps que usen la cámara y vuelve a intentarlo.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return {
        kind: 'missing',
        title: 'No se encontró una cámara disponible.',
        hint: 'Comprueba que el equipo tenga cámara.',
      };
    default:
      return {
        kind: 'unknown',
        title: 'No se pudo encender la cámara.',
        hint: 'Vuelve a intentarlo. Si sigue fallando, reinicia la app.',
      };
  }
}

/**
 * Abre la camara y devuelve el stream solo si quien lo pidio sigue vivo.
 *
 * Si `isAlive()` es falso cuando `getUserMedia` resuelve, las pistas se paran
 * aqui mismo y se devuelve `null`: es la unica forma de no dejar la camara
 * encendida cuando la pantalla ya se destruyo mientras esperaba.
 */
export async function openCameraStream(
  constraints: MediaStreamConstraints,
  isAlive: () => boolean,
): Promise<MediaStream | null> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  if (!isAlive()) {
    stopStream(stream);
    return null;
  }
  return stream;
}

/**
 * Que camara se abre: `environment` es la trasera y `user` la delantera.
 *
 * Registro y marcacion empiezan con la trasera, y la delantera queda a un boton
 * para quien se registra o se marca solo.
 */
export type CameraFacing = 'environment' | 'user';

export const DEFAULT_CAMERA_FACING: CameraFacing = 'environment';

export function otherFacing(facing: CameraFacing): CameraFacing {
  return facing === 'environment' ? 'user' : 'environment';
}

function facingConstraints(facing: CameraFacing, strict: boolean): MediaStreamConstraints {
  return {
    video: {
      facingMode: strict ? { exact: facing } : { ideal: facing },
      width: { ideal: 720 },
      height: { ideal: 720 },
    },
  };
}

/**
 * Abre la camara pedida.
 *
 * Primero se exige esa cara con `exact`: con `ideal` algunos WebView de Android
 * se quedan con la primera camara que enumeran, que suele ser la delantera. Si
 * el equipo no tiene esa camara (`OverconstrainedError`), se abre la que haya en
 * vez de dejar la pantalla sin imagen.
 */
export async function openFacingCamera(
  facing: CameraFacing,
  isAlive: () => boolean,
): Promise<MediaStream | null> {
  try {
    return await openCameraStream(facingConstraints(facing, true), isAlive);
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name !== 'OverconstrainedError' && name !== 'ConstraintNotSatisfiedError') throw error;
    if (!isAlive()) return null;
    return openCameraStream(facingConstraints(facing, false), isAlive);
  }
}

/** Si el equipo tiene mas de una camara; sin eso el boton de cambiar sobra. */
export async function hasSeveralCameras(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput').length > 1;
  } catch {
    return false;
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach(track => track.stop());
}
