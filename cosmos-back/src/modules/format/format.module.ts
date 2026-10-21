import { forwardRef, Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { FormatService } from './format.service'
import { FormatDataService } from './format-data.service'
import { FormatEngineResolver } from './format-engine.resolver'
import { PdfService } from './pdf.service'
import { FormatController } from './format.controller'
import { NamedModule } from '../named/named.module'
import { EmployeeModule } from '../employee/employee.module'
import { EntryModule } from '../entry/entry.module'
import { PointModule } from '../point/point.module'
import { FORMAT_ENGINE_V2 } from './format-engine'
import { DocumentBuilder } from './v2/document.builder'
import { XlsxRenderer } from './v2/xlsx.renderer'
import { FormatNumberingService } from './v2/format-numbering.service'
import { FormatV2Engine } from './v2/format-v2.engine'
import { NumberingModule } from '../../common/numbering/numbering.module'
import { UploadModule } from '../upload/upload.module'
import { FormatDefinitionController } from './definitions/format-definition.controller'
import { FormatDefinitionService } from './definitions/format-definition.service'
import {
  FormatDefinitionEntity,
  FormatDefinitionSchema,
  FormatDefinitionVersionEntity,
  FormatDefinitionVersionSchema,
} from './definitions/format-definition.entity'

@Module({
  imports: [
    forwardRef(() => NamedModule),
    forwardRef(() => EmployeeModule),
    forwardRef(() => EntryModule),
    forwardRef(() => PointModule),
    NumberingModule,
    // El motor v2 baja de S3 los bytes de las firmas registradas para dibujarlas
    // en el libro; `UploadService` es quien sabe leer de ahi.
    UploadModule,
    MongooseModule.forFeature([
      { name: FormatDefinitionEntity.name, schema: FormatDefinitionSchema },
      { name: FormatDefinitionVersionEntity.name, schema: FormatDefinitionVersionSchema },
    ]),
  ],
  // El orden importa y no es cosmetico. `FormatController` declara
  // `@Get(':staffTransmissionId')`, que casa con **cualquier** segmento debajo
  // de `/format`, incluido `/format/definitions`. Registrado primero, se
  // quedaba con la peticion del maestro e intentaba emitir el formato de una
  // nombrada llamada "definitions".
  //
  // Express 5 ya no admite restringir un parametro con una expresion regular
  // (`:id(\\d+)` lanza con path-to-regexp 8), asi que la unica forma de
  // desambiguar es declarar la ruta concreta antes que la comodin.
  controllers: [FormatDefinitionController, FormatController],
  providers: [
    FormatDataService,
    FormatService,
    FormatEngineResolver,
    PdfService,
    DocumentBuilder,
    XlsxRenderer,
    FormatNumberingService,
    FormatDefinitionService,
    FormatV2Engine,
    // El resolutor inyecta el motor v2 por token porque `FormatEngine` es una
    // interfaz y en tiempo de ejecucion no queda nada de ella.
    { provide: FORMAT_ENGINE_V2, useExisting: FormatV2Engine },
  ],
  exports: [
    FormatDataService,
    FormatService,
    FormatEngineResolver,
    PdfService,
    FormatDefinitionService,
  ],
})
export class FormatModule { }
