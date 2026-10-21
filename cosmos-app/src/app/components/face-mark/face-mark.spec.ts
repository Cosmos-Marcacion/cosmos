import { ComponentFixture, TestBed } from '@angular/core/testing';

import FaceMark from './face-mark';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('FaceMark', () => {
  let component: FaceMark;
  let fixture: ComponentFixture<FaceMark>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FaceMark],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(FaceMark);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
