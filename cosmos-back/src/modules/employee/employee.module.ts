import { forwardRef, Module } from '@nestjs/common'
import { EmployeeService } from './employee.service'
import { EmployeeController } from './employee.controller'
import { MongooseModule } from '@nestjs/mongoose'
import { Employee, EmployeeSchema } from './entities/employee.entity'
import { NamedModule } from '../named/named.module'
import { UploadModule } from '../upload/upload.module'
import { VismaModule } from '../visma/visma.module'
import { EmployeeDirectoryService } from './employee-directory.service'
import { EmployeeSyncRunService } from './employee-sync-run.service'
import {
  EmployeeSyncRun,
  EmployeeSyncRunSchema,
} from './entities/employee-sync-run.entity'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: EmployeeSyncRun.name, schema: EmployeeSyncRunSchema },
    ]),
    forwardRef(() => NamedModule),
    UploadModule,
    // El buscador del registro cruza el maestro local con el de Visma.
    VismaModule,
  ],
  controllers: [EmployeeController],
  providers: [
    EmployeeService,
    EmployeeDirectoryService,
    EmployeeSyncRunService,
  ],
  exports: [EmployeeService, EmployeeDirectoryService],
})
export class EmployeeModule {}
