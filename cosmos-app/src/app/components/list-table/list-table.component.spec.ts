import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListTableComponent } from './list-table.component';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('ListTableComponent', () => {
  let component: ListTableComponent;
  let fixture: ComponentFixture<ListTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListTableComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
