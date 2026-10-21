import { Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChekinConfirmationStateService } from '../../services/chekin-confirmation-state.service';
import { FeedbackSoundService } from '../../services/feedback-sound.service';

/**
 * La pantalla que dice si la marcación contó.
 *
 * Es lo último que ve quien marca, muchas veces de pie en el muelle y con la
 * pantalla al sol. Tiene que resolverse de un vistazo y sin leer: color, forma
 * y sonido dicen lo mismo tres veces, porque cualquiera de los tres puede
 * fallar —hay luz que se come el color, hay ruido que se come el sonido—.
 */
@Component({
  selector: 'app-checkin-confirmation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './checkin-confirmation.html',
  styleUrl: './checkin-confirmation.scss',
})
export class CheckinConfirmation {
  public checkinConfirmationStateService = inject(ChekinConfirmationStateService);
  private readonly sound = inject(FeedbackSoundService);

  readonly visible = toSignal(this.checkinConfirmationStateService.isVisible(), {
    initialValue: false,
  });
  readonly type = toSignal(this.checkinConfirmationStateService.type.asObservable(), {
    initialValue: 'success' as 'success' | 'error',
  });
  readonly message = toSignal(this.checkinConfirmationStateService.message.asObservable(), {
    initialValue: '',
  });

  readonly title = computed(() =>
    this.type() === 'success' ? 'Marcación registrada' : 'No se pudo marcar'
  );

  /**
   * El mensaje que acompaña al título.
   *
   * Si quien llama no puso ninguno se pone uno útil: "Error" a secas no le dice
   * a nadie qué hacer a continuación.
   */
  readonly detail = computed(() => {
    const propio = this.message().trim();
    if (propio) {
      return propio;
    }
    return this.type() === 'success'
      ? 'Ya está. Puedes continuar.'
      : 'Vuelve a intentarlo o avisa a tu supervisor.';
  });

  constructor() {
    // El sonido va atado a que la pantalla aparezca, no a quien la lanza: así
    // suena una sola vez y siempre, venga la marcación de la cara, del DNI o
    // de la huella.
    effect(() => {
      if (!this.visible()) {
        return;
      }
      if (this.type() === 'success') {
        this.sound.success();
      } else {
        this.sound.error();
      }
    });
  }
}
