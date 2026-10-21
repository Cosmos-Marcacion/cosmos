import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../modules/auth/guards/roles.guard';
import { ModuleGuard } from '../common/access/module.guard';

/** Usuario que los tests inyectan en `request.user` cuando no les importa quien pide. */
export const TEST_USER = {
  _id: '000000000000000000000001',
  email: 'qa@cosmos.com.pe',
  roles: ['admin'],
  permissions: ['puertos', 'permisos', 'nombradas', 'formatos', 'empleados'],
};

/**
 * Guard que siempre deja pasar y ademas planta un usuario en la peticion.
 *
 * Sirve para probar el *controlador*: rutas, parseo de parametros, codigos de
 * estado. La autorizacion tiene sus propios tests, sobre los guards de verdad
 * (`module.guard.spec.ts`, `roles.guard.spec.ts`); mezclarlas haria que un
 * fallo de permisos se manifestara como un fallo de ruta.
 */
export class AllowAllGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    request.user = { ...TEST_USER, ...(request.user ?? {}) };
    return true;
  }
}

/**
 * Desactiva la cadena de autorizacion completa de un modulo de prueba.
 *
 * Se llama antes de `.compile()`.
 */
export function bypassAuth(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder
    .overrideGuard(AuthGuard('jwt'))
    .useClass(AllowAllGuard)
    .overrideGuard(RolesGuard)
    .useClass(AllowAllGuard)
    .overrideGuard(ModuleGuard)
    .useClass(AllowAllGuard);
}

/**
 * `ExecutionContext` minimo para probar guards e interceptores sin levantar
 * HTTP. `handler` y `cls` son lo que leera el `Reflector`.
 */
export function executionContext(options: {
  user?: unknown;
  handler?: unknown;
  cls?: unknown;
  request?: Record<string, unknown>;
}): ExecutionContext {
  const request = { user: options.user, ...(options.request ?? {}) };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getHandler: () => options.handler ?? (() => undefined),
    getClass: () => options.cls ?? class {},
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}),
    switchToWs: () => ({}),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}
