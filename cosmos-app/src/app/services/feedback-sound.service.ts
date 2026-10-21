import { Injectable } from '@angular/core';

/**
 * El sonido de que la marcación salió bien o no.
 *
 * Se sintetiza con la Web Audio API en vez de reproducir ficheros. En el muelle
 * la app se usa con la pantalla al sol y a veces sin cobertura: un `.mp3` que no
 * ha terminado de descargarse deja la marcación muda justo cuando más falta
 * hace saber si contó. Dos osciladores no dependen de nada.
 *
 * Los dos sonidos se distinguen sin mirar: el de acierto **sube** y el de fallo
 * **baja**. Es lo que permite marcar sin apartar la vista de lo que se está
 * haciendo, que es la situación real de quien lo usa.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackSoundService {
  private context: AudioContext | null = null;

  /**
   * El contexto se crea al primer sonido, no al arrancar.
   *
   * Los navegadores móviles no dejan sonar nada hasta que hay un gesto del
   * usuario; creándolo antes queda en `suspended` para siempre y no suena nunca.
   */
  private ensureContext(): AudioContext | null {
    try {
      if (!this.context) {
        const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
        const Impl = Ctor.AudioContext ?? Ctor.webkitAudioContext;
        if (!Impl) {
          return null;
        }
        this.context = new Impl();
      }
      if (this.context.state === 'suspended') {
        void this.context.resume();
      }
      return this.context;
    } catch {
      // Sin audio la marcación sigue siendo válida: el sonido acompaña, no
      // informa por sí solo. Nunca puede tumbar la pantalla.
      return null;
    }
  }

  /** Una nota. `at` es el desfase en segundos desde ahora. */
  private tone(frequency: number, at: number, duration: number, volume = 0.22) {
    const context = this.context;
    if (!context) return;

    const start = context.currentTime + at;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);

    // Con la envolvente de volumen no chasquea al empezar ni al cortar, que es
    // lo que hace que un pitido sintetizado suene barato.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  /** Dos notas que suben: la marcación quedó registrada. */
  success() {
    if (!this.ensureContext()) return;
    this.tone(880, 0, 0.12);
    this.tone(1318.5, 0.11, 0.22);
    this.vibrate([35]);
  }

  /** Dos notas graves y repetidas: no se pudo marcar. */
  error() {
    if (!this.ensureContext()) return;
    this.tone(320, 0, 0.16, 0.26);
    this.tone(240, 0.18, 0.3, 0.26);
    // Un patrón distinto al del acierto: con guantes el móvil se nota mejor de
    // lo que se oye.
    this.vibrate([80, 60, 80]);
  }

  /** Un toque corto al capturar el rostro. */
  capture() {
    if (!this.ensureContext()) return;
    this.tone(1046.5, 0, 0.07, 0.14);
  }

  private vibrate(pattern: number[]) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // El navegador puede no admitirlo o tenerlo bloqueado; da igual.
    }
  }
}
