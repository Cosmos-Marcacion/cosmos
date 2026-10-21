import { Component, inject, ChangeDetectionStrategy, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UsersService } from '../services/users.service';
import { RolesService } from '../services/roles.service';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  IUser,
  IUserResponse,
  IRoleResponse,
} from '../interfaces/user.interface';
import { NotificationService } from '../../../services/notification.service';
import {
  PASSWORD_HINT,
  emailAddress,
  password as passwordRule,
  personName,
  requiredTrimmed,
} from '../../../validators/text-rules';

/** Lo mismo que admite `POST/PATCH /user` para la imagen. */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-add-user',
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './add-user.html',
  styleUrl: './add-user.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AddUser implements OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private usersService = inject(UsersService);
  private rolesService = inject(RolesService);
  private formBuilder = inject(FormBuilder);
  private notificationService = inject(NotificationService);

  id: string = this.route.snapshot.params['id'];
  // Signals y no campos sueltos: el componente es OnPush en una app sin zone.js,
  // y asignar `this.roles` dentro del subscribe no marcaba la vista. El
  // desplegable se quedaba en "Seleccione un rol" hasta el primer blur.
  roles = signal<IRoleResponse[]>([]);
  rolesState = signal<'loading' | 'ready' | 'error'>('loading');
  saving = signal(false);
  readonly passwordHint = PASSWORD_HINT;
  private originalUser: IUserResponse | null = null;
  selectedFile: File | null = null;
  previewUrl = signal<string | null>(null);

  form = this.formBuilder.group({
    name: ['', [requiredTrimmed, personName]],
    email: ['', [requiredTrimmed, emailAddress]],
    password: ['', [Validators.required, passwordRule]],
    roleId: ['', Validators.required],
  });

  goBack() {
    this.router.navigate(['/usuarios']);
  }

  ngOnInit() {
    this.getRoles();
    if (this.id) {
      this.getUser();
      // En edicion la contrasena no se pide (quien edita no la sabe), pero si
      // se escribe una, cumple la politica.
      this.form.get('password')?.setValidators(passwordRule);
      this.form.get('password')?.updateValueAndValidity();
      this.form.get('email')?.disable();
    }
  }

  getRoles() {
    this.rolesState.set('loading');
    this.rolesService.getAssignableRoles().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.rolesState.set('ready');
      },
      error: () => this.rolesState.set('error'),
    });
  }

  getUser() {
    this.usersService.getUser(this.id).subscribe((user) => {
      this.form.patchValue({
        name: user.name,
        email: user.email,
        // `save()` ya lee `user.role?._id` con la comprobacion puesta; aqui
        // faltaba, y un usuario sin perfil resuelto dejaba la pantalla en
        // blanco con un TypeError en vez de un desplegable vacio.
        roleId: user.role?._id,
      });
      this.originalUser = user;
      if (user.image) {
        this.previewUrl.set(user.image);
      }
    });
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) {
      return;
    }
    if (this.id) {
      const updateData: Partial<IUser> = {};
      const formRawValue = this.form.getRawValue();

      const name = (formRawValue.name ?? '').trim();
      if (name !== this.originalUser?.name) {
        updateData.name = name || undefined;
      }

      if (formRawValue.roleId !== this.originalUser?.role?._id) {
        updateData.roleId = formRawValue.roleId || undefined;
      }

      const hasImage = !!this.selectedFile;
      if (Object.keys(updateData).length > 0 || hasImage) {
        const formData = new FormData();
        Object.entries(updateData).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });
        if (this.selectedFile) {
          formData.append('image', this.selectedFile);
        }
        this.saving.set(true);
        this.usersService.updateUserFormData(this.id, formData).subscribe({
          next: () => {
            this.saving.set(false);
            this.notificationService.show(
              'Usuario actualizado correctamente',
              'success'
            );
            this.router.navigate(['/usuarios']);
          },
          // El interceptor ya muestra el mensaje de la API; repetirlo aqui daba dos avisos.
          error: () => this.saving.set(false),
        });
      } else {
        this.notificationService.show(
          'No hay cambios para actualizar',
          'success'
        );
      }
    } else {
      const formData = new FormData();
      const formValue = this.form.value;
      formData.append('name', (formValue.name ?? '').trim());
      formData.append('email', (formValue.email ?? '').trim());
      formData.append('password', formValue.password as string);
      formData.append('roleId', formValue.roleId as string);
      if (this.selectedFile) {
        formData.append('image', this.selectedFile);
      }
      this.saving.set(true);
      this.usersService.createUserFormData(formData).subscribe({
        next: () => {
          this.saving.set(false);
          this.notificationService.show(
            'Usuario creado correctamente',
            'success'
          );
          this.router.navigate(['/usuarios']);
        },
        // El interceptor ya muestra el mensaje de la API; repetirlo aqui daba dos avisos.
        error: () => this.saving.set(false),
      });
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    // La API solo admite JPG, PNG y GIF de hasta 5 MB. Con `image/*` se podia
    // elegir un WEBP o un SVG y el fallo llegaba al pulsar GUARDAR.
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      input.value = '';
      this.notificationService.show('Formato de imagen no soportado. Usa JPG, PNG o GIF.', 'error');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      input.value = '';
      this.notificationService.show('La imagen no puede pasar de 5 MB.', 'error');
      return;
    }
    this.selectedFile = file;
    this.revokePreview();
    this.previewUrl.set(URL.createObjectURL(file));
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  private revokePreview() {
    const url = this.previewUrl();
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  get name() {
    return this.form.get('name');
  }

  get email() {
    return this.form.get('email');
  }

  get password() {
    return this.form.get('password');
  }

  get roleId() {
    return this.form.get('roleId');
  }
}
