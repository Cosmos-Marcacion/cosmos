import { Component, inject, OnInit, AfterViewInit, PLATFORM_ID } from '@angular/core';
import { ConfirmationService } from './services/confirmation.service';
import { NotificationService } from './services/notification.service';
import { LoaderService } from './services/loader.service';
import { LoaderComponent } from './components/loader/loader.component';
import { ConfirmationComponent } from './components/confirmation/confirmation.component';
import { NotificationComponent } from './components/notification/notification.component';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ChekinConfirmationStateService } from './services/chekin-confirmation-state.service';
import { CheckinConfirmation } from './components/checkin-confirmation/checkin-confirmation';
import { SplashComponent } from './components/splash/splash.component';
import { SplashService } from './services/splash.service';
import { PermissionDialogComponent } from './components/permission-dialog/permission-dialog.component';
import { PermissionDialogService } from './services/permission-dialog.service';

import { DOMCompatibilityConfig } from './config/dom-compatibility.config';
import { Style } from '@capacitor/status-bar';
import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { AndroidCompatibilityService } from './services/android-compatibility.service';
import { ANDROID_VIEWPORT_CONFIG } from './config/android-compatibility.config';
import { App as CapacitorApp } from '@capacitor/app';
import { NgZone } from '@angular/core';
import { Location } from '@angular/common';
import { AuthService } from './modules/auth/services/auth.services';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NotificationComponent,
    LoaderComponent,
    ConfirmationComponent,
    CommonModule,
    RouterOutlet,
    CheckinConfirmation,
    SplashComponent,
    PermissionDialogComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, AfterViewInit {
  protected title = 'cosmos-front';
  private readonly loaderService = inject(LoaderService);
  private readonly notificationService = inject(NotificationService);
  private readonly checkinConfirmationStateService = inject(ChekinConfirmationStateService);
  private readonly splashService = inject(SplashService);
  private readonly permissionDialogService = inject(PermissionDialogService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly androidCompatibilityService = inject(AndroidCompatibilityService);
  readonly isConfirmationVisible = inject(ConfirmationService);
  readonly isNotificationVisible = this.notificationService.isVisible();
  readonly isLoading = this.loaderService.loading$;
  readonly isCheckinConfirmationVisible = this.checkinConfirmationStateService.isVisible();
  readonly isSplashVisible = this.splashService.getSplashVisible();
  readonly isPermissionDialogVisible = this.permissionDialogService.isVisible;
  private readonly zone = inject(NgZone);
  private readonly location = inject(Location);
  private readonly authService = inject(AuthService);

  constructor() {
    this.isLoggedIn();
  }

  ngOnInit(): void {
    this.initializeApp();
    this.initializeCameraPermissions();
  }

  isLoggedIn() {
    // Revalida la sesion al arrancar. Si el token ya no vale, el interceptor de
    // errores limpia el usuario y manda a /login; aqui no hay nada que hacer con
    // la respuesta, pero el error hay que absorberlo o queda sin gestionar.
    this.authService.isLoggedIn().subscribe({ error: () => { } })
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      DOMCompatibilityConfig.applyCompatibilityStyles();
    }, 200);
  }

  private async initializeApp(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      this.setupBackButtonHandler();
      if (Capacitor.getPlatform() === 'android') {
        // `Style.Dark` significa "texto claro para fondos oscuros". La barra usa
        // el color de marca (#003d53), asi que con `Style.Light` los iconos
        // salian oscuros sobre azul oscuro y no se leia la hora ni la bateria.
        // Es ademas lo que ya declara capacitor.config.ts.
        StatusBar.setStyle({ style: Style.Dark });

        this.configureAndroidPlatform();
      } else if (Capacitor.getPlatform() === 'ios') {
        StatusBar.setStyle({ style: Style.Dark });
      }
    }

  }

  setupBackButtonHandler() {
    CapacitorApp.addListener('backButton', (event) => {
      this.zone.run(() => {
        if (!event.canGoBack) {
          CapacitorApp.exitApp();
        } else {
          this.location.back();
        }
      });
    });
  }

  private configureAndroidPlatform(): void {
    this.setAndroidViewport();

    this.setAndroidStyles();

    this.androidCompatibilityService.initialize();
  }

  private setAndroidViewport(): void {
    if (isPlatformBrowser(this.platformId)) {
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', ANDROID_VIEWPORT_CONFIG.content);
      }
    }
  }

  private setAndroidStyles(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.add('platform-android');

      const style = document.createElement('style');
      style.textContent = `
        .platform-android {
          -webkit-transform: translateZ(0);
          transform: translateZ(0);
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
        }
        
        .platform-android video,
        .platform-android canvas {
          /* Asegurar que los elementos de video y canvas funcionen correctamente */
          -webkit-transform: translateZ(0);
          transform: translateZ(0);
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          /* Prevenir problemas de renderizado en Android */
          will-change: transform;
        }
        
        .platform-android .app-container {
          /* Asegurar que el contenedor principal no interfiera con elementos nativos */
          background: transparent;
        }
      `;
      document.head.appendChild(style);
    }
  }

  private async initializeCameraPermissions(): Promise<void> {
    try {
      await this.permissionDialogService.initializePermissions();
    } catch (error) {
      console.error('Error al inicializar permisos de cámara:', error);
    }
  }
}
