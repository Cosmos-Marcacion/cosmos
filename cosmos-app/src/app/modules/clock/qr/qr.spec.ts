import { ComponentFixture, TestBed } from '@angular/core/testing';

import Qr from './qr';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('Qr', () => {
  let component: Qr;
  let fixture: ComponentFixture<Qr>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Qr],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Qr);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
