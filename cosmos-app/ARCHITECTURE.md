# Cosmos Check-In - Arquitectura y Manual de Uso

## Indice

1. [Vision General del Sistema](#1-vision-general-del-sistema)
2. [Stack Tecnologico](#2-stack-tecnologico)
3. [Estructura de Directorios](#3-estructura-de-directorios)
4. [Frontend Angular](#4-frontend-angular)
5. [Plugin Nativo fingercosmos](#5-plugin-nativo-fingercosmos)
6. [Proyecto Android](#6-proyecto-android)
7. [Puente Capacitor](#7-puente-capacitor)
8. [Flujos de Datos Criticos](#8-flujos-de-datos-criticos)
9. [Integracion con Backend](#9-integracion-con-backend)
10. [Manual de Operacion](#10-manual-de-operacion)
11. [Pipeline de Build y Despliegue](#11-pipeline-de-build-y-despliegue)
12. [Referencia de Archivos Clave](#12-referencia-de-archivos-clave)

---

## 1. Vision General del Sistema

Cosmos Check-In es una aplicacion hibrida de control de asistencia y autenticacion biometrica para empleados. Corre como APK Android (via Capacitor) y consume una API REST de backend.

### Metodos de fichaje soportados

| Metodo | Descripcion |
|--------|-------------|
| Huella digital | Lector USB ZKTeco SLK20r via plugin nativo |
| Reconocimiento facial | Camara del dispositivo con face-api.js |
| Codigo QR | Camara con libreria zxing |
| DNI manual | Formulario de entrada |
| Escaneo DNI | Camara con OCR |

### Diagrama de capas

```
+--------------------------------------------------+
|            Angular 20 (TypeScript)               |
|   Componentes / Servicios / Signals / Router     |
+--------------------------------------------------+
|              Capacitor 7 Bridge                  |
|   JavaScript <-> Native method bridge            |
+--------------------------------------------------+
|        fingercosmos-plugin (Java)                |
|   Plugin Capacitor para ZKTeco SLK20r            |
+--------------------------------------------------+
|           ZKTeco Android SDK (JARs)              |
|   zkandroidcore / zkandroidfpreader / service    |
+--------------------------------------------------+
|         Dispositivo USB (SLK20r)                 |
|   Lector de huella OTG via android.hardware.usb  |
+--------------------------------------------------+
```

---

## 2. Stack Tecnologico

| Capa | Tecnologia | Version |
|------|------------|---------|
| Framework UI | Angular | 20.0.5 |
| Bridge Movil | Capacitor | 7.4.3 |
| Bundler | Vite (`@angular/build`) | latest |
| Estilos | Tailwind CSS + SCSS | 3.4.1 |
| Estado | Angular Signals (zoneless) | nativo |
| HTTP | `@angular/common/http` | 20.0 |
| Reconocimiento facial | face-api.js | 0.22.2 |
| Escaner QR | @zxing/ngx-scanner | 20.0.0 |
| SDK biometrico | ZKTeco Android SDK | JAR 2020 |
| Android target | API 35 / min API 23 | Java 21 |
| Plugin nativo | fingercosmos-plugin | 0.0.1 |

---

## 3. Estructura de Directorios

```
cosmos-app/
├── src/                              # Fuente Angular
│   ├── app/
│   │   ├── app.ts                    # Componente raiz
│   │   ├── app.config.ts             # Providers y configuracion
│   │   ├── app.routes.ts             # Rutas de la aplicacion
│   │   ├── components/               # Componentes globales compartidos
│   │   ├── config/                   # Configuraciones iniciales
│   │   ├── constants/                # Constantes de app
│   │   ├── guards/                   # Guards de ruta
│   │   ├── interceptors/             # Interceptores HTTP
│   │   ├── interfaces/               # Tipos TypeScript globales
│   │   ├── layouts/                  # Layouts de pagina
│   │   ├── modules/                  # Modulos de negocio (lazy loaded)
│   │   ├── pipes/                    # Pipes personalizados
│   │   ├── services/                 # Servicios de negocio globales
│   │   └── types/                    # Tipos adicionales
│   ├── environments/                 # Config por entorno (dev/prod)
│   └── main.ts                       # Bootstrap
│
├── fingercosmos-plugin/              # Plugin Capacitor nativo
│   ├── src/                          # Fuente TypeScript del plugin
│   │   ├── definitions.ts            # Interfaz publica del plugin
│   │   ├── index.ts                  # Registro del plugin
│   │   └── web.ts                    # Fallback web (throws not implemented)
│   ├── android/                      # Implementacion Android Java
│   │   ├── build.gradle
│   │   └── src/main/java/com/cosmos/fingercosmos/
│   │       ├── fingercosmosPlugin.java  # Implementacion principal (2100+ lineas)
│   │       └── fingercosmos.java        # Clase utilitaria
│   └── dist/                         # Compilado del plugin (generado)
│
├── android/                          # Proyecto Android nativo (Capacitor)
│   ├── app/
│   │   ├── build.gradle              # Configuracion de la app
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml
│   │   │   ├── java/com/cosmos/checkin/MainActivity.java
│   │   │   └── assets/public/        # Bundle Angular compilado
│   │   └── release/app-release.apk   # APK de produccion
│   ├── libs/                         # JARs y .so del SDK ZKTeco
│   │   ├── zkandroidcore.jar
│   │   ├── zkandroidfpreader.jar
│   │   ├── zkandroidfingerservice.jar
│   │   ├── armeabi-v7a/              # Librerias nativas 32-bit
│   │   └── arm64-v8a/                # Librerias nativas 64-bit
│   ├── capacitor.settings.gradle     # Auto-generado por cap sync
│   └── settings.gradle
│
├── dist/                             # Build Angular (generado)
├── node_modules/                     # Dependencias npm
├── capacitor.config.ts               # Configuracion Capacitor
├── angular.json                      # Configuracion Angular CLI
├── package.json
└── tsconfig.json
```

---

## 4. Frontend Angular

### 4.1 Bootstrap y configuracion

`src/main.ts` arranca `bootstrapApplication(App, appConfig)`.

`appConfig` en `src/app/app.config.ts` provee:
- Change detection **zoneless** (rendimiento optimizado)
- Routing con **hash** (`#/ruta`) para compatibilidad con WebView Android
- `HttpClient` con los interceptores `httpInterceptor` y `errorInterceptor`
- Providers de animaciones async

`App` (componente raiz) inicializa en su constructor:
- Status bar Android (`#1E40AF`, estilo DARK)
- Ajuste de viewport para Android WebView
- Handler del boton Back nativo (cierra app si no hay historial)
- Permisos de camara
- Fixes de compatibilidad DOM para WebView

### 4.2 Rutas (`app.routes.ts`)

Todos los modulos son **lazy-loaded** con `loadComponent`.

```
/login                          → Auth (noAuthGuard)
/qr                             → Escaner QR
/dni                            → Entrada DNI manual
/dni-scan                       → Escaner de documento DNI
/face/:id                       → Captura facial para empleado
/signature/:id                  → Captura de firma

[ MainLayoutComponent - requiere authGuard ]
  /inicio                       → Home / listado de empleados
  /detalle-empleado/:id/...     → Detalle de empleado
  /registro                     → Alta de empleado
  /registro/:id                 → Edicion de empleado
  /marcacion                    → Hub de metodos de fichaje
  /fingerprint                  → Identificacion por huella
  /fingerprint-register/:id     → Registro de huella de empleado
  /capacitaciones               → Gestion de capacitaciones
  /capacitaciones/agregar       → Alta / edicion capacitacion
  /capacitaciones/asistentes/.. → Asistentes de capacitacion
  /validacion-registro/:id      → Confirmacion post-identificacion (internalNavigationGuard)
  /face-mark                    → Fichaje por reconocimiento facial
```

#### Guards

| Guard | Funcion |
|-------|---------|
| `authGuard` | Exige JWT valido en localStorage |
| `noAuthGuard` | Bloquea si ya esta autenticado |
| `internalNavigationGuard` | Impide acceso directo a `/validacion-registro` |
| `employeeDetailBackGuard` | Limpieza al salir del detalle de empleado |

### 4.3 Jerarquia de componentes

```
App
├── SplashComponent              # Pantalla de inicio
├── LoaderComponent              # Overlay de carga global
├── NotificationComponent        # Toasts de notificacion
├── ConfirmationComponent        # Dialogo si/no
├── PermissionDialogComponent    # Solicitud de permiso camara
├── CheckinConfirmation          # Modal post-fichaje biometrico
└── RouterOutlet
    ├── Auth  (/login)
    ├── Clock (/qr, /dni, /dni-scan)
    └── MainLayout
        ├── MenuComponent        # Navegacion lateral
        └── RouterOutlet
            ├── Home
            ├── Marcacion
            │   ├── Fingerprint
            │   ├── FaceMark
            │   ├── QR
            │   └── DniScan
            ├── EmployeeRegister
            ├── FingerprintRegister
            └── Talks
```

### 4.4 Servicios clave

#### FingerprintService (`services/fingerprint.service.ts`)

Es el puente principal entre la UI Angular y el plugin nativo.

**Signals de estado:**

```typescript
isConnected         // boolean - dispositivo conectado
deviceInfo          // string  - informacion del lector
mode                // 'idle' | 'register' | 'identify'
capturing           // boolean - captura activa
enrollmentStatus    // { step, message, progress }
identificationResult // { match, employeeId, score }
lastCapturedTemplate // string base64 - ultimo template
lastCapturedQuality  // number - calidad 0-100
lastCapturedLen      // number - longitud en bytes
```

**Metodos publicos:**

```typescript
initializeScanner()                          // Conectar al dispositivo
identifyFingerprint()                        // Iniciar identificacion
registerFingerprint(userId, employeeId)      // Iniciar enrolamiento
loadAllFingerprints()                        // Cargar plantillas del backend
configureDevice(options)                     // Configurar parametros
saveFingerprint()                            // Guardar plantilla en backend
findLocalMatch(template)                     // Busqueda local por igualdad
```

**Listener principal:**

```typescript
plugin.addListener('fingerprintEvent', (data) => {
  switch (data.type) {
    case 'registration':    // Plantilla capturada -> guardar en backend
    case 'identification':  // Match encontrado -> navegar a confirmacion
    case 'error':           // Error -> mostrar notificacion
    case 'success':         // Enrolamiento completado
  }
})
```

#### Otros servicios globales

| Servicio | Responsabilidad |
|----------|----------------|
| `LoaderService` | Estado global del spinner |
| `NotificationService` | Toasts (signal-based) |
| `ConfirmationService` | Dialogo modal global |
| `UserStateService` | Datos del usuario autenticado |
| `SplashService` | Control de la splash screen |
| `FaceService` | Reconocimiento facial con face-api.js |
| `ScannerService` | Lectura QR/barcode |
| `UploadService` | Subida de archivos al backend |
| `FingerprintStorageService` | Llamadas HTTP para plantillas |
| `CameraPermissionsService` | Flujo de permisos de camara |

### 4.5 Interceptores HTTP

**httpInterceptor:**
- Adjunta el JWT en el header `Authorization: Bearer <token>`
- Establece `Content-Type` por defecto

**errorInterceptor:**
- Captura errores HTTP (401, 403, 500, etc.)
- Muestra toast de error via `NotificationService`
- En 401 redirige al login

### 4.6 Configuracion Capacitor (`capacitor.config.ts`)

```typescript
{
  appId: 'com.cosmos.checkin',
  appName: 'Cosmos Check-In',
  webDir: 'dist/cosmos-app/browser',

  plugins: {
    Camera: {
      androidScaleType: 'CENTER_CROP',
      androidRequestPermissions: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1E40AF'
    },
    fingercosmos: {
      deviceType: 'SLK20r',
      connectionTimeout: 10000,   // ms
      captureTimeout: 30000,      // ms (0 = sin limite)
      beepEnabled: true,
      sensitivity: 5              // 1-9
    }
  },
  android: {
    allowMixedContent: true,
    captureInput: true
  }
}
```

---

## 5. Plugin Nativo fingercosmos

### 5.1 Interfaz TypeScript (`src/definitions.ts`)

```typescript
interface fingercosmosPlugin {
  initialize(): Promise<{ connected: boolean; deviceInfo?: string }>
  checkConnection(): Promise<{ connected: boolean; deviceInfo?: string }>
  configureDevice(options: {
    timeout?: number;
    sensitivity?: number;
    beepEnabled?: boolean;
  }): Promise<{ success: boolean }>

  startRegistration(options: {
    userId: string;
    employeeId: string;
  }): Promise<{ success: boolean; userId: string; template?: string }>

  startIdentification(): Promise<{
    match: boolean;
    userId?: string;
    employeeId?: string;
    score?: number;
    timestamp?: number;
  }>

  deleteFingerprint(options: { userId: string }):
    Promise<{ success: boolean; userId: string }>

  getRegisteredUsers(): Promise<{
    users: Array<{ userId: string; employeeId: string; registered: boolean }>
  }>

  // Listeners de eventos
  addListener('enrollmentStep',       listenerFunc): Promise<PluginListenerHandle>
  addListener('identificationResult', listenerFunc): Promise<PluginListenerHandle>
  addListener('deviceStatus',         listenerFunc): Promise<PluginListenerHandle>
  // El servicio tambien usa el evento compuesto:
  addListener('fingerprintEvent',     listenerFunc): Promise<PluginListenerHandle>
}
```

**Payload del evento `fingerprintEvent`:**

```typescript
{
  type: 'success' | 'error' | 'identification' | 'registration'
  message: string
  template?: string       // Plantilla biometrica en Base64
  templateLen?: number    // Longitud raw en bytes
  quality?: number        // Calidad 0-100 (minimo valido: 20)
  employeeId?: string     // ID del empleado identificado
  score?: number          // Puntuacion de coincidencia 0-100
  timestamp?: number      // Timestamp del evento
  step?: number           // Paso de enrolamiento (1 o 2)
  progress?: number       // Progreso porcentual (0-100)
}
```

### 5.2 Registro del plugin (`src/index.ts`)

```typescript
const fingercosmos = registerPlugin<fingercosmosPlugin>('fingercosmos', {
  web: () => import('./web').then((m) => new m.fingercosmosWeb()),
  // La implementacion Android se registra via anotacion @CapacitorPlugin
})

export * from './definitions'
export { fingercosmos }
```

En el lado de la app, el servicio lo importa como:
```typescript
import { fingercosmos as ZKTecoFingerprint } from 'fingercosmos-plugin'
```

### 5.3 Implementacion Java (`fingercosmosPlugin.java`)

#### Constantes criticas

```java
static final int    VENDOR_ID              = 6997;   // VID ZKTeco
static final int    MIN_QUALITY            = 20;     // Calidad minima aceptable
static final int    MIN_TEMPLATE_LEN_BYTES = 256;    // Tamanio minimo de plantilla
static final long   EVENT_THROTTLE_MS      = 800;    // Anti-rebote de eventos
```

#### Estado interno del plugin

```java
boolean isCapturing           // Captura activa
boolean isScannerConnected    // Dispositivo inicializado
boolean isRegistrationMode    // true=enrolar / false=identificar
byte[]  enrollFirstTemplate   // Plantilla del primer dedo (fase 1 de 2)
int     enrollSampleCount     // Contador de muestras (0, 1, 2)
int     matchThreshold        // Umbral minimo de coincidencia
long    captureTimeoutMs      // Auto-stop (0=nunca)
String  currentUserId         // ID del usuario en enrolamiento
String  currentEmployeeId     // ID de empleado en enrolamiento
```

#### Metodos anotados (`@PluginMethod`)

```java
initialize(call)
  // 1. Busca dispositivo USB con VID 6997
  // 2. Solicita permiso USB al usuario
  // 3. Crea FingerprintSensor via ZKTeco SDK
  // 4. Registra captureListener
  // 5. Resuelve call: { connected, deviceInfo }
  // 6. Emite evento 'deviceStatus'

startRegistration(call)
  // 1. Extrae userId, employeeId de call.options
  // 2. isRegistrationMode = true, enrollSampleCount = 0
  // 3. sensor.startCapture(captureListener)
  // Captura continua hasta enrollSampleCount == 2

startIdentification(call)
  // 1. isRegistrationMode = false
  // 2. isCapturing = true
  // 3. sensor.startCapture(captureListener)
  // Loop continuo hasta stopCapture()

loadReferences(call)
  // Recibe array de { template, employeeId }
  // Los carga en el SDK para matching interno
  // Llama al API del SDK para registrar referencias

deleteFingerprint(call)
  // Elimina plantilla del SDK y del estado local

getRegisteredUsers(call)
  // Retorna lista de usuarios con plantillas cargadas

checkConnection(call)
  // Verifica estado del sensor y retorna deviceInfo

configureDevice(call)
  // Aplica timeout, sensitivity, beepEnabled via ParameterHelper
```

#### Ciclo de vida del USB

```
BroadcastReceiver registrado para:
  ACTION_USB_PERMISSION        → Si concedido: crear sensor e inicializar
  USB_DEVICE_ATTACHED          → Auto-deteccion y solicitud de permiso
  USB_DEVICE_DETACHED          → Limpiar sensor, emitir deviceStatus(false)

Deteccion de dispositivo:
  UsbManager.getDeviceList()
    └── Para cada device: device.getVendorId() == 6997 → es ZKTeco
```

#### Flujo del captureListener

```
SDK llama: onFeatureCaptured(template, quality, length)
    │
    ├── Validar quality >= MIN_QUALITY
    ├── Validar length >= MIN_TEMPLATE_LEN_BYTES
    ├── Verificar throttle (< 800ms desde ultimo evento -> ignorar)
    │
    ├── [Modo registro]
    │   ├── enrollSampleCount == 0:
    │   │     Guardar template como enrollFirstTemplate
    │   │     enrollSampleCount = 1
    │   │     Emitir { type:'registration', step:1, progress:50 }
    │   │
    │   └── enrollSampleCount == 1:
    │         Comparar template con enrollFirstTemplate
    │         Si similares: enrollSampleCount = 2
    │         Emitir { type:'registration', step:2, progress:100,
    │                  template, employeeId, quality, templateLen }
    │
    └── [Modo identificacion]
          SDK compara contra referencias cargadas
          Si match: emitir { type:'identification', employeeId, score }
          Si no match: emitir { type:'identification', employeeId:null }
          Reiniciar captura (loop)

notifyListeners('fingerprintEvent', jsObject)
    → Capacitor serializa a JSON
    → Entregado al listener en JavaScript
```

#### Estrategia de fallback para el SDK

El plugin usa reflexion Java para manejar variantes del SDK ZKTeco:

```java
// Intento 1: API directa del SDK
FingerprintFactory.createFingerprintSensor(context, transportType)

// Intento 2: Constructor alternativo via reflection
Class.forName("com.zkfingerprint.FingerprintSensor")
    .getConstructor(Context.class)

// Intento 3: Metodos de cierre via reflection
sensor.getClass().getMethod("stopCapture").invoke(sensor)
sensor.getClass().getMethod("close").invoke(sensor)
```

---

## 6. Proyecto Android

### 6.1 MainActivity.java

```java
package com.cosmos.checkin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

`BridgeActivity` de Capacitor gestiona todo:
- Carga el bundle Angular desde `assets/public/`
- El WebView ejecuta la app Angular
- Enruta llamadas JS a plugins nativos registrados
- Maneja permisos y ciclo de vida de Activity

### 6.2 AndroidManifest.xml - Permisos y configuracion

```xml
<!-- Permisos requeridos -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />

<!-- USB OTG para el lector de huella -->
<uses-feature android:name="android.hardware.usb.host" android:required="true" />

<!-- Declaracion de MainActivity -->
<activity android:name=".MainActivity"
          android:launchMode="singleTask"
          android:exported="true">
  <!-- App launcher -->
  <intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LAUNCHER" />
  </intent-filter>

  <!-- Auto-deteccion del lector USB al conectar -->
  <intent-filter>
    <action android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED" />
  </intent-filter>
  <meta-data
    android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED"
    android:resource="@xml/device_filter" />  <!-- Filtra VID 6997 -->
</activity>
```

### 6.3 Dependencias Gradle del SDK ZKTeco

**`android/app/build.gradle`:**
```gradle
dependencies {
  // JARs del SDK ZKTeco (en android/libs/)
  implementation fileTree(include: ['*.jar'], dir: '../libs')

  // Librerias nativas .so (armeabi-v7a, arm64-v8a)
  // Configuradas en sourceSets.main.jniLibs.srcDirs
}

sourceSets {
  main {
    jniLibs.srcDirs = ['src/main/jniLibs', '../libs']
  }
}
```

**`fingercosmos-plugin/android/build.gradle`:**
```gradle
dependencies {
  // JARs solo para compilacion (no empaquetar, evita duplicados)
  compileOnly fileTree(dir: 'libs', include: ['*.jar'])
  compileOnly fileTree(dir: '../../android/libs', include: ['*.jar'])
  implementation project(':capacitor-android')
}
```

### 6.4 Archivos auto-generados por `npx cap sync`

Estos archivos NO se editan manualmente - se regeneran cada vez que se ejecuta `npx cap sync android`:

**`android/capacitor.settings.gradle`** - Incluye todos los modulos de plugins:
```gradle
include ':fingercosmos-plugin'
project(':fingercosmos-plugin').projectDir = new File('../fingercosmos-plugin/android')
```

**`android/app/capacitor.build.gradle`** - Dependencias de plugins:
```gradle
dependencies {
  implementation project(':fingercosmos-plugin')
  // ... otros plugins
}
```

**`android/app/src/main/assets/capacitor.plugins.json`** - Registro en runtime:
```json
[
  { "pkg": "fingercosmos-plugin", "classpath": "com.cosmos.fingercosmos.fingercosmosPlugin" }
]
```

---

## 7. Puente Capacitor

### 7.1 Como funciona el bridge

```
[Angular TypeScript]
ZKTecoFingerprint.startIdentification()
         |
         | (via Capacitor Core)
         | Serializa: { pluginId:'fingercosmos', method:'startIdentification', options:{} }
         |
[Capacitor Android Bridge]
BridgeActivity.handleCall()
  → Busca plugin 'fingercosmos' en capacitor.plugins.json
  → Instancia fingercosmosPlugin (o reutiliza instancia)
  → Llama fingercosmosPlugin.startIdentification(PluginCall)
         |
[Java Native]
fingercosmosPlugin.startIdentification(PluginCall call) {
  sensor.startCapture(captureListener);
  // NO resuelve el call aqui - es una operacion continua
}
         |
[ZKTeco SDK - evento asincrono]
captureListener.onFeatureCaptured(template, quality, length)
  → Procesa y valida
  → notifyListeners('fingerprintEvent', jsObject)
         |
[Capacitor Bridge - evento de vuelta]
  → Serializa JSObject a JSON
  → Entrega al listener registrado en JavaScript
         |
[Angular - listener]
plugin.addListener('fingerprintEvent', (data) => { ... })
  → data.type === 'identification'
  → router.navigate(['/validacion-registro/' + data.employeeId])
```

### 7.2 Diferencia: call.resolve() vs notifyListeners()

| Mecanismo | Cuando se usa | Ejemplo |
|-----------|---------------|---------|
| `call.resolve(data)` | Respuesta unica a una llamada | `initialize()`, `checkConnection()` |
| `call.reject(msg)` | Error en una llamada | Fallo de conexion |
| `notifyListeners(event, data)` | Eventos asyncronos y continuos | Captura de huella (puede ocurrir multiples veces) |

---

## 8. Flujos de Datos Criticos

### 8.1 Identificacion por huella (fichaje)

```
Usuario en /fingerprint toca "Identificar"
    |
fingerprintService.initializeScanner()        [si no conectado]
    → ZKTecoFingerprint.initialize()
    → Java: detecta USB VID 6997, solicita permiso
    → Resuelve: { connected: true }
    |
fingerprintService.loadAllFingerprints()      [carga plantillas]
    → GET /fingerprint
    → Respuesta: [{ employeeId, template }, ...]
    → Almacena en fingerprintsMap (cache local)
    → ZKTecoFingerprint.loadReferences({ refs, threshold })  [opcional]
    |
fingerprintService.identifyFingerprint()
    → ZKTecoFingerprint.startIdentification()
    → Java: sensor.startCapture(captureListener)
    |
[Usuario coloca el dedo en el lector]
    |
SDK emite: onFeatureCaptured(template, quality=75, length=512)
    → Valida calidad >= 20, longitud >= 256
    → Compara contra referencias
    → notifyListeners('fingerprintEvent', {
         type: 'identification',
         employeeId: 'EMP-001',
         score: 87,
         template: '<base64>',
         quality: 75,
         templateLen: 512
       })
    |
FingerprintService listener:
    case 'identification':
      si employeeId existe → navegar directamente
      si no → findLocalMatch(template) → busqueda por igualdad en fingerprintsMap
    → router.navigate(['/validacion-registro/EMP-001'])
    |
/validacion-registro/EMP-001
    → Muestra datos del empleado
    → POST al backend para registrar fichaje
    → Redirige a /marcacion
```

### 8.2 Registro de nueva huella

```
Administrador en /fingerprint-register/:id
    |
fingerprintService.registerFingerprint(userId, employeeId)
    → ZKTecoFingerprint.startRegistration({ userId, employeeId })
    → Java: isRegistrationMode=true, enrollSampleCount=0
    → sensor.startCapture(captureListener)
    |
[Empleado coloca el dedo - PRIMERA VEZ]
    |
onFeatureCaptured(template1, quality1, length1)
    → enrollSampleCount=0: guardar como enrollFirstTemplate
    → enrollSampleCount=1
    → notifyListeners('fingerprintEvent', {
         type: 'registration', step: 1, progress: 50,
         message: 'Coloque el dedo nuevamente'
       })
    |
UI muestra: "Paso 1/2 completado - Vuelva a colocar el dedo"
    |
[Empleado coloca el dedo - SEGUNDA VEZ]
    |
onFeatureCaptured(template2, quality2, length2)
    → enrollSampleCount=1: comparar template2 vs enrollFirstTemplate
    → Si similares suficientes:
      → enrollSampleCount=2
      → notifyListeners('fingerprintEvent', {
           type: 'registration', step: 2, progress: 100,
           template: enrollFirstTemplate,  // se guarda la primera
           employeeId: 'EMP-001',
           quality: quality1,
           templateLen: length1
         })
    |
FingerprintService listener:
    case 'registration':
      → saveFingerprint(employeeId, template, templateLen, quality)
        → POST /fingerprint/save { employeeId, template, quality, templateLen }
      → Actualiza fingerprintsMap local
      → pushReferencesToPlugin()
        → ZKTecoFingerprint.loadReferences(...)
      → Navega a /registro
    |
Huella guardada exitosamente
```

### 8.3 Reconocimiento facial

```
Usuario en /face-mark
    |
FaceService inicializa face-api.js
    → Carga modelos desde assets/public/models/
    → SsdMobilenetv1, FaceLandmark68Net, FaceRecognitionNet
    |
CameraPermissionsService verifica permisos de camara
    |
Video stream activo (getUserMedia)
    |
Loop de deteccion (requestAnimationFrame):
    → faceapi.detectSingleFace(video, SsdMobilenetv1)
           .withFaceLandmarks()
           .withFaceDescriptor()
    → Obtiene descriptor (128 dimensiones Float32Array)
    → Compara contra descriptores almacenados de empleados
       (FaceMatcher con umbral de distancia)
    → Si match: navegar a /validacion-registro/:id
```

---

## 9. Integracion con Backend

### 9.1 Endpoints de huellas digitales

```
GET  /fingerprint
     Respuesta: [{ employeeId, template, quality?, templateLen? }, ...]
     Uso: Carga todas las plantillas al iniciar el modo identificacion

POST /fingerprint/save
     Body: { employeeId, template, quality?, templateLen? }
     Uso: Persiste una nueva plantilla tras el enrolamiento

POST /fingerprint/verify
     Body: { template }
     Uso: Verificacion alternativa contra backend (no local)

POST /fingerprint/quality-check
     Body: { template }
     Uso: Validacion de calidad de plantilla
```

### 9.2 Endpoints de empleados

```
GET  /employees                   → Lista paginada de empleados
GET  /employee/:id                → Detalle de empleado
POST /employee                    → Crear empleado
PUT  /employee/:id                → Actualizar empleado
```

### 9.3 Autenticacion

```
POST /auth/login
     Body: { email, password }
     Respuesta: { token, user }

GET  /auth/verify
     Header: Authorization: Bearer <token>
     Uso: Verificar validez del token (authGuard)
```

### 9.4 Uploads

```
POST /upload
     Body: FormData { file, resourceType }
     Uso: Imagenes de perfil, documentos DNI, fotos de fichaje
```

---

## 10. Manual de Operacion

### 10.1 Primera vez - Configuracion inicial

**Prerrequisitos del dispositivo Android:**
- Android 6.0 (API 23) o superior
- Puerto USB OTG (USB Host) habilitado
- El dispositivo debe tener soporte USB Host (tablets empresariales generalmente lo tienen)

**Instalacion del APK:**
```bash
# Via ADB
adb install android/app/build/outputs/apk/debug/app-debug.apk

# O copia el APK al dispositivo y abrelo desde el explorador de archivos
# Puede requerir habilitar "Fuentes desconocidas" en Ajustes > Seguridad
```

**Primera apertura:**
1. La splash screen aparece mientras se cargan los recursos
2. La app redirige a `/login`
3. Iniciar sesion con credenciales de administrador

---

### 10.2 Conexion del lector ZKTeco SLK20r

1. Conectar el lector al puerto USB OTG del dispositivo Android
2. Android detecta el dispositivo (VID 6997) automaticamente
3. Aparece un dialogo del sistema: **"Permitir que [App] acceda al dispositivo USB"**
4. Tocar **ACEPTAR** (marcar "Usar siempre" para evitar el dialogo en el futuro)
5. El lector emite un beep indicando conexion exitosa
6. En la app, el estado del lector cambia a "Conectado"

**Si el dialogo no aparece:**
- Desconectar y volver a conectar el lector
- Ir a Ajustes > Aplicaciones > Cosmos Check-In > Permisos y verificar USB

---

### 10.3 Registrar huella de un empleado

1. Ir a **Registro de empleados** (`/registro`)
2. Abrir el detalle del empleado o crear uno nuevo
3. Tocar el boton **"Registrar huella"**
4. La app navega a `/fingerprint-register/:id`
5. Asegurarse que el lector este conectado (se muestra el estado en pantalla)
6. **Paso 1:** Pedir al empleado que coloque el dedo en el lector
   - El lector emite un beep y captura la primera muestra
   - La barra de progreso muestra 50%
7. **Paso 2:** Pedir al empleado que coloque el mismo dedo nuevamente
   - El lector emite un beep y valida la coincidencia entre ambas muestras
   - La barra de progreso llega al 100%
8. La plantilla se guarda automaticamente en el backend
9. La app regresa a la pantalla de registro

**Problemas comunes en registro:**
- **"Calidad insuficiente"**: El dedo no hizo buen contacto. Pedir al empleado que limpie el dedo y coloque bien toda la yema.
- **"Las muestras no coinciden"**: Las dos impresiones no coincidieron. Volver a empezar el proceso.
- **"Dispositivo no conectado"**: Verificar cable USB y dialogo de permiso.

---

### 10.4 Identificacion / Fichaje por huella

1. Ir a **Marcacion** (`/marcacion`)
2. Tocar **"Huella digital"**
3. La app navega a `/fingerprint`
4. El lector se inicializa y carga todas las plantillas del backend
5. El estado muestra "Listo para identificar"
6. El empleado coloca el dedo en el lector
7. El lector captura y compara contra todas las plantillas cargadas
8. **Si hay coincidencia:**
   - La app navega a `/validacion-registro/:id`
   - Se muestra nombre y foto del empleado
   - Se registra el fichaje en el backend
   - La app regresa a `/marcacion` para el siguiente empleado
9. **Si no hay coincidencia:**
   - Se muestra un mensaje de error
   - La app permanece en modo identificacion para reintentar

---

### 10.5 Fichaje por reconocimiento facial

1. Ir a **Marcacion** (`/marcacion`)
2. Tocar **"Reconocimiento facial"**
3. La camara frontal se activa
4. El empleado mira a la camara
5. El sistema compara el rostro contra los descriptores almacenados
6. Si hay coincidencia, navega a la confirmacion de fichaje

---

### 10.6 Fichaje por QR

1. Ir a **Marcacion** (`/marcacion`)
2. Tocar **"Codigo QR"**
3. Apuntar la camara al codigo QR del empleado
4. El sistema decodifica el QR y registra el fichaje

---

### 10.7 Gestion de capacitaciones

1. Ir a **Capacitaciones** (`/capacitaciones`)
2. Ver listado de capacitaciones existentes
3. Tocar **"Agregar"** para crear una nueva
4. En el detalle de una capacitacion, tocar **"Asistentes"** para registrar presencia

---

### 10.8 Diagnostico de problemas del lector

**El lector no es detectado:**
- Verificar que el cable USB este bien conectado en ambos extremos
- Probar con otro cable USB OTG
- Verificar que el dispositivo Android tenga soporte USB Host (`lsusb` en ADB shell)
- Reiniciar la app

**El lector se detecta pero no captura:**
- Asegurarse de haber aceptado el permiso USB
- Verificar que la superficie del lector este limpia
- Probar con `checkConnection()` desde la pantalla de huella

**La identificacion siempre falla:**
- Verificar que el empleado tenga su huella registrada en el sistema
- Revisar que las plantillas se hayan cargado (boton "Recargar plantillas" si existe)
- Verificar conectividad con el backend para que `GET /fingerprint` funcione

---

## 11. Pipeline de Build y Despliegue

### 11.1 Desarrollo (solo web)

```bash
cd cosmos-app/
npm start
# Servidor en http://localhost:4201
# Hot reload activo
```

### 11.2 Build completo para Android

```bash
# 1. Compilar plugin (solo si hubo cambios en fingercosmos-plugin/)
cd fingercosmos-plugin/
npm install
npm run build
cd ..

# 2. Instalar dependencias de la app (enlaza el plugin compilado)
npm install

# 3. Compilar Angular
npm run build
# Output: dist/cosmos-app/browser/

# 4. Sincronizar con Android
# Copia el build a android/app/src/main/assets/public/
# Actualiza capacitor.settings.gradle, capacitor.build.gradle, capacitor.plugins.json
npx cap sync android

# 5. Compilar APK debug
cd android/
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk

# 6. Instalar en dispositivo conectado
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 11.3 Build de produccion

```bash
# Angular produccion (minificado, optimizado)
npm run build -- --configuration production

# Sync y APK release (requiere keystore configurado)
npx cap sync android
cd android/
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk
# O para bundle (Play Store):
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

### 11.4 Flujo de actualizacion del plugin

```bash
# Cuando se modifica fingercosmos-plugin/src/ o android/src/:
cd fingercosmos-plugin/
npm run build      # Recompila TypeScript a dist/
cd ..
npx cap sync android  # Actualiza los archivos Gradle
cd android/
./gradlew assembleDebug  # Recompila el APK
```

---

## 12. Referencia de Archivos Clave

| Archivo | Proposito |
|---------|-----------|
| `src/app/app.config.ts` | Providers globales de Angular, configuracion de zoneless y routing |
| `src/app/app.routes.ts` | Definicion completa de rutas y guards |
| `src/app/app.ts` | Componente raiz, inicializacion de la app |
| `src/app/services/fingerprint.service.ts` | Puente Angular <-> plugin nativo, signals de estado |
| `src/app/modules/fingerprint/fingerprint.ts` | Componente de identificacion por huella |
| `src/app/modules/fingerprint-register/fingerprint-register.ts` | Componente de enrolamiento |
| `fingercosmos-plugin/src/definitions.ts` | Interfaz TypeScript publica del plugin |
| `fingercosmos-plugin/src/index.ts` | Registro del plugin en Capacitor |
| `fingercosmos-plugin/src/web.ts` | Fallback web (lanza "not available on web") |
| `fingercosmos-plugin/android/.../fingercosmosPlugin.java` | Implementacion nativa completa (2100+ lineas) |
| `fingercosmos-plugin/android/build.gradle` | Dependencias del modulo del plugin |
| `fingercosmos-plugin/package.json` | Metadata del paquete npm del plugin |
| `android/app/src/main/AndroidManifest.xml` | Permisos y declaracion de componentes Android |
| `android/app/src/main/java/.../MainActivity.java` | Entry point Android (extends BridgeActivity) |
| `android/libs/zkandroidcore.jar` | SDK ZKTeco - nucleo |
| `android/libs/zkandroidfpreader.jar` | SDK ZKTeco - lector de huella |
| `android/libs/zkandroidfingerservice.jar` | SDK ZKTeco - servicio de huella |
| `android/capacitor.settings.gradle` | Auto-generado: modulos Gradle de plugins |
| `android/app/capacitor.build.gradle` | Auto-generado: dependencias de plugins |
| `android/app/src/main/assets/capacitor.plugins.json` | Auto-generado: classpath de plugins en runtime |
| `capacitor.config.ts` | Configuracion de Capacitor y parametros de plugins |
| `package.json` | Dependencias npm de la app Angular |
