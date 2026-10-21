import { Capacitor } from '@capacitor/core';

export interface FaceDetectionConfig {
    // Configuraciones de detección
    detection: {
        inputSize: number;
        scoreThreshold: number;
        detectionInterval: number;
        minFaceWidth: number;
        maxFaceWidth: number;
    };

    // Configuraciones de video
    video: {
        width: { ideal: number; min: number; max: number };
        height: { ideal: number; min: number; max: number };
        frameRate: { ideal: number; min: number; max: number };
        facingMode: 'user' | 'environment';
    };

    // Configuraciones de calidad
    quality: {
        minConfidence: number;
        minQualityScore: number;
        maxFaceAngle: number;
        minLighting: number;
    };

    // Configuraciones de UI
    ui: {
        showConfidence: boolean;
        showQualityMetrics: boolean;
        showFaceBox: boolean;
        showLandmarks: boolean;
        autoCaptureDelay: number;
    };

    // Configuraciones de plataforma
    platform: {
        isMobile: boolean;
        isAndroid: boolean;
        isIOS: boolean;
        isWeb: boolean;
    };
}

/**
 * Configuración por defecto para la detección facial
 */
const defaultConfig: FaceDetectionConfig = {
    detection: {
        inputSize: 320,
        scoreThreshold: 0.6,
        detectionInterval: 150,
        minFaceWidth: 300,
        maxFaceWidth: 400
    },

    video: {
        width: { ideal: 640, min: 320, max: 1280 },
        height: { ideal: 480, min: 240, max: 720 },
        frameRate: { ideal: 30, min: 15, max: 60 },
        facingMode: 'user'
    },

    quality: {
        minConfidence: 0.7,
        minQualityScore: 0.8,
        maxFaceAngle: 20,
        minLighting: 0.5
    },

    ui: {
        showConfidence: true,
        showQualityMetrics: true,
        showFaceBox: true,
        showLandmarks: true,
        autoCaptureDelay: 1000
    },

    platform: {
        isMobile: false,
        isAndroid: false,
        isIOS: false,
        isWeb: true
    }
};

/**
 * Configuración optimizada para dispositivos móviles
 */
const mobileConfig: Partial<FaceDetectionConfig> = {
    detection: {
        inputSize: 256,
        scoreThreshold: 0.5,
        detectionInterval: 200,
        minFaceWidth: 280,
        maxFaceWidth: 420
    },

    video: {
        width: { ideal: 480, min: 240, max: 720 },
        height: { ideal: 360, min: 180, max: 540 },
        frameRate: { ideal: 24, min: 15, max: 30 },
        facingMode: 'user'
    },

    quality: {
        minConfidence: 0.6,
        minQualityScore: 0.7,
        maxFaceAngle: 25,
        minLighting: 0.4
    },

    ui: {
        showConfidence: false,
        showQualityMetrics: false,
        showFaceBox: true,
        showLandmarks: false,
        autoCaptureDelay: 1500
    }
};

/**
 * Configuración optimizada para Android
 */
const androidConfig: Partial<FaceDetectionConfig> = {
    detection: {
        inputSize: 224,
        scoreThreshold: 0.45,
        detectionInterval: 250,
        minFaceWidth: 260,
        maxFaceWidth: 440
    },

    video: {
        width: { ideal: 400, min: 200, max: 640 },
        height: { ideal: 300, min: 150, max: 480 },
        frameRate: { ideal: 20, min: 10, max: 25 },
        facingMode: 'user'
    },

    quality: {
        minConfidence: 0.55,
        minQualityScore: 0.65,
        maxFaceAngle: 30,
        minLighting: 0.35
    }
};

/**
 * Configuración optimizada para iOS
 */
const iosConfig: Partial<FaceDetectionConfig> = {
    detection: {
        inputSize: 240,
        scoreThreshold: 0.5,
        detectionInterval: 200,
        minFaceWidth: 270,
        maxFaceWidth: 430
    },

    video: {
        width: { ideal: 480, min: 240, max: 720 },
        height: { ideal: 360, min: 180, max: 540 },
        frameRate: { ideal: 30, min: 15, max: 30 },
        facingMode: 'user'
    },

    quality: {
        minConfidence: 0.6,
        minQualityScore: 0.7,
        maxFaceAngle: 22,
        minLighting: 0.4
    }
};

/**
 * Configuración optimizada para web
 */
const webConfig: Partial<FaceDetectionConfig> = {
    detection: {
        inputSize: 320,
        scoreThreshold: 0.6,
        detectionInterval: 150,
        minFaceWidth: 300,
        maxFaceWidth: 400
    },

    video: {
        width: { ideal: 640, min: 320, max: 1280 },
        height: { ideal: 480, min: 240, max: 720 },
        frameRate: { ideal: 30, min: 15, max: 60 },
        facingMode: 'user'
    },

    quality: {
        minConfidence: 0.7,
        minQualityScore: 0.8,
        maxFaceAngle: 20,
        minLighting: 0.5
    },

    ui: {
        showConfidence: true,
        showQualityMetrics: true,
        showFaceBox: true,
        showLandmarks: true,
        autoCaptureDelay: 1000
    }
};

/**
 * Obtiene la configuración optimizada para la plataforma actual
 */
export function getFaceDetectionConfig(): FaceDetectionConfig {
    const platform = Capacitor.getPlatform();
    const isMobile = Capacitor.isNativePlatform();

    let config: Partial<FaceDetectionConfig> = { ...defaultConfig };

    // Aplicar configuraciones específicas de plataforma
    if (isMobile) {
        config = { ...config, ...mobileConfig };

        if (platform === 'android') {
            config = { ...config, ...androidConfig };
        } else if (platform === 'ios') {
            config = { ...config, ...iosConfig };
        }
    } else {
        config = { ...config, ...webConfig };
    }

    // Actualizar información de plataforma
    config.platform = {
        isMobile,
        isAndroid: platform === 'android',
        isIOS: platform === 'ios',
        isWeb: platform === 'web'
    };

    return config as FaceDetectionConfig;
}

/**
 * Configuración específica para el modo de desarrollo
 */
export function getDevelopmentConfig(): Partial<FaceDetectionConfig> {
    return {
        detection: {
            inputSize: 256,
            scoreThreshold: 0.4,
            detectionInterval: 100,
            minFaceWidth: 250,
            maxFaceWidth: 450
        },

        ui: {
            showConfidence: true,
            showQualityMetrics: true,
            showFaceBox: true,
            showLandmarks: true,
            autoCaptureDelay: 500
        }
    };
}

/**
 * Configuración específica para el modo de producción
 */
export function getProductionConfig(): Partial<FaceDetectionConfig> {
    return {
        detection: {
            inputSize: 320,
            scoreThreshold: 0.7,
            detectionInterval: 200,
            minFaceWidth: 300,
            maxFaceWidth: 400
        },

        ui: {
            showConfidence: false,
            showQualityMetrics: false,
            showFaceBox: true,
            showLandmarks: false,
            autoCaptureDelay: 1000
        }
    };
}

/**
 * Configuración personalizada para casos específicos
 */
export function getCustomConfig(overrides: Partial<FaceDetectionConfig>): FaceDetectionConfig {
    const baseConfig = getFaceDetectionConfig();
    return { ...baseConfig, ...overrides };
}

/**
 * Valida una configuración de detección facial
 */
export function validateFaceDetectionConfig(config: FaceDetectionConfig): string[] {
    const errors: string[] = [];

    // Validar configuraciones de detección
    if (config.detection.inputSize < 128 || config.detection.inputSize > 512) {
        errors.push('inputSize debe estar entre 128 y 512');
    }

    if (config.detection.scoreThreshold < 0.1 || config.detection.scoreThreshold > 0.9) {
        errors.push('scoreThreshold debe estar entre 0.1 y 0.9');
    }

    if (config.detection.detectionInterval < 50 || config.detection.detectionInterval > 500) {
        errors.push('detectionInterval debe estar entre 50ms y 500ms');
    }

    if (config.detection.minFaceWidth >= config.detection.maxFaceWidth) {
        errors.push('minFaceWidth debe ser menor que maxFaceWidth');
    }

    // Validar configuraciones de video
    if (config.video.width.min > config.video.width.max) {
        errors.push('width.min no puede ser mayor que width.max');
    }

    if (config.video.height.min > config.video.height.max) {
        errors.push('height.min no puede ser mayor que height.max');
    }

    // Validar configuraciones de calidad
    if (config.quality.minConfidence < 0.1 || config.quality.minConfidence > 0.9) {
        errors.push('minConfidence debe estar entre 0.1 y 0.9');
    }

    if (config.quality.minQualityScore < 0.1 || config.quality.minQualityScore > 0.9) {
        errors.push('minQualityScore debe estar entre 0.1 y 0.9');
    }

    return errors;
}

/**
 * Exporta la configuración por defecto
 */
export { defaultConfig };
