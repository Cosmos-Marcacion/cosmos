import { TestBed } from '@angular/core/testing';

import { TalksService } from './talks.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('TalksService', () => {
  let service: TalksService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(TalksService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
