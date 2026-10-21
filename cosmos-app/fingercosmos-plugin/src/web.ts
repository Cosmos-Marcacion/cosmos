import type { PluginListenerHandle } from '@capacitor/core';
import { WebPlugin } from '@capacitor/core';

import type { fingercosmosPlugin } from './definitions';

export class fingercosmosWeb extends WebPlugin implements fingercosmosPlugin {
  addListener(
    eventName: any,
    listenerFunc: (...args: any[]) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle {
    return super.addListener(eventName, listenerFunc) as unknown as Promise<PluginListenerHandle> & PluginListenerHandle;
  }

  async initialize(): Promise<{ connected: boolean; deviceInfo?: string }> {
    throw this.unimplemented('Not available on web');
  }

  async startRegistration(_options: {
    userId: string;
    employeeId: string;
  }): Promise<{ success: boolean; userId: string; template?: string }> {
    throw this.unimplemented('Not available on web');
  }

  async startIdentification(): Promise<{
    match: boolean;
    userId?: string;
    employeeId?: string;
    score?: number;
    timestamp?: number;
  }> {
    throw this.unimplemented('Not available on web');
  }

  async deleteFingerprint(_options: {
    userId: string;
  }): Promise<{ success: boolean; userId: string }> {
    throw this.unimplemented('Not available on web');
  }

  async getRegisteredUsers(): Promise<{
    users: Array<{ userId: string; employeeId: string; registered: boolean }>;
  }> {
    throw this.unimplemented('Not available on web');
  }

  async checkConnection(): Promise<{
    connected: boolean;
    deviceInfo?: string;
  }> {
    throw this.unimplemented('Not available on web');
  }

  async configureDevice(_options: {
    timeout?: number;
    sensitivity?: number;
    beepEnabled?: boolean;
  }): Promise<{ success: boolean }> {
    throw this.unimplemented('Not available on web');
  }
}
