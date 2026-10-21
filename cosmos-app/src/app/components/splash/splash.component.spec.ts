import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SplashComponent } from './splash.component';
import { SplashService } from '../../services/splash.service';
import { of } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('SplashComponent', () => {
  let component: SplashComponent;
  let fixture: ComponentFixture<SplashComponent>;
  let splashService: jasmine.SpyObj<SplashService>;

  beforeEach(async () => {
    const spy = jasmine.createSpyObj('SplashService', ['getSplashVisible']);
    spy.getSplashVisible.and.returnValue(of(true));

    await TestBed.configureTestingModule({
      imports: [SplashComponent],
      providers: [
        { provide: SplashService, useValue: spy },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SplashComponent);
    component = fixture.componentInstance;
    splashService = TestBed.inject(
      SplashService
    ) as jasmine.SpyObj<SplashService>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call splashService.getSplashVisible on init', () => {
    component.ngOnInit();
    expect(splashService.getSplashVisible).toHaveBeenCalled();
  });
});
