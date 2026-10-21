import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Fingerprint } from '../../fingerprint/entities/fingerprint.entity';

export interface EmployeeDocument extends Document {
    _id: Types.ObjectId;
    id: number
    vismaId?: string;
    fileNumber?: string;
    firstName: string;
    lastName: string;
    document: string;
    email: string;
    phone: string;
    address: string;
    status: string;
    faceDescriptor: number[];
    signature: string;
    fingerprintId?: Types.ObjectId;
    currentChallenge?: string;
    issetFinger?: boolean;
}

@Schema({ timestamps: true })
export class Employee {
    /**
     * `staff_id` de Cosmos. Deja de ser obligatorio: desde que el registro de
     * la app tambien busca en Visma se puede dar de alta a alguien que solo
     * existe alli, y esa persona no tiene `staff_id`. El documento sigue siendo
     * la identidad de la ficha (es el unico campo con indice unico).
     */
    @Prop({ required: false })
    id: number;

    /** `id` del usuario en Visma TuRecibo, cuando la ficha vino de ahi. */
    @Prop({ required: false })
    vismaId?: string;

    /** Legajo de Visma (`numero_legajo`). */
    @Prop({ required: false })
    fileNumber?: string;

    @Prop({ required: true })
    firstName: string;

    @Prop({ required: true })
    lastName: string;

    @Prop({ required: false })
    email: string;

    @Prop({ required: false, unique: true })
    document: string;

    @Prop({ required: false })
    image: string;

    @Prop({ required: false })
    phone: string;

    @Prop({ required: false })
    address: string;

    @Prop({ default: 'active' })
    status: string;

    @Prop({ required: false })
    signature: string;

    @Prop({ type: [Number], required: false })
    faceDescriptor: number[];

    @Prop({ required: false })
    currentChallenge?: string;

    @Prop({ type: Types.ObjectId, ref: 'Fingerprint', required: false })
    fingerprintId?: Types.ObjectId;

    @Prop({ default: false })
    issetFinger?: boolean;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
