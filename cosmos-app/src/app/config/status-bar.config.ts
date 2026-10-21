import { Capacitor } from '@capacitor/core';

/**
 * Configuración para el plugin de StatusBar de Capacitor
 */
export const StatusBarConfig = {
    /**
     * Configuración para Android
     */
    android: {
        style: 'LIGHT',
        backgroundColor: '#003d53',
        overlaysWebView: false,
        show: true,
        // Configuraciones específicas para Android
        windowTranslucentStatus: false,
        windowDrawsSystemBarBackgrounds: true,
        statusBarColor: '#003d53'
    },

    /**
     * Obtiene la configuración según la plataforma
     */
    getConfig() {
        if (Capacitor.isNativePlatform()) {
            if (Capacitor.getPlatform() === 'android') {
                return this.android;
            }
        }
        return this.android; // Default
    },

    /**
     * Obtiene la configuración específica para el tema de Android
     */
    getAndroidThemeConfig() {
        return {
            'android:windowTranslucentStatus': false,
            'android:windowDrawsSystemBarBackgrounds': true,
            'android:statusBarColor': '#003d53',
            'android:windowFullscreen': false
        };
    }
};
