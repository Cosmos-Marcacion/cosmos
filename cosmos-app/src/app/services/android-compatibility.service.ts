import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { isPlatformBrowser } from '@angular/common';
import {
    ANDROID_CSS_STYLES,
    ANDROID_VIDEO_CONFIG,
    ANDROID_CANVAS_CONFIG,
    ANDROID_VIEWPORT_CONFIG,
    isAndroidPlatform
} from '../config/android-compatibility.config';

export interface AndroidCompatibilityConfig {
    enableHardwareAcceleration: boolean;
    useWebGL: boolean;
    optimizeVideoRendering: boolean;
    preventIonicInterference: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class AndroidCompatibilityService {
    private readonly platformId = inject(PLATFORM_ID);
    private isAndroid = false;
    private isInitialized = false;

    constructor() {
        this.isAndroid = isAndroidPlatform();
    }

    /**
     * Inicializa la compatibilidad para Android
     */
    initialize(): void {
        if (!this.isAndroid || this.isInitialized) {
            return;
        }

        console.log('🤖 Inicializando compatibilidad para Android');

        try {
            this.setupHardwareAcceleration();
            this.optimizeVideoElements();
            this.preventIonicInterference();
            this.setupTouchHandling();

            this.isInitialized = true;
            console.log('✅ Compatibilidad para Android inicializada correctamente');
        } catch (error) {
            console.error('❌ Error al inicializar compatibilidad para Android:', error);
        }
    }

    /**
     * Configura la aceleración por hardware para mejorar el rendimiento
     */
    private setupHardwareAcceleration(): void {
        if (!isPlatformBrowser(this.platformId)) return;

        const style = document.createElement('style');
        style.textContent = ANDROID_CSS_STYLES;
        document.head.appendChild(style);
    }

    /**
     * Optimiza los elementos de video para Android
     */
    private optimizeVideoElements(): void {
        if (!isPlatformBrowser(this.platformId)) return;

        // Buscar todos los elementos de video y aplicar optimizaciones
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            // Configurar atributos específicos para Android
            Object.entries(ANDROID_VIDEO_CONFIG.attributes).forEach(([key, value]) => {
                video.setAttribute(key, value);
            });

            // Agregar clase específica para Android
            video.classList.add('android-optimized');

            // Configurar estilos inline para mejor compatibilidad
            Object.entries(ANDROID_VIDEO_CONFIG.styles).forEach(([key, value]) => {
                video.style.setProperty(key, value);
            });
        });
    }

    /**
     * Previene que Ionic interfiera con elementos nativos
     * Los estilos ya están incluidos en ANDROID_CSS_STYLES
     */
    private preventIonicInterference(): void {
        // Los estilos para prevenir interferencia de Ionic ya están incluidos
        // en el método setupHardwareAcceleration() a través de ANDROID_CSS_STYLES
        console.log('🛡️ Configuración de prevención de interferencia de Ionic aplicada');
    }

    /**
     * Configura el manejo de touch para Android
     * Los estilos ya están incluidos en ANDROID_CSS_STYLES
     */
    private setupTouchHandling(): void {
        // Los estilos para el manejo de touch ya están incluidos
        // en el método setupHardwareAcceleration() a través de ANDROID_CSS_STYLES
        console.log('👆 Configuración de manejo de touch para Android aplicada');
    }

    /**
     * Aplica configuraciones específicas para un componente de face detection
     */
    applyFaceDetectionOptimizations(element: HTMLElement): void {
        if (!this.isAndroid) return;

        // Agregar clase específica para face detection
        element.classList.add('android-face-detection');

        // Aplicar estilos específicos
        const style = document.createElement('style');
        style.textContent = `
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
    `;
        document.head.appendChild(style);
    }

    /**
     * Verifica si la compatibilidad está habilitada
     */
    isCompatibilityEnabled(): boolean {
        return this.isAndroid && this.isInitialized;
    }

    /**
     * Obtiene la configuración actual de compatibilidad
     */
    getCompatibilityConfig(): AndroidCompatibilityConfig {
        return {
            enableHardwareAcceleration: this.isAndroid,
            useWebGL: this.isAndroid,
            optimizeVideoRendering: this.isAndroid,
            preventIonicInterference: this.isAndroid
        };
    }
}
