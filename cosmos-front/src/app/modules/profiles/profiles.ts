import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RolesService } from '../users/services/roles.service';
import { IPlatformModule, IRoleResponse } from '../users/interfaces/user.interface';
import { NotificationService } from '../../services/notification.service';
import { UserStateService } from '../../services/user-state.service';
import { ConfirmationService } from '../../services/confirmation.service';

/** Lo que se está editando. `null` significa que no hay ficha abierta. */
interface Draft {
  _id: string | null;
  name: string;
  description: string;
  permissions: string[];
  active: boolean;
}

/**
 * Perfiles de usuario.
 *
 * Un perfil es un nombre y una lista de módulos que puede abrir. Sustituye a
 * los tres roles fijos —`Super`, `Admin`, `User`— cuyo acceso estaba escrito en
 * el código: dar permiso a alguien para una sola pantalla obligaba a tocar un
 * controlador y desplegar.
 *
 * Los módulos son exactamente las opciones del menú, y eso es deliberado. Un
 * permiso que no se corresponda con algo que el usuario ve no lo sabe explicar
 * nadie: «puede entrar en Marcaciones» se entiende; «tiene entries.read» no.
 *
 * El catálogo lo sirve el backend, que es quien decide si deja pasar. Con una
 * lista escrita aquí se podría conceder un permiso que la API no reconoce, y el
 * fallo aparecería como una pantalla que no abre sin decir por qué.
 */
@Component({
  selector: 'app-profiles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profiles.html',
  styleUrl: './profiles.scss',
})
export default class Profiles {
  private readonly roles = inject(RolesService);
  private readonly notification = inject(NotificationService);
  private readonly users = inject(UserStateService);
  private readonly confirmation = inject(ConfirmationService);

  readonly profiles = signal<IRoleResponse[]>([]);
  readonly modules = signal<IPlatformModule[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly draft = signal<Draft | null>(null);

  /** El perfil con el que está entrando quien mira la pantalla. */
  private readonly ownRole = computed(() => this.users.getUser()?.role?._id ?? '');

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    // El interceptor ya avisa del fallo con el mensaje de la API; repetirlo
    // aqui sacaba dos avisos por el mismo error.
    this.roles.getModules().subscribe({
      next: modules => this.modules.set(modules),
    });
    this.roles.getRoles().subscribe({
      next: profiles => {
        this.profiles.set(profiles);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Los módulos de un perfil, con su nombre legible. */
  labelsOf(profile: IRoleResponse): string {
    const keys = profile.permissions ?? [];
    if (keys.length === 0) {
      return 'Sin acceso a ninguna pantalla';
    }
    if (keys.length === this.modules().length) {
      return 'Todas las pantallas';
    }
    return this.modules()
      .filter(module => keys.includes(module.key))
      .map(module => module.label)
      .join(' · ');
  }

  /**
   * Si este es el perfil de quien está mirando.
   *
   * Se marca para que nadie se quite a sí mismo el acceso a Perfiles y se
   * quede sin poder volver a entrar a arreglarlo.
   */
  isOwn(profile: IRoleResponse): boolean {
    return profile._id === this.ownRole();
  }

  // --- edición ----------------------------------------------------------------

  newProfile() {
    // Nace sin permisos: un perfil que lo abriera todo por descuido es el
    // error caro; uno que no abre nada se nota al primer intento.
    this.draft.set({ _id: null, name: '', description: '', permissions: [], active: true });
  }

  edit(profile: IRoleResponse) {
    this.draft.set({
      _id: profile._id,
      name: profile.name,
      description: profile.description ?? '',
      permissions: [...(profile.permissions ?? [])],
      active: profile.active !== false,
    });
  }

  close() {
    this.draft.set(null);
  }

  setName(value: string) {
    this.draft.update(draft => (draft ? { ...draft, name: value } : draft));
  }

  setDescription(value: string) {
    this.draft.update(draft => (draft ? { ...draft, description: value } : draft));
  }

  setActive(value: boolean) {
    this.draft.update(draft => (draft ? { ...draft, active: value } : draft));
  }

  has(key: string): boolean {
    return this.draft()?.permissions.includes(key) ?? false;
  }

  toggle(key: string) {
    this.draft.update(draft => {
      if (!draft) return draft;
      const permissions = draft.permissions.includes(key)
        ? draft.permissions.filter(entry => entry !== key)
        : [...draft.permissions, key];
      return { ...draft, permissions };
    });
  }

  all() {
    this.draft.update(draft =>
      draft ? { ...draft, permissions: this.modules().map(module => module.key) } : draft
    );
  }

  none() {
    this.draft.update(draft => (draft ? { ...draft, permissions: [] } : draft));
  }

  /**
   * Aviso al quitarse a uno mismo el acceso a Perfiles.
   *
   * No se impide: puede haber otro administrador, y bloquearlo sería adivinar.
   * Pero es el único cambio de esta pantalla que se deja a uno fuera de la
   * pantalla, y conviene decirlo antes de guardar y no después.
   */
  readonly lockingSelf = computed(() => {
    const draft = this.draft();
    if (!draft?._id || draft._id !== this.ownRole()) {
      return false;
    }
    return !draft.permissions.includes('perfiles');
  });

  save() {
    const draft = this.draft();
    if (!draft || !draft.name.trim()) {
      this.notification.show('El perfil necesita un nombre', 'error');
      return;
    }

    const body = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      permissions: draft.permissions,
      active: draft.active,
    };

    this.saving.set(true);
    const request = draft._id
      ? this.roles.update(draft._id, body)
      : this.roles.create(body);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.close();
        this.load();
        this.notification.show(
          draft._id ? 'Perfil actualizado' : 'Perfil creado',
          'success'
        );
      },
      error: () => this.saving.set(false),
    });
  }

  /**
   * Borra el perfil tras confirmarlo. Antes bastaba un clic, sin vuelta atras.
   * Si hay usuarios con el perfil, la API lo rechaza y el interceptor lo avisa.
   */
  remove(profile: IRoleResponse) {
    this.confirmation.show(
      `¿Eliminar el perfil "${profile.name}"?`,
      () => {
        this.roles.remove(profile._id).subscribe({
          next: () => {
            this.load();
            this.notification.show('Perfil eliminado', 'success');
          },
        });
      },
      { confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true }
    );
  }
}
