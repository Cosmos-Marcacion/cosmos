import { ComponentFixture, TestBed } from '@angular/core/testing';

import Clock from './clock';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('Clock', () => {
  let component: Clock;
  let fixture: ComponentFixture<Clock>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Clock],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Clock);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
