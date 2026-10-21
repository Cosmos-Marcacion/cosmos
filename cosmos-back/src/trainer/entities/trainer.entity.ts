
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

export interface TrainerDocument {
    firstName: string
    lastName: string
    document: string
    position: string
}

export interface GetTrainerDocument extends TrainerDocument {
    _id: Types.ObjectId
}


@Schema({ timestamps: true })
export class Trainer {

    @Prop({ required: true })
    firstName: string

    @Prop({ required: true })
    lastName: string

    @Prop({ required: true })
    document: string

    @Prop({ required: true })
    position: string

    @Prop({ default: true })
    active: boolean

}

export const TrainerSchema = SchemaFactory.createForClass(Trainer)