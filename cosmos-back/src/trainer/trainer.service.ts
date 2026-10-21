import { Injectable } from '@nestjs/common';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateTrainerDto } from './dto/update-trainer.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Trainer } from './entities/trainer.entity';
import { Model } from 'mongoose';

@Injectable()
export class TrainerService {
  constructor(@InjectModel(Trainer.name) private trainerModel: Model<Trainer>) { }
  create(createTrainerDto: CreateTrainerDto) {
    return this.trainerModel.create(createTrainerDto);
  }

  findAll() {
    return this.trainerModel.find().exec();
  }

  /**
   * Devuelve el `Trainer` que corresponde a una persona del maestro de personal,
   * creándolo la primera vez.
   *
   * Las charlas referencian al entrenador y al responsable del registro por
   * `ObjectId`, y ese contrato lo consumen los reportes ya emitidos. En vez de
   * migrarlo, el selector de personal resuelve aquí la persona elegida: el
   * maestro de Visma sigue siendo el único origen de nombres y esta colección
   * queda como el espejo local que las charlas necesitan.
   *
   * La clave es el documento, que es lo único estable entre ambos sistemas.
   */
  async resolveFromPerson(person: {
    fullName: string;
    document?: string;
    position?: string;
  }) {
    const document = (person.document ?? '').trim();
    const fullName = (person.fullName ?? '').trim().replace(/\s+/g, ' ');
    // El maestro entrega "APELLIDOS NOMBRES" en un solo campo; se parte en dos
    // porque `Trainer` los guarda separados y así se imprimen en el reporte.
    const parts = fullName.split(' ');
    const lastName = parts.slice(0, 2).join(' ') || fullName;
    const firstName = parts.slice(2).join(' ') || fullName;

    const filter = document ? { document } : { firstName, lastName };
    return this.trainerModel
      .findOneAndUpdate(
        filter,
        {
          $set: {
            firstName,
            lastName,
            document,
            position: person.position ?? '',
            active: true,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  findOne(id: string) {
    return this.trainerModel.findById(id).exec();
  }

  update(id: string, updateTrainerDto: UpdateTrainerDto) {
    return this.trainerModel.findByIdAndUpdate(id, updateTrainerDto, { new: true }).exec();
  }

  remove(id: string) {
    return this.trainerModel.findByIdAndDelete(id).exec();
  }
}
