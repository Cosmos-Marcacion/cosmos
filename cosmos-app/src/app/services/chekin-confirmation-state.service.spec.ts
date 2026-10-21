import { TestBed } from '@angular/core/testing';

import { ChekinConfirmationStateService } from './chekin-confirmation-state.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('ChekinConfirmationStateService', () => {
  let service: ChekinConfirmationStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(ChekinConfirmationStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
