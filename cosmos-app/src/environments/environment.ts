export const environment = {
    production: false,
    api: 'http://localhost:3024/api/v1',
    scanner: {
        wsUrl: 'ws://localhost:9876',
        reconnectAttempts: 5,
        reconnectDelay: 2000,
        captureTimeout: 30000
    }
};
