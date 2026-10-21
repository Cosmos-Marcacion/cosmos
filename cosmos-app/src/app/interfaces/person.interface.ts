/** Persona del maestro de personal (Visma). */
export interface IPerson {
  id: string;
  fullName: string;
  document: string;
  position: string;
  active: boolean;
}

/**
 * Persona ya asignada a algo de la plataforma.
 *
 * Se guarda como copia y no como referencia: el nombre y el documento deben
 * quedar congelados tal como se imprimieron en el formato, aunque después
 * cambien en el maestro.
 */
export interface IPersonRef {
  fullName: string;
  document: string;
  source?: string;
  externalId?: string;
  position?: string;
}
