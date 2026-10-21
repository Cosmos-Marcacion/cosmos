import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Port } from 'src/modules/port/entities/port.entity';

export interface PointDocument extends Document {
    _id: Types.ObjectId;
    portId: Types.ObjectId;
    order: number;
    dependOnId: Types.ObjectId;
    name: string;
}

export interface PointResponse extends PointDocument {
    _id: Types.ObjectId;
    port: Port;
    dependOn: PointDocument;
    previousTolerance: number;
    nextTolerance: number;
    order: number;
    isChecked: boolean;
}

@Schema({ timestamps: true })
export class Point {
    @Prop({ required: true, ref: 'Port', alias: 'port' })
    portId: Types.ObjectId;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    order: number;

    @Prop({ ref: 'Point', alias: 'dependOn' })
    dependOnId: Types.ObjectId;

    @Prop({ default: 0 })
    previousTolerance: number;

    @Prop({ default: 0 })
    nextTolerance: number;

}

export const PointSchema = SchemaFactory.createForClass(Point);
