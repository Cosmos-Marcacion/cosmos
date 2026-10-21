import { ComponentFixture, TestBed } from '@angular/core/testing';

import Talks, { localToday } from './talks';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { provideRouter } from '@angular/router';

describe('Talks', () => {
  let component: Talks;
  let fixture: ComponentFixture<Talks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Talks],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Talks);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('Talks: listado', () => {
  let component: Talks;
  let http: HttpTestingController;
  const url = `${environment.api}/talk/search`;

  function page(ids: string[], pageNumber: number, total: number) {
    return {
      data: ids.map(id => ({ _id: id, workerDate: '2026-09-24', turn: '07:00 - 15:00' })),
      total,
      page: pageNumber,
      limit: 10,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Talks],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(Talks);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('"Ver mas" pide la pagina siguiente y la suma a la lista', () => {
    http.expectOne(r => r.url.startsWith(url) && r.urlWithParams.includes('page=1'))
      .flush(page(['a', 'b'], 1, 4));

    component.loadMore(2);
    http.expectOne(r => r.urlWithParams.includes('page=2')).flush(page(['c', 'd'], 2, 4));

    expect(component.talks().map(t => t._id)).toEqual(['a', 'b', 'c', 'd']);
    expect(component.page()).toBe(2);
  });

  it('buscar vuelve a la primera pagina', () => {
    http.expectOne(r => r.urlWithParams.includes('page=1')).flush(page(['a'], 1, 20));
    component.loadMore(2);
    http.expectOne(r => r.urlWithParams.includes('page=2')).flush(page(['b'], 2, 20));

    component.search();
    http.expectOne(r => r.urlWithParams.includes('page=1')).flush(page(['z'], 1, 1));

    expect(component.talks().map(t => t._id)).toEqual(['z']);
  });
});

describe('localToday', () => {
  it('usa la fecha del dispositivo y no la de UTC', () => {
    // 23 de septiembre a las 21:00 en hora local: en UTC ya seria dia 24 en
    // husos negativos como el de Peru.
    expect(localToday(new Date(2026, 8, 23, 21, 0))).toBe('2026-09-23');
  });
});
