import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UserStateService } from './user-state.service';

describe('UserStateService', () => {
  let service: UserStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    service = TestBed.inject(UserStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
