import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface PermissionDocument extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    portId: Types.ObjectId;
}

@Schema({ timestamps: true })
export class Permission {
    @Prop({ required: true, ref: 'User', alias: 'user' })
    userId: Types.ObjectId;

    @Prop({ required: true })
    portId: Types.ObjectId;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
