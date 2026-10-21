import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import {
  TALK_SESSION_PLACES,
  TALK_SESSION_TYPES,
} from '../talk-session.constants'

export class PersonRefDto {
  @IsString() @IsOptional() fullName?: string
  @IsString() @IsOptional() document?: string
  @IsString() @IsOptional() source?: string
  @IsString() @IsOptional() externalId?: string
  @IsString() @IsOptional() position?: string
}

export class TalkTopicDto {
  @IsString() @IsOptional() topic?: string
  @IsString() @IsOptional() summary?: string
}

export class UpsertNamedRecordDto {
  /** Fecha de la nombrada en `dd/mm/yyyy`, necesaria para localizarla. */
  @IsString() @IsNotEmpty() workerDate: string

  /**
   * Ya no se guarda: el formato sale del tipo de nave de Cosmos. Se sigue
   * aceptando para que un cliente anterior no reciba un 400 al guardar.
   */
  @IsString()
  @IsOptional()
  @IsIn([
    'ETHANOL',
    'GRANEL',
    'MERCADERIA_GENERAL',
    'CONTAINERO',
    'BIG_BAG',
    '',
  ])
  formatType?: string

  @ValidateNested()
  @Type(() => PersonRefDto)
  @IsOptional()
  jefeCubierta?: PersonRefDto
  @ValidateNested()
  @Type(() => PersonRefDto)
  @IsOptional()
  supervisorOperaciones?: PersonRefDto
  @ValidateNested()
  @Type(() => PersonRefDto)
  @IsOptional()
  supervisorSsoma?: PersonRefDto
  @ValidateNested()
  @Type(() => PersonRefDto)
  @IsOptional()
  jefeCubiertaVsi?: PersonRefDto
  @ValidateNested()
  @Type(() => PersonRefDto)
  @IsOptional()
  ssomaVsi?: PersonRefDto
  @ValidateNested()
  @Type(() => PersonRefDto)
  @IsOptional()
  trainer?: PersonRefDto
  @ValidateNested()
  @Type(() => PersonRefDto)
  @IsOptional()
  registerResponsible?: PersonRefDto

  /** Cadena vacia mientras no se elija; la hoja sale sin marcar. */
  @IsString()
  @IsOptional()
  @IsIn([...TALK_SESSION_TYPES, ''])
  talkType?: string

  @IsString()
  @IsOptional()
  @IsIn([...TALK_SESSION_PLACES, ''])
  talkPlace?: string

  @IsBoolean() @IsOptional() talkIsAnnual?: boolean

  @IsString()
  @IsOptional()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/, {
    message: 'talkStartTime debe tener formato HH:mm',
  })
  talkStartTime?: string

  @IsString()
  @IsOptional()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/, {
    message: 'talkEndTime debe tener formato HH:mm',
  })
  talkEndTime?: string

  @IsNumber() @Min(0) @Max(24) @IsOptional() talkHours?: number

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TalkTopicDto)
  @IsOptional()
  talkTopics?: TalkTopicDto[]

  @IsString() @IsOptional() notes?: string
}

export class GetNamedBoardDto {
  /** `dd/mm/yyyy` */
  @IsString() @IsNotEmpty() sInitialDate: string
  @IsString() @IsNotEmpty() sFinalDate: string
  @IsString() @IsOptional() turn?: string
  @IsString() @IsOptional() vessel?: string
}
