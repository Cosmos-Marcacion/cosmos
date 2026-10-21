import { Test } from '@nestjs/testing'
import { EmployeeSyncRunService } from './employee-sync-run.service'
import { EmployeeSyncRun } from './entities/employee-sync-run.entity'
import { createModelMock, modelProvider, ModelMock } from '../../testing'

/** CKI11: cada sincronizacion deja constancia de cuando, como termino y cuantos. */
describe('EmployeeSyncRunService', () => {
  let service: EmployeeSyncRunService
  let model: ModelMock

  beforeEach(async () => {
    model = createModelMock()
    model.create.mockResolvedValue({ _id: 'run1' })
    const module = await Test.createTestingModule({
      providers: [
        EmployeeSyncRunService,
        modelProvider(EmployeeSyncRun.name, model),
      ],
    }).compile()
    service = module.get(EmployeeSyncRunService)
  })

  const resultado = (errors: string[] = []) => ({
    totalProcessed: 10,
    newEmployees: 2,
    existingEmployees: 8,
    errors,
  })

  it('abre el registro en curso con quien la lanzo', async () => {
    await service.record('ana@cosmos.com.pe', async () => resultado())

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        triggeredBy: 'ana@cosmos.com.pe',
      })
    )
  })

  it('sin errores la marca como correcta con sus cantidades', async () => {
    const res = await service.record('ana', async () => resultado())

    expect(res.newEmployees).toBe(2)
    const cambios = model.updateOne.mock.calls[0][1].$set
    expect(cambios).toEqual(
      expect.objectContaining({
        status: 'success',
        totalProcessed: 10,
        newEmployees: 2,
        existingEmployees: 8,
        errorCount: 0,
      })
    )
    expect(cambios.finishedAt).toBeInstanceOf(Date)
  })

  it('con errores por usuario la marca como parcial', async () => {
    await service.record('ana', async () =>
      resultado(['Error procesando usuario 1'])
    )

    expect(model.updateOne.mock.calls[0][1].$set).toEqual(
      expect.objectContaining({ status: 'partial', errorCount: 1 })
    )
  })

  it('si la sincronizacion falla lo registra y propaga el error', async () => {
    await expect(
      service.record('ana', async () => {
        throw new Error('servicio caido')
      })
    ).rejects.toThrow('servicio caido')

    expect(model.updateOne.mock.calls[0][1].$set).toEqual(
      expect.objectContaining({
        status: 'failed',
        failureMessage: 'servicio caido',
      })
    )
  })

  it('un fallo al guardar el registro no tumba la sincronizacion', async () => {
    model.create.mockRejectedValue(new Error('mongo caido'))

    await expect(
      service.record('ana', async () => resultado())
    ).resolves.toEqual(resultado())
  })
})
