package com.cosmos.fingercosmos;

import android.util.Log;
import android.util.Base64;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginResult;
import com.getcapacitor.JSArray;

// Importaciones para ZKTeco SLK20r
import com.zkteco.android.biometric.core.device.ParameterHelper;
import com.zkteco.android.biometric.core.device.TransportType;
import com.zkteco.android.biometric.module.fingerprintreader.FingerprintCaptureListener;
import com.zkteco.android.biometric.module.fingerprintreader.FingerprintSensor;
import com.zkteco.android.biometric.module.fingerprintreader.FingerprintFactory;
import com.zkteco.android.biometric.module.fingerprintreader.FingerprintConstant;
import com.zkteco.android.biometric.module.fingerprintreader.exception.FingerprintException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "fingercosmos")
public class fingercosmosPlugin extends Plugin {

    private static final String TAG = "fingercosmosPlugin";
    private FingerprintSensor fingerprintSensor;
    private boolean isScannerConnected = false;
    private boolean isCapturing = false;
    private boolean isProcessingEvent = false;
    private long lastEventAtMs = 0L;
    private static final long EVENT_THROTTLE_MS = 800L;
    private long operationStartedAtMs = 0L;
    private static final int MIN_QUALITY = 20;
    private static final int MIN_TEMPLATE_LEN_BYTES = 256; // evita artefactos pequeños
    private static final int MIN_TEMPLATE_BASE64_LEN = 512;
    // Estado local de usuarios/templates eliminado. La verificación se delega al backend.
    private String currentUserId;
    private String currentEmployeeId;
    private boolean isRegistrationMode = false;
    // Enrolamiento en 2 fases para evitar falsos positivos sin dedo
    private String enrollFirstTemplateCanonical = null;
    private long enrollFirstAtMs = 0L;
    private int enrollSampleCount = 0;

    // Referencias para matching local (delegado al SDK).
    private static class Reference {
        String employeeId;
        String templateBase64;
        Reference(String employeeId, String templateBase64) {
            this.employeeId = employeeId;
            this.templateBase64 = templateBase64;
        }
    }
    private final java.util.List<Reference> referenceTemplates = new java.util.ArrayList<>();
    private int matchThreshold = 0; // score mínimo para considerar match (permitir 0 para mayor tolerancia)
    private int captureTimeoutMs = 60000; // tiempo de espera de captura; 0 desactiva auto-stop

    // USB
    private static final String ACTION_USB_PERMISSION = "com.cosmos.checkin.USB_PERMISSION";
    private UsbManager usbManager;
    private PendingIntent usbPermissionIntent;
    private BroadcastReceiver usbReceiver;

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "Plugin fingercosmos cargado");

        try {
            usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            Intent intent = new Intent(ACTION_USB_PERMISSION);
            // Intent explícito hacia nuestra propia app para cumplir con U+
            intent.setPackage(getContext().getPackageName());
            usbPermissionIntent = PendingIntent.getBroadcast(
                getContext(),
                0,
                intent,
                PendingIntent.FLAG_IMMUTABLE
            );

            usbReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String action = intent.getAction();
                    if (ACTION_USB_PERMISSION.equals(action)) {
                        synchronized (this) {
                            UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                            boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                            if (device != null) {
                                if (granted) {
                                    Log.d(TAG, "✅ Permiso USB concedido para dispositivo: " + device.getDeviceName());
                                    boolean opened = openWithUsbDevice(device);
                                    isScannerConnected = opened;
                                    if (opened) {
                                        setupFingerprintListener();
                                        JSObject data = new JSObject();
                                        data.put("type", "device");
                                        data.put("status", "ready");
                                        data.put("message", "Dispositivo USB listo");
                                        notifyListeners("fingerprintEvent", data);
                                    } else {
                                        notifyError("No se pudo abrir el dispositivo USB tras permiso");
                                    }
                                } else {
                                    Log.d(TAG, "❌ Permiso USB denegado");
                                    notifyError("Permiso USB denegado por el usuario");
                                }
                            }
                        }
                    } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                        UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                        if (device != null && device.getVendorId() == 6997) {
                            Log.d(TAG, "📥 Dispositivo USB conectado: " + device.getDeviceName());
                            if (usbManager != null && usbManager.hasPermission(device)) {
                                boolean opened = openWithUsbDevice(device);
                                isScannerConnected = opened;
                                if (opened) setupFingerprintListener();
                            } else if (usbManager != null) {
                                usbManager.requestPermission(device, usbPermissionIntent);
                            }
                        }
                    } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                        UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                        if (device != null && device.getVendorId() == 6997) {
                            Log.d(TAG, "📤 Dispositivo USB desconectado: " + device.getDeviceName());
                            // Detener captura y cerrar canales si fuese necesario
                            try {
                                if (fingerprintSensor != null) {
                                    java.lang.reflect.Method stopCap = fingerprintSensor.getClass().getMethod("stopCapture", int.class);
                                    stopCap.invoke(fingerprintSensor, 0);
                                    try { stopCap.invoke(fingerprintSensor, 1); } catch (Exception ignore) {}
                                    java.lang.reflect.Method closeMethod = fingerprintSensor.getClass().getMethod("close", int.class);
                                    closeMethod.invoke(fingerprintSensor, 0);
                                    try { closeMethod.invoke(fingerprintSensor, 1); } catch (Exception ignore) {}
                                }
                            } catch (Exception ignore) {}
                            isCapturing = false;
                            isScannerConnected = false;
                        }
                    }
                }
            };

            IntentFilter filter = new IntentFilter();
            filter.addAction(ACTION_USB_PERMISSION);
            filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
            filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
            try {
                // Android 14+ requiere flags al registrar receptores no exclusivos de broadcasts del sistema
                getContext().registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } catch (NoSuchMethodError err) {
                // Compatible con APIs previas
                getContext().registerReceiver(usbReceiver, filter);
            }

            // Solicitar permiso proactivamente si el dispositivo ya está conectado
            try {
                if (usbManager != null) {
                    java.util.HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
                    for (UsbDevice device : deviceList.values()) {
                        if (device.getVendorId() == 6997 && !usbManager.hasPermission(device)) {
                            usbManager.requestPermission(device, usbPermissionIntent);
                        }
                    }
                }
            } catch (Exception e) {
                Log.d(TAG, "⚠️ Error solicitando permiso proactivo: " + e.getMessage());
            }
        } catch (Exception e) {
            Log.d(TAG, "⚠️ No se pudo registrar receptor USB: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        Log.d(TAG, "handleOnStop -> limpiando captura y recursos ligeros");
        stopCaptureSafely();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        Log.d(TAG, "handleOnDestroy -> cleanup completo");
        cleanup();
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        Log.d(TAG, "=== INICIO: Inicializando dispositivo ZKTeco SLK20r ===");
        try {
            if (fingerprintSensor == null) {
                // Detectar VID/PID dinámicamente
                int vid = 6997;
                int pid = 289; // valor por defecto
                try {
                    UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
                    if (um != null) {
                        java.util.HashMap<String, UsbDevice> deviceList = um.getDeviceList();
                        for (UsbDevice d : deviceList.values()) {
                            if (d.getVendorId() == 6997) {
                                vid = d.getVendorId();
                                pid = d.getProductId();
                                Log.d(TAG, "🧭 VID/PID detectados para creación del sensor: " + vid + "/" + pid);
                                break;
                            }
                        }
                    }
                } catch (Exception ignore) {}
                Map<String, Object> params = new HashMap<>();
                params.put(ParameterHelper.PARAM_KEY_VID, vid);
                params.put(ParameterHelper.PARAM_KEY_PID, pid);
                fingerprintSensor = FingerprintFactory.createFingerprintSensor(getContext(), TransportType.USB, params);
            }
            // Inicialización física del sensor
            boolean initialized = initializeSensor(fingerprintSensor);
            if (!initialized) {
                // Fallback: re-crear el sensor usando otros constructores/métodos y reintentar
                Log.d(TAG, "♻️ Fallback: re-creando sensor con constructor alternativo y reintentando...");
                try {
                    int vid = 6997;
                    int pid = 289;
                    UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
                    if (um != null) {
                        java.util.HashMap<String, UsbDevice> deviceList = um.getDeviceList();
                        for (UsbDevice d : deviceList.values()) {
                            if (d.getVendorId() == 6997) { vid = d.getVendorId(); pid = d.getProductId(); break; }
                        }
                    }
                    FingerprintSensor alt = createSensorAlternative(vid, pid);
                    if (alt != null) {
                        fingerprintSensor = alt;
                        Log.d(TAG, "🔁 Sensor alternativo creado. Reintentando inicialización...");
                        if (initializeSensor(fingerprintSensor)) {
                            setupFingerprintListener();
            isScannerConnected = true;
            JSObject result = new JSObject();
            result.put("connected", true);
                            result.put("deviceInfo", "ZKTeco SLK20r - Conectado (alt)");
                            result.put("message", "Dispositivo inicializado correctamente (alternativo)");
            call.resolve(result);
                            Log.d(TAG, "=== FIN: Inicializando dispositivo ZKTeco SLK20r ===");
                            return;
                        }
                    }
                } catch (Exception e) {
                    Log.d(TAG, "❌ Fallback de recreación falló: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                }
                isScannerConnected = false;
                JSObject fail = new JSObject();
                fail.put("connected", false);
                fail.put("deviceInfo", "ZKTeco SLK20r - No inicializado");
                fail.put("message", "No se pudo inicializar el sensor. Conecte el dispositivo y vuelva a intentar.");
                call.resolve(fail);
                Log.d(TAG, "=== FIN: Inicializando dispositivo ZKTeco SLK20r ===");
                return;
            }
            setupFingerprintListener();
            isScannerConnected = true;
            JSObject result = new JSObject();
            result.put("connected", true);
            result.put("deviceInfo", "ZKTeco SLK20r - Conectado");
            result.put("message", "Dispositivo inicializado correctamente");
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "❌ ERROR al inicializar: " + e.getMessage());
            isScannerConnected = false;
            JSObject result = new JSObject();
            result.put("connected", false);
            result.put("deviceInfo", "Error de inicialización");
            result.put("message", "Error: " + e.getMessage());
            call.resolve(result);
        }
        Log.d(TAG, "=== FIN: Inicializando dispositivo ZKTeco SLK20r ===");
    }

    private FingerprintSensor createRealFingerprintSensor() {
        try {
            Log.d(TAG, "=== INICIO: Creando sensor real de ZKTeco SLK20r ===");
            
            // Explorar todos los métodos disponibles
            Log.d(TAG, "🔍 EXPLORANDO MÉTODOS DISPONIBLES...");
            
            // Explorar FingerprintFactory
            exploreFactoryMethods("FingerprintFactory", FingerprintFactory.class);
            
            // Explorar FingprintFactory
            try {
                Class<?> fingprintFactoryClass = Class.forName("com.zkteco.android.biometric.module.fingerprintreader.FingprintFactory");
                exploreFactoryMethods("FingprintFactory", fingprintFactoryClass);
        } catch (Exception e) {
                Log.e(TAG, "❌ No se pudo cargar FingprintFactory: " + e.getMessage());
            }
            
            // Explorar FingerprintSensor
            exploreSensorConstructors("FingerprintSensor", FingerprintSensor.class);
            
            // Intentar crear el sensor usando los métodos encontrados
            FingerprintSensor sensor = tryCreateSensor();
            
            if (sensor != null) {
                Log.d(TAG, "✅ SENSOR CREADO EXITOSAMENTE");
                return sensor;
            }
            
            Log.e(TAG, "❌ TODOS LOS MÉTODOS FALLARON - No se pudo crear el sensor real");
            Log.d(TAG, "=== FIN: Creando sensor real de ZKTeco SLK20r ===");
            return null;
            
        } catch (Exception e) {
            Log.e(TAG, "❌ ERROR GENERAL al crear sensor: " + e.getClass().getSimpleName() + " - " + e.getMessage());
            return null;
        }
    }

    private FingerprintSensor createSensorAlternative(int vid, int pid) {
        try {
            Log.d(TAG, "🔄 Creando sensor alternativo... VID=" + vid + ", PID=" + pid);
            // Opción 1: Constructor directo
            try {
                java.lang.reflect.Constructor<?> ctor = FingerprintSensor.class.getConstructor();
                FingerprintSensor sensor = (FingerprintSensor) ctor.newInstance();
                try {
                    java.lang.reflect.Method addParams = sensor.getClass().getMethod("addParameters", Map.class);
                    Map<String, Object> params = new HashMap<>();
                    params.put(ParameterHelper.PARAM_KEY_VID, vid);
                    params.put(ParameterHelper.PARAM_KEY_PID, pid);
                    addParams.invoke(sensor, params);
                } catch (Exception ignore) {}
                return sensor;
            } catch (Exception e) {
                Log.d(TAG, "⚠️ Constructor directo falló: " + e.getMessage());
            }
            // Opción 2: Factory alternativa por reflexión (si existiera)
            try {
                java.lang.reflect.Method m = FingerprintFactory.class.getMethod("createFingerprintSensor2", Context.class, TransportType.class, Map.class);
                Map<String, Object> params = new HashMap<>();
                params.put(ParameterHelper.PARAM_KEY_VID, vid);
                params.put(ParameterHelper.PARAM_KEY_PID, pid);
                FingerprintSensor sensor = (FingerprintSensor) m.invoke(null, getContext(), TransportType.USB, params);
                return sensor;
            } catch (Exception e) {
                Log.d(TAG, "⚠️ Factory alternativa no disponible: " + e.getMessage());
            }
            return null;
        } catch (Exception e) {
            Log.d(TAG, "❌ Error creando sensor alternativo: " + e.getMessage());
            return null;
        }
    }
    
    private void exploreFactoryMethods(String factoryName, Class<?> factoryClass) {
        try {
            Log.d(TAG, "🔍 Explorando métodos de " + factoryName + ":");
            java.lang.reflect.Method[] methods = factoryClass.getMethods();
            
            for (java.lang.reflect.Method method : methods) {
                if (method.getName().contains("create") || method.getName().contains("get") || method.getName().contains("new")) {
                    Log.d(TAG, "  📋 " + method.getName() + "(" + getParameterTypes(method) + ") -> " + method.getReturnType().getSimpleName());
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "❌ Error explorando " + factoryName + ": " + e.getMessage());
        }
    }
    
    private void exploreSensorConstructors(String sensorName, Class<?> sensorClass) {
        try {
            Log.d(TAG, "🔍 Explorando constructores de " + sensorName + ":");
            java.lang.reflect.Constructor<?>[] constructors = sensorClass.getConstructors();
            
            for (java.lang.reflect.Constructor<?> constructor : constructors) {
                Log.d(TAG, "  📋 " + sensorName + "(" + getParameterTypes(constructor) + ")");
            }
        } catch (Exception e) {
            Log.e(TAG, "❌ Error explorando constructores de " + sensorName + ": " + e.getMessage());
        }
    }
    
    private String getParameterTypes(java.lang.reflect.Method method) {
        Class<?>[] params = method.getParameterTypes();
        if (params.length == 0) return "";
        
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < params.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append(params[i].getSimpleName());
        }
        return sb.toString();
    }
    
    private String getParameterTypes(java.lang.reflect.Constructor<?> constructor) {
        Class<?>[] params = constructor.getParameterTypes();
        if (params.length == 0) return "";
        
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < params.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append(params[i].getSimpleName());
        }
        return sb.toString();
    }
    
    private FingerprintSensor tryCreateSensor() {
        try {
            Log.d(TAG, "🔧 INTENTANDO CREAR SENSOR...");
            
            // Primero, intentar detectar dispositivos USB disponibles
            Log.d(TAG, "🔍 DETECTANDO DISPOSITIVOS USB...");
            android.hardware.usb.UsbManager usbManager = (android.hardware.usb.UsbManager) getContext().getSystemService(android.content.Context.USB_SERVICE);
            
            if (usbManager != null) {
                java.util.HashMap<String, android.hardware.usb.UsbDevice> deviceList = usbManager.getDeviceList();
                Log.d(TAG, "📋 Dispositivos USB encontrados: " + deviceList.size());
                
                for (android.hardware.usb.UsbDevice device : deviceList.values()) {
                    Log.d(TAG, "📋 Dispositivo: " + device.getDeviceName() + 
                              " - VendorID: " + device.getVendorId() + 
                              " - ProductID: " + device.getProductId() +
                              " - Clase: " + device.getDeviceClass());
                    
                    // ZKTeco SLK20R - Parámetros oficiales según documentación
                    int vendorId = device.getVendorId();
                    int productId = device.getProductId();
                    boolean isZKTeco = (vendorId == 6997) && (productId == 289); // SLK20R específico
                    
                    if (isZKTeco) {
                        Log.d(TAG, "🎯 ¡POSIBLE DISPOSITIVO ZKTECO DETECTADO! (VendorID: " + vendorId + ")");
                        
                        // Método 1: Intentar crear con UsbDevice
                        try {
                            Log.d(TAG, "Método 1: Intentando crear con UsbDevice");
                            FingerprintSensor sensor = new FingerprintSensor();
                            
                            // Primero configurar parámetros antes de abrir
                            try {
                                java.lang.reflect.Method setLibusbFlagMethod = sensor.getClass().getMethod("setLibusbFlag", boolean.class);
                                setLibusbFlagMethod.invoke(sensor, true);
                                Log.d(TAG, "✅ setLibusbFlag configurado antes de abrir");
                            } catch (Exception e) {
                                Log.d(TAG, "⚠️ Error configurando setLibusbFlag: " + e.getMessage());
                            }
                            
                            // Intentar abrir con UsbDevice
                            java.lang.reflect.Method openUsbMethod = sensor.getClass().getMethod("open", android.hardware.usb.UsbDevice.class);
                            openUsbMethod.invoke(sensor, device);
                            Log.d(TAG, "✅ MÉTODO 1 EXITOSO: Sensor creado y abierto con UsbDevice");
                            return sensor;
                        } catch (Exception e) {
                            Log.e(TAG, "❌ MÉTODO 1 FALLÓ: " + e.getClass().getSimpleName() + " - " + e.getMessage());
                            
                            // Intentar con open(Object) como alternativa
                            try {
                                Log.d(TAG, "Método 1b: Intentando con open(Object)");
                                FingerprintSensor sensor2 = new FingerprintSensor();
                                java.lang.reflect.Method openObjectMethod = sensor2.getClass().getMethod("open", Object.class);
                                openObjectMethod.invoke(sensor2, device);
                                Log.d(TAG, "✅ MÉTODO 1b EXITOSO: Sensor creado y abierto con open(Object)");
                                return sensor2;
                            } catch (Exception e2) {
                                Log.e(TAG, "❌ MÉTODO 1b FALLÓ: " + e2.getClass().getSimpleName() + " - " + e2.getMessage());
                            }
                        }
                        
                        // Método 5: Constructor directo con configuración USB específica
                        try {
                            Log.d(TAG, "Método 5: Intentando con constructor directo y configuración USB específica");
                            java.lang.reflect.Constructor<?> constructor = FingerprintSensor.class.getConstructor();
                            FingerprintSensor sensor = (FingerprintSensor) constructor.newInstance();
                            
                            // Configurar parámetros específicos para ZKTeco SLK20r
                            try {
                                java.lang.reflect.Method setLibusbFlagMethod = sensor.getClass().getMethod("setLibusbFlag", boolean.class);
                                setLibusbFlagMethod.invoke(sensor, true);
                                Log.d(TAG, "✅ setLibusbFlag configurado");
                            } catch (Exception e) {
                                Log.d(TAG, "⚠️ Error configurando setLibusbFlag: " + e.getMessage());
                            }
                            
                            try {
                                java.lang.reflect.Method setManualReleaseMethod = sensor.getClass().getMethod("setManualReleaseZKFinger", boolean.class);
                                setManualReleaseMethod.invoke(sensor, false);
                                Log.d(TAG, "✅ setManualReleaseZKFinger configurado");
                            } catch (Exception e) {
                                Log.d(TAG, "⚠️ Error configurando setManualReleaseZKFinger: " + e.getMessage());
                            }
                            
                            try {
                                java.lang.reflect.Method setCaptureModeMethod = sensor.getClass().getMethod("setCaptureMode", int.class);
                                setCaptureModeMethod.invoke(sensor, 1);
                                Log.d(TAG, "✅ setCaptureMode configurado");
                            } catch (Exception e) {
                                Log.d(TAG, "⚠️ Error configurando setCaptureMode: " + e.getMessage());
                            }
                            
                            // Intentar abrir con el dispositivo USB detectado
                            try {
                                java.lang.reflect.Method openUsbMethod = sensor.getClass().getMethod("open", android.hardware.usb.UsbDevice.class);
                                openUsbMethod.invoke(sensor, device);
                                Log.d(TAG, "✅ open(UsbDevice) exitoso");
                            } catch (Exception e) {
                                Log.d(TAG, "⚠️ open(UsbDevice) falló, intentando open(Object): " + e.getMessage());
                                try {
                                    java.lang.reflect.Method openObjectMethod = sensor.getClass().getMethod("open", Object.class);
                                    openObjectMethod.invoke(sensor, device);
                                    Log.d(TAG, "✅ open(Object) exitoso");
                                } catch (Exception e2) {
                                    Log.d(TAG, "⚠️ open(Object) también falló: " + e2.getMessage());
                                }
                            }
                            
                            Log.d(TAG, "✅ MÉTODO 5 EXITOSO: Sensor creado con constructor directo y configuración USB específica");
                            return sensor;
                        } catch (Exception e4) {
                            Log.e(TAG, "❌ MÉTODO 5 FALLÓ: " + e4.getClass().getSimpleName() + " - " + e4.getMessage());
                        }
                    }
                }
            } else {
                Log.d(TAG, "❌ UsbManager no disponible");
            }
            
            // Método 2: Usar FingerprintFactory.createFingerprintSensor (método oficial ZKTeco)
            try {
                Log.d(TAG, "Método 2: Intentando con FingerprintFactory.createFingerprintSensor");
                
                // Buscar TransportType en diferentes paquetes
                Class<?> transportTypeClass = null;
                try {
                    transportTypeClass = Class.forName("com.zkteco.android.biometric.module.fingerprintreader.TransportType");
                } catch (ClassNotFoundException e) {
                    try {
                        transportTypeClass = Class.forName("com.zkteco.android.biometric.core.device.TransportType");
                    } catch (ClassNotFoundException e2) {
                        try {
                            transportTypeClass = Class.forName("com.zkteco.android.biometric.TransportType");
                        } catch (ClassNotFoundException e3) {
                            Log.d(TAG, "❌ No se encontró TransportType en ningún paquete");
                        }
                    }
                }
                
                if (transportTypeClass != null) {
                    // Obtener el enum USB del TransportType
                    Object[] transportTypes = transportTypeClass.getEnumConstants();
                    Object usbTransportType = null;
                    for (Object transportType : transportTypes) {
                        if (transportType.toString().contains("USB") || transportType.toString().contains("usb")) {
                            usbTransportType = transportType;
                            break;
                        }
                    }
                    
                    if (usbTransportType == null) {
                        usbTransportType = transportTypes[0]; // Usar el primero si no se encuentra USB
                    }
                    
                    // Crear Map de configuración específica para ZKTeco
                    java.util.Map<String, Object> config = new java.util.HashMap<>();
                    config.put("transport", "USB");
                    config.put("device", "SLK20r");
                    config.put("vendorId", 6997);
                    config.put("productId", 289); // Corregido según documentación oficial
                    config.put("devicePath", "/dev/bus/usb/001/002");
                    config.put("deviceClass", 255);
                    
                    // Usar FingerprintFactory.createFingerprintSensor (método oficial)
                    java.lang.reflect.Method createMethod = FingerprintFactory.class.getMethod("createFingerprintSensor", 
                        android.content.Context.class, transportTypeClass, java.util.Map.class);
                    FingerprintSensor sensor = (FingerprintSensor) createMethod.invoke(null, getContext(), usbTransportType, config);
                    
                    Log.d(TAG, "✅ MÉTODO 2 EXITOSO: Sensor creado con FingerprintFactory.createFingerprintSensor");
                    return sensor;
                } else {
                    Log.d(TAG, "❌ TransportType no disponible, saltando createFingerprintSensor");
                }
            } catch (Exception e1) {
                Log.e(TAG, "❌ MÉTODO 2 FALLÓ: " + e1.getClass().getSimpleName() + " - " + e1.getMessage());
            }
            
            // Método 3: Intentar con FingerprintFactory.getDefault()
            try {
                Log.d(TAG, "Método 3: Intentando con FingerprintFactory.getDefault()");
                java.lang.reflect.Method getDefaultMethod = FingerprintFactory.class.getMethod("getDefault");
                Object factory = getDefaultMethod.invoke(null);
                
                java.lang.reflect.Method createMethod = factory.getClass().getMethod("createFingerprintSensor", android.content.Context.class);
                FingerprintSensor sensor = (FingerprintSensor) createMethod.invoke(factory, getContext());
                Log.d(TAG, "✅ MÉTODO 3 EXITOSO: Sensor creado con getDefault()");
                return sensor;
            } catch (Exception e2) {
                Log.e(TAG, "❌ MÉTODO 3 FALLÓ: " + e2.getClass().getSimpleName() + " - " + e2.getMessage());
            }
            
            // Método 4: Intentar con FingprintFactory
            try {
                Log.d(TAG, "Método 4: Intentando con FingprintFactory.getDefault()");
                Class<?> fingprintFactoryClass = Class.forName("com.zkteco.android.biometric.module.fingerprintreader.FingprintFactory");
                java.lang.reflect.Method getDefaultMethod = fingprintFactoryClass.getMethod("getDefault");
                Object factory = getDefaultMethod.invoke(null);
                
                java.lang.reflect.Method createMethod = factory.getClass().getMethod("createFingerprintSensor", android.content.Context.class);
                FingerprintSensor sensor = (FingerprintSensor) createMethod.invoke(factory, getContext());
                Log.d(TAG, "✅ MÉTODO 4 EXITOSO: Sensor creado con getDefault()");
                return sensor;
            } catch (Exception e3) {
                Log.e(TAG, "❌ MÉTODO 4 FALLÓ: " + e3.getClass().getSimpleName() + " - " + e3.getMessage());
            }
            
            
            // Método 6: Constructor directo (sin dispositivo - modo simulación)
            try {
                Log.d(TAG, "Método 6: Intentando con constructor directo (modo simulación)");
                java.lang.reflect.Constructor<?> constructor = FingerprintSensor.class.getConstructor();
                FingerprintSensor sensor = (FingerprintSensor) constructor.newInstance();
                Log.d(TAG, "✅ MÉTODO 6 EXITOSO: Sensor creado con constructor directo (modo simulación)");
                return sensor;
            } catch (Exception e5) {
                Log.e(TAG, "❌ MÉTODO 6 FALLÓ: " + e5.getClass().getSimpleName() + " - " + e5.getMessage());
            }
            
            return null;
        } catch (Exception e) {
            Log.e(TAG, "❌ ERROR en tryCreateSensor: " + e.getMessage());
            return null;
        }
    }
    
    private boolean initializeSensor(FingerprintSensor sensor) {
        try {
            Log.d(TAG, "🔧 INICIALIZANDO SENSOR...");
            
            // Explorar TODOS los métodos disponibles en el sensor
            Log.d(TAG, "🔍 EXPLORANDO TODOS LOS MÉTODOS DEL SENSOR:");
            java.lang.reflect.Method[] methods = sensor.getClass().getMethods();
            
            for (java.lang.reflect.Method method : methods) {
                String paramTypes = "";
                for (Class<?> paramType : method.getParameterTypes()) {
                    paramTypes += paramType.getSimpleName() + ", ";
                }
                if (paramTypes.length() > 0) {
                    paramTypes = paramTypes.substring(0, paramTypes.length() - 2);
                }
                Log.d(TAG, "  📋 " + method.getName() + "(" + paramTypes + ") -> " + method.getReturnType().getSimpleName());
            }
            
            // Configurar parámetros del sensor antes de intentar inicializar
            Log.d(TAG, "🔧 CONFIGURANDO PARÁMETROS DEL SENSOR...");
            
            try {
                Log.d(TAG, "Configurando setLibusbFlag(true)");
                java.lang.reflect.Method setLibusbFlagMethod = sensor.getClass().getMethod("setLibusbFlag", boolean.class);
                setLibusbFlagMethod.invoke(sensor, true);
                Log.d(TAG, "✅ setLibusbFlag configurado exitosamente");
            } catch (Exception e) {
                Log.d(TAG, "❌ Error configurando setLibusbFlag: " + e.getMessage());
            }
            
            try {
                Log.d(TAG, "Configurando setManualReleaseZKFinger(false)");
                java.lang.reflect.Method setManualReleaseMethod = sensor.getClass().getMethod("setManualReleaseZKFinger", boolean.class);
                setManualReleaseMethod.invoke(sensor, false);
                Log.d(TAG, "✅ setManualReleaseZKFinger configurado exitosamente");
            } catch (Exception e) {
                Log.d(TAG, "❌ Error configurando setManualReleaseZKFinger: " + e.getMessage());
            }
            
            try {
                java.lang.reflect.Method setCaptureModeMethod = sensor.getClass().getMethod("setCaptureMode", int.class);
                // Probar modo 0 por defecto
                Log.d(TAG, "Configurando setCaptureMode(0)");
                setCaptureModeMethod.invoke(sensor, 0);
                Log.d(TAG, "✅ setCaptureMode(0) configurado exitosamente");
            } catch (Exception e) {
                Log.d(TAG, "❌ Error configurando setCaptureMode(0): " + e.getMessage());
            }
            // Intentar setImageDPI(500,1.0)
            try {
                Log.d(TAG, "Configurando setImageDPI(500,1.0)");
                java.lang.reflect.Method setImageDPI = sensor.getClass().getMethod("setImageDPI", int.class, float.class);
                setImageDPI.invoke(sensor, 500, 1.0f);
                Log.d(TAG, "✅ setImageDPI configurado exitosamente");
            } catch (Exception e) {
                Log.d(TAG, "ℹ️ setImageDPI no disponible: " + e.getMessage());
            }
            // Asegurar fake off
            try {
                Log.d(TAG, "Configurando setFakeFunOn(0)");
                java.lang.reflect.Method setFakeFunOn = sensor.getClass().getMethod("setFakeFunOn", int.class);
                setFakeFunOn.invoke(sensor, 0);
                Log.d(TAG, "✅ setFakeFunOn(0) configurado exitosamente");
            } catch (Exception e) {
                Log.d(TAG, "ℹ️ setFakeFunOn no disponible: " + e.getMessage());
            }
            
            // Intentar inicialización oficial del SDK
            try {
                Map<String, Object> devParams = new HashMap<>();
                devParams.put(ParameterHelper.PARAM_KEY_VID, 6997);
                devParams.put(ParameterHelper.PARAM_KEY_PID, 289);
                sensor.initBiometricDevice(getContext(), TransportType.USB, devParams);
                Log.d(TAG, "✅ initBiometricDevice OK (USB)");
                try {
                    java.lang.reflect.Method getTransport = sensor.getClass().getMethod("getTransportType");
                    Object tt = getTransport.invoke(sensor);
                    Log.d(TAG, "🚚 TransportType reportado por sensor: " + tt);
                } catch (Exception ignore) {}
                // Intentar abrir con UsbDevice autorizado si existe primero
                try {
                    UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
                    if (um != null) {
                        java.util.HashMap<String, UsbDevice> deviceList = um.getDeviceList();
                        for (UsbDevice device : deviceList.values()) {
                            if (device.getVendorId() == 6997) {
                                Log.d(TAG, "🔗 Intentando openWithUsbDevice tras initBiometricDevice... VID=6997, PID=" + device.getProductId() + ", hasPermission=" + um.hasPermission(device));
                                if (!um.hasPermission(device)) {
                                    Log.d(TAG, "🛑 Sin permiso USB, solicitando...");
                                    um.requestPermission(device, usbPermissionIntent);
                                    return false; // continuará por broadcast
                                }
                                boolean opened = openWithUsbDevice(device);
                                if (opened) return true;
                                Log.d(TAG, "❌ openWithUsbDevice tras initBiometricDevice no abrió, probando open(int)...");
                                break;
                            }
                        }
                    }
                } catch (Exception e) {
                    Log.d(TAG, "⚠️ Error intentando openWithUsbDevice: " + e.getMessage());
                }
                try {
                    sensor.open(0);
                    Log.d(TAG, "✅ open(0) OK");
                    try {
                        java.lang.reflect.Method statusMethod = sensor.getClass().getMethod("getDeviceStatus", int.class);
                        Object status = statusMethod.invoke(sensor, 1);
                        Log.d(TAG, "📊 Estado tras open(0): " + status);
                    } catch (Exception ignore) {}
                    return true;
                } catch (Exception eOpen0) {
                    Log.d(TAG, "❌ open(0) falló: " + eOpen0.getMessage());
                }
                try {
                    sensor.open(1);
                    Log.d(TAG, "✅ open(1) OK");
                    try {
                        java.lang.reflect.Method statusMethod = sensor.getClass().getMethod("getDeviceStatus", int.class);
                        Object status = statusMethod.invoke(sensor, 1);
                        Log.d(TAG, "📊 Estado tras open(1): " + status);
                    } catch (Exception ignore) {}
                    return true;
                } catch (Exception eOpen1) {
                    Log.d(TAG, "❌ open(1) falló: " + eOpen1.getMessage());
                }
            } catch (Exception e) {
                Log.d(TAG, "❌ initBiometricDevice falló: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }

            // Intentar métodos específicos de ZKTeco SLK20r
            Log.d(TAG, "🔧 INTENTANDO MÉTODOS ESPECÍFICOS DE ZKTECO...");
            
            // Métodos específicos de ZKTeco que hemos visto en los logs anteriores
            String[] zktecoMethods = {
                "open", "initialize", "connect", "start", "enable", "activate", "powerOn", "wakeUp",
                "init", "begin", "setup", "prepare", "ready", "power", "turnOn", "switchOn",
                "openDevice", "initDevice", "connectDevice", "startDevice", "enableDevice"
            };
            
            for (String methodName : zktecoMethods) {
                try {
                    Log.d(TAG, "🔧 Intentando sensor." + methodName + "()");
                    java.lang.reflect.Method method = sensor.getClass().getMethod(methodName);
                    Object result = method.invoke(sensor);
                    
                    if (result instanceof Boolean) {
                        boolean boolResult = (Boolean) result;
                        Log.d(TAG, "✅ MÉTODO EXITOSO: sensor." + methodName + "() - Resultado: " + boolResult);
                        if (boolResult) {
                            Log.d(TAG, "🎉 SENSOR INICIALIZADO CORRECTAMENTE");
                            return true;
                        }
                    } else {
                        Log.d(TAG, "✅ MÉTODO EXITOSO: sensor." + methodName + "() - Resultado: " + result);
                        Log.d(TAG, "🎉 SENSOR INICIALIZADO CORRECTAMENTE");
                        return true;
                    }
                } catch (Exception e) {
                    Log.d(TAG, "❌ MÉTODO FALLÓ: sensor." + methodName + "() - " + e.getClass().getSimpleName());
                }
            }
            
            // Intentar métodos con parámetros específicos
            Log.d(TAG, "🔧 INTENTANDO MÉTODOS CON PARÁMETROS...");
            
            try {
                // Intentar open() con parámetros - método correcto encontrado en logs
                java.lang.reflect.Method openMethod = sensor.getClass().getMethod("open", int.class);
                openMethod.invoke(sensor, 1);
                Log.d(TAG, "✅ MÉTODO EXITOSO: sensor.open(1) - Dispositivo abierto");
                return true;
            } catch (java.lang.reflect.InvocationTargetException e) {
                // InvocationTargetException significa que el método se ejecutó pero falló internamente
                Log.d(TAG, "❌ MÉTODO FALLÓ: sensor.open(1) - InvocationTargetException: " + e.getCause().getMessage());
                
                // Intentar con diferentes valores de parámetro
                try {
                    java.lang.reflect.Method openMethod2 = sensor.getClass().getMethod("open", int.class);
                    openMethod2.invoke(sensor, 0);
                    Log.d(TAG, "✅ MÉTODO EXITOSO: sensor.open(0) - Dispositivo abierto");
                    return true;
                } catch (Exception e2) {
                    Log.d(TAG, "❌ MÉTODO FALLÓ: sensor.open(0) - " + e2.getCause().getMessage());
                }
                
                try {
                    java.lang.reflect.Method openMethod3 = sensor.getClass().getMethod("open", int.class);
                    openMethod3.invoke(sensor, 2);
                    Log.d(TAG, "✅ MÉTODO EXITOSO: sensor.open(2) - Dispositivo abierto");
                    return true;
                } catch (Exception e2) {
                    Log.d(TAG, "❌ MÉTODO FALLÓ: sensor.open(2) - " + e2.getCause().getMessage());
                }
                
            } catch (Exception e) {
                Log.d(TAG, "❌ MÉTODO FALLÓ: sensor.open(1) - " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
            
            // Intentar open() con UsbDevice autorizado si existe
            try {
                UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
                if (um != null) {
                    java.util.HashMap<String, UsbDevice> deviceList = um.getDeviceList();
                    for (UsbDevice device : deviceList.values()) {
                        if (device.getVendorId() == 6997) {
                            if (!um.hasPermission(device)) {
                                Log.d(TAG, "🛑 Sin permiso USB, solicitando...");
                                um.requestPermission(device, usbPermissionIntent);
                                // Devolver false por ahora; el flujo continuará en el BroadcastReceiver
                                return false;
                            }
                            try {
                                java.lang.reflect.Method openUsbMethod = sensor.getClass().getMethod("open", UsbDevice.class);
                                openUsbMethod.invoke(sensor, device);
                                Log.d(TAG, "✅ open(UsbDevice) exitoso tras permiso");
                                return true;
                            } catch (Exception e) {
                                Log.d(TAG, "❌ open(UsbDevice) falló: " + e.getMessage());
                            }
                        }
                    }
                }
            } catch (Exception e) {
                Log.d(TAG, "❌ Error en open(UsbDevice): " + e.getMessage());
            }
            
            try {
                // Intentar initBiometricDevice - método específico de ZKTeco
                java.lang.reflect.Method initBioMethod = sensor.getClass().getMethod("initBiometricDevice", android.content.Context.class, Class.forName("com.zkteco.android.biometric.module.fingerprintreader.TransportType"), java.util.Map.class);
                // No tenemos los parámetros correctos, pero registramos que existe
                Log.d(TAG, "📋 Método initBiometricDevice disponible pero requiere parámetros específicos");
            } catch (Exception e) {
                Log.d(TAG, "❌ Método initBiometricDevice no disponible: " + e.getMessage());
            }
            
            // Si no hay métodos de inicialización, intentar con UsbManager + permiso y abrir
            try {
                UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
                if (um != null) {
                    java.util.HashMap<String, UsbDevice> deviceList = um.getDeviceList();
                    for (UsbDevice device : deviceList.values()) {
                        if (device.getVendorId() == 6997) {
                            if (!um.hasPermission(device)) {
                                Log.d(TAG, "🛑 Sin permiso USB, solicitando...");
                                um.requestPermission(device, usbPermissionIntent);
                                return false; // Continúa por broadcast
                            }
                            boolean opened = openWithUsbDevice(device);
                            if (opened) {
                                Log.d(TAG, "✅ Inicializado via UsbDevice");
                                return true;
                            }
                        }
                    }
                }
            } catch (Exception e) {
                Log.d(TAG, "❌ Fallback UsbManager falló: " + e.getMessage());
            }
            Log.d(TAG, "⚠️ No se encontraron métodos de inicialización automática");
            return false;
            
        } catch (Exception e) {
            Log.e(TAG, "❌ ERROR en initializeSensor: " + e.getMessage());
            return false;
        }
    }
    
    private void setupFingerprintListener() {
        if (fingerprintSensor == null) return;
        Log.d(TAG, "🔧 CONFIGURANDO LISTENER DEL SENSOR (canal 0)...");
        fingerprintSensor.setFingerprintCaptureListener(0, new FingerprintCaptureListener() {
            @Override
            public void captureOK(byte[] template) {
                Log.d(TAG, "captureOK(ch0) recibido (solo logging; se procesa en extractOK)");
            }

            @Override
            public void captureError(FingerprintException e) {
                notifyError("Error al capturar huella: " + e.getMessage());
            }

            @Override
            public void extractOK(byte[] template) {
                processCapturedFingerprint(template);
            }

            @Override
            public void extractError(int errorCode) {
                notifyError("Error al extraer template: " + errorCode);
                // Evitar cierre de app: capturar excepciones del listener
            }
        });

        // Configurar también el canal 1 por seguridad, ya que algunos SDK usan 1
        try {
            Log.d(TAG, "🔧 CONFIGURANDO LISTENER DEL SENSOR (canal 1)...");
            fingerprintSensor.setFingerprintCaptureListener(1, new FingerprintCaptureListener() {
                @Override
                public void captureOK(byte[] template) {
                    Log.d(TAG, "captureOK(ch1) recibido (solo logging; se procesa en extractOK)");
                }

                @Override
                public void captureError(FingerprintException e) {
                    notifyError("Error al capturar huella (ch1): " + e.getMessage());
                }

                @Override
                public void extractOK(byte[] template) {
                    processCapturedFingerprint(template);
                }

                @Override
                public void extractError(int errorCode) {
                    notifyError("Error al extraer template (ch1): " + errorCode);
                }
            });
        } catch (Exception ignore) {}
    }

    /**
     * Abre el sensor usando un UsbDevice autorizado
     */
    private boolean openWithUsbDevice(UsbDevice device) {
        try {
            if (device == null) {
                Log.d(TAG, "🛑 UsbDevice es null");
                return false;
            }

            if (usbManager == null) {
                usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            }

            if (usbManager != null && !usbManager.hasPermission(device)) {
                Log.d(TAG, "🛑 Sin permiso para el dispositivo USB, solicitando...");
                usbManager.requestPermission(device, usbPermissionIntent);
                return false;
            }

            // Asegurar instancia del sensor
            if (fingerprintSensor == null) {
                try {
                    java.lang.reflect.Constructor<?> constructor = FingerprintSensor.class.getConstructor();
                    fingerprintSensor = (FingerprintSensor) constructor.newInstance();
                    Log.d(TAG, "✅ Sensor instanciado por constructor");
                } catch (Exception e) {
                    Log.d(TAG, "❌ No se pudo instanciar por constructor: " + e.getMessage());
                    try {
                        Map<String, Object> params = new HashMap<>();
                        params.put(ParameterHelper.PARAM_KEY_VID, 6997);
                        params.put(ParameterHelper.PARAM_KEY_PID, 289);
                        fingerprintSensor = FingerprintFactory.createFingerprintSensor(getContext(), TransportType.USB, params);
                        Log.d(TAG, "✅ Sensor instanciado por FingerprintFactory");
                    } catch (Exception ex) {
                        Log.d(TAG, "❌ No se pudo instanciar por FingerprintFactory: " + ex.getMessage());
                        return false;
                    }
                }
            }

            // Configuración previa
            try {
                java.lang.reflect.Method setLibusbFlagMethod = fingerprintSensor.getClass().getMethod("setLibusbFlag", boolean.class);
                setLibusbFlagMethod.invoke(fingerprintSensor, true);
                Log.d(TAG, "⚙️ setLibusbFlag(true)");
            } catch (Exception ignore) {}
            try {
                java.lang.reflect.Method setManualReleaseMethod = fingerprintSensor.getClass().getMethod("setManualReleaseZKFinger", boolean.class);
                setManualReleaseMethod.invoke(fingerprintSensor, false);
                Log.d(TAG, "⚙️ setManualReleaseZKFinger(false)");
            } catch (Exception ignore) {}
            try {
                java.lang.reflect.Method setCaptureModeMethod = fingerprintSensor.getClass().getMethod("setCaptureMode", int.class);
                setCaptureModeMethod.invoke(fingerprintSensor, 1);
                Log.d(TAG, "⚙️ setCaptureMode(1)");
            } catch (Exception ignore) {}

            // Cargar parámetros al sensor si el SDK lo permite
            try {
                Map<String, Object> params = new HashMap<>();
                params.put(ParameterHelper.PARAM_KEY_VID, device.getVendorId());
                params.put(ParameterHelper.PARAM_KEY_PID, device.getProductId());
                java.lang.reflect.Method addParams = fingerprintSensor.getClass().getMethod("addParameters", Map.class);
                addParams.invoke(fingerprintSensor, params);
                Log.d(TAG, "⚙️ addParameters({VID=" + device.getVendorId() + ",PID=" + device.getProductId() + "})");
            } catch (Exception ignore) {}

            // Explorar y configurar claves de ParameterHelper relacionadas a USB
            try {
                java.lang.reflect.Field[] phFields = ParameterHelper.class.getFields();
                for (java.lang.reflect.Field f : phFields) {
                    String name = f.getName();
                    if (name.contains("USB") || name.contains("VID") || name.contains("PID")) {
                        Object keyVal = f.get(null);
                        Log.d(TAG, "🔑 ParameterHelper." + name + " = " + keyVal);
                        try {
                            if (name.contains("USBFS")) {
                                // Ruta típica de usbfs en Android
                                java.lang.reflect.Method addParam = fingerprintSensor.getClass().getMethod("addParameter", String.class, Object.class);
                                addParam.invoke(fingerprintSensor, (String) keyVal, "/dev/bus/usb");
                                Log.d(TAG, "⚙️ addParameter(USBFS, /dev/bus/usb)");
                            }
                            if (name.contains("VID")) {
                                java.lang.reflect.Method addParam = fingerprintSensor.getClass().getMethod("addParameter", String.class, Object.class);
                                addParam.invoke(fingerprintSensor, (String) keyVal, 6997);
                            }
                            if (name.contains("PID")) {
                                java.lang.reflect.Method addParam = fingerprintSensor.getClass().getMethod("addParameter", String.class, Object.class);
                                addParam.invoke(fingerprintSensor, (String) keyVal, 289);
                            }
                            if (name.contains("DEVICE") || name.contains("DEV_NAME") || name.contains("DEVPATH")) {
                                String devName = device.getDeviceName();
                                java.lang.reflect.Method addParam = fingerprintSensor.getClass().getMethod("addParameter", String.class, Object.class);
                                addParam.invoke(fingerprintSensor, (String) keyVal, devName);
                                Log.d(TAG, "⚙️ addParameter(" + name + ", " + devName + ")");
                            }
                        } catch (Exception inner) {
                            // Continuar si no aplica
                        }
                    }
                }
            } catch (Exception e) {
                Log.d(TAG, "ℹ️ No se pudieron explorar/aplicar claves de ParameterHelper: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }

            // Intentar configurar vía initBiometricDevice si existe
            try {
                Map<String, Object> devParams = new HashMap<>();
                devParams.put(ParameterHelper.PARAM_KEY_VID, device.getVendorId());
                devParams.put(ParameterHelper.PARAM_KEY_PID, device.getProductId());
                java.lang.reflect.Method initBio = fingerprintSensor.getClass().getMethod("initBiometricDevice", Context.class, TransportType.class, Map.class);
                initBio.invoke(fingerprintSensor, getContext(), TransportType.USB, devParams);
                Log.d(TAG, "⚙️ initBiometricDevice(Context,USB,{VID=" + device.getVendorId() + ",PID=" + device.getProductId() + "})");
            } catch (Exception e) {
                Log.d(TAG, "ℹ️ initBiometricDevice no disponible o falló: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }

            // Intento A: Abrir con UsbDevice con manejo de InvocationTargetException y fallback
            boolean opened = false;
            Exception openError = null;
            Log.d(TAG, "🔎 Dispositivo objetivo: VID=" + device.getVendorId() + ", PID=" + device.getProductId() + ", Name=" + device.getDeviceName());
            try {
                java.lang.reflect.Method openUsbMethod = fingerprintSensor.getClass().getMethod("open", UsbDevice.class);
                Object result = openUsbMethod.invoke(fingerprintSensor, device);
                Log.d(TAG, "✅ open(UsbDevice) exitoso, result=" + result);
                opened = true;
            } catch (NoSuchMethodException e) {
                Log.d(TAG, "⚠️ open(UsbDevice) no existe, intentando open(Object)");
                try {
                    java.lang.reflect.Method openObjectMethod = fingerprintSensor.getClass().getMethod("open", Object.class);
                    Object result = openObjectMethod.invoke(fingerprintSensor, device);
                    Log.d(TAG, "✅ open(Object) exitoso con UsbDevice, result=" + result);
                    opened = true;
                } catch (Exception e2) {
                    Log.d(TAG, "❌ open(Object) falló: " + e2.getClass().getSimpleName() + ": " + e2.getMessage());
                    openError = e2;
                }
            } catch (java.lang.reflect.InvocationTargetException ite) {
                Throwable cause = ite.getCause();
                Log.d(TAG, "❌ open(UsbDevice) lanzó InvocationTargetException: " + (cause != null ? cause.getClass().getSimpleName() + ": " + cause.getMessage() : "null"));
                openError = ite;
                // Intento A2: Probar con UsbDeviceConnection via open(Object)
                try {
                    if (usbManager != null) {
                        android.hardware.usb.UsbDeviceConnection conn = usbManager.openDevice(device);
                        Log.d(TAG, "🔌 UsbDeviceConnection: " + (conn != null ? "OK" : "null"));
                        if (conn != null) {
                            // Establecer la interfaz de la conexión si es necesario
                            try {
                                if (device.getInterfaceCount() > 0) {
                                    for (int i = 0; i < device.getInterfaceCount(); i++) {
                                        android.hardware.usb.UsbInterface intf = device.getInterface(i);
                                        boolean claimed = conn.claimInterface(intf, true);
                                        Log.d(TAG, "📎 claimInterface(" + i + "): " + claimed + ", endpoints=" + intf.getEndpointCount());
                                        for (int e = 0; e < intf.getEndpointCount(); e++) {
                                            android.hardware.usb.UsbEndpoint ep = intf.getEndpoint(e);
                                            Log.d(TAG, "   ↳ EP " + e + ": addr=" + ep.getAddress() + ", dir=" + ep.getDirection() + ", type=" + ep.getType() + ", maxPkt=" + ep.getMaxPacketSize());
                                        }
                                        // Intentar open(Object) con esta interfaz
                                        try {
                                            java.lang.reflect.Method openObjectMethod = fingerprintSensor.getClass().getMethod("open", Object.class);
                                            Object resultIntf = openObjectMethod.invoke(fingerprintSensor, intf);
                                            Log.d(TAG, "✅ open(Object) con UsbInterface[" + i + "] exitoso, result=" + resultIntf);
                                            opened = true;
                                            break;
                                        } catch (Exception eIntf) {
                                            Log.d(TAG, "❌ open(Object) con UsbInterface[" + i + "] falló: " + eIntf.getClass().getSimpleName() + ": " + eIntf.getMessage());
                                        }
                                    }
                                }
                            } catch (Exception ignore) {}
                            // Cargar parámetros explícitos comunes (usbfs, devname, fd)
                            try {
                                java.lang.reflect.Method addParam = fingerprintSensor.getClass().getMethod("addParameter", String.class, Object.class);
                                addParam.invoke(fingerprintSensor, "param.key.usbfs", "/dev/bus/usb");
                                addParam.invoke(fingerprintSensor, "param.key.devname", device.getDeviceName());
                                addParam.invoke(fingerprintSensor, "param.key.fd", conn.getFileDescriptor());
                                Log.d(TAG, "⚙️ addParameter(usbfs, devname, fd)");
                            } catch (Exception eAdd) {
                                Log.d(TAG, "ℹ️ addParameter usbfs/devname/fd no disponible: " + eAdd.getClass().getSimpleName() + ": " + eAdd.getMessage());
                            }
                            try {
                                java.lang.reflect.Method openObjectMethod = fingerprintSensor.getClass().getMethod("open", Object.class);
                                Object result = openObjectMethod.invoke(fingerprintSensor, conn);
                                Log.d(TAG, "✅ open(Object) con UsbDeviceConnection exitoso, result=" + result);
                                opened = true;
                            } catch (Exception e2) {
                                Log.d(TAG, "❌ open(Object) con UsbDeviceConnection falló: " + e2.getClass().getSimpleName() + ": " + e2.getMessage());
                            }
                            if (!opened) {
                                // Intento con Map de parámetros conocidos
                                try {
                                    java.util.HashMap<String, Object> devMap = new java.util.HashMap<>();
                                    devMap.put("vid", device.getVendorId());
                                    devMap.put("pid", device.getProductId());
                                    devMap.put("usbfs", "/dev/bus/usb");
                                    devMap.put("devname", device.getDeviceName());
                                    devMap.put("connection", conn);
                                    devMap.put("interface", device.getInterfaceCount() > 0 ? device.getInterface(0) : null);
                                    java.lang.reflect.Method openObjectMethod = fingerprintSensor.getClass().getMethod("open", Object.class);
                                    Object result = openObjectMethod.invoke(fingerprintSensor, devMap);
                                    Log.d(TAG, "✅ open(Object) con Map de parámetros exitoso, result=" + result);
                                    opened = true;
                                } catch (Exception mapEx) {
                                    Log.d(TAG, "❌ open(Object) con Map falló: " + mapEx.getClass().getSimpleName() + ": " + mapEx.getMessage());
                                }
                            }
                        }
                    }
                } catch (Exception e3) {
                    Log.d(TAG, "⚠️ Error creando UsbDeviceConnection: " + e3.getClass().getSimpleName() + ": " + e3.getMessage());
                }
            } catch (Exception e) {
                Log.d(TAG, "❌ open(UsbDevice) falló: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                openError = e;
            }

            if (!opened) {
                // Fallback 1: Alternar libusb y reintentar open(Object)
                try {
                    java.lang.reflect.Method libusb = fingerprintSensor.getClass().getMethod("setLibusbFlag", boolean.class);
                    libusb.invoke(fingerprintSensor, false);
                    Log.d(TAG, "🔁 setLibusbFlag(false) aplicado (fallback)");
                } catch (Exception ignore) {}
                try {
                    java.lang.reflect.Method openObjectMethod = fingerprintSensor.getClass().getMethod("open", Object.class);
                    Object result = openObjectMethod.invoke(fingerprintSensor, device);
                    Log.d(TAG, "✅ Fallback: open(Object) exitoso tras cambiar libusb");
                    opened = true;
                } catch (Exception e2) {
                    Log.d(TAG, "❌ Fallback open(Object) también falló: " + e2.getClass().getSimpleName() + ": " + e2.getMessage());
                }
                // Fallback 1b: Probar con deviceName (ruta) y file descriptor
                if (!opened) {
                    try {
                        String devPath = device.getDeviceName();
                        java.lang.reflect.Method openObjectMethod = fingerprintSensor.getClass().getMethod("open", Object.class);
                        Object result = openObjectMethod.invoke(fingerprintSensor, devPath);
                        Log.d(TAG, "✅ Fallback: open(Object) con deviceName exitoso, result=" + result);
                        opened = true;
                    } catch (Exception e3) {
                        Log.d(TAG, "❌ Fallback open(Object) con deviceName falló: " + e3.getClass().getSimpleName() + ": " + e3.getMessage());
                    }
                }
                if (!opened) {
                    try {
                        if (usbManager != null) {
                            android.hardware.usb.UsbDeviceConnection conn = usbManager.openDevice(device);
                            if (conn != null) {
                                Integer fd = conn.getFileDescriptor();
                                java.lang.reflect.Method openObjectMethod = fingerprintSensor.getClass().getMethod("open", Object.class);
                                Object result = openObjectMethod.invoke(fingerprintSensor, fd);
                                Log.d(TAG, "✅ Fallback: open(Object) con fileDescriptor exitoso, result=" + result);
                                opened = true;
                            }
                        }
                    } catch (Exception e4) {
                        Log.d(TAG, "❌ Fallback open(Object) con fileDescriptor falló: " + e4.getClass().getSimpleName() + ": " + e4.getMessage());
                    }
                }
            }

            if (!opened) {
                // Fallback 2: Reintentar con open(int) 0/1/2
                int[] channels = new int[]{0,1,2};
                for (int ch : channels) {
                    try {
                        java.lang.reflect.Method openInt = fingerprintSensor.getClass().getMethod("open", int.class);
                        openInt.invoke(fingerprintSensor, ch);
                        Log.d(TAG, "✅ Fallback: open(" + ch + ") exitoso");
                        opened = true;
                        break;
                    } catch (java.lang.reflect.InvocationTargetException ite2) {
                        Throwable cause = ite2.getCause();
                        Log.d(TAG, "❌ Fallback open(" + ch + ") InvocationTargetException: " + (cause != null ? cause.getMessage() : "null"));
                    } catch (Exception e2) {
                        Log.d(TAG, "❌ Fallback open(" + ch + ") falló: " + e2.getClass().getSimpleName() + ": " + e2.getMessage());
                    }
                }
            }

            if (!opened) {
                // Fallback 3: openAndReboot(0) y reintentar open(0)
                try {
                    java.lang.reflect.Method openReboot = fingerprintSensor.getClass().getMethod("openAndReboot", int.class);
                    openReboot.invoke(fingerprintSensor, 0);
                    Log.d(TAG, "🔁 Fallback: openAndReboot(0) invocado");
                    try {
                        java.lang.reflect.Method openInt = fingerprintSensor.getClass().getMethod("open", int.class);
                        openInt.invoke(fingerprintSensor, 0);
                        Log.d(TAG, "✅ Fallback: open(0) tras reboot exitoso");
                        opened = true;
                    } catch (Exception e2) {
                        Log.d(TAG, "❌ Fallback open(0) tras reboot falló: " + e2.getClass().getSimpleName() + ": " + e2.getMessage());
                    }
                } catch (Exception e) {
                    Log.d(TAG, "❌ Fallback openAndReboot(0) falló: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                }
            }

            if (!opened) {
                Log.d(TAG, "🛑 No se pudo abrir el dispositivo USB tras múltiples intentos. Último error: " + (openError != null ? openError.getClass().getSimpleName() + ": " + openError.getMessage() : "desconocido"));
                return false;
            }

            // Comprobar estado si es posible (best-effort)
            try {
                java.lang.reflect.Method statusMethod = fingerprintSensor.getClass().getMethod("getDeviceStatus", int.class);
                Object status0 = statusMethod.invoke(fingerprintSensor, 0);
                Object status1 = statusMethod.invoke(fingerprintSensor, 1);
                Log.d(TAG, "📊 Estado tras abrir (ch0): " + status0 + ", (ch1): " + status1);
                try {
                    java.lang.reflect.Method exceptStatusMethod = fingerprintSensor.getClass().getMethod("getExceptStatus");
                    Object ex = exceptStatusMethod.invoke(fingerprintSensor);
                    Log.d(TAG, "📟 getExceptStatus(): " + ex);
                } catch (Exception ignore) {}
                try {
                    java.lang.reflect.Method fw = fingerprintSensor.getClass().getMethod("getFirmwareVersion");
                    Object fwv = fw.invoke(fingerprintSensor);
                    Log.d(TAG, "🧬 Firmware: " + fwv);
                } catch (Exception ignore) {}
                boolean ch0Closed = (status0 instanceof Integer && ((Integer) status0) == -1);
                boolean ch1Closed = (status1 instanceof Integer && ((Integer) status1) == -1);
                if (ch0Closed && ch1Closed) {
                    Log.d(TAG, "🛑 Estado indica no abierto (-1)");
                    // Intento reconfigurar y reabrir cambiando libusb y parámetros
                    try {
                        java.lang.reflect.Method libusb = fingerprintSensor.getClass().getMethod("setLibusbFlag", boolean.class);
                        libusb.invoke(fingerprintSensor, false);
                        Log.d(TAG, "🔁 setLibusbFlag(false) aplicado (post-open)");
                    } catch (Exception ignore) {}
                    try {
                        java.lang.reflect.Method addParam = fingerprintSensor.getClass().getMethod("addParameter", String.class, Object.class);
                        addParam.invoke(fingerprintSensor, "param.key.usbfs", "/dev/bus/usb");
                        addParam.invoke(fingerprintSensor, "param.key.devname", device.getDeviceName());
                        Log.d(TAG, "🔁 addParameter(usbfs, devname) re-aplicados");
                    } catch (Exception ignore) {}
                    // Cerrar canales si existen y reintentar open(int)
                    try {
                        java.lang.reflect.Method closeMethod = fingerprintSensor.getClass().getMethod("close", int.class);
                        closeMethod.invoke(fingerprintSensor, 0);
                        closeMethod.invoke(fingerprintSensor, 1);
                        Log.d(TAG, "🔒 close(0) & close(1) invocados");
                    } catch (Exception ignore) {}
                    try {
                        java.lang.reflect.Method openInt = fingerprintSensor.getClass().getMethod("open", int.class);
                        openInt.invoke(fingerprintSensor, 0);
                        Object s0b = statusMethod.invoke(fingerprintSensor, 0);
                        Object s1b = statusMethod.invoke(fingerprintSensor, 1);
                        Log.d(TAG, "📊 Estado tras re-open(0): ch0=" + s0b + ", ch1=" + s1b);
                        if (s0b instanceof Integer && ((Integer) s0b) != -1) {
                            isScannerConnected = true;
                            return true;
                        }
                    } catch (Exception ignore) {}
                    // Intento final: openAndReboot(0)
                    try {
                        java.lang.reflect.Method openReboot = fingerprintSensor.getClass().getMethod("openAndReboot", int.class);
                        openReboot.invoke(fingerprintSensor, 0);
                        Object status2_0 = statusMethod.invoke(fingerprintSensor, 0);
                        Object status2_1 = statusMethod.invoke(fingerprintSensor, 1);
                        Log.d(TAG, "📊 Estado tras openAndReboot(0): ch0=" + status2_0 + ", ch1=" + status2_1);
                        if ((status2_0 instanceof Integer && ((Integer) status2_0) != -1) || (status2_1 instanceof Integer && ((Integer) status2_1) != -1)) {
                            isScannerConnected = true;
                            return true;
                        }
                    } catch (Exception eRe) {
                        Log.d(TAG, "❌ openAndReboot(0) falló: " + eRe.getMessage());
                    }
                    return false;
                }
            } catch (Exception ignore) {}

            isScannerConnected = true;
            return true;
        } catch (Exception e) {
            Log.e(TAG, "❌ openWithUsbDevice falló: " + e.getClass().getSimpleName() + ": " + e.getMessage(), e);
            return false;
        }
    }
    
    private void processCapturedFingerprint(byte[] template) {
        try {
            // Throttle y exclusión mutua para evitar múltiples procesamientos por una sola pasada
            long now = System.currentTimeMillis();
            if (isProcessingEvent) {
                Log.d(TAG, "⏳ Evento en curso; se ignora nuevo template");
                return;
            }
            if (now - lastEventAtMs < EVENT_THROTTLE_MS) {
                Log.d(TAG, "⛔ Throttle activo (" + (now - lastEventAtMs) + "ms); se ignora");
                return;
            }
            if (!isCapturing) {
                Log.d(TAG, "⚠️ Evento recibido fuera de captura activa; ignorado");
                return;
            }
            isProcessingEvent = true;
            lastEventAtMs = now;
            String capturedCanonical = canonicalizeTemplate(template);
            Integer lastLen = null;
            Integer lastQuality = null;
            try {
                if (fingerprintSensor != null) {
                    java.lang.reflect.Method getLen = fingerprintSensor.getClass().getMethod("getLastTempLen");
                    Object len = getLen.invoke(fingerprintSensor);
                    if (len instanceof Integer) lastLen = (Integer) len;
                }
            } catch (Exception ignore) {}
            try {
                if (fingerprintSensor != null) {
                    java.lang.reflect.Method getQual = fingerprintSensor.getClass().getMethod("getLastQuality");
                    Object q = getQual.invoke(fingerprintSensor);
                    if (q instanceof Integer) lastQuality = (Integer) q;
                }
            } catch (Exception ignore) {}

            // Validar que haya captura en curso y que el template sea utilizable
            if (!isCapturing) {
                Log.d(TAG, "⚠️ Evento recibido sin captura activa; se ignora");
                isProcessingEvent = false;
                return;
            }

            // Medidas y checks del evento actual
            int paramLen = (template != null ? template.length : 0);
            int b64Len = (capturedCanonical != null ? capturedCanonical.length() : 0);

            // Consultar fake status si existe
            Integer fakeStatus = null;
            try {
                if (fingerprintSensor != null) {
                    java.lang.reflect.Method getFakeSt = fingerprintSensor.getClass().getMethod("getFakeStatus");
                    Object fs = getFakeSt.invoke(fingerprintSensor);
                    if (fs instanceof Integer) fakeStatus = (Integer) fs;
                }
            } catch (Exception ignore) {}

            boolean meetsLengths = (paramLen >= MIN_TEMPLATE_LEN_BYTES) && (b64Len >= MIN_TEMPLATE_BASE64_LEN);
            // Algunos firmwares reportan quality=0. Para registro usaremos verificación de doble muestra en vez de quality.
            boolean meetsQualityForRegistration = true;
            boolean meetsQualityForIdentify = true; // permitimos quality=0 en identificación
            boolean isNotFake = (fakeStatus == null) || (fakeStatus == 0) || (fakeStatus == -1);
            boolean hasUsableTemplateRegistration = meetsLengths && meetsQualityForRegistration && isNotFake;
            boolean hasUsableTemplateIdentify = meetsLengths && meetsQualityForIdentify && isNotFake;

            // Nota: quality puede ser 0; usamos tamaño como criterio robusto
            Log.d(TAG, "📈 Medidas de captura -> len=" + lastLen + ", quality=" + lastQuality + ", base64Len=" + b64Len + ", paramLen=" + paramLen + ", fakeStatus=" + fakeStatus);
            if (!meetsLengths) {
                Log.d(TAG, "❌ Rechazado por tamaño insuficiente: paramLen=" + paramLen + ", base64Len=" + b64Len);
                isProcessingEvent = false;
                return;
            }
            if (!isNotFake) {
                Log.d(TAG, "❌ Rechazado por fakeStatus: " + fakeStatus);
                isProcessingEvent = false;
                return;
            }

            if (isRegistrationMode && currentUserId != null) {
                if (!hasUsableTemplateRegistration) {
                    Log.d(TAG, "❌ Registro rechazado: calidad insuficiente o fakeStatus");
                    isProcessingEvent = false;
                    return;
                }
                // Enrolamiento en 2 pasos para confirmar dedo real y estabilidad
                if (enrollSampleCount == 0) {
                    enrollFirstTemplateCanonical = capturedCanonical;
                    enrollFirstAtMs = System.currentTimeMillis();
                    enrollSampleCount = 1;
                    Log.d(TAG, "🟡 Primer sample de registro capturado (esperando confirmación)");
                    isProcessingEvent = false;
                    return; // esperar el siguiente sample
                } else {
                    long delta = System.currentTimeMillis() - enrollFirstAtMs;
                    boolean withinWindow = delta >= 200 && delta <= 5000; // 0.2s a 5s
                    boolean consistent = enrollFirstTemplateCanonical != null && !enrollFirstTemplateCanonical.equals(capturedCanonical);
                    // Si el SDK da distintos templates por el mismo dedo, la consistencia por igualdad puede fallar;
                    // exigimos simplemente dos capturas válidas en ventana temporal
                    if (!withinWindow) {
                        Log.d(TAG, "⚠️ Segundo sample fuera de ventana temporal (" + delta + "ms); reiniciando");
                        enrollSampleCount = 0;
                        isProcessingEvent = false;
                        return;
                    }
                    if (!consistent) {
                        Log.d(TAG, "⚠️ Segundo sample idéntico al primero; esperando uno distinto para robustez");
                        isProcessingEvent = false;
                        return;
                    }
                    // Validación algorítmica: los dos templates deben coincidir por algoritmo del SDK
                    boolean selfMatch = verifyTemplatesByAlgorithm(enrollFirstTemplateCanonical, capturedCanonical);
                    if (!selfMatch) {
                        Log.d(TAG, "❌ Segundo sample no coincide con el primero por algoritmo; reiniciando");
                        enrollSampleCount = 0;
                        isProcessingEvent = false;
                        return;
                    }
                    // Aceptar segunda captura
                    Log.d(TAG, "🟢 Segundo sample recibido; finalizando registro");
                    enrollSampleCount = 0;
                    enrollFirstTemplateCanonical = null;
                }

                Log.d(TAG, "Procesando registro de huella para usuario: " + currentUserId);
                // No guardar en estado local; delegar persistencia al backend vía app.
                notifyRegistration(currentUserId, currentEmployeeId, true, capturedCanonical, lastLen, lastQuality);

                currentUserId = null;
                currentEmployeeId = null;
                isRegistrationMode = false;
                stopCaptureSafely();

            } else {
                if (!hasUsableTemplateIdentify) {
                    Log.d(TAG, "❌ Identificación rechazada: tamaños insuficientes o fakeStatus");
                    isProcessingEvent = false;
                    return;
                }
                // Identificación: realizar matching local con referencias cargadas
                Log.d(TAG, "Procesando identificación de huella (matching local)");
                String bestEmp = null;
                int bestScore = 0;
                try {
                    // Fallback rápido por igualdad exacta del template Base64
                    for (Reference ref : referenceTemplates) {
                        if (capturedCanonical.equals(ref.templateBase64)) {
                            bestEmp = ref.employeeId;
                            bestScore = 100;
                            break;
                        }
                    }
                    // Si no hubo igualdad exacta, usar verificación del SDK
                    if (bestEmp == null) {
                        byte[] probe = Base64.decode(capturedCanonical, Base64.NO_WRAP);
                        for (Reference ref : referenceTemplates) {
                            try {
                                byte[] refTpl = Base64.decode(ref.templateBase64, Base64.NO_WRAP);
                                Integer score = computeMatchScore(probe, refTpl);
                                int s = (score != null ? score.intValue() : 0);
                                if (s > bestScore) {
                                    bestScore = s;
                                    bestEmp = ref.employeeId;
                                }
                            } catch (Exception ignore) {}
                        }
                    }
                } catch (Exception e) {
                    Log.d(TAG, "Error en matching local: " + e.getMessage());
                }

                boolean isMatch = (bestEmp != null) && (bestScore >= matchThreshold);
                notifyIdentificationWithTemplate(isMatch ? bestEmp : null, isMatch ? bestEmp : null, isMatch, bestScore, capturedCanonical, lastLen, lastQuality);
                stopCaptureSafely();
            }
            isProcessingEvent = false;
        } catch (Exception e) {
            Log.e(TAG, "Error al procesar huella: " + e.getMessage());
            notifyError("Error al procesar huella: " + e.getMessage());
            isProcessingEvent = false;
        }
    }

    private String canonicalizeTemplate(byte[] template) {
        try {
            // Preferir el último template base64 reportado por el SDK (si existe)
            if (fingerprintSensor != null) {
                try {
                    java.lang.reflect.Method getLast = fingerprintSensor.getClass().getMethod("getLastTempBase64");
                    Object val = getLast.invoke(fingerprintSensor);
                    if (val instanceof String && ((String) val).length() > 0) {
                        return (String) val;
                    }
                } catch (Exception ignore) {}
            }
            // Fallback: base64 sin saltos
            return Base64.encodeToString(template, Base64.NO_WRAP);
        } catch (Exception e) {
            return Base64.encodeToString(template, Base64.NO_WRAP);
        }
    }
    
    private String findMatchingUser(String capturedTemplateCanonical) {
        // Matching local eliminado: delegar al backend.
        return null;
    }

    // Busca dinámicamente métodos de verificación en clases del SDK (fingerservice/algoritmo)
    private Integer trySdkMatch(byte[] probe, byte[] ref) {
        String[] candidates = new String[] {
            // Comunes
            "com.zkteco.biometric.FingerprintSDK",
            // Variantes ZKFingerService
            "com.zkteco.android.biometric.core.ZKFingerService",
            "com.zkteco.android.biometric.ZKFingerService",
            "com.zkteco.android.biometric.module.fingerprintreader.ZKFingerService",
            // Servicios/Utilidades
            "com.zkteco.android.biometric.core.algorithm.Algorithm",
            "com.zkteco.android.biometric.core.ZKFingerUtil",
            // Servicios fingerprint
            "com.zkteco.android.biometric.core.device.FingerprintService",
            "com.zkteco.android.biometric.module.fingerprintreader.FingerprintService",
            "com.zkteco.zkfinger.FingerprintService",
            // Otros posibles
            "cn.zkteco.android.biometric.core.ZKFingerService"
        };
        for (String cls : candidates) {
            try {
                Class<?> c = Class.forName(cls);
                // 1) Método estático verify/match
                for (java.lang.reflect.Method m : c.getMethods()) {
                    String n = m.getName().toLowerCase();
                    if ((n.contains("verify") || n.contains("match") || n.contains("compare")) && (m.getParameterTypes().length == 2 || m.getParameterTypes().length == 3)) {
                        Class<?>[] p = m.getParameterTypes();
                        if (p.length == 2 && p[0] == byte[].class && p[1] == byte[].class) {
                            Object out = m.invoke(null, probe, ref);
                            if (out instanceof Integer) return (Integer) out;
                            if (out instanceof Boolean) return ((Boolean) out) ? 100 : 0;
                        } else if (p.length == 3 && p[0] == byte[].class && p[1] == byte[].class && (p[2] == int.class || p[2] == java.lang.Integer.class)) {
                            Object out = m.invoke(null, probe, ref, 3); // nivel de seguridad medio
                            if (out instanceof Integer) return (Integer) out;
                            if (out instanceof Boolean) return ((Boolean) out) ? 100 : 0;
                        }
                    }
                }
                // 2) getInstance()/getDefault() y método verify/match de instancia
                Object instance = null;
                try {
                    java.lang.reflect.Method gi = c.getMethod("getInstance");
                    instance = gi.invoke(null);
                } catch (Exception ignore) {}
                if (instance == null) {
                    try {
                        java.lang.reflect.Method gd = c.getMethod("getDefault");
                        instance = gd.invoke(null);
                    } catch (Exception ignore) {}
                }
                if (instance != null) {
                    for (java.lang.reflect.Method m : instance.getClass().getMethods()) {
                        String n = m.getName().toLowerCase();
                        if ((n.contains("verify") || n.contains("match") || n.contains("compare")) && (m.getParameterTypes().length == 2 || m.getParameterTypes().length == 3)) {
                            Class<?>[] p = m.getParameterTypes();
                            if (p.length == 2 && p[0] == byte[].class && p[1] == byte[].class) {
                                Object out = m.invoke(instance, probe, ref);
                                if (out instanceof Integer) return (Integer) out;
                                if (out instanceof Boolean) return ((Boolean) out) ? 100 : 0;
                            } else if (p.length == 3 && p[0] == byte[].class && p[1] == byte[].class && (p[2] == int.class || p[2] == java.lang.Integer.class)) {
                                Object out = m.invoke(instance, probe, ref, 3);
                                if (out instanceof Integer) return (Integer) out;
                                if (out instanceof Boolean) return ((Boolean) out) ? 100 : 0;
                            }
                        }
                    }
                }
            } catch (ClassNotFoundException e) {
                // siguiente candidato
            } catch (Exception e) {
                Log.d(TAG, "trySdkMatch en " + cls + " falló: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        }
        return null;
    }

    // Calcula score intentando primero verify/match en fingerprintSensor, luego trySdkMatch
    private Integer computeMatchScore(byte[] probe, byte[] ref) {
        try {
            if (fingerprintSensor != null) {
                // Buscar método verify(byte[], byte[]) o match(byte[], byte[])
                java.lang.reflect.Method[] methods = fingerprintSensor.getClass().getMethods();
                for (java.lang.reflect.Method m : methods) {
                    String n = m.getName().toLowerCase();
                    Class<?>[] p = m.getParameterTypes();
                    boolean ok = (p.length == 2 && p[0] == byte[].class && p[1] == byte[].class);
                    if (ok && (n.contains("verify") || n.contains("match") || n.contains("compare"))) {
                        Object out = m.invoke(fingerprintSensor, probe, ref);
                        if (out instanceof Integer) return (Integer) out;
                        if (out instanceof Boolean) return ((Boolean) out) ? 100 : 0;
                    }
                }
            }
        } catch (Exception ignore) {}
        // Fallback a clases auxiliares
        return trySdkMatch(probe, ref);
    }

    private boolean verifyTemplatesByAlgorithm(String tplBase64A, String tplBase64B) {
        try {
            byte[] a = Base64.decode(tplBase64A, Base64.NO_WRAP);
            byte[] b = Base64.decode(tplBase64B, Base64.NO_WRAP);
            Integer score = trySdkMatch(a, b);
            if (score != null) {
                Log.d(TAG, "🔎 SelfMatch score=" + score);
                return score > 0; // umbral básico; si se expone score real, podemos subirlo
            }
        } catch (Exception e) {
            Log.d(TAG, "verifyTemplatesByAlgorithm fallo: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        return false;
    }
    
    private void notifySuccess(String message) {
        JSObject data = new JSObject();
        data.put("type", "success");
        data.put("message", message);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("fingerprintEvent", data);
    }
    
    private void notifyRegistration(String userId, String employeeId, boolean saved) {
        JSObject data = new JSObject();
        data.put("type", "registration");
        data.put("saved", saved);
        data.put("userId", userId);
        data.put("employeeId", employeeId);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("fingerprintEvent", data);
    }

    private void notifyRegistration(String userId, String employeeId, boolean saved, String templateBase64, Integer lastLen, Integer lastQuality) {
        JSObject data = new JSObject();
        data.put("type", "registration");
        data.put("saved", saved);
        data.put("userId", userId);
        data.put("employeeId", employeeId);
        data.put("template", templateBase64);
        if (lastLen != null) data.put("templateLen", lastLen);
        if (lastQuality != null) data.put("quality", lastQuality);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("fingerprintEvent", data);
    }
    
    private void notifyError(String message) {
        JSObject data = new JSObject();
        data.put("type", "error");
        data.put("message", message);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("fingerprintEvent", data);
    }
    
    private void notifyIdentification(String userId, String employeeId, boolean match, int score) {
        JSObject data = new JSObject();
        data.put("type", "identification");
        data.put("match", match);
        data.put("userId", userId);
        data.put("employeeId", employeeId);
        data.put("score", score);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("fingerprintEvent", data);
    }

    private void notifyIdentificationWithTemplate(String userId, String employeeId, boolean match, int score, String templateBase64, Integer lastLen, Integer lastQuality) {
        JSObject data = new JSObject();
        data.put("type", "identification");
        data.put("match", match);
        data.put("userId", userId);
        data.put("employeeId", employeeId);
        data.put("score", score);
        data.put("template", templateBase64);
        if (lastLen != null) data.put("templateLen", lastLen);
        if (lastQuality != null) data.put("quality", lastQuality);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("fingerprintEvent", data);
    }

    @PluginMethod
    public void loadReferences(PluginCall call) {
        try {
            JSArray refs = call.getArray("refs"); // [{ employeeId, template }]
            Integer threshold = call.getInt("threshold");
            referenceTemplates.clear();
            if (threshold != null) matchThreshold = Math.max(1, threshold);
            if (refs != null) {
                for (int i = 0; i < refs.length(); i++) {
                    try {
                        org.json.JSONObject obj = refs.getJSONObject(i);
                        String empId = obj.optString("employeeId", null);
                        String tpl = obj.optString("template", null);
                        if (empId != null && tpl != null && tpl.length() > 0) {
                            referenceTemplates.add(new Reference(empId, tpl));
                        }
                    } catch (Exception ignore) {}
                }
            }
            JSObject result = new JSObject();
            result.put("loaded", referenceTemplates.size());
            result.put("threshold", matchThreshold);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Error al cargar referencias: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void startRegistration(PluginCall call) {
        try {
            if (!isScannerConnected || fingerprintSensor == null) {
                call.reject("El escáner no está conectado. Conecte el dispositivo ZKTeco SLK20r.");
                return;
            }
            
            String userId = call.getString("userId");
            String employeeId = call.getString("employeeId");
            
            if (userId == null || userId.isEmpty()) {
                call.reject("El User ID no puede estar vacío.");
                return;
            }
            
            if (employeeId == null || employeeId.isEmpty()) {
                call.reject("El Employee ID no puede estar vacío.");
                return;
            }
            
            // No hay verificación local; el backend es la fuente de verdad.
            
            Log.d(TAG, "Iniciando registro para usuario: " + userId + ", empleado: " + employeeId);
            
            // Guardar información del usuario para el registro
            currentUserId = userId;
            currentEmployeeId = employeeId;
            isRegistrationMode = true;
            
            // Configurar parámetros adicionales antes de la captura
            try {
                Log.d(TAG, "🔧 CONFIGURANDO PARÁMETROS ANTES DE CAPTURA...");
                
                // Configurar parámetros específicos para SLK20r
                try {
                    java.lang.reflect.Method setParameterMethod = fingerprintSensor.getClass().getMethod("setParameter", int.class, int.class, int.class);
                    setParameterMethod.invoke(fingerprintSensor, 1, 1, 1); // Configuración básica
                    Log.d(TAG, "✅ setParameter configurado exitosamente");
                } catch (Exception e) {
                    Log.d(TAG, "❌ Error configurando setParameter: " + e.getMessage());
                }
                
                // Encender-dispositivo/canal antes de empezar
                ensureOpenChannel();
                // Iniciar captura de huella real (evitar duplicados)
                if (!isCapturing) {
                    fingerprintSensor.startCapture(0);
                    isCapturing = true;
                    operationStartedAtMs = System.currentTimeMillis();
                    scheduleAutoStop();
                    // Reset de estado de enrolamiento en 2 pasos
                    enrollSampleCount = 0;
                    enrollFirstTemplateCanonical = null;
                } else {
                    Log.d(TAG, "⚠️ Captura ya activa; no se reinicia");
                }
                Log.d(TAG, "✅ Captura de huella iniciada - Coloque su dedo en el sensor");
                
            JSObject result = new JSObject();
            result.put("success", true);
                result.put("message", "Coloque su dedo en el sensor");
            call.resolve(result);
                
            } catch (Exception e) {
                Log.e(TAG, "❌ Error al iniciar captura: " + e.getMessage());
                call.reject("Error al iniciar captura: " + e.getMessage());
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error durante el registro: " + e.getMessage());
            call.reject("Error durante el registro: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void startIdentification(PluginCall call) {
        try {
            if (!isScannerConnected || fingerprintSensor == null) {
                call.reject("El escáner no está conectado. Conecte el dispositivo ZKTeco SLK20r.");
                return;
            }

            // No validar usuarios locales; el backend es la fuente de verdad.

            Log.d(TAG, "Iniciando identificación");
            
            // Limpiar variables de registro
            currentUserId = null;
            currentEmployeeId = null;
            isRegistrationMode = false;
            
            // Configurar parámetros adicionales antes de la captura
            try {
                Log.d(TAG, "🔧 CONFIGURANDO PARÁMETROS ANTES DE IDENTIFICACIÓN...");
                
                // Configurar parámetros específicos para SLK20r
                try {
                    java.lang.reflect.Method setParameterMethod = fingerprintSensor.getClass().getMethod("setParameter", int.class, int.class, int.class);
                    setParameterMethod.invoke(fingerprintSensor, 1, 1, 1); // Configuración básica
                    Log.d(TAG, "✅ setParameter configurado exitosamente");
                } catch (Exception e) {
                    Log.d(TAG, "❌ Error configurando setParameter: " + e.getMessage());
                }
                
                // Encender-dispositivo/canal antes de empezar
                ensureOpenChannel();
                // Iniciar captura de huella para identificación (evitar duplicados)
                if (!isCapturing) {
                    fingerprintSensor.startCapture(0);
                    isCapturing = true;
                    operationStartedAtMs = System.currentTimeMillis();
                    scheduleAutoStop();
                } else {
                    Log.d(TAG, "⚠️ Captura ya activa; no se reinicia");
                }
                Log.d(TAG, "✅ Captura de huella para identificación iniciada - Coloque su dedo en el sensor");
                
            JSObject result = new JSObject();
                result.put("success", true);
                result.put("message", "Coloque su dedo en el sensor para identificación");
            call.resolve(result);
                
            } catch (Exception e) {
                Log.e(TAG, "❌ Error al iniciar identificación: " + e.getMessage());
                call.reject("Error al iniciar identificación: " + e.getMessage());
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error durante la identificación: " + e.getMessage());
            call.reject("Error durante la identificación: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deleteFingerprint(PluginCall call) {
        try {
            String userId = call.getString("userId");
            if (userId == null || userId.isEmpty()) {
                call.reject("El User ID no puede estar vacío.");
                return;
            }
            // Sin estado local: confirmamos la petición y delegamos al backend.
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("userId", userId);
            result.put("message", "Petición de eliminación recibida (gestionar en backend)");
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error al eliminar huella: " + e.getMessage());
            call.reject("Error al eliminar huella: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getRegisteredUsers(PluginCall call) {
        try {
            // Sin estado local: devolver lista vacía, la fuente de verdad es backend.
            List<JSObject> users = new ArrayList<>();
            JSObject result = new JSObject();
            result.put("users", users);
            result.put("count", 0);
            result.put("capturing", isCapturing);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error al obtener usuarios: " + e.getMessage());
            call.reject("Error al obtener usuarios: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkConnection(PluginCall call) {
        try {
            Log.d(TAG, "🔍 Verificando conexión del dispositivo...");

            boolean connected = false;

            // Verificación real vía UsbManager
            try {
                UsbManager um = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
                if (um != null) {
                    java.util.HashMap<String, UsbDevice> deviceList = um.getDeviceList();
                    for (UsbDevice device : deviceList.values()) {
                        if (device.getVendorId() == 6997) {
                            connected = um.hasPermission(device);
                            break;
                        }
                    }
                }
            } catch (Exception e) {
                Log.d(TAG, "⚠️ Error consultando UsbManager: " + e.getMessage());
            }

            // Si además hay sensor instanciado, intentar getDeviceStatus
            if (connected && fingerprintSensor != null) {
                try {
                    java.lang.reflect.Method statusMethod = fingerprintSensor.getClass().getMethod("getDeviceStatus", int.class);
                    Object status = statusMethod.invoke(fingerprintSensor, 1);
                    Log.d(TAG, "📊 getDeviceStatus(1): " + status);
                    // Algunos SDK usan -1 como NO_ABIERTO. Si es -1, consideramos desconectado.
                    if (status instanceof Integer && ((Integer) status) == -1) {
                        connected = false;
                    }
                } catch (Exception ignore) {}
            }

            Log.d(TAG, "Resultado de conexión: " + connected);

            JSObject result = new JSObject();
            result.put("connected", connected);
            result.put("deviceInfo", connected ? "ZKTeco SLK20r - Conectado" : "Dispositivo no conectado");
            result.put("message", connected ? "Dispositivo funcionando correctamente" : "Conecte el dispositivo ZKTeco SLK20r");
            result.put("capturing", isCapturing);
            call.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "Error al verificar conexión: " + e.getMessage());
            call.reject("Error al verificar conexión: " + e.getMessage());
        }
    }

    @PluginMethod
    public void configureDevice(PluginCall call) {
        try {
            Integer timeout = call.getInt("timeout");
            Integer sensitivity = call.getInt("sensitivity");
            Boolean beepEnabled = call.getBoolean("beepEnabled");
            
            Log.d(TAG, "Configurando dispositivo...");
            
            // Configurar parámetros del dispositivo
            if (timeout != null) {
                Log.d(TAG, "Configurando timeout: " + timeout);
                // Interpretación: segundos si es pequeño, milisegundos si es grande
                if (timeout <= 300) {
                    captureTimeoutMs = timeout * 1000;
                } else {
                    captureTimeoutMs = timeout;
                }
                if (timeout == 0) captureTimeoutMs = 0; // desactivar auto-stop
            }
            
            if (sensitivity != null) {
                Log.d(TAG, "Configurando sensibilidad: " + sensitivity);
            }
            
            if (beepEnabled != null) {
                Log.d(TAG, "Configurando beep: " + beepEnabled);
            }
            
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("message", "Dispositivo configurado");
            result.put("timeoutMs", captureTimeoutMs);
            call.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "Error al configurar dispositivo: " + e.getMessage());
            call.reject("Error al configurar dispositivo: " + e.getMessage());
        }
    }

    // Método de limpieza cuando se destruye el plugin
    public void cleanup() {
        try {
            if (fingerprintSensor != null) {
                // Cerrar el sensor si es necesario
                Log.d(TAG, "Limpiando recursos del sensor");
                try {
                    java.lang.reflect.Method stopCap = fingerprintSensor.getClass().getMethod("stopCapture", int.class);
                    stopCap.invoke(fingerprintSensor, 0);
                    try { stopCap.invoke(fingerprintSensor, 1); } catch (Exception ignore) {}
                } catch (Exception ignore) {}
                try {
                    java.lang.reflect.Method closeMethod = fingerprintSensor.getClass().getMethod("close", int.class);
                    closeMethod.invoke(fingerprintSensor, 0);
                    try { closeMethod.invoke(fingerprintSensor, 1); } catch (Exception ignore) {}
                } catch (Exception ignore) {}
                try {
                    java.lang.reflect.Method destroy = fingerprintSensor.getClass().getMethod("destroy");
                    destroy.invoke(fingerprintSensor);
                } catch (Exception ignore) {}
                isCapturing = false;
            }
            if (usbReceiver != null) {
                try {
                    getContext().unregisterReceiver(usbReceiver);
                } catch (Exception ignore) {}
            }
        } catch (Exception e) {
            Log.e(TAG, "Error al limpiar: " + e.getMessage());
        }
    }

    private void stopCaptureSafely() {
        try {
            if (fingerprintSensor != null) {
                java.lang.reflect.Method stopCap = fingerprintSensor.getClass().getMethod("stopCapture", int.class);
                stopCap.invoke(fingerprintSensor, 0);
                try { stopCap.invoke(fingerprintSensor, 1); } catch (Exception ignore) {}
                isCapturing = false;
                // Apagar canal si está encendido
                try {
                    java.lang.reflect.Method closeMethod = fingerprintSensor.getClass().getMethod("close", int.class);
                    closeMethod.invoke(fingerprintSensor, 0);
                    try { closeMethod.invoke(fingerprintSensor, 1); } catch (Exception ignore) {}
                } catch (Exception ignore) {}
            }
        } catch (Exception e) {
            Log.d(TAG, "stopCaptureSafely: " + e.getMessage());
        }
    }

    private void scheduleAutoStop() {
        try {
            // Detener captura automáticamente si no hay eventos en cierto tiempo
            if (captureTimeoutMs == 0) return; // auto-stop desactivado
            final long startedAt = System.currentTimeMillis();
            final int timeoutLocal = captureTimeoutMs;
            new Thread(() -> {
                try {
                    Thread.sleep(timeoutLocal);
                    if (isCapturing && System.currentTimeMillis() - startedAt >= timeoutLocal) {
                        Log.d(TAG, "⏲️ Auto-stop de captura por timeout (" + timeoutLocal + "ms)");
                        stopCaptureSafely();
                        try {
                            JSObject data = new JSObject();
                            data.put("type", "error");
                            data.put("message", "Tiempo agotado. Vuelva a intentar colocando su dedo.");
                            data.put("timestamp", System.currentTimeMillis());
                            notifyListeners("fingerprintEvent", data);
                        } catch (Exception ignore) {}
                    }
                } catch (InterruptedException ignored) {}
            }).start();
        } catch (Exception ignored) {}
    }

    private void ensureOpenChannel() {
        try {
            if (fingerprintSensor == null) return;
            java.lang.reflect.Method statusMethod = fingerprintSensor.getClass().getMethod("getDeviceStatus", int.class);
            Object s0 = statusMethod.invoke(fingerprintSensor, 0);
            boolean open = !(s0 instanceof Integer && ((Integer) s0) == -1);
            if (!open) {
                try {
                    java.lang.reflect.Method openInt = fingerprintSensor.getClass().getMethod("open", int.class);
                    openInt.invoke(fingerprintSensor, 0);
                    Log.d(TAG, "🔌 Canal 0 abierto para captura");
                } catch (Exception e) {
                    Log.d(TAG, "⚠️ No se pudo abrir canal 0: " + e.getMessage());
                }
            }
        } catch (Exception ignore) {}
    }
}