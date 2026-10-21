import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { moduleGuard } from './guards/module.guard';
import { unsavedChangesGuard } from './guards/unsaved-changes.guard';
import { altaOEdicion } from './resolvers/alta-o-edicion.resolver';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./modules/auth/auth'),
  },
  {
    // Manual de uso del panel y de la app. Público y fuera del armazón: quien
    // todavía no puede entrar es quien más lo necesita, y no enseña datos de
    // la operación, solo cómo se usa.
    path: 'manual',
    title: 'Manual de uso',
    loadComponent: () => import('./modules/manual/manual'),
  },
  {
    path: 'manual/:tema',
    title: 'Manual de uso',
    loadComponent: () => import('./modules/manual/manual'),
  },
  {
    // Vista de impresión del formato de una nombrada. Va fuera del layout
    // principal a propósito: dentro, el menú lateral y la cabecera salían en la
    // hoja, y el contenedor con scroll recortaba la impresión a la primera
    // pantalla. Aquí solo hay una barra (que no se imprime) y las hojas A4.
    path: 'formatos/imprimir/:staffTransmissionId',
    canActivate: [moduleGuard('marcaciones')],
    title: 'Formato',
    loadComponent: () => import('./modules/formats/format-print/format-print'),
  },
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: 'panel',
        canActivate: [moduleGuard('panel')],
        title: 'Panel',
        loadComponent: () => import('./modules/dashboard/dashboard'),
      },
      {
        // Los perfiles deciden que puede abrir cada usuario. Va junto a
        // Usuarios porque se configuran a la vez: se crea el perfil y se
        // asigna.
        path: 'perfiles',
        canActivate: [moduleGuard('perfiles')],
        title: 'Perfiles',
        loadComponent: () => import('./modules/profiles/profiles'),
      },
      {
        path: 'usuarios',
        canActivate: [moduleGuard('usuarios')],
        title: 'Usuarios',
        loadComponent: () => import('./modules/users/users'),
      },
      {
        // La vista principal de marcaciones es ahora por nombrada: agrupa el
        // personal, su capacitación y la emisión del formato en un solo sitio.
        path: 'marcaciones',
        canActivate: [moduleGuard('marcaciones')],
        title: 'Marcaciones',
        loadComponent: () => import('./modules/entries/named-board/named-board'),
      },
      {
        // Detalle completo de una nombrada: personal, marcaciones,
        // responsables, capacitación y formatos emitidos.
        path: 'marcaciones/nombrada/:staffTransmissionId',
        canActivate: [moduleGuard('marcaciones')],
        title: 'Nombrada',
        loadComponent: () => import('./modules/entries/named-detail/named-detail'),
      },
      {
        path: 'marcaciones/listado',
        canActivate: [moduleGuard('marcaciones')],
        title: 'Marcaciones por trabajador',
        loadComponent: () => import('./modules/entries/entries'),
      },
      {
        path: 'marcaciones/agregar',
        canActivate: [moduleGuard('marcaciones')],
        title: altaOEdicion('marcación'),
        loadComponent: () => import('./modules/entries/add-entry/add-entry'),
      },
      {
        path: 'marcaciones/agregar/:id',
        canActivate: [moduleGuard('marcaciones')],
        title: altaOEdicion('marcación'),
        loadComponent: () => import('./modules/entries/add-entry/add-entry'),
      },
      {
        path: 'usuarios/agregar',
        canActivate: [moduleGuard('usuarios')],
        title: altaOEdicion('usuario'),
        loadComponent: () => import('./modules/users/add-user/add-user'),
      },
      {
        path: 'usuarios/agregar/:id',
        canActivate: [moduleGuard('usuarios')],
        title: altaOEdicion('usuario'),
        loadComponent: () => import('./modules/users/add-user/add-user'),
      },
      {
        path: 'puertos',
        canActivate: [moduleGuard('puertos')],
        title: 'Puertos',
        loadComponent: () => import('./modules/ports/ports'),
      },
      {
        path: 'puertos/agregar',
        canActivate: [moduleGuard('puertos')],
        title: altaOEdicion('puerto'),
        loadComponent: () => import('./modules/ports/add-port/add-port'),
      },
      {
        path: 'puertos/agregar/:id',
        canActivate: [moduleGuard('puertos')],
        title: altaOEdicion('puerto'),
        loadComponent: () => import('./modules/ports/add-port/add-port'),
      },
      {
        path: 'puntos',
        canActivate: [moduleGuard('puntos')],
        title: 'Puntos de marcación',
        loadComponent: () => import('./modules/points/points'),
      },
      {
        path: 'puntos/agregar',
        canActivate: [moduleGuard('puntos')],
        title: altaOEdicion('punto'),
        loadComponent: () => import('./modules/points/add-point/add-point'),
      },
      {
        path: 'puntos/agregar/:id',
        canActivate: [moduleGuard('puntos')],
        title: altaOEdicion('punto'),
        loadComponent: () => import('./modules/points/add-point/add-point'),
      },
      {
        // La capacitación es ahora un dato de la nombrada y se registra en su
        // detalle, junto al personal que la recibe y al formato que la imprime.
        // El módulo suelto de /capacitaciones ya no existe; sus enlaces
        // guardados llevan al listado de nombradas.
        //
        // El comodín va como hijo a propósito: `**` solo funciona cuando es la
        // ruta entera, así que `capacitaciones/**` no cazaría nada, y un
        // `redirectTo` por prefijo arrastraría los segmentos que sobran
        // (`/capacitaciones/agregar` acabaría pidiendo `/marcaciones/agregar`).
        path: 'capacitaciones',
        children: [{ path: '**', redirectTo: '/marcaciones' }],
      },
      {
        path: 'marcaciones/ver/:employeeId/:workerDate/:namedId',
        canActivate: [moduleGuard('marcaciones')],
        title: 'Detalle de empleado',
        loadComponent: () => import('./modules/entries/view-entries/view-entries'),
      },
      {
        // El maestro edita la definicion del documento, no los datos de una
        // jornada. Lo publicado es lo que emite los formatos.
        path: 'formatos/maestro',
        canActivate: [moduleGuard('formatos')],
        // Aquí se edita un documento entero antes de guardar nada: salir sin
        // avisar tira el trabajo y el servidor sigue con la versión de antes.
        canDeactivate: [unsavedChangesGuard],
        title: 'Maestro de formatos',
        loadComponent: () => import('./modules/formats/format-master/format-master'),
      },
      {
        path: 'generador',
        canActivate: [moduleGuard('generador')],
        title: 'Generador',
        loadComponent: () => import('./modules/generator/generator'),
      },
      {
        path: 'sincronizar-empleados',
        canActivate: [moduleGuard('sincronizar-empleados')],
        title: 'Sincronizar empleados',
        loadComponent: () => import('./modules/sync-employees/sync-employees'),
      },
      {
        path: '**',
        redirectTo: 'panel',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
