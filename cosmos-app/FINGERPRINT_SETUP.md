# Configuración del Sistema de Huellas Digitales ZKTeco SLK20r

## Descripción

Este sistema permite el registro y la identificación de empleados mediante huellas digitales usando el dispositivo ZKTeco SLK20r en una aplicación Angular con Capacitor.

## Características

- ✅ Registro de huellas digitales para empleados
- ✅ Identificación/autenticación por huella digital
- ✅ Gestión de usuarios registrados
- ✅ Interfaz de usuario moderna y responsiva
- ✅ Integración completa con ZKTeco SLK20r
- ✅ Manejo de errores y estados de conexión

## Requisitos Previos

### Hardware

- Dispositivo ZKTeco SLK20r
- Cable USB para conexión
- Dispositivo Android con soporte USB OTG

### Software

- Android SDK 23+ (Android 6.0+)
- Capacitor 7.0+
- Angular 20+
- Node.js 18+

## Instalación

### 1. Configurar el Plugin

El plugin `fingercosmos-plugin` ya está incluido en el proyecto. Asegúrate de que las librerías JAR de ZKTeco estén en la carpeta `android/libs/`:

```
android/libs/
├── zkandroidcore.jar
├── zkandroidfingerservice.jar
├── zkandroidfpreader.jar
└── libslkidcap.so (archivos nativos)
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Configurar Capacitor

```bash
npx cap sync android
```

### 4. Compilar y Ejecutar

```bash
# Compilar la aplicación
npm run build

# Sincronizar con Android
npx cap sync android

# Abrir en Android Studio
npx cap open android
```

## Uso

### Inicialización

El sistema se inicializa automáticamente al cargar el componente. Verifica que el dispositivo ZKTeco SLK20r esté conectado via USB.

### Registro de Huellas

1. Navega a "Registrar Huella"
2. Ingresa el ID de usuario y ID de empleado
3. Coloca el dedo en el escáner cuando se solicite
4. Sigue las instrucciones en pantalla

### Identificación

1. Navega a "Identificar"
2. Haz clic en "Iniciar Identificación"
3. Coloca el dedo en el escáner
4. El sistema mostrará el resultado de la identificación

### Gestión de Usuarios

- Ve a "Usuarios Registrados" para ver la lista
- Usa el botón de eliminar para remover huellas registradas

## Configuración del Dispositivo

### Permisos Android

Asegúrate de que la aplicación tenga los siguientes permisos en `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.USB_PERMISSION" />
<uses-permission android:name="android.permission.USB_ACCESSORY" />
<uses-feature android:name="android.hardware.usb.host" />
```

### Configuración USB

El dispositivo ZKTeco SLK20r debe estar configurado para modo USB HID o modo de comunicación personalizado.

## Estructura del Código

### Plugin Nativo (Android)

- `fingercosmosPlugin.java`: Implementación principal del plugin
- Integración con ZKTeco SDK
- Manejo de eventos de captura y identificación

### Servicio Angular

- `FingerprintService`: Servicio principal para manejo de huellas
- Signals para estado reactivo
- Manejo de eventos y listeners

### Componente UI

- `FingerprintComponent`: Interfaz de usuario completa
- Navegación entre vistas
- Formularios y validación

## Solución de Problemas

### Dispositivo No Conectado

1. Verifica la conexión USB
2. Asegúrate de que el dispositivo esté encendido
3. Revisa los permisos USB en Android
4. Reinicia la aplicación

### Error de Captura

1. Limpia el sensor del dispositivo
2. Asegúrate de que el dedo esté limpio y seco
3. Coloca el dedo completamente sobre el sensor
4. Mantén el dedo estable durante la captura

### Problemas de Identificación

1. Verifica que la huella esté registrada
2. Asegúrate de usar el mismo dedo registrado
3. Coloca el dedo en la misma posición
4. Revisa la calidad de la huella registrada

## API del Plugin

### Métodos Principales

```typescript
// Inicializar dispositivo
await fingerprintService.initializeScanner();

// Registrar huella
await fingerprintService.registerFingerprint(userId, employeeId);

// Identificar huella
await fingerprintService.identifyFingerprint();

// Eliminar huella
await fingerprintService.deleteFingerprint(userId);

// Verificar conexión
await fingerprintService.checkConnection();
```

### Eventos

```typescript
// Progreso de registro
enrollmentStatus$: Observable<EnrollmentStatus>;

// Resultado de identificación
identificationResult$: Observable<IdentificationResult>;

// Estado del dispositivo
isConnected: Signal<boolean>;
```

## Desarrollo

### Agregar Nuevas Funcionalidades

1. Actualiza las definiciones en `definitions.ts`
2. Implementa el método en el plugin Android
3. Agrega el método al servicio Angular
4. Actualiza la interfaz de usuario

### Testing

```bash
# Ejecutar tests unitarios
npm run test

# Ejecutar tests e2e
npm run e2e
```

## Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo LICENSE para más detalles.

## Soporte

Para soporte técnico o preguntas sobre la integración con ZKTeco SLK20r, consulta la documentación oficial de ZKTeco o contacta al equipo de desarrollo.
