import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from './services/auth.services';
import { Router } from '@angular/router';
import { UserStateService } from '../../services/user-state.service';
import { Icon } from '../../components/icon/icon';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Auth {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly userStateService = inject(UserStateService);
  private readonly router = inject(Router);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly isPasswordVisible = signal(false);
  /** Evita el doble envio y da algo que mirar mientras responde el servidor. */
  readonly submitting = signal(false);

  togglePasswordVisibility(): void {
    this.isPasswordVisible.update(visible => !visible);
  }

  /**
   * Envio del formulario.
   *
   * Se dispara desde `(ngSubmit)` y no desde el `(click)` del boton. Con el
   * `(click)` de antes, pulsar Enter en un campo enviaba el formulario pero no
   * llamaba a `login()`: parecia que la aplicacion se habia quedado colgada.
   *
   * Ademas se marcan los campos como tocados antes de validar. Sin eso, pulsar
   * "Ingresar" con el formulario vacio no mostraba ningun error y aun asi se
   * enviaba la peticion con el correo y la clave en blanco.
   */
  login() {
    if (this.submitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.authService.login(this.form.value.email!, this.form.value.password!).subscribe({
      next: res => {
        this.userStateService.setUser(res);
        this.router.navigate(['/']);
      },
      // El aviso al usuario lo pone el interceptor de errores; aqui solo hay que
      // absorber el error para que no quede sin gestionar y soltar el boton.
      error: () => this.submitting.set(false),
    });
  }

  get email() {
    return this.form.get('email');
  }

  get password() {
    return this.form.get('password');
  }
}
