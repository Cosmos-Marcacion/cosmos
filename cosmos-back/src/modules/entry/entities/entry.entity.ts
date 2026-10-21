import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Como se identifico quien marca desde la app. */
export const ENTRY_METHODS = ['rostro', 'huella', 'qr', 'documento'] as const;
export type EntryMethod = (typeof ENTRY_METHODS)[number];

export interface EntryDocument extends Document {
    _id: Types.ObjectId;
    pointId: Types.ObjectId;
    employeeId: Types.ObjectId;
    workerDate: string;
    namedId: number
    isRemate: boolean
    isAbsence: boolean
    date: Date
    observation: string
}

@Schema({ timestamps: true })
export class Entry {
    @Prop({ required: true, ref: 'Point', alias: 'point' })
    pointId: Types.ObjectId;

    @Prop({ required: true, ref: 'Employee', alias: 'employee' })
    employeeId: Types.ObjectId;

    @Prop({ required: true })
    namedId: number;

    @Prop({ required: true })
    workerDate: string;

    @Prop({ default: false })
    isRemate: boolean;

    @Prop({ default: false })
    isAbsence: boolean;

    @Prop({ required: true, default: Date.now })
    date: Date;

    @Prop({ required: false, default: '' })
    observation: string;

    /**
     * Con que se identifico quien marco desde la app: `rostro`, `huella`,
     * `qr` o `documento`. Vacio en las marcaciones manuales y en las antiguas.
     */
    @Prop({ type: String, required: false, enum: ENTRY_METHODS })
    method?: EntryMethod;

    /**
     * Lo seguro que estaba el reconocimiento: la distancia del rostro (menor
     * es mejor) o la puntuacion de la huella (mayor es mejor).
     */
    @Prop({ type: Number, required: false })
    matchScore?: number;
}

export const EntrySchema = SchemaFactory.createForClass(Entry);

// Índices para acelerar consultas por fecha, punto, empleado y nombrada
EntrySchema.index({ workerDate: 1 });
EntrySchema.index({ workerDate: 1, pointId: 1 });
EntrySchema.index({ employeeId: 1, namedId: 1, workerDate: 1 });
EntrySchema.index({ namedId: 1, workerDate: 1 });