import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { noAuthGuard } from './no-auth.guard';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('noAuthGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => noAuthGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
