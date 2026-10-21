import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NamedService } from './named.service';
import { NamedStoreService } from './named-store.service';

/**
 * Mantiene al día la copia local de las nombradas de los días recientes.
 *
 * Con esto las marcaciones y el dashboard leen de MongoDB en vez de consultar
 * el servicio externo en cada petición: el tráfico saliente pasa a ser un
 * puñado de llamadas por hora, constante, en lugar de una por operación.
 *
 * Se apaga con `NAMED_SYNC_ENABLED=false`.
 */
@Injectable()
export class NamedSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NamedSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly namedService: NamedService,
    private readonly namedStore: NamedStoreService,
    private readonly configService: ConfigService
  ) { }

  onModuleInit(): void {
    const enabled = this.configService.get('NAMED_SYNC_ENABLED', 'true') !== 'false';
    if (!enabled || !this.namedStore.isEnabled()) {
      return;
    }
    // Sin URL del servicio externo no hay nada que sincronizar (entornos de
    // prueba y arranques sin `.env` completo).
    if (!this.configService.get('URL_COSMOS')) {
      return;
    }

    const intervalMs = Number(this.configService.get('NAMED_SYNC_INTERVAL_MS', 10 * 60 * 1000));
    this.timer = setInterval(() => {
      void this.refreshWindow();
    }, intervalMs);
    // No debe impedir que el proceso termine.
    this.timer.unref?.();

    void this.refreshWindow();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private toNamedDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
  }

  /**
   * Vuelve a leer del servicio externo la ventana de días que todavía pueden
   * cambiar. Los días anteriores a esa ventana se consideran cerrados y ya
   * están guardados, así que no se vuelven a pedir.
   */
  async refreshWindow(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const backDays = Number(this.configService.get('NAMED_SYNC_BACK_DAYS', 2));
      const forwardDays = Number(this.configService.get('NAMED_SYNC_FORWARD_DAYS', 1));
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - backDays);
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + forwardDays);

      await this.namedService.refreshNamedsRange({
        sInitialDate: this.toNamedDate(from),
        sFinalDate: this.toNamedDate(to),
      });
    } catch (error) {
      // Un fallo del servicio externo no debe tumbar el proceso: la copia local
      // sigue sirviendo lo que ya tenía y se reintenta en el siguiente ciclo.
      this.logger.warn(`No se pudo refrescar la ventana de nombradas: ${error?.message ?? error}`);
    } finally {
      this.running = false;
    }
  }
}
