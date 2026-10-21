import { ComponentFixture, TestBed } from '@angular/core/testing';

import Fingerprint from './fingerprint';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('Fingerprint', () => {
  let component: Fingerprint;
  let fixture: ComponentFixture<Fingerprint>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Fingerprint],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Fingerprint);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
