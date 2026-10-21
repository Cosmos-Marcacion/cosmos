import { TestBed } from '@angular/core/testing';
import { SplashService } from './splash.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('SplashService', () => {
  let service: SplashService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(SplashService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return observable for splash visibility', () => {
    const result = service.getSplashVisible();
    expect(result).toBeDefined();
  });

  it('should hide splash', () => {
    spyOn(service['splashVisible'], 'next');
    service.hideSplash();
    expect(service['splashVisible'].next).toHaveBeenCalledWith(false);
  });

  it('should show splash', () => {
    spyOn(service['splashVisible'], 'next');
    service.showSplash();
    expect(service['splashVisible'].next).toHaveBeenCalledWith(true);
  });
});
