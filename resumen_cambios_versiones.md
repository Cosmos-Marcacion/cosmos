# Resumen de Cambios y Versiones (23-24 de Abril de 2026)

## 1. Últimos Cambios Realizados (Correcciones en Producción)

Durante la última intervención en el backend (`cosmos-back`), se han aplicado las siguientes correcciones críticas:

### A. Corrección de Sincronización de Empleados (Error E11000)
- **Problema:** La sincronización de empleados fallaba con un error de clave duplicada (`E11000 Duplicate key error`) en el campo `document` (DNI). Esto ocurría porque la lógica anterior solo verificaba si el empleado existía usando su `id` (staff_id). Si un empleado cambiaba de `staff_id` pero mantenía su mismo documento, el sistema intentaba crear un nuevo registro, chocando con la restricción de unicidad de MongoDB.
- **Solución:** Se modificó la función `syncEmployeesFromNamedService` en `employee.service.ts`. Ahora el sistema verifica si existe un empleado buscando coincidencias tanto por el `id` como por el `document`. Si encuentra una coincidencia, actualiza los datos del empleado existente (incluyendo el nuevo `id` de ser el caso) en lugar de intentar crear un registro duplicado. Esto previene bloqueos durante el proceso de sincronización.

### B. Limpieza de Logs en Producción
- **Problema:** Existían múltiples llamadas a `console.log` dispersas por los servicios del backend, lo cual ensucia la salida estándar en el entorno de producción y puede afectar el rendimiento.
- **Solución:** Se rastrearon y eliminaron todos los `console.log` en los archivos del backend, específicamente en:
  - `main.ts`
  - `entry.service.ts`
  - `point.service.ts`
  - `employee.service.ts`
- *Nota:* Se han mantenido los `console.error` críticos para preservar la trazabilidad de errores reales de infraestructura (como fallos al inicializar DNS o cargar modelos de reconocimiento).

### C. Actualizaciones y Generación de APK (Aplicación Móvil)
- **Problema/Necesidad:** Se requería implementar la gestión de detalles de los empleados y asegurar que la aplicación compilara correctamente en formato Android (`.apk`).
- **Solución:** Se completaron los flujos de navegación (`navigation state service`), se configuraron los parámetros de red y construcción para Android (`build configurations`), logrando generar exitosamente la nueva versión de la aplicación en formato `.apk` lista para su instalación y uso en producción.
- **Detalles de la versión Android (APK):**
  - **Versión:** `v1.0` (versionCode 1)
  - **Cambios integrados:** 
    - Implementación de la gestión de detalles de empleados y servicio de estado de navegación.
    - Se agregaron configuraciones de hardware en `device_filter.xml` (configuraciones de compilación para Android).
    - Se configuró el `build.gradle` para integrar el SDK de huellas dactilares de ZKTeco (`ZKTeco SDK`) leyendo las librerías nativas (`.so` y `.jar`) directamente desde los directorios de `libs`.

---


## 2. Versiones / Commits Integrados (Entre el 23 y 24 de Abril)

Al no existir tags de release estandarizados (tipo `v1.0.0`), a continuación se detalla el historial de *commits* (versiones de despliegue continuo) que se han registrado en los repositorios durante ayer y hoy:

### 📦 Backend (`cosmos-back`)
**24 de Abril:**
- `1ccba67` - *feat*: Implementación de módulos de servicio para `entry`, `point` y `employee` con la inicialización core del backend.
- `37adf34` - *feat*: Inicialización de la aplicación integrando CORS, validaciones globales y servicio de gestión de usuarios.
- `2282bb1` - *feat*: Configuración del bootstrap de NestJS con DNS personalizados, validación global, política CORS y documentación Swagger.
- `50083b5` - *feat*: Configuración inicial de pipes globales, CORS, Swagger docs y endpoint de *health check*.
- `4175983` - *feat*: Integración de validaciones, CORS, Swagger y configuraciones personalizadas de DNS.
- `3c658be` - *feat*: Despliegue de inicialización de la app (CORS, Swagger y DNS).

**23 de Abril:**
- `73debdd` - *feat*: Inicialización con DNS custom, validaciones globales, CORS y Swagger API docs.
- `708a99a` - *chore*: Actualización de dependencias en `package-lock.json`.
- `3d9a658` - *chore*: Actualización y movimiento de paquetes SWC de *devDependencies* a *dependencies*.
- `c7b99d2` - *chore*: Movimiento de dependencias SWC en `package.json` para despliegue de producción.
- `62f811d` - *feat*: Implementación de servicios y controladores modulares para `talk`, `employee` y `auth` con soporte para compilador SWC.
- `5bc1dbc` - *feat*: Implementación de servicios core, *guards* de autenticación y lógica de reconocimiento facial.

### 📦 Frontend (`cosmos-front`)
**24 de Abril:**
- `6f541be` - *feat*: Implementación del componente `AddUser` para el manejo y creación/actualización de usuarios vía `FormData`.

**23 de Abril:**
- `84a354e` - *feat*: Implementación del módulo de autenticación con funcionalidades de *login* y recuperación de contraseña.

### 📦 Aplicación Móvil (`cosmos-app`)
**24 de Abril:**
- `0234124` - *feat*: Implementación de gestión de detalles de empleados, servicio de estado de navegación y configuraciones de compilación para Android (`build configurations`).
