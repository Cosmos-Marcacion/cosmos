import { PluginListenerHandle } from "@capacitor/core";

export interface fingercosmosPlugin {
  /**
   * Inicializa la conexión con el dispositivo ZKTeco SLK20r
   */
  initialize(): Promise<{ connected: boolean; deviceInfo?: string }>;

  /**
   * Inicia el proceso de registro de huella digital
   */
  startRegistration(options: { userId: string; employeeId: string }): Promise<{ success: boolean; userId: string; template?: string }>;

  /**
   * Inicia el proceso de identificación/autenticación
   */
  startIdentification(): Promise<{ match: boolean; userId?: string; employeeId?: string; score?: number; timestamp?: number }>;

  /**
   * Elimina una huella digital registrada
   */
  deleteFingerprint(options: { userId: string }): Promise<{ success: boolean; userId: string }>;

  /**
   * Obtiene la lista de usuarios registrados
   */
  getRegisteredUsers(): Promise<{ users: Array<{ userId: string; employeeId: string; registered: boolean }> }>;

  /**
   * Verifica el estado de conexión del dispositivo
   */
  checkConnection(): Promise<{ connected: boolean; deviceInfo?: string }>;

  /**
   * Configura parámetros del dispositivo
   */
  configureDevice(options: {
    timeout?: number;
    sensitivity?: number;
    beepEnabled?: boolean
  }): Promise<{ success: boolean }>;

  /**
   * Listener para eventos de progreso durante el registro
   */
  addListener(
    eventName: 'enrollmentStep',
    listenerFunc: (data: { step: number; message: string; progress: number }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /**
   * Listener para eventos de identificación
   */
  addListener(
    eventName: 'identificationResult',
    listenerFunc: (data: { match: boolean; userId?: string; employeeId?: string; score?: number }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /**
   * Listener para eventos de conexión del dispositivo
   */
  addListener(
    eventName: 'deviceStatus',
    listenerFunc: (data: { connected: boolean; message: string }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}
