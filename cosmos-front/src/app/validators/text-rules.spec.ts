import { FormControl } from '@angular/forms';
import { emailAddress } from './text-rules';

describe('emailAddress', () => {
  const check = (value: string) => emailAddress(new FormControl(value));

  it('acepta un correo con dominio completo', () => {
    expect(check('ana.torres@cosmos.com.pe')).toBeNull();
  });

  it('rechaza un dominio sin punto, que la API rechaza con IsEmail', () => {
    // `Validators.email` lo daba por bueno y el 400 llegaba al guardar.
    expect(check('ana@cosmos')).toEqual({ email: true });
  });

  it('rechaza espacios y arrobas de mas', () => {
    expect(check('ana torres@cosmos.pe')).toEqual({ email: true });
    expect(check('ana@@cosmos.pe')).toEqual({ email: true });
  });

  it('deja el vacio a la regla de obligatorio', () => {
    expect(check('')).toBeNull();
  });
});
