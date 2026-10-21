import { Injectable, Logger } from '@nestjs/common'
import { EmployeeService } from './employee.service'
import { VismaPerson, VismaService } from '../visma/visma.service'

/**
 * Buscador de personal del registro de empleados de la app.
 *
 * Fusiona los dos maestros que tiene la plataforma, que hasta ahora vivian
 * separados:
 *
 *  - **Cosmos** (`api/Users/ListarUsuarios`), sincronizado en la coleccion
 *    `employees`. Es el personal operativo que aparece en las nombradas, y es
 *    de donde salia hasta ahora la lista del registro.
 *  - **Visma TuRecibo** (`GET /v2/admin-mod/users/search`). Es el maestro de
 *    RR. HH., y trae gente que Cosmos no tiene.
 *
 * Sin la fusion, a quien esta solo en Visma no se le podia registrar la huella,
 * la firma ni el rostro: simplemente no salia en el buscador.
 *
 * La union va **por documento**, que es lo unico que comparten los dos origenes
 * (el `staff_id` de Cosmos no existe en Visma y el `id` de Visma no existe en
 * Cosmos) y ademas es el unico campo con indice unico de la coleccion local.
 */

/**
 * Ficha local tal como la devuelve `findAllLean`, con la proyeccion
 * `EMPLOYEE_LEAN_FIELDS`. Se declara aqui porque el modelo de Mongoose no la
 * expresa: `select()` no estrecha el tipo.
 */
interface LeanEmployee {
  _id?: { toString(): string }
  id?: number
  vismaId?: string
  fileNumber?: string
  firstName?: string
  lastName?: string
  document?: string
  signature?: string
  status?: string
  issetFinger?: boolean
}

export interface DirectoryPerson {
  /** Clave estable de la fila: el documento normalizado, o el origen y su id. */
  key: string
  /** `_id` de la ficha local, si la persona ya esta dada de alta. */
  employeeId?: string
  /** `staff_id` de Cosmos. Ausente en quien solo esta en Visma. */
  id?: number
  /** `id` del usuario en Visma TuRecibo. */
  vismaId?: string
  firstName: string
  lastName: string
  /** Nombre para mostrar. En Visma llega sin separar apellidos. */
  fullName: string
  document: string
  fileNumber?: string
  position?: string
  email?: string
  status: string
  issetFinger: boolean
  signature: string
  /** Maestros en los que aparece la persona: `cosmos`, `visma` o ambos. */
  sources: ('cosmos' | 'visma')[]
}

export interface DirectoryResult {
  data: DirectoryPerson[]
  total: number
  /** Caracteres minimos para que Visma responda; por debajo solo hay Cosmos. */
  minLength: number
  /** `false` cuando Visma no respondio: la lista sale solo de Cosmos. */
  vismaAvailable: boolean
}

/** Quita acentos y pasa a mayusculas, para comparar sin sorpresas. */
function norm(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

/**
 * Clave de cruce de un documento.
 *
 * Se quitan separadores y ceros a la izquierda porque los dos origenes escriben
 * el mismo DNI de formas distintas (`03501122` en Cosmos, `3501122` en Visma) y
 * si no coincidieran la misma persona saldria dos veces en el buscador.
 */
function documentKey(document: string): string {
  const clean = norm(document).replace(/[^0-9A-Z]/g, '')
  return clean.replace(/^0+/, '') || clean
}

/** Parte un nombre completo en apellidos y nombres cuando no vienen separados. */
function splitFullName(fullName: string): {
  firstName: string
  lastName: string
} {
  const words = norm(fullName).split(' ').filter(Boolean)
  if (words.length === 0) {
    return { firstName: '', lastName: '' }
  }
  if (words.length === 1) {
    return { firstName: words[0], lastName: '' }
  }
  // Visma devuelve "Nombres Apellidos" en el buscador. Con dos palabras se
  // reparte una y una; con mas, las dos ultimas se toman como apellidos, que es
  // lo habitual en Peru. Es una aproximacion solo para ordenar y mostrar: al
  // seleccionar a la persona se pide su ficha, que si los trae separados.
  const lastCount = words.length >= 3 ? 2 : 1
  return {
    firstName: words.slice(0, words.length - lastCount).join(' '),
    lastName: words.slice(words.length - lastCount).join(' '),
  }
}

@Injectable()
export class EmployeeDirectoryService {
  private readonly logger = new Logger(EmployeeDirectoryService.name)

  constructor(
    private readonly employeeService: EmployeeService,
    private readonly vismaService: VismaService
  ) {}

  /**
   * Personal de los dos maestros para el buscador del registro.
   *
   * Sin termino de busqueda se devuelve solo Cosmos: Visma no tiene endpoint de
   * listado y exige un filtro de tres caracteres, asi que la lista inicial de
   * la app sigue siendo la de siempre y Visma se suma en cuanto se teclea.
   */
  async search(search = '', limit = 100): Promise<DirectoryResult> {
    const term = (search ?? '').trim()
    const locals =
      (await this.employeeService.findAllLean()) as unknown as LeanEmployee[]

    const byKey = new Map<string, DirectoryPerson>()
    for (const local of locals) {
      const entry = this.fromLocal(local)
      const existing = byKey.get(entry.key)
      // Un mismo documento puede tener varias fichas locales (mismo DNI con
      // distinto staff_id). Gana la que ya tenga registros biometricos.
      if (!existing || (!existing.issetFinger && !existing.signature)) {
        byKey.set(
          entry.key,
          existing ? this.mergeLocal(existing, entry) : entry
        )
      }
    }

    let vismaAvailable = true
    if (term.length >= this.vismaService.minSearchLength()) {
      try {
        const people = await this.vismaService.search({ search: term, limit })
        for (const person of people) {
          this.addVisma(byKey, person)
        }
      } catch (error) {
        // Visma caido no puede dejar sin registrar a quien ya esta en Cosmos.
        vismaAvailable = false
        const detail = error instanceof Error ? error.message : String(error)
        this.logger.warn(`Visma no respondio al buscar "${term}": ${detail}`)
      }
    }

    const matches = this.rank([...byKey.values()], term)
    return {
      data: matches.slice(0, limit),
      total: matches.length,
      minLength: this.vismaService.minSearchLength(),
      vismaAvailable,
    }
  }

  // ------------------------------------------------------------------ mapeo

  private fromLocal(local: LeanEmployee): DirectoryPerson {
    const firstName = norm(local.firstName ?? '')
    const lastName = norm(local.lastName ?? '')
    const document = String(local.document ?? '').trim()
    return {
      key:
        documentKey(document) ||
        `cosmos:${local.id ?? local._id?.toString() ?? ''}`,
      employeeId: local._id?.toString(),
      id: typeof local.id === 'number' ? local.id : undefined,
      vismaId: local.vismaId || undefined,
      fileNumber: local.fileNumber || undefined,
      firstName,
      lastName,
      fullName: [lastName, firstName].filter(Boolean).join(' '),
      document,
      status: local.status ?? 'active',
      issetFinger: Boolean(local.issetFinger),
      signature: local.signature ?? '',
      sources: ['cosmos'],
    }
  }

  /** Conserva de la ficha desplazada lo que la ganadora no tenga. */
  private mergeLocal(
    winner: DirectoryPerson,
    other: DirectoryPerson
  ): DirectoryPerson {
    return {
      ...winner,
      employeeId: winner.employeeId ?? other.employeeId,
      id: winner.id ?? other.id,
      issetFinger: winner.issetFinger || other.issetFinger,
      signature: winner.signature || other.signature,
    }
  }

  private addVisma(
    byKey: Map<string, DirectoryPerson>,
    person: VismaPerson
  ): void {
    const document = person.document ?? ''
    const key = documentKey(document) || `visma:${person.id}`
    const existing = byKey.get(key)

    if (existing) {
      // Ya estaba en Cosmos: se marca el segundo origen y se completa lo que la
      // ficha local no guarda. El nombre local manda, que es el que se imprime.
      existing.sources = existing.sources.includes('visma')
        ? existing.sources
        : [...existing.sources, 'visma']
      existing.vismaId = existing.vismaId ?? person.id
      existing.fileNumber = existing.fileNumber ?? person.fileNumber
      existing.position = existing.position || person.position || undefined
      existing.email = existing.email ?? person.email
      if (!existing.document && document) {
        existing.document = document
      }
      return
    }

    const split =
      person.lastName || person.firstName
        ? {
            firstName: norm(person.firstName ?? ''),
            lastName: norm(person.lastName ?? ''),
          }
        : splitFullName(person.fullName)

    byKey.set(key, {
      key,
      vismaId: person.id,
      firstName: split.firstName,
      lastName: split.lastName,
      fullName: norm(person.fullName),
      document,
      fileNumber: person.fileNumber,
      position: person.position || undefined,
      email: person.email,
      status: person.active ? 'active' : 'inactive',
      issetFinger: false,
      signature: '',
      sources: ['visma'],
    })
  }

  /**
   * Relevancia para el autocompletado: documento exacto primero, luego prefijo
   * de documento, luego apellido o nombre que empieza por lo tecleado y por
   * ultimo lo que solo lo contiene. Sin termino se ordena por apellido.
   */
  private rank(people: DirectoryPerson[], search: string): DirectoryPerson[] {
    const byName = (a: DirectoryPerson, b: DirectoryPerson) =>
      `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
        'es',
        {
          numeric: true,
          sensitivity: 'base',
        }
      )

    const term = norm(search)
    if (!term) {
      return [...people].sort(byName)
    }

    const scored: { person: DirectoryPerson; score: number }[] = []
    for (const person of people) {
      const name = `${person.lastName} ${person.firstName} ${person.fullName}`
      const document = norm(person.document)

      let score = -1
      if (document === term) score = 0
      else if (document.startsWith(term)) score = 1
      else if (
        norm(person.lastName).startsWith(term) ||
        norm(person.firstName).startsWith(term)
      )
        score = 2
      else if (name.split(' ').some(word => word.startsWith(term))) score = 3
      else if (name.includes(term) || document.includes(term)) score = 4
      // Lo que trae Visma ya lo filtro la propia API: aunque la coincidencia no
      // se vea en el nombre normalizado, la persona es un resultado valido.
      else if (
        person.sources.includes('visma') &&
        !person.sources.includes('cosmos')
      )
        score = 5

      if (score >= 0) {
        scored.push({ person, score })
      }
    }

    return scored
      .sort((a, b) => a.score - b.score || byName(a.person, b.person))
      .map(s => s.person)
  }
}
