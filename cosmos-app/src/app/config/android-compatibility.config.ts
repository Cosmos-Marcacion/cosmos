import { Capacitor } from '@capacitor/core';

export interface AndroidCompatibilitySettings {
    enableHardwareAcceleration: boolean;
    useWebGL: boolean;
    optimizeVideoRendering: boolean;
    preventIonicInterference: boolean;
    customViewport: boolean;
    touchOptimization: boolean;
}

/**
 * Configuración de compatibilidad para Android
 */
export const ANDROID_COMPATIBILITY_CONFIG: AndroidCompatibilitySettings = {
    enableHardwareAcceleration: true,
    useWebGL: true,
    optimizeVideoRendering: true,
    preventIonicInterference: true,
    customViewport: true,
    touchOptimization: true
};

/**
 * Verifica si la aplicación está ejecutándose en Android
 */
export function isAndroidPlatform(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Verifica si la aplicación está ejecutándose en web
 */
export function isWebPlatform(): boolean {
    return Capacitor.getPlatform() === 'web';
}

/**
 * Obtiene la configuración de compatibilidad según la plataforma
 */
export function getCompatibilityConfig(): AndroidCompatibilitySettings {
    if (isAndroidPlatform()) {
        return { ...ANDROID_COMPATIBILITY_CONFIG };
    }

    // Para web, deshabilitar optimizaciones específicas de Android
    return {
        enableHardwareAcceleration: false,
        useWebGL: false,
        optimizeVideoRendering: false,
        preventIonicInterference: false,
        customViewport: false,
        touchOptimization: false
    };
}

/**
 * Configuraciones específicas para elementos de video en Android
 */
export const ANDROID_VIDEO_CONFIG = {
    attributes: {
        playsinline: 'true',
        webkitPlaysinline: 'true',
        xWebkitAirplay: 'allow',
        controls: 'false',
        autoplay: 'true',
        muted: 'true'
    },
    styles: {
        transform: 'translate3d(0, 0, 0)',
        webkitTransform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        webkitBackfaceVisibility: 'hidden',
        willChange: 'transform',
        zIndex: '1000',
        position: 'relative'
    }
};

/**
 * Configuraciones específicas para elementos de canvas en Android
 */
export const ANDROID_CANVAS_CONFIG = {
    styles: {
        transform: 'translate3d(0, 0, 0)',
        webkitTransform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        webkitBackfaceVisibility: 'hidden',
        willChange: 'transform',
        zIndex: '1001',
        position: 'relative'
    }
};

/**
 * Configuraciones de viewport para Android
 */
export const ANDROID_VIEWPORT_CONFIG = {
    content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
};

/**
 * Estilos CSS específicos para Android
 */
export const ANDROID_CSS_STYLES = `
  .platform-android {
    /* Habilitar aceleración por hardware */
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    -webkit-perspective: 1000;
    perspective: 1000;
  }
  
  .platform-android video,
  .platform-android canvas {
    /* Optimizar renderizado de video y canvas */
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    will-change: transform;
    /* Prevenir problemas de renderizado en Android */
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
  }
  
  .platform-android .app-container {
    /* Asegurar que el contenedor principal no interfiera con elementos nativos */
    background: transparent !important;
    overflow: visible !important;
  }
  
  /* Prevenir que Ionic capture eventos de touch en elementos de video */
  .platform-android video,
  .platform-android canvas {
    pointer-events: auto !important;
    touch-action: manipulation !important;
  }
  
  .android-face-detection {
    /* Optimizaciones específicas para face detection en Android */
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    will-change: transform;
    /* Asegurar que el elemento esté por encima de Ionic */
    z-index: 1000;
    position: relative;
  }
  
  .android-face-detection video,
  .android-face-detection canvas {
    /* Configuraciones específicas para video y canvas en face detection */
    -webkit-transform: translate3d(0, 0, 0) !important;
    transform: translate3d(0, 0, 0) !important;
    -webkit-backface-visibility: hidden !important;
    backface-visibility: hidden !important;
    will-change: transform !important;
    /* Prevenir interferencia de Ionic */
    z-index: 1001 !important;
    position: relative !important;
  }
  
  .android-optimized {
    /* Configuraciones específicas para video optimizado en Android */
    -webkit-transform: translate3d(0, 0, 0) !important;
    transform: translate3d(0, 0, 0) !important;
    -webkit-backface-visibility: hidden !important;
    backface-visibility: hidden !important;
    will-change: transform !important;
  }
  
  .android-optimized::-webkit-media-controls {
    /* Ocultar controles nativos de video en Android */
    display: none !important;
  }
`;
