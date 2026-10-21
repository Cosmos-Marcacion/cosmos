import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { NgStyle } from '@angular/common';
import { AuthService } from './services/auth.services';
import { Router } from '@angular/router';
import { UserStateService } from '../../services/user-state.service';
import { PLATFORM_MODULES } from '../../constants/platform-modules.constant';
import { NotificationService } from '../../services/notification.service';
import { PASSWORD_HINT, password as passwordRule } from '../../validators/text-rules';

/** Segundos que hay que esperar para pedir otro codigo; lo mismo exige la API. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Mensaje de un error de la API para mostrarlo junto al formulario.
 *
 * Antes cualquier fallo al pedir el codigo salia como "Error al enviar el
 * codigo", sin decir si el correo no existia, si habia que esperar o si el
 * servicio de correo estaba caido (CKI18).
 */
function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'No se pudo conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.';
    }
    const message = err.error?.message;
    if (Array.isArray(message) && message.length) {
      return message[0];
    }
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
}

@Component({
  selector: 'app-auth',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NgStyle
  ],
  templateUrl: './auth.html',
  styleUrl: './auth.scss'
})
export default class Auth implements OnDestroy {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private userStateService = inject(UserStateService);
  private router = inject(Router);
  private notificationService = inject(NotificationService)

  viewMode = signal<'login' | 'forgot' | 'reset'>('login');

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  resetForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    newPassword: ['', [Validators.required, passwordRule]],
    confirmPassword: ['', [Validators.required]]
  });

  readonly passwordHint = PASSWORD_HINT;
  showPassword = signal(false);
  isLoading = signal(false);
  /** Error del ultimo envio, junto al formulario que lo produjo. */
  formError = signal('');
  /** Confirmacion del envio del codigo, en la pantalla de nueva contrasena. */
  info = signal('');
  resendIn = signal(0);
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  toggleShowPassword(): void {
    this.showPassword.update(v => !v);
  }

  setMode(mode: 'login' | 'forgot' | 'reset') {
    this.viewMode.set(mode);
    this.formError.set('');
    if (mode !== 'reset') {
      this.info.set('');
    }
    if (mode === 'reset' && this.form.value.email) {
      this.resetForm.patchValue({ email: this.form.value.email });
    }
  }

  login() {
    this.formError.set('');
    // Sin esto, pulsar Ingresar con los campos vacios no mostraba nada: los
    // mensajes solo salen en campos tocados (CKI12).
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.authService.login(this.form.value.email!, this.form.value.password!).subscribe({
      next: (res) => {
        if (!canUsePanel(res.role?.name, res.permissions ?? res.role?.permissions ?? [])) {
          this.notificationService.show('No tienes permisos para acceder a este sistema', 'error')
          this.router.navigate(['/login'])
          this.isLoading.set(false);
          return
        }
        this.userStateService.setUser(res);
        this.form.reset();
        this.router.navigate(['/']);
        this.isLoading.set(false);
      },
      error: (err) => {
        const status = err instanceof HttpErrorResponse ? err.status : -1;
        this.formError.set(
          status === 0
            ? apiMessage(err, '')
            : 'Correo o contraseña incorrectos. Revisa los datos o recupera tu contraseña.'
        );
        this.isLoading.set(false);
      }
    });
  }

  sendCode() {
    this.formError.set('');
    const emailControl = this.form.controls.email;
    const email = (emailControl.value ?? '').trim();
    if (!email || emailControl.invalid) {
      emailControl.markAsTouched();
      this.formError.set('Ingresa un correo válido.');
      return;
    }
    if (this.resendIn() > 0) {
      return;
    }

    this.isLoading.set(true);
    this.authService.sendPasswordCode(email).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.setMode('reset');
        this.info.set(res.message);
        this.startResendCooldown();
      },
      error: (err) => {
        this.isLoading.set(false);
        // El correo no registrado (404), la espera entre envios (429) y el
        // fallo del servicio de correo (503) se quedan en esta pantalla con su
        // propio mensaje; ninguno lleva a "Nueva contraseña" (CKI19).
        this.formError.set(apiMessage(err, 'No pudimos enviar el código. Inténtalo de nuevo en unos minutos.'));
      }
    });
  }

  /** Reenvio desde la pantalla de nueva contrasena, sin volver atras. */
  resendCode() {
    const email = this.resetForm.value.email || this.form.value.email;
    if (email) {
      this.form.patchValue({ email });
    }
    this.sendCode();
  }

  confirmReset() {
    this.formError.set('');
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      this.notificationService.show('Por favor completa todos los campos correctamente', 'error');
      return;
    }

    if (this.resetForm.value.newPassword !== this.resetForm.value.confirmPassword) {
      this.notificationService.show('Las contraseñas no coinciden', 'error');
      this.formError.set('Las contraseñas no coinciden.');
      return;
    }

    this.isLoading.set(true);
    const { email, code, newPassword } = this.resetForm.value;
    this.authService.resetPassword({ email, code, newPassword }).subscribe({
      next: (res) => {
        this.notificationService.show(res.message, 'success');
        this.form.reset();
        this.resetForm.reset();
        this.setMode('login');
        this.isLoading.set(false);
      },
      error: (err) => {
        this.formError.set(apiMessage(err, 'No se pudo restablecer la contraseña.'));
        this.isLoading.set(false);
      }
    });
  }

  private startResendCooldown() {
    this.stopResendCooldown();
    this.resendIn.set(RESEND_COOLDOWN_SECONDS);
    this.resendTimer = setInterval(() => {
      const next = this.resendIn() - 1;
      this.resendIn.set(Math.max(next, 0));
      if (next <= 0) {
        this.stopResendCooldown();
      }
    }, 1000);
  }

  private stopResendCooldown() {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.stopResendCooldown();
  }

  get email() {
    return this.form.get('email');
  }
  get password() {
    return this.form.get('password');
  }
  get code() {
    return this.resetForm.get('code');
  }
  get newPassword() {
    return this.resetForm.get('newPassword');
  }
  get confirmPassword() {
    return this.resetForm.get('confirmPassword');
  }
}

/**
 * Si una cuenta puede entrar al panel web.
 *
 * Antes solo entraban los perfiles llamados "Admin" o "Super", y un perfil
 * creado en Perfiles con otro nombre quedaba fuera aunque tuviera pantallas.
 * Ahora decide lo que el perfil abre, con dos excepciones:
 *  - "Admin" y "Super" entran siempre, tengan o no la lista de pantallas.
 *  - "User" es el perfil de las cuentas de la app del muelle y no entra: tiene
 *    Panel y Marcaciones porque la app usa esas rutas de la API, no porque
 *    deba abrir el panel.
 */
export function canUsePanel(roleName: string | undefined, permissions: string[]): boolean {
  if (roleName === 'Admin' || roleName === 'Super') return true;
  if (roleName === 'User') return false;
  return PLATFORM_MODULES.some((module) => permissions.includes(module.key));
}
