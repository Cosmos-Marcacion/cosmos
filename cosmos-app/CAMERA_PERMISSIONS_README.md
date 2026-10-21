# Implementación de Permisos de Cámara en Cosmos App

## Descripción

Esta implementación agrega la funcionalidad para solicitar y manejar permisos de cámara al iniciar la aplicación Ionic para Android usando Capacitor.

## Características

- ✅ Solicitud automática de permisos al iniciar la aplicación
- ✅ Diálogo de permisos con interfaz moderna y responsiva
- ✅ Manejo de estados de permisos (granted, denied, prompt)
- ✅ Integración con Capacitor Camera API
- ✅ Diseño Mobile First con Tailwind CSS
- ✅ Componentes standalone de Angular 20
- ✅ Uso de signals para estado reactivo

## Archivos Implementados

### 1. Servicios

- `src/app/services/camera-permissions.service.ts` - Servicio principal para manejar permisos
- `src/app/services/permission-dialog.service.ts` - Servicio para controlar el diálogo de permisos

### 2. Componentes

- `src/app/components/permission-dialog/permission-dialog.component.ts` - Componente del diálogo de permisos

### 3. Configuración Android

- `android/app/src/main/AndroidManifest.xml` - Permisos y características de cámara
- `android/app/src/main/res/values/strings.xml` - Strings de permisos
- `android/app/src/main/res/xml/camera_permissions.xml` - Configuración de permisos
- `capacitor.config.ts` - Configuración de Capacitor

### 4. Integración Principal

- `src/app/app.ts` - Componente principal con integración de permisos
- `src/app/app.html` - Template con el diálogo de permisos

## Cómo Funciona

### 1. Inicialización

Al iniciar la aplicación, el `AppComponent` llama a `initializeCameraPermissions()` que:

- Verifica si la aplicación está ejecutándose en un dispositivo móvil
- Revisa el estado actual de los permisos de cámara
- Muestra automáticamente el diálogo si es necesario

### 2. Flujo de Permisos

```
Inicio App → Verificar Permisos → ¿Necesita Permisos? → Mostrar Diálogo → Solicitar Permisos
     ↓
¿Permisos Otorgados? → Sí: Continuar / No: Mostrar Opciones
```

### 3. Estados de Permisos

- **prompt**: El usuario aún no ha sido preguntado
- **granted**: Permisos otorgados
- **denied**: Permisos denegados

## Uso

### Verificar Permisos

```typescript
// En cualquier componente
constructor(private cameraPermissionsService: CameraPermissionsService) {}

async checkPermissions() {
  const isAvailable = await this.cameraPermissionsService.isCameraAvailable();
  if (isAvailable) {
    // Usar cámara
  } else {
    // Solicitar permisos
    await this.cameraPermissionsService.requestCameraPermission();
  }
}
```

### Mostrar Diálogo Manualmente

```typescript
// En cualquier componente
constructor(private permissionDialogService: PermissionDialogService) {}

showPermissionDialog() {
  this.permissionDialogService.showDialog();
}
```

## Configuración de Build

### 1. Instalar Dependencias

```bash
npm install @capacitor/camera @capacitor/android @ionic/angular
```

### 2. Sincronizar Capacitor

```bash
npx cap sync android
```

### 3. Build y Deploy

```bash
npm run build
npx cap build android
npx cap run android
```

## Personalización

### Cambiar Colores del Diálogo

Modifica las clases de Tailwind en `permission-dialog.component.ts`:

```typescript
// Cambiar color principal
class="bg-blue-600 hover:bg-blue-700" // Azul
class="bg-green-600 hover:bg-green-700" // Verde
class="bg-purple-600 hover:bg-purple-700" // Púrpura
```

### Cambiar Textos

Modifica los strings en `strings.xml` y el template del componente.

### Cambiar Comportamiento

Modifica la lógica en `camera-permissions.service.ts` para personalizar:

- Cuándo mostrar el diálogo
- Qué hacer si se deniegan los permisos
- Lógica de reintentos

## Troubleshooting

### Error: "Camera permission not granted"

1. Verifica que los permisos estén en `AndroidManifest.xml`
2. Asegúrate de que `@capacitor/camera` esté instalado
3. Revisa que la configuración de Capacitor sea correcta

### El diálogo no se muestra

1. Verifica que `initializeCameraPermissions()` se llame en `ngOnInit`
2. Revisa la consola para errores
3. Asegúrate de que el componente esté incluido en el template

### Permisos no se solicitan en Android

1. Verifica la configuración de `capacitor.config.ts`
2. Asegúrate de que `androidRequestPermissions: true` esté configurado
3. Revisa que el dispositivo tenga cámara disponible

## Mejoras Futuras

- [ ] Persistencia del estado de permisos
- [ ] Solicitud de permisos adicionales (micrófono, ubicación)
- [ ] Integración con sistema de notificaciones
- [ ] Analytics de uso de permisos
- [ ] Soporte para iOS
- [ ] Modo oscuro del diálogo

## Notas Técnicas

- La implementación usa signals de Angular 20 para estado reactivo
- Los componentes son standalone para mejor modularidad
- El diseño es Mobile First con Tailwind CSS
- Se sigue la arquitectura limpia con separación de responsabilidades
- Los servicios implementan principios SOLID
- Se usa la nueva sintaxis de plantillas de Angular 20 (@if, @for)
- **Integración completa con Ionic Platform**: Uso de `Platform` service para detección de dispositivos móviles
- **Listeners de estado de aplicación**: Monitoreo de cambios entre primer y segundo plano
- **Detección de plataforma**: Soporte específico para Android e iOS

## Contribución

Para contribuir a esta funcionalidad:

1. Sigue las convenciones de código establecidas
2. Mantén la compatibilidad con Angular 20
3. Usa signals en lugar de observables cuando sea posible
4. Mantén el diseño Mobile First
5. Documenta cualquier cambio en este README
