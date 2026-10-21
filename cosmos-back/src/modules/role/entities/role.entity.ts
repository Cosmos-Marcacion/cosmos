import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

export interface RoleDocument {
    name: string
    description?: string
    permissions?: string[]
    active?: boolean
}

export interface GetRoleDocument extends RoleDocument {
    _id: Types.ObjectId
}


/**
 * Un perfil de usuario: como se llama y que modulos puede abrir.
 *
 * Antes era solo un nombre —`Super`, `Admin`, `User`— y el acceso se decidia
 * comparando ese nombre contra una lista escrita en cada controlador. Con eso,
 * dar permiso a alguien para una sola pantalla obligaba a tocar codigo y
 * desplegar.
 *
 * `permissions` guarda claves de `PLATFORM_MODULES`, que son las opciones del
 * menu. Se valida al guardar: un permiso inventado no llega a la base de datos,
 * porque nadie lo detectaria despues salvo por que una pantalla no abre.
 */
@Schema({ timestamps: true })
export class Role {

    @Prop({ required: true })
    name: string

    /** Para que sirve el perfil, en una linea. Se lee en la pantalla. */
    @Prop({ default: '' })
    description: string

    /**
     * Claves de modulo. Vacio significa que no entra a ninguna pantalla, no
     * que entre a todas: un perfil recien creado no puede abrirlo todo por
     * descuido.
     */
    @Prop({ type: [String], default: [] })
    permissions: string[]

    @Prop({ default: true })
    active: boolean

}

export const RoleSchema = SchemaFactory.createForClass(Role)
