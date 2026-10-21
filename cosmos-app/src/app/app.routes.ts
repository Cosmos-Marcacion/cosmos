import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { authGuard } from './guards/auth.guard';
import { noAuthGuard } from './guards/no-auth.guard';
import { internalNavigationGuard } from './guards/internal-navigation.guard';
import { employeeDetailBackGuard } from './guards/employee-detail-back.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./modules/auth/auth'),
    canActivate: [noAuthGuard],
  },
  {
    path: 'qr',
    loadComponent: () => import('./modules/clock/qr/qr'),
  },
  {
    path: 'dni',
    loadComponent: () => import('./modules/clock/dni/dni'),
  },
  {
    path: 'dni-scan',
    loadComponent: () => import('./modules/clock/dni-scan/dni-scan'),
  },
  {
    path: 'face/:id',
    loadComponent: () => import('./components/face/face'),
  },
  {
    path: 'signature/:id',
    loadComponent: () => import('./components/sign/sign'),
  },

  {
    path: 'face-mark',
    loadComponent: () => import('./components/face-mark/face-mark'),
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'validacion-registro/:id',
        loadComponent: () =>
          import('./components/register-validation/register-validation'),
        title: 'Marcación',
        canActivate: [internalNavigationGuard],
      },
      {
        path: 'inicio',
        loadComponent: () => import('./modules/home/home'),
        title: 'Checkin Cosmos',
      },
      {
        path: 'detalle-empleado/:id/:staffTransmissionId/:date',
        loadComponent: () =>
          import('./modules/home/employee-detail/employee-detail'),
        title: 'Detalle de empleado',
        canDeactivate: [employeeDetailBackGuard],
      },
      {
        path: 'registro',
        loadComponent: () =>
          import('./modules/employee-register/employee-register'),
        title: 'Registro',
      },
      {
        path: 'registro/:id',
        loadComponent: () =>
          import('./modules/employee-register/employee-register'),
        title: 'Registro',
      },
      {
        path: 'marcacion',
        loadComponent: () => import('./modules/clock/clock'),
        title: 'Marcación',
      },
      {
        path: 'capacitaciones',
        loadComponent: () => import('./modules/talks/talks'),
        title: 'Capacitaciones',
      },
      {
        path: 'capacitaciones/agregar',
        loadComponent: () => import('./modules/talks/add-talk/add-talk'),
        title: 'Agregar Capacitación',
      },
      {
        path: 'capacitaciones/agregar/:id',
        loadComponent: () => import('./modules/talks/add-talk/add-talk'),
        title: 'Editar Capacitación',
      },
      {
        path: 'capacitaciones/asistentes/:id/:workerDate/:turn',
        loadComponent: () => import('./modules/talks/assistants/assistants'),
        title: 'Asistentes',
      },
      {
        path: 'fingerprint',
        loadComponent: () => import('./modules/fingerprint/fingerprint'),
        title: 'Fingerprint',
      },
      {
        path: 'fingerprint-register/:id',
        loadComponent: () => import('./modules/fingerprint-register/fingerprint-register'),
        title: 'Fingerprint Register',
      },
      {
        path: '**',
        redirectTo: 'inicio',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
