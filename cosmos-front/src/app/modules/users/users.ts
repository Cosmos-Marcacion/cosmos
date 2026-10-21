import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataComponent } from '../../components/data/data.component';
import { UsersService } from './services/users.service';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { IUserResponse } from './interfaces/user.interface';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService } from '../../services/confirmation.service';
import { IResponse } from '../../interfaces/response.interface';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { ExcelService } from '../../services/excel.service';
import { ExcelDownloadConfig } from '../../components/excel-download/excel-download.component';

@Component({
  selector: 'app-users',
  imports: [CommonModule, DataComponent, FormsModule],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export default class Users {
  private usersService = inject(UsersService);
  private userStateService = inject(UserStateService);
  private router = inject(Router);
  private confirmationService = inject(ConfirmationService);
  private notificationService = inject(NotificationService);
  private excelService = inject(ExcelService);
  users: IUserResponse[] = [];
  usersTemp: IUserResponse[] = [];
  headers: IHeaderList[] = [
    {
      header: 'Nombre',
      value: 'name',
    },
    {
      header: 'Email',
      value: 'email',
    },
    {
      header: 'Rol',
      value: 'role',
    },
    {
      header: 'Acciones',
      value: 'actions',
      options: ['edit', 'delete'],
    },
  ];
  total: number = 0;
  page: number = 1;
  limit: number = 10;

  showExcelDownload: boolean = true;
  searchTerm: string = '';
  loading: boolean = false;
  error: string = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.getUsers();
  }

  getUsers(search: string = '') {
    const user = this.userStateService.getUser();
    // `role?.name` y no `role.name`: la interrogacion estaba solo en `user`,
    // asi que una sesion sin perfil resuelto lanzaba aqui. El error cae en
    // `ngOnInit` y se lleva por delante la pasada de deteccion entera: no se
    // quedaba en blanco esta pantalla, se quedaba tambien el menu lateral.
    if (user?.role?.name === 'Super') {
      this.getUsersWithSuper(search);
    } else {
      this.getUsersExceptSuper(search);
    }
  }

  getUsersExceptSuper(search: string = '') {
    this.loading = true;
    this.error = '';
    this.usersService
      .getUsersExceptSuper(this.limit, this.page, search)
      .subscribe({
        next: (users) => {
          this.loading = false;
          this.assignUser(users);
        },
        error: () => {
          this.loading = false;
          this.error = 'No se pudo cargar la lista de usuarios.';
        },
      });
  }

  getUsersWithSuper(search: string = '') {
    this.loading = true;
    this.error = '';
    this.usersService
      .getUsers(this.limit, this.page, search)
      .subscribe({
        next: (users) => {
          this.loading = false;
          this.assignUser(users);
        },
        error: () => {
          this.loading = false;
          this.error = 'No se pudo cargar la lista de usuarios.';
        },
      });
  }

  assignUser(users: IResponse<IUserResponse[]>) {
    this.users = users.data;
    this.usersTemp = users.data;
    this.total = users.total;
    this.page = users.page;
    this.limit = users.limit;
  }

  pageChange(page: number) {
    this.page = page;
    this.getUsers(this.searchTerm);
  }

  /** Busca al dejar de escribir: antes salia una peticion por tecla. */
  searchUsers(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.searchTerm = value;
      this.page = 1;
      this.getUsers(value);
    }, 300);
  }

  retry() {
    this.getUsers(this.searchTerm);
  }

  clickOptions(option: string, _id: string) {
    if (option === 'edit') {
      this.editUser(_id);
    } else if (option === 'delete') {
      this.deleteUser(_id);
    }
  }

  addUser() {
    this.router.navigate(['/usuarios/agregar']);
  }

  editUser(id: string) {
    this.router.navigate(['/usuarios/agregar', id]);
  }

  deleteUser(id: string) {
    const user = this.userStateService.getUser();
    if (user?._id === id) {
      this.notificationService.show(
        'No puedes eliminar tu propio usuario',
        'error'
      );
      return;
    }
    this.confirmationService.show(
      '¿Estás seguro de querer eliminar este usuario?',
      () => {
        this.usersService.deleteUser(id).subscribe(() => {
          // Se conserva la busqueda y, si era el ultimo de la pagina, se
          // vuelve a la anterior en vez de mostrar una pagina vacia.
          if (this.users.length === 1 && this.page > 1) {
            this.page--;
          }
          this.getUsers(this.searchTerm);
        });
      }
    );
  }

  getExcelConfig(): ExcelDownloadConfig {
    return {
      title: 'Reporte de Usuarios',
      filters: {
        Búsqueda: this.searchTerm || '-',
      },
      data: this.users,
      headers: this.headers
        .filter((header) => header.value && header.value !== 'actions')
        .map((header) => ({
          header: header.header,
          value: header.value!,
        })),
      fileName: 'Reporte_Usuarios',
    };
  }

  async onExcelDownload(config: ExcelDownloadConfig) {
    await this.excelService.downloadExcel(config);
  }
}
