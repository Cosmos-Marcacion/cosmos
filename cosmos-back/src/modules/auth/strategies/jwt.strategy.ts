import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { jwtSecret } from '../constants/jwt.constants';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: jwtSecret(),
        });
    }

    async validate(payload: any) {
        return {
            _id: payload.userId,
            email: payload.email,
            roles: payload.roles,
            // Un token emitido antes de que existieran los perfiles no los
            // trae. Se resuelve como lista vacia y no como `undefined`, para
            // que el guardia compare siempre contra un array.
            permissions: payload.permissions ?? [],
        };
    }
}