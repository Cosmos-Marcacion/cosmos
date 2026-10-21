import { IsMongoId, IsNotEmpty, IsString } from 'class-validator'

export class GetNamesByDateAndTurnDto {
  @IsString()
  @IsNotEmpty()
  workerDate: string

  @IsString()
  @IsNotEmpty()
  turn: string

  // Va a `new Types.ObjectId(...)` al buscar los asistentes: mal formado
  // daba 500 en vez de 400.
  @IsMongoId()
  talkId: string
}
