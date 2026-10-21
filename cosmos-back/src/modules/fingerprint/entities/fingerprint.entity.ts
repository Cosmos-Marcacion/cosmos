import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { Employee } from '../../employee/entities/employee.entity';

@Schema({ collection: 'fingerprints', timestamps: true })
export class Fingerprint extends Document {
    @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true })
    employeeId: Employee;

    @Prop({ required: true })
    template: string; // Base64 string

    @Prop({ required: false })
    quality?: number;

    @Prop({ required: false })
    templateLen?: number;

    @Prop({ default: Date.now })
    createdAt: Date;
}

export const FingerprintSchema = SchemaFactory.createForClass(Fingerprint);