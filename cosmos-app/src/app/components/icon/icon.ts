import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Iconografia de la aplicacion.
 *
 * Antes cada SVG se pegaba en linea en la plantilla que lo necesitaba. El
 * icono facial son ~60 lineas de datos de trazado, repetidas en marcacion y en
 * la pantalla de reconocimiento; el de reloj estaba tres veces con tres
 * tamanos distintos. Eso ademas escondia defectos: en el menu habia un `<svg>`
 * con el atributo `class` duplicado (el navegador se queda con el primero, asi
 * que ese icono ignoraba tamano y color) y otro con un trazado pensado para
 * `stroke` pintado con `fill`, que salia como una mancha.
 *
 * Aqui el trazado se declara una vez y el modo de pintado va junto a el, de
 * modo que no se pueden volver a mezclar.
 */

type PaintMode = 'stroke' | 'fill';

interface IconDef {
  /** `d` de cada `<path>`. */
  paths: string[];
  mode: PaintMode;
  /** Solo para los iconos que no vienen en la rejilla de 24. */
  viewBox?: string;
}

const ICONS: Record<string, IconDef> = {
  home: {
    mode: 'stroke',
    paths: [
      'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
    ],
  },
  user: {
    mode: 'stroke',
    paths: [
      'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
    ],
  },
  clock: {
    mode: 'stroke',
    paths: [
      'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    ],
  },
  book: {
    mode: 'stroke',
    paths: [
      'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.966 8.966 0 0 0-6 2.292m0-14.25v14.25',
    ],
  },
  // --- Variantes rellenas -------------------------------------------------
  //
  // La barra inferior alterna contorno y relleno segun el destino activo. Es
  // la convencion de las aplicaciones nativas y funciona mejor que cambiar
  // solo el color: la diferencia de peso se percibe de reojo, sin leer.
  homeFill: {
    mode: 'fill',
    paths: [
      'M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z',
      'm12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z',
    ],
  },
  userFill: {
    mode: 'fill',
    paths: [
      'M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z',
    ],
  },
  clockFill: {
    mode: 'fill',
    paths: [
      'M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z',
    ],
  },
  bookFill: {
    mode: 'fill',
    paths: [
      'M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533ZM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z',
    ],
  },
  logout: {
    mode: 'stroke',
    paths: [
      'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75',
    ],
  },
  menu: {
    mode: 'stroke',
    paths: ['M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5'],
  },
  close: {
    mode: 'stroke',
    paths: ['M6 18 18 6M6 6l12 12'],
  },
  fingerprint: {
    mode: 'stroke',
    paths: [
      'M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33',
    ],
  },
  /**
   * Rostro. Se sustituye el trazado original de 5120 unidades (~60 lineas de
   * datos) por uno de la misma rejilla que el resto: pesaba mas que el propio
   * componente y no combinaba de tamano con los iconos vecinos.
   */
  face: {
    mode: 'stroke',
    paths: [
      'M3.75 8.25V6a2.25 2.25 0 0 1 2.25-2.25h2.25M15.75 3.75H18A2.25 2.25 0 0 1 20.25 6v2.25M20.25 15.75V18A2.25 2.25 0 0 1 18 20.25h-2.25M8.25 20.25H6A2.25 2.25 0 0 1 3.75 18v-2.25',
      'M9 10.5h.008v.008H9V10.5Zm6 0h.008v.008H15V10.5Z',
      'M9.75 15a3.75 3.75 0 0 0 4.5 0',
    ],
  },
  qr: {
    mode: 'stroke',
    paths: [
      'M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z',
      'M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z',
    ],
  },
  mail: {
    mode: 'stroke',
    paths: [
      'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75',
    ],
  },
  lock: {
    mode: 'stroke',
    paths: [
      'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z',
    ],
  },
  eye: {
    mode: 'stroke',
    paths: [
      'M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z',
      'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    ],
  },
  eyeOff: {
    mode: 'stroke',
    paths: [
      'M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 1-4.243-4.243m4.242 4.242L9.88 9.88',
    ],
  },
  arrowRight: {
    mode: 'stroke',
    paths: ['M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3'],
  },
  card: {
    mode: 'stroke',
    paths: [
      'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z',
    ],
  },
  search: {
    mode: 'stroke',
    paths: ['m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z'],
  },
  trash: {
    mode: 'stroke',
    paths: [
      'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
    ],
  },
  signature: {
    mode: 'stroke',
    paths: ['M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5'],
  },
  check: {
    mode: 'stroke',
    paths: ['m4.5 12.75 6 6 9-13.5'],
  },
  chevronRight: {
    mode: 'stroke',
    paths: ['m8.25 4.5 7.5 7.5-7.5 7.5'],
  },
  chevronLeft: {
    mode: 'stroke',
    paths: ['M15.75 19.5 8.25 12l7.5-7.5'],
  },
  chevronDown: {
    mode: 'stroke',
    paths: ['m19.5 8.25-7.5 7.5-7.5-7.5'],
  },
  calendar: {
    mode: 'stroke',
    paths: [
      'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
    ],
  },
  ship: {
    mode: 'stroke',
    paths: [
      'M3 16.5 4.5 12h15l1.5 4.5M6 12V7.5A1.5 1.5 0 0 1 7.5 6h9A1.5 1.5 0 0 1 18 7.5V12M12 6V3.75',
      'M2.25 18.75c1.5 0 1.5 1.5 3 1.5s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5',
    ],
  },
  plus: {
    mode: 'stroke',
    paths: ['M12 4.5v15m7.5-7.5h-15'],
  },
  download: {
    mode: 'stroke',
    paths: [
      'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3',
    ],
  },
  alert: {
    mode: 'stroke',
    paths: [
      'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
    ],
  },
  info: {
    mode: 'stroke',
    paths: [
      'm11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
    ],
  },
  inbox: {
    mode: 'stroke',
    paths: [
      'M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z',
    ],
  },
  camera: {
    mode: 'stroke',
    paths: [
      'M3 9a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 10.07 4h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 18.07 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z',
      'M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    ],
  },
  cameraSwitch: {
    mode: 'stroke',
    paths: [
      'M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5',
      'M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5',
      'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
      'm18 22-3-3 3-3',
      'm6 2 3 3-3 3',
    ],
  },
};

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="def().viewBox ?? '0 0 24 24'"
      [attr.fill]="def().mode === 'fill' ? 'currentColor' : 'none'"
      [attr.stroke]="def().mode === 'stroke' ? 'currentColor' : null"
      [attr.stroke-width]="def().mode === 'stroke' ? strokeWidth() : null"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @for (d of def().paths; track d) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
      }
      svg {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class Icon {
  readonly name = input.required<IconName>();
  /** Trazos mas finos para iconos grandes; mas gruesos para los pequenos. */
  readonly strokeWidth = input<number>(1.6);

  protected readonly def = computed<IconDef>(() => ICONS[this.name()] ?? ICONS['info']);
}
