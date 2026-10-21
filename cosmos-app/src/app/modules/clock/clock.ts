import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Icon, IconName } from '../../components/icon/icon';

/**
 * Metodo de marcacion.
 *
 * Los cuatro caminos se declaran como datos y no como cuatro bloques de
 * marcado copiados: antes cada tarjeta repetia las mismas clases y su SVG en
 * linea, y ninguna explicaba que hacia. Aqui cada una lleva una descripcion,
 * porque quien marca no siempre sabe cual le toca.
 */
interface ClockMethod {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  path: string;
}

@Component({
  selector: 'app-clock',
  standalone: true,
  imports: [Icon],
  templateUrl: './clock.html',
  styleUrl: './clock.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Clock {
  private readonly router = inject(Router);

  readonly methods: ClockMethod[] = [
    {
      id: 'fingerprint',
      label: 'Huella digital',
      hint: 'Con el lector conectado al equipo',
      icon: 'fingerprint',
      path: '/fingerprint',
    },
    {
      id: 'face',
      label: 'Reconocimiento facial',
      hint: 'Con la cámara trasera o la delantera',
      icon: 'face',
      path: '/face-mark',
    },
    {
      id: 'qr',
      // El destino es el escaner de documento; el rotulo se mantiene porque es
      // como lo llama el personal en el muelle.
      label: 'QR / código de barras',
      hint: 'Escanea el carné o el documento',
      icon: 'qr',
      path: '/dni-scan',
    },
    {
      id: 'dni',
      label: 'Ingresar documento',
      hint: 'Escribe el número a mano',
      icon: 'card',
      path: '/dni',
    },
  ];

  go(path: string) {
    this.router.navigate([path]);
  }
}
