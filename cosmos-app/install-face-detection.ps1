# Script de Instalación del Sistema de Detección Facial - Cosmos App
# Ejecutar como administrador en PowerShell

param(
    [switch]$SkipDependencies,
    [switch]$SkipModels,
    [switch]$SkipConfig,
    [switch]$Verbose
)

Write-Host "🚀 Instalando Sistema de Detección Facial - Cosmos App" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green

# Función para logging
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        "SUCCESS" { "Green" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

# Función para verificar si un comando existe
function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Verificar requisitos previos
Write-Log "Verificando requisitos previos..." "INFO"

if (-not (Test-Command "node")) {
    Write-Log "❌ Node.js no está instalado. Por favor instala Node.js 18+ primero." "ERROR"
    exit 1
}

if (-not (Test-Command "npm")) {
    Write-Log "❌ npm no está instalado. Por favor instala npm primero." "ERROR"
    exit 1
}

if (-not (Test-Command "ng")) {
    Write-Log "❌ Angular CLI no está instalado. Instalando..." "WARN"
    npm install -g @angular/cli
}

Write-Log "✅ Requisitos previos verificados" "SUCCESS"

# Instalar dependencias
if (-not $SkipDependencies) {
    Write-Log "Instalando dependencias..." "INFO"
    
    try {
        # Dependencias principales
        Write-Log "Instalando face-api.js..." "INFO"
        npm install face-api.js @capacitor/camera @capacitor/core
        
        # Dependencias de desarrollo
        Write-Log "Instalando dependencias de desarrollo..." "INFO"
        npm install --save-dev @types/face-api.js
        
        Write-Log "✅ Dependencias instaladas correctamente" "SUCCESS"
    } catch {
        Write-Log "❌ Error al instalar dependencias: $_" "ERROR"
        exit 1
    }
} else {
    Write-Log "⏭️ Saltando instalación de dependencias" "WARN"
}

# Descargar modelos de FaceAPI
if (-not $SkipModels) {
    Write-Log "Descargando modelos de FaceAPI..." "INFO"
    
    $modelsDir = "public/models"
    if (-not (Test-Path $modelsDir)) {
        New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null
    }
    
    $models = @(
        "tiny_face_detector_model-shard1",
        "tiny_face_detector_model-weights_manifest.json",
        "face_landmark_68_model-shard1",
        "face_landmark_68_model-weights_manifest.json",
        "face_recognition_model-shard1",
        "face_recognition_model-shard2",
        "face_recognition_model-weights_manifest.json"
    )
    
    $baseUrl = "https://github.com/justadudewhohacks/face-api.js/raw/master/weights"
    
    foreach ($model in $models) {
        $modelPath = Join-Path $modelsDir $model
        if (-not (Test-Path $modelPath)) {
            Write-Log "Descargando $model..." "INFO"
            try {
                Invoke-WebRequest -Uri "$baseUrl/$model" -OutFile $modelPath
                Write-Log "✅ $model descargado" "SUCCESS"
            } catch {
                Write-Log "❌ Error al descargar $model: $_" "ERROR"
                Write-Log "Por favor descarga manualmente desde: $baseUrl/$model" "WARN"
            }
        } else {
            Write-Log "⏭️ $model ya existe" "INFO"
        }
    }
} else {
    Write-Log "⏭️ Saltando descarga de modelos" "WARN"
}

# Configurar Capacitor
if (-not $SkipConfig) {
    Write-Log "Configurando Capacitor..." "INFO"
    
    try {
        # Verificar si ya está configurado
        if (-not (Test-Path "capacitor.config.ts")) {
            Write-Log "❌ capacitor.config.ts no encontrado. Por favor ejecuta 'npx cap init' primero." "ERROR"
            exit 1
        }
        
        # Agregar configuración de cámara si no existe
        $capacitorConfig = Get-Content "capacitor.config.ts" -Raw
        if ($capacitorConfig -notmatch "Camera") {
            Write-Log "Agregando configuración de cámara a Capacitor..." "INFO"
            
            $cameraConfig = @"
  plugins: {
    Camera: {
      androidScaleType: 'CENTER_CROP',
      androidAllowBackup: true,
      androidRequestPermissions: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1E40AF',
      overlaysWebView: false
    }
  },
"@
            
            $capacitorConfig = $capacitorConfig -replace "const config: CapacitorConfig = \{", "const config: CapacitorConfig = {$cameraConfig"
            Set-Content "capacitor.config.ts" $capacitorConfig
            
            Write-Log "✅ Configuración de cámara agregada" "SUCCESS"
        } else {
            Write-Log "⏭️ Configuración de cámara ya existe" "INFO"
        }
        
        # Configurar Android
        if (Test-Path "android") {
            Write-Log "Configurando Android..." "INFO"
            
            $manifestPath = "android/app/src/main/AndroidManifest.xml"
            if (Test-Path $manifestPath) {
                $manifest = Get-Content $manifestPath -Raw
                
                # Agregar permisos si no existen
                if ($manifest -notmatch "android.permission.CAMERA") {
                    $permissions = @"
    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    
    <!-- Camera features -->
    <uses-feature android:name="android.hardware.camera" android:required="true" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
"@
                    
                    $manifest = $manifest -replace "</manifest>", "$permissions`n</manifest>"
                    Set-Content $manifestPath $manifest
                    
                    Write-Log "✅ Permisos de Android agregados" "SUCCESS"
                } else {
                    Write-Log "⏭️ Permisos de Android ya existen" "INFO"
                }
            }
        }
        
        # Configurar iOS
        if (Test-Path "ios") {
            Write-Log "Configurando iOS..." "INFO"
            
            $infoPlistPath = "ios/App/App/Info.plist"
            if (Test-Path $infoPlistPath) {
                $infoPlist = Get-Content $infoPlistPath -Raw
                
                # Agregar descripción de uso de cámara si no existe
                if ($infoPlist -notmatch "NSCameraUsageDescription") {
                    $cameraUsage = @"
	<key>NSCameraUsageDescription</key>
	<string>Esta aplicación necesita acceso a la cámara para la detección facial</string>
"@
                    
                    $infoPlist = $infoPlist -replace "</dict>", "$cameraUsage`n	</dict>"
                    Set-Content $infoPlistPath $infoPlist
                    
                    Write-Log "✅ Descripción de uso de cámara agregada para iOS" "SUCCESS"
                } else {
                    Write-Log "⏭️ Descripción de uso de cámara ya existe para iOS" "INFO"
                }
            }
        }
        
    } catch {
        Write-Log "❌ Error al configurar Capacitor: $_" "ERROR"
        exit 1
    }
} else {
    Write-Log "⏭️ Saltando configuración de Capacitor" "WARN"
}

# Verificar archivos del sistema
Write-Log "Verificando archivos del sistema..." "INFO"

$requiredFiles = @(
    "src/app/services/face.service.ts",
    "src/app/services/camera-permissions.service.ts",
    "src/app/services/face-utils.service.ts",
    "src/app/config/face-detection.config.ts",
    "src/app/components/face/face.ts",
    "src/app/components/face-mark/face-mark.ts"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Log "❌ Archivos faltantes:" "ERROR"
    foreach ($file in $missingFiles) {
        Write-Log "   - $file" "ERROR"
    }
    Write-Log "Por favor asegúrate de que todos los archivos estén en su lugar." "ERROR"
} else {
    Write-Log "✅ Todos los archivos del sistema están presentes" "SUCCESS"
}

# Construir y sincronizar
Write-Log "Construyendo aplicación..." "INFO"

try {
    # Construir Angular
    Write-Log "Ejecutando build de Angular..." "INFO"
    npm run build
    
    # Sincronizar con Capacitor
    if (Test-Path "android" -or Test-Path "ios") {
        Write-Log "Sincronizando con Capacitor..." "INFO"
        npx cap sync
        
        Write-Log "✅ Aplicación construida y sincronizada" "SUCCESS"
    } else {
        Write-Log "✅ Aplicación construida (no hay plataformas móviles configuradas)" "SUCCESS"
    }
} catch {
    Write-Log "❌ Error al construir la aplicación: $_" "ERROR"
    exit 1
}

# Verificación final
Write-Log "Realizando verificación final..." "INFO"

$nodeModules = Test-Path "node_modules/face-api.js"
$models = Test-Path "public/models"
$services = Test-Path "src/app/services/face.service.ts"

if ($nodeModules -and $models -and $services) {
    Write-Log "🎉 ¡Instalación completada exitosamente!" "SUCCESS"
    Write-Log "" "INFO"
    Write-Log "Próximos pasos:" "INFO"
    Write-Log "1. Ejecuta 'npm start' para probar en el navegador" "INFO"
    Write-Log "2. Para móvil: 'npx cap run android' o 'npx cap run ios'" "INFO"
    Write-Log "3. Consulta FACE_DETECTION_README.md para más información" "INFO"
} else {
    Write-Log "❌ La instalación no se completó correctamente" "ERROR"
    exit 1
}

Write-Log "" "INFO"
Write-Log "📚 Documentación disponible en FACE_DETECTION_README.md" "INFO"
Write-Log "🐛 Para soporte, consulta los logs o contacta al equipo de desarrollo" "INFO"
