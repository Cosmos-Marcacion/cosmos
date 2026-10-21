import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

export interface PresitionDocument {
    presition: number
}

export interface GetPresitionDocument extends PresitionDocument {
    _id: Types.ObjectId
}


@Schema({ timestamps: true })
export class Presition {

    @Prop({ required: true })
    presition: number

}

export const PresitionSchema = SchemaFactory.createForClass(Presition)