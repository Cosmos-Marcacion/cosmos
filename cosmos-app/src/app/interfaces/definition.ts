import { PluginListenerHandle } from "@capacitor/core";

export interface fingercosmosPlugin {
    /**
     * Inicializa la conexión con el dispositivo ZKTeco SLK20r
     */
    initialize(): Promise<{ connected: boolean; deviceInfo?: string; message?: string }>;

    /**
     * Inicia el proceso de registro de huella digital
     */
    startRegistration(options: { userId: string; employeeId: string }): Promise<{ success: boolean; message: string }>;

    /**
     * Inicia el proceso de identificación/autenticación
     */
    startIdentification(): Promise<{ success: boolean; message: string }>;

    /**
     * Elimina una huella digital registrada
     */
    deleteFingerprint(options: { userId: string }): Promise<{ success: boolean; userId: string; message?: string }>;

    /**
     * Obtiene la lista de usuarios registrados
     */
    getRegisteredUsers(): Promise<{ users: Array<{ userId: string; employeeId: string; registered: boolean }>; count: number }>;

    /**
     * Verifica el estado de conexión del dispositivo
     */
    checkConnection(): Promise<{ connected: boolean; deviceInfo?: string; message?: string }>;

    /**
     * Configura parámetros del dispositivo
     */
    configureDevice(options: {
        timeout?: number;
        sensitivity?: number;
        beepEnabled?: boolean
    }): Promise<{ success: boolean; message?: string }>;

    /**
     * Listener para eventos del fingerprint
     */
    addListener(
        eventName: 'fingerprintEvent',
        listenerFunc: (data: any) => void,
    ): Promise<PluginListenerHandle> & PluginListenerHandle;
}