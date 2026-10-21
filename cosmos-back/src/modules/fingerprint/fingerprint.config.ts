export const FINGERPRINT_CONFIG = {
    // Configuración del servidor WebSocket del escáner
    SCANNER_WS_HOST: process.env.FINGERPRINT_SCANNER_HOST || 'localhost',
    SCANNER_WS_PORT: parseInt(process.env.FINGERPRINT_SCANNER_PORT || '9876'),
    SCANNER_WS_URL: `ws://${process.env.FINGERPRINT_SCANNER_HOST || 'localhost'}:${process.env.FINGERPRINT_SCANNER_PORT || '9876'}`,

    // Timeouts y reintentos
    DEFAULT_CAPTURE_TIMEOUT: parseInt(process.env.FINGERPRINT_CAPTURE_TIMEOUT || '30000'),
    DEFAULT_MAX_RETRIES: parseInt(process.env.FINGERPRINT_MAX_RETRIES || '3'),
    DEFAULT_RETRY_DELAY: parseInt(process.env.FINGERPRINT_RETRY_DELAY || '2000'),

    // Configuración de conexión WebSocket
    WS_CONNECTION_TIMEOUT: parseInt(process.env.FINGERPRINT_WS_TIMEOUT || '5000'),
    WS_RECONNECT_TIMEOUT: parseInt(process.env.FINGERPRINT_WS_RECONNECT_TIMEOUT || '10000'),
} as const;
