import { TestBed } from '@angular/core/testing';

import { FaceService } from './face.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('FaceService', () => {
  let service: FaceService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(FaceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
