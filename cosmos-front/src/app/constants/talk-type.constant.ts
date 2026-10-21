/**
 * Opciones de la capacitación del turno, que se registra dentro de la nombrada.
 *
 * El identificador es lo que se guarda; la etiqueta es solo lo que se lee en
 * pantalla. Lo que sale impreso en la hoja de charla lo resuelve el backend a
 * partir del identificador, para que un cambio de texto aquí no descoloque el
 * formato del cliente.
 */

export interface ITalkOption {
  id: string;
  label: string;
}

export const TALK_TYPES: ITalkOption[] = [
  { id: 'INDUCCION', label: 'Inducción' },
  { id: 'CAPACITACION', label: 'Capacitación' },
  { id: 'ENTRENAMIENTO', label: 'Entrenamiento' },
  { id: 'SIMULACRO', label: 'Simulacro de emergencia' },
  { id: 'TOOLBOX', label: 'Toolbox de seguridad' },
  { id: 'OTROS', label: 'Otros' },
];

export const TALK_PLACES: ITalkOption[] = [
  { id: 'EMBARCACION', label: 'Embarcación' },
  { id: 'TERMINAL', label: 'Terminal' },
  { id: 'OFICINA', label: 'Oficina' },
  { id: 'OTROS', label: 'Otros' },
];
