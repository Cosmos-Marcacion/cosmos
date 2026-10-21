import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface TalkDocument extends Document {
    _id: Types.ObjectId;
    type: string;  // induccion, talk, training, drill, other
    topic: string;
    summary: string;
    isAnnual: boolean;
    area: string;
    place: string; //ship, terminal, office, other
    branch: string;
    startTime: string;
    endTime: string;
    hours: number;
    registerNumber: string;
    trainerId: Types.ObjectId;
    registerId: Types.ObjectId;
    workerDate: string
    turn: string
    staffTransmissionId: string
}




@Schema({ timestamps: true })
export class Talk {
    @Prop({ required: true })
    type: string;

    @Prop({ required: true })
    topic: string;

    @Prop({ required: true })
    summary: string;

    @Prop({ default: false })
    isAnnual: boolean;

    @Prop({ required: true })
    area: string;

    @Prop({ required: true })
    place: string;

    @Prop({ required: true })
    branch: string;

    @Prop({ required: true })
    startTime: string;

    @Prop({ required: true })
    endTime: string;

    @Prop({ required: true })
    hours: number;

    @Prop({ required: true })
    workerDate: string

    @Prop({ required: true })
    turn: string

    @Prop({ required: true, default: 0 })
    registerNumber: string;

    @Prop({ required: true, ref: 'Trainer', alias: 'trainer' })
    trainerId: Types.ObjectId;

    @Prop({ required: true, ref: 'Trainer', alias: 'register' })
    registerId: Types.ObjectId;

    @Prop({ required: true })
    staffTransmissionId: string
}

export const TalkSchema = SchemaFactory.createForClass(Talk);
