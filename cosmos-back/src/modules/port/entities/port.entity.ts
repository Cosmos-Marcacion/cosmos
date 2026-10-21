import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface PortDocument extends Document {
    _id: Types.ObjectId;
    name: string;
    address: string;
}

@Schema({ timestamps: true })
export class Port {
    @Prop({ required: true, unique: true })
    name: string;

    @Prop({ required: true })
    address: string;

}

export const PortSchema = SchemaFactory.createForClass(Port);