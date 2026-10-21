import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface AssistantDocument extends Document {
    _id: Types.ObjectId;
    employeeId: Types.ObjectId;
    talkId: Types.ObjectId;
}

@Schema({ timestamps: true })
export class Assistant {
    @Prop({ required: true, ref: 'Employee' })
    employeeId: Types.ObjectId;

    @Prop({ required: true, ref: 'Talk' })
    talkId: Types.ObjectId;
}

export const AssistantSchema = SchemaFactory.createForClass(Assistant);
