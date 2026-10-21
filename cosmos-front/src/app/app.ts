import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmationService } from './services/confirmation.service';
import { Observable } from 'rxjs';
import { NotificationService } from './services/notification.service';
import { LoaderService } from './services/loader.service';
import { LoaderComponent } from './components/loader/loader.component';
import { ConfirmationComponent } from './components/confirmation/confirmation.component';
import { NotificationComponent } from './components/notification/notification.component';
import { CommonModule } from '@angular/common';
import { NamedService } from './services/named.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NotificationComponent, LoaderComponent, ConfirmationComponent, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected title = 'cosmos-front';

  isConfirmationVisible = inject(ConfirmationService);

  isNotificationVisible!: Observable<Boolean>;

  isLoading!: Observable<Boolean>;
  isShow!: Observable<Boolean>;
  isPreviewVisible!: Observable<Boolean>;
  constructor(
    private loaderService: LoaderService,
    private notificationService: NotificationService,
    private namedService: NamedService
  ) {
    this.isLoggedIn()
  }

  ngOnInit() {
    this.getNotificationState();
    this.getLoaderState();
  }

  getNotificationState() {
    this.isNotificationVisible = this.notificationService.isVisible();
  }

  getLoaderState() {
    this.isLoading = this.loaderService.loading$
  }

  /**
   * Sondea el estado de sesion al arrancar.
   *
   * Es informativo: nada en la pantalla depende de la respuesta. Por eso el
   * error se ignora **de forma explicita**. Sin el manejador, un backend caido
   * dejaba un `HttpErrorResponse` sin capturar en cada carga —ruido constante en
   * la consola del navegador y en el reporte de errores, tapando los fallos que
   * si importan—.
   */
  isLoggedIn() {
    this.namedService.isLoggedIn().subscribe({
      error: () => undefined,
    })
  }

}
