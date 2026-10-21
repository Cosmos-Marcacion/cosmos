import { TestBed } from '@angular/core/testing';

import { FingerprintService } from './fingerprint.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('FingerprintService', () => {
  let service: FingerprintService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(FingerprintService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
