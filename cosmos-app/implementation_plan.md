# Plan de Implementación — Agendado+ Plataforma Completa

> **Scope:** 55 historias de usuario · 24 colecciones MongoDB · Kit UI · Mobile · CI/CD
> **Stack:** Angular 21 · NestJS 11 · MongoDB 7 · TailwindCSS 3 · Capacitor 8

---

## User Review Required

> [!IMPORTANT]
> Este plan es extenso. Cada fase se puede ejecutar de forma independiente y está diseñada para ser un incremento funcional demostrable. **Solicito tu aprobación** para proceder con **Fase 1** primero, y luego avanzar secuencialmente.

> [!WARNING]
> - Las integraciones con pasarelas de pago (Stripe/MercadoPago) y video (Twilio/Daily.co) requieren cuentas y API keys configuradas previamente.
> - La integración con Google OAuth requiere un proyecto en Google Cloud Console con OAuth 2.0 configurado.

---

## Resumen de Fases

| Fase | Nombre | Sprints | HUs cubiertas | Prioridad |
|------|--------|---------|---------------|-----------|
| 1 | Base de Datos + Schemas Mongoose | Sprint 1 | — (infraestructura) | 🔴 |
| 2 | Tenants, Usuarios, Roles y Permisos (RBAC) | Sprint 1 | HU-ADM-001, HU-ADM-002, HU-ADM-009 | 🔴 |
| 3 | Autenticación JWT + Google OAuth | Sprint 1 | HU-PAC-013 | 🔴 |
| 4 | Layout, Kit UI y Responsive Mobile-First | Sprint 1-2 | — (infraestructura) | 🔴 |
| 5 | Configuración Mobile (Capacitor iOS/Android) | Sprint 2 | — (infraestructura) | 🔴 |
| 6 | Pruebas Unitarias, ESLint y SonarQube | Continuo | — (calidad) | 🔴 |
| 7 | Agendamiento Core | Sprint 2-3 | HU-PAC-001 a 007, HU-DOC-001 a 004, HU-DOC-008 | 🔴 |
| 8 | Historia Clínica + Recetas | Sprint 3-4 | HU-DOC-005 a 007, HU-DOC-011, HU-DOC-012 | 🔴 |
| 9 | Pagos + Finanzas | Sprint 4-5 | HU-PAC-008 a 010, HU-ADM-003, HU-ADM-005, HU-ADM-010 | 🔴 |
| 10 | Notificaciones + Campañas | Sprint 5 | HU-PAC-012, HU-ADM-007 | 🔴 |
| 11 | Funcionalidades Innovadoras | Sprint 6+ | HU-INN-001 a 020 | 🟡/🟢 |

---

## Fase 1: Base de Datos — Schemas Mongoose (24 colecciones)

### Backend

#### [NEW] `backend/src/common/schemas/base.schema.ts`
- Clase base con `tenant_id`, `created_at`, `updated_at` y plugin de timestamps.

#### [NEW] `backend/src/modules/tenants/schemas/tenant.schema.ts`
- Schema para colección `tenants` con subdocumento `config` (payment_policy, slot_lock_seconds, etc.).

#### [NEW] `backend/src/modules/users/schemas/user.schema.ts`
- Schema `users` con roles array, preferences embedded, device_tokens, indexes compound con `tenant_id`.

#### [NEW] `backend/src/modules/locations/` (module completo)
- Schema `locations` + controller + service + DTOs.

#### [NEW] `backend/src/modules/specialties/` (module completo)
- Schema `specialties` + controller + service + DTOs.

#### [NEW] `backend/src/modules/doctor-profiles/schemas/doctor-profile.schema.ts`
- Schema con `specialty_ids`, `location_ids`, `commission_pct`, `modalities`, `slug`.

#### [NEW] `backend/src/modules/doctor-documents/schemas/doctor-document.schema.ts`
- Schema con `validation_status`, `expires_at`.

#### [NEW] `backend/src/modules/schedules/schemas/schedule.schema.ts`
- Disponibilidad semanal recurrente por doctor/sede.

#### [NEW] `backend/src/modules/schedule-exceptions/schemas/schedule-exception.schema.ts`
- Excepciones (vacaciones, bloqueos manuales).

#### [NEW] `backend/src/modules/appointments/schemas/appointment.schema.ts`
- Schema core con todos los campos de estado, modalidad, triage, check-in.

#### [NEW] `backend/src/modules/slot-locks/schemas/slot-lock.schema.ts`
- TTL collection con `expires_at`.

#### [NEW] Schemas restantes
- `reschedule-requests`, `payments`, `payment-plans`, `medical-records`, `prescriptions`, `lab-results`, `patient-files`, `consents`, `consent-templates`, `notifications`, `campaigns`, `reviews`, `loyalty-ledger`, `waitlist`.

#### [NEW] `backend/src/common/constants/`
- `roles.constant.ts`: enum de roles (`patient`, `doctor`, `receptionist`, `cashier`, `admin`, `superadmin`)
- `appointment-status.constant.ts`: enum de estados de cita.
- `payment-status.constant.ts`: enum de estados de pago.

#### [NEW] `shared/types/` y `shared/enums/`
- Tipos TypeScript compartidos: `appointment.types.ts`, `user.types.ts`, `payment.types.ts`, `tenant.types.ts`.
- Enums compartidos: `appointment-status.enum.ts`, `user-role.enum.ts`, `payment-status.enum.ts`.

---

## Fase 2: Tenants, Usuarios, Roles y Permisos (RBAC)

### Backend

#### [MODIFY] `backend/src/modules/tenants/`
- CRUD completo de tenants con validación de `tax_id` unique.
- Endpoint de configuración (`PATCH /tenants/:id/config`).

#### [NEW] `backend/src/common/middleware/tenant.middleware.ts`
- Resuelve `tenant_id` desde header `X-Tenant-Id`, subdomain o custom domain.
- Inyecta `tenant_id` en el request para todos los módulos downstream.

#### [NEW] `backend/src/common/guards/tenant.guard.ts`
- Valida que el tenant esté activo.

#### [MODIFY] `backend/src/modules/users/`
- CRUD completo con filtros por rol, estado, búsqueda.
- Endpoint de bloqueo/desbloqueo con `block_reason`.
- Matriz de permisos RBAC por rol.

#### [NEW] `backend/src/common/guards/roles.guard.ts`
- Guard que valida roles del usuario contra los requeridos por el endpoint.

#### [NEW] `backend/src/common/decorators/`
- `@CurrentTenant()`: extrae tenant del request.
- `@CurrentUser()`: extrae usuario del JWT.
- `@Roles('admin', 'doctor')`: define roles requeridos.

#### [MODIFY] `backend/src/modules/locations/`
- CRUD con validación de citas futuras al desactivar.
- Constraint: al menos 1 sede activa por tenant.

#### [NEW] `backend/src/modules/specialties/`
- CRUD con soporte para catálogo global (`tenant_id: null`) y por tenant.

### Frontend

#### [NEW] `frontend/src/app/features/admin/users/`
- Página de gestión de usuarios con tabla, filtros y formulario de creación/edición.

#### [NEW] `frontend/src/app/features/admin/locations/`
- CRUD de sedes con mapa interactivo (Google Maps).

#### [NEW] `frontend/src/app/features/admin/settings/`
- Configuración general del tenant (secciones: General, Pagos, Agendamiento, Fidelización).

---

## Fase 3: Autenticación JWT + Google OAuth

### Backend

#### [MODIFY] `backend/src/modules/auth/`
- **Login** con email + password (bcrypt hash).
- **Registro** con verificación de email (OTP).
- **JWT Strategy**: Access token (15min) + Refresh token (7d).
- **Google Strategy** (`passport-google-oauth20`).
- **Forgot password** con OTP por email.
- **Account lockout**: 5 intentos fallidos → bloqueo temporal.

#### [NEW] `backend/src/modules/auth/strategies/`
- `jwt.strategy.ts`: valida access token.
- `local.strategy.ts`: valida email+password.
- `google.strategy.ts`: OAuth 2.0 flow.
- `jwt-refresh.strategy.ts`: valida refresh token.

#### [NEW] `backend/src/common/interceptors/auth.interceptor.ts`
- Adjunta `tenant_id` a cada request autenticado.

### Frontend

#### [NEW] `frontend/src/app/core/auth/`
- `auth.service.ts`: login, register, refresh, Google OAuth.
- `auth.guard.ts`: protege rutas autenticadas.
- `role.guard.ts`: protege rutas por rol.
- `auth.interceptor.ts`: adjunta JWT a cada HTTP request.
- `token.service.ts`: manejo de tokens en localStorage/cookies.

#### [NEW] `frontend/src/app/features/public/login/`
- Página de login con formulario email+pass + botón "Continuar con Google".

#### [NEW] `frontend/src/app/features/public/register/`
- Formulario de registro con verificación OTP.

---

## Fase 4: Layout, Kit UI y Responsive Mobile-First

### Frontend

#### [MODIFY] `frontend/tailwind.config.js`
- Tokens del Kit UI: colores `#23125B`, `#7209B7`, gradientes `#4CC9F0` → `#4361EE`.
- Breakpoints: `xs: 375px`, `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`.
- Font family: Inter (Google Fonts).

#### [MODIFY] `frontend/src/styles/`
- `_variables.scss`: CSS custom properties base con dark mode support.
- `_theme.scss`: mixins para theming dinámico por tenant.
- `_typography.scss`: escalas tipográficas responsive.
- `_components.scss`: Tailwind `@layer components` con `.btn-primary`, `.btn-secondary`, `.card`, `.input-field`, badges.

#### [NEW] `frontend/src/app/shared/components/`
- `button/`: componente reutilizable (primario, secundario, acento, ghost, sizes).
- `modal/`: modal con backdrop, animaciones, sizes.
- `data-table/`: tabla con sorting, paginación, filtros.
- `card/`: tarjeta estándar y con borde degradado.
- `badge/`: badges de estado con colores semánticos.
- `input/`: campo de formulario estilizado.
- `select/`: selector estilizado.
- `notification-center/`: panel de notificaciones in-app.

#### [NEW] `frontend/src/app/layouts/`
- `patient-layout/`: sidebar desktop + bottom nav mobile.
- `doctor-layout/`: sidebar con calendario lateral.
- `admin-layout/`: sidebar completa con métricas.
- `public-layout/`: header claro + footer.

#### [NEW] `frontend/src/app/core/tenant/`
- `tenant.service.ts`: resuelve tenant por dominio/URL.
- `tenant.store.ts`: Signal-based store con datos del tenant.
- `theme.service.ts`: aplica CSS custom properties dinámicamente.
- `theme.initializer.ts`: `APP_INITIALIZER` para cargar tema al arrancar.

---

## Fase 5: Configuración Mobile (Capacitor iOS/Android)

#### [MODIFY] `frontend/capacitor.config.ts`
- `appId`, `appName`, server URL, plugins config.

#### [NEW] Scripts de generación de assets
- `scripts/generate-icons.sh`: genera iconos para todas las resoluciones (Android/iOS).
- `scripts/generate-splash.sh`: splash screens responsive.

#### [NEW] `codemagic.yaml`
- Workflow para build Android (APK/AAB → Play Store).
- Workflow para build iOS (IPA → App Store / TestFlight).
- Firma de código, variables de entorno, triggers por tag.

#### [MODIFY] `.github/workflows/`
- `deploy-frontend.yml`: deploy a Netlify.
- `deploy-backend.yml`: build Docker + push a registry.

---

## Fase 6: Pruebas Unitarias, ESLint y SonarQube

### Backend

#### [NEW] `backend/jest.config.ts`
- Configuración de Jest con coverage thresholds (80% mínimo).

#### [NEW] Tests unitarios por módulo
- `tenants.service.spec.ts`, `users.service.spec.ts`, `auth.service.spec.ts`, etc.
- Mocks de Mongoose models, Redis, external services.

#### [MODIFY] `backend/eslint.config.mjs`
- Reglas de ESLint alineadas con NestJS best practices.
- No unused vars, explicit return types, naming conventions.

### Frontend

#### [NEW] `frontend/jest.config.ts` (o configuración de testing de Angular)
- Jest con Angular test utilities.
- Coverage thresholds: 80% statements, 70% branches.

#### [NEW] Tests unitarios por componente y servicio
- `auth.service.spec.ts`, `appointment.store.spec.ts`, `button.component.spec.ts`, etc.

#### [MODIFY] `frontend/.eslintrc.json`
- Reglas TypeScript + Angular strict.

### Calidad

#### [MODIFY] `sonar-project.properties`
- Quality gates: coverage ≥ 80%, duplications ≤ 3%, bugs = 0, vulnerabilities = 0.
- Exclusiones: node_modules, dist, spec files, assets.

---

## Fases 7-11: Resumen (post-aprobación)

| Fase | Módulos Backend | Páginas Frontend | HUs |
|------|----------------|------------------|-----|
| **7** | appointments, schedules, slot-locks, schedule-exceptions, reschedule-requests, waitlist | book-appointment, my-appointments, doctor-calendar, day-agenda | HU-PAC-001→007, HU-DOC-001→004, HU-DOC-008→009 |
| **8** | medical-records, prescriptions, lab-results, patient-files, consents | consultation-form, patient-timeline, prescription-builder | HU-DOC-005→007, HU-DOC-011→012, HU-PAC-011 |
| **9** | payments, payment-plans | payment-checkout, payment-history, admin-reports, doctor-commissions | HU-PAC-008→010, HU-ADM-003, HU-ADM-005, HU-ADM-010 |
| **10** | notifications, campaigns (BullMQ workers) | notification-center, campaign-builder | HU-PAC-012, HU-ADM-007 |
| **11** | AI triage, reviews, loyalty, teleconsulta, check-in QR | chatbot, video-room, loyalty-panel, review-form | HU-INN-001→020 |

---

## Verification Plan

### Automated Tests
- `npm run test -w backend` — Jest unit tests con coverage ≥ 80%.
- `npm run test -w frontend` — Angular/Jest unit tests con coverage ≥ 80%.
- `npx sonar-scanner` — Quality gates: 0 bugs, 0 vulnerabilities, ≤ 3% duplicación.
- CI/CD: GitHub Actions ejecuta tests en cada push/PR.

### Manual Verification
- Login con email+password y Google OAuth.
- CRUD de usuarios, sedes, especialidades desde panel admin.
- Verificar responsive en 320px, 768px, 1024px, 1440px.
- `npx cap sync` → verificar proyecto Android en Android Studio.
- Verificar theming dinámico por tenant (cambio de colores y logo).
