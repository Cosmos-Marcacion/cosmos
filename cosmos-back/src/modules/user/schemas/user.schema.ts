import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface UserDocument extends Document {
    _id: Types.ObjectId;
    email: string;
    name: string;
    password: string;
    roleId: Types.ObjectId;
    image: string;
}

@Schema({ timestamps: true })
export class User {
    @Prop({ required: true, unique: true })
    email: string;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    password: string;

    @Prop({ required: true, ref: 'Role', alias: 'role' })
    roleId: Types.ObjectId;

    @Prop({ required: false })
    image: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
