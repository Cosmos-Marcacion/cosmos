import { ComponentFixture, TestBed } from '@angular/core/testing';

import Face from './face';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('Face', () => {
  let component: Face;
  let fixture: ComponentFixture<Face>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Face],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Face);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
