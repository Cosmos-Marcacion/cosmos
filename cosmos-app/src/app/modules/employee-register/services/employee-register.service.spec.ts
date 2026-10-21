import { TestBed } from '@angular/core/testing';

import { EmployeeRegisterService } from './employee-register.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('EmployeeRegisterService', () => {
  let service: EmployeeRegisterService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(EmployeeRegisterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
