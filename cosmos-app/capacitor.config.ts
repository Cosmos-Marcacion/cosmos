import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cosmos.checkin',
  appName: 'Cosmos Check-In',
  webDir: 'dist/cosmos-app/browser',
  plugins: {
    Camera: {
      androidScaleType: 'CENTER_CROP',
      androidAllowBackup: true,
      androidRequestPermissions: true
    },
    StatusBar: {
      style: 'DARK',
      // Color corporativo del isotipo Cosmos, igual que el splash y el icono.
      backgroundColor: '#003D53',
      overlaysWebView: false,
      show: true
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#003D53',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false
    },
    fingercosmos: {
      deviceType: 'SLK20r',
      connectionTimeout: 10000,
      captureTimeout: 30000,
      beepEnabled: true,
      sensitivity: 5
    }
  },
  android: {
    allowMixedContent: true,
    captureInput: true
  }
};

export default config;
