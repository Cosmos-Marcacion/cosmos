import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import {
  IAssistance,
  IAssistancesResponse,
  IDashboardFilters,
  IDashboardResponse,
  INamedRow,
  INamedsResponse,
} from './interfaces/dashboard.interface';
import { FormsModule } from '@angular/forms';
import { DashboardService } from './services/dashboard.service';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { ExcelService } from '../../services/excel.service';
import {
  ExcelDownloadConfig,
  ExcelDownloadComponent,
} from '../../components/excel-download/excel-download.component';
import { Chart, registerables } from 'chart.js';
import { CommonModule } from '@angular/common';
import { DashboardFilters } from './dashboard-filters/dashboard-filters';
import { ServerTable } from '../../components/server-table/server-table';
import { LoaderService } from '../../services/loader.service';
import { NotificationService } from '../../services/notification.service';
import { HttpErrorResponse } from '@angular/common/http';
import {
  EMPTY,
  Subject,
  catchError,
  finalize,
  lastValueFrom,
  switchMap,
  takeUntil,
} from 'rxjs';

Chart.register(...registerables);

type ChartPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

const EMPTY_RESPONSE: IDashboardResponse = {
  totalNameds: 0,
  totalEmployees: 0,
  totalAssistances: 0,
  totalTalks: 0,
  totalPersonNameds: 0,
  totalNoAssistances: 0,
  totalAssistancesByNamed: 0,
  chart1Data: {
    daily: { labels: [], data: [] },
    weekly: { labels: [], data: [] },
    monthly: { labels: [], data: [] },
    yearly: { labels: [], data: [] },
  },
  chart2Data: [],
  chart3Data: [],
  chart5Data: { labels: [], values: [] },
  assistancesPage: { data: [], total: 0, page: 1, limit: 10 },
  namedsPage: { data: [], total: 0, page: 1, limit: 10 },
};

/**
 * Panel de control.
 *
 * Una búsqueda es ahora una sola petición. Antes eran tres encadenadas
 * (`/dashboard`, luego `/dashboard/assistances`, luego `/dashboard/nameds`), sin
 * cancelación: al cambiar de filtro varias veces seguidas se apilaban, la
 * respuesta más lenta pisaba a la más reciente y el loader sólo se cerraba en el
 * callback de éxito de la última, de modo que cualquier error lo dejaba girando.
 */
/**
 * Filas que se piden para el Excel: todo el resultado, sin pasar del tope que
 * admite `DashboardDto.limit` (100000). Por encima la API respondia 400 y no
 * se descargaba nada.
 */
export const EXPORT_MAX_ROWS = 100000;
export function exportLimit(total: number | null | undefined): number {
  const rows = total && total > 0 ? total : 10000;
  return Math.min(rows, EXPORT_MAX_ROWS);
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    FormsModule,
    ExcelDownloadComponent,
    CommonModule,
    DashboardFilters,
    ServerTable,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export default class Dashboard implements OnInit, OnDestroy {
  private dashboardService = inject(DashboardService);
  private excelService = inject(ExcelService);
  private loaderService = inject(LoaderService);
  private notificationService = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('barChartCanvas') barChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pieChartCanvas') pieChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChartCanvas2') barChartCanvas2!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChartCanvas5') barChartCanvas5!: ElementRef<HTMLCanvasElement>;

  barChart: Chart | null = null;
  pieChart: Chart | null = null;
  barChart2: Chart | null = null;
  barChart5: Chart | null = null;

  selectedPeriod: ChartPeriod = 'daily';
  loading = false;
  error = '';

  assistancesPage = 1;
  assistancesLimit = 10;
  assistancesData: IAssistance[] = [];
  assistancesTotal = 0;

  namedsPage = 1;
  namedsLimit = 10;
  namedsData: INamedRow[] = [];
  namedsTotal = 0;

  dashboardResponse: IDashboardResponse = { ...EMPTY_RESPONSE };

  /**
   * Si cada grafico tiene algo que pintar. Sin datos, Chart.js dibuja los ejes
   * vacios y no se distingue un dia sin asistencias de una carga que fallo; en
   * su lugar se muestra un mensaje.
   */
  chartHasData = { bar: false, pie: false, positions: false, turns: false };
  /** Hubo al menos una busqueda terminada: antes de eso el vacio no es "sin datos". */
  searched = false;
  filters: IDashboardFilters = {} as IDashboardFilters;

  /**
   * Cada emisión cancela la consulta anterior: la vista sólo puede reflejar la
   * última búsqueda pedida, nunca una respuesta atrasada.
   */
  private readonly searchTrigger = new Subject<IDashboardFilters>();
  private readonly assistancesTrigger = new Subject<void>();
  private readonly namedsTrigger = new Subject<void>();
  private readonly destroy = new Subject<void>();

  headers: IHeaderList[] = [
    { header: 'Fecha', value: 'workerDate' },
    { header: 'Turno', value: 'turn' },
    { header: 'Nombrada', value: 'named' },
    { header: 'Navío', value: 'ship' },
    { header: 'Muelle', value: 'muelle' },
    { header: 'Empleado', value: 'employee' },
    { header: 'Posición', value: 'position' },
    { header: 'Marcaciones', value: 'markings' },
  ];

  headersNameds: IHeaderList[] = [
    { header: 'Fecha', value: 'date' },
    { header: 'Navío', value: 'ship' },
    { header: 'Turno', value: 'turn' },
    { header: 'Muelle', value: 'location' },
    { header: 'Número', value: 'number' },
    { header: 'Personal Nombrado', value: 'staffCount' },
    { header: 'Asistentes', value: 'assistantsCount' },
  ];

  // Las configuraciones del Excel se guardan en vez de calcularse desde la
  // plantilla: allí se reconstruían enteras en cada ciclo de detección.
  excelConfigAssistances: ExcelDownloadConfig = this.buildExcelConfigAssistances();
  excelConfigNameds: ExcelDownloadConfig = this.buildExcelConfigNameds();

  ngOnInit() {
    this.searchTrigger
      .pipe(
        switchMap((filters) => {
          this.loading = true;
          this.error = '';
          return this.dashboardService.getDashboard(filters).pipe(
            catchError(() => {
              this.error = 'No se pudieron cargar los datos del panel.';
              this.applyResponse({ ...EMPTY_RESPONSE });
              return EMPTY;
            }),
            finalize(() => {
              // Se libera pase lo que pase: éxito, error o cancelación por una
              // búsqueda más reciente.
              this.loading = false;
              this.loaderService.hide();
              this.cdr.detectChanges();
            })
          );
        }),
        takeUntil(this.destroy)
      )
      .subscribe((res) => this.applyResponse(res));

    this.assistancesTrigger
      .pipe(
        switchMap(() =>
          this.dashboardService
            .getDashboardAssistances({
              ...this.filters,
              limit: this.assistancesLimit,
              page: this.assistancesPage,
            })
            .pipe(catchError(() => EMPTY))
        ),
        takeUntil(this.destroy)
      )
      .subscribe((res: IAssistancesResponse) => {
        this.assistancesData = res.data;
        this.assistancesTotal = res.total;
        this.excelConfigAssistances = this.buildExcelConfigAssistances();
        this.cdr.detectChanges();
      });

    this.namedsTrigger
      .pipe(
        switchMap(() =>
          this.dashboardService
            .getDashboardNameds({
              ...this.filters,
              limit: this.namedsLimit,
              page: this.namedsPage,
            })
            .pipe(catchError(() => EMPTY))
        ),
        takeUntil(this.destroy)
      )
      .subscribe((res: INamedsResponse) => {
        this.namedsData = res.data;
        this.namedsTotal = res.total;
        this.excelConfigNameds = this.buildExcelConfigNameds();
        this.cdr.detectChanges();
      });
  }

  ngOnDestroy() {
    this.destroy.next();
    this.destroy.complete();
    this.destroyAllCharts();
  }

  /** Lanza la búsqueda con todos los filtros. La dispara el botón Buscar. */
  search(filters: IDashboardFilters) {
    this.filters = filters;
    this.assistancesPage = 1;
    this.namedsPage = 1;
    this.searchTrigger.next(filters);
  }

  private applyResponse(res: IDashboardResponse) {
    this.dashboardResponse = { ...EMPTY_RESPONSE, ...res };
    this.searched = true;

    const assistances = this.dashboardResponse.assistancesPage;
    this.assistancesData = assistances.data;
    this.assistancesTotal = assistances.total;
    this.assistancesPage = assistances.page || 1;

    const nameds = this.dashboardResponse.namedsPage;
    this.namedsData = nameds.data;
    this.namedsTotal = nameds.total;
    this.namedsPage = nameds.page || 1;

    this.excelConfigAssistances = this.buildExcelConfigAssistances();
    this.excelConfigNameds = this.buildExcelConfigNameds();

    this.destroyAllCharts();
    this.updateChartFlags();
    this.cdr.detectChanges();
    this.createPieChart();
    this.createBarChart2();
    this.createBarChart();
    this.createBarChart5();
  }

  // ---------------------------------------------------------------------------
  // Tablas
  // ---------------------------------------------------------------------------

  onNamedsPageChange(event: { page: number; limit: number }) {
    this.namedsPage = event.page;
    this.namedsLimit = event.limit;
    this.namedsTrigger.next();
  }

  onAssistancesPageChange(event: { page: number; limit: number }) {
    this.assistancesPage = event.page;
    this.assistancesLimit = event.limit;
    this.assistancesTrigger.next();
  }

  // ---------------------------------------------------------------------------
  // Gráficos
  // ---------------------------------------------------------------------------

  private destroyAllCharts() {
    for (const chart of [
      this.barChart,
      this.pieChart,
      this.barChart2,
      this.barChart5,
    ]) {
      chart?.destroy();
    }
    this.barChart = null;
    this.pieChart = null;
    this.barChart2 = null;
    this.barChart5 = null;
  }

  private static hasValues(values: readonly unknown[] | undefined): boolean {
    return (values ?? []).some((v) => (Number(v) || 0) > 0);
  }

  private updateChartFlags() {
    const r = this.dashboardResponse;
    this.chartHasData = {
      bar: Dashboard.hasValues(this.getChart1DataForSelectedPeriod().data),
      pie: Dashboard.hasValues(r.chart2Data),
      positions: Dashboard.hasValues((r.chart3Data ?? []).map((i) => i.assistances)),
      turns: Dashboard.hasValues(r.chart5Data?.values),
    };
  }

  /** Mensaje de un grafico sin datos, segun el estado de la consulta. */
  chartEmptyMessage(): string {
    if (this.loading) return 'Cargando...';
    if (this.error) return 'No se pudo cargar el gráfico. Vuelve a pulsar Buscar.';
    if (!this.searched) return 'Pulsa Buscar para ver los datos.';
    return 'Sin asistencias para los filtros elegidos. Amplía el rango de fechas o pulsa Limpiar.';
  }

  private readonly barPalette = [
    'rgba(0, 61, 83, 0.85)',
    'rgba(0, 99, 135, 0.85)',
    'rgba(0, 135, 184, 0.85)',
    'rgba(6, 173, 234, 0.85)',
    'rgba(76, 193, 235, 0.85)',
    'rgba(150, 211, 233, 0.85)',
    'rgba(198, 228, 238, 0.85)',
  ];

  private readonly barBorderPalette = [
    'rgba(0, 61, 83, 1)',
    'rgba(0, 99, 135, 1)',
    'rgba(0, 135, 184, 1)',
    'rgba(6, 173, 234, 1)',
    'rgba(76, 193, 235, 1)',
    'rgba(150, 211, 233, 1)',
    'rgba(198, 228, 238, 1)',
  ];

  private horizontalBarChart(
    canvas: ElementRef<HTMLCanvasElement> | undefined,
    labels: string[],
    data: number[]
  ): Chart | null {
    const ctx = canvas?.nativeElement.getContext('2d');
    if (!ctx) {
      return null;
    }
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Asistencias',
            data,
            backgroundColor: this.barPalette,
            borderColor: this.barBorderPalette,
            borderWidth: 2,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { precision: 0, stepSize: 1 }, min: 0 } },
      },
    });
  }

  createBarChart2() {
    const chart3 = this.dashboardResponse.chart3Data ?? [];
    this.barChart2 = this.horizontalBarChart(
      this.barChartCanvas2,
      chart3.map((item) => item.position),
      chart3.map((item) => item.assistances)
    );
  }

  createBarChart5() {
    const chart5 = this.dashboardResponse.chart5Data ?? { labels: [], values: [] };
    this.barChart5 = this.horizontalBarChart(
      this.barChartCanvas5,
      [...(chart5.labels ?? [])],
      [...(chart5.values ?? [])]
    );
  }

  createBarChart() {
    const ctx = this.barChartCanvas?.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }
    const { labels, data } = this.getChart1DataForSelectedPeriod();
    this.barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Asistencias',
            data,
            backgroundColor: 'rgba(0, 135, 184, 0.8)',
            borderColor: 'rgba(0, 61, 83, 1)',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { precision: 0, stepSize: 1 }, min: 0 } },
      },
    });
  }

  getChart1DataForSelectedPeriod(): { labels: string[]; data: number[] } {
    const series = this.dashboardResponse?.chart1Data?.[this.selectedPeriod];
    // Un `series` sin `labels` dejaba el gráfico en blanco sin dar ningún aviso.
    return {
      labels: series?.labels ?? [],
      data: series?.data ?? [],
    };
  }

  onChangePeriod(period: ChartPeriod) {
    if (this.selectedPeriod === period) {
      return;
    }
    this.selectedPeriod = period;
    this.barChart?.destroy();
    this.barChart = null;
    this.updateChartFlags();
    // El lienzo puede pasar de oculto a visible: se pinta antes de medirlo.
    this.cdr.detectChanges();
    this.createBarChart();
  }

  createPieChart() {
    const ctx = this.pieChartCanvas?.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }

    const labels = [
      'Asistencias a tiempo',
      'Tolerancias',
      'Tardanzas',
      'Faltas',
      'Por completar jornada',
      'Por completar remate',
    ];
    const chart2 = this.dashboardResponse.chart2Data ?? [];
    const dataValues = labels.map((_, index) => chart2[index] || 0);

    this.pieChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [
          {
            data: dataValues,
            // Escala de severidad: a tiempo, tolerancia, tardanza, falta; y los
            // dos estados pendientes en color de marca, que son informativos.
            backgroundColor: [
              'rgba(20, 123, 102, 0.85)',
              'rgba(178, 98, 6, 0.85)',
              'rgba(198, 40, 40, 0.85)',
              'rgba(142, 27, 27, 0.85)',
              'rgba(0, 135, 184, 0.85)',
              'rgba(0, 61, 83, 0.85)',
            ],
            borderColor: [
              'rgba(20, 123, 102, 1)',
              'rgba(178, 98, 6, 1)',
              'rgba(198, 40, 40, 1)',
              'rgba(142, 27, 27, 1)',
              'rgba(0, 135, 184, 1)',
              'rgba(0, 61, 83, 1)',
            ],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#6B7280',
              padding: 20,
              usePointStyle: true,
              generateLabels: (chart: any) => {
                const dataset = chart.data.datasets[0];
                const dataArr: number[] = (dataset.data || []).map(
                  (v: number) => Number(v) || 0
                );
                const totalSum = dataArr.reduce((a, b) => a + b, 0);
                const meta = chart.getDatasetMeta(0);
                return chart.data.labels.map((label: string, i: number) => {
                  const value = dataArr[i] || 0;
                  const pct = totalSum ? (value / totalSum) * 100 : 0;
                  const style = meta.controller.getStyle(i, false);
                  return {
                    text: `${label}: ${value} (${pct.toFixed(1)}%)`,
                    fillStyle: style.backgroundColor,
                    strokeStyle: style.borderColor,
                    lineWidth: style.borderWidth,
                    hidden: !chart.getDataVisibility(i),
                    index: i,
                  };
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = Number(context.parsed) || 0;
                const dataset = context.chart.data.datasets[0];
                const totalSum =
                  (dataset.data as number[]).reduce(
                    (a, b) => a + (Number(b) || 0),
                    0
                  ) || 0;
                const pct = totalSum ? (value / totalSum) * 100 : 0;
                const label = context.label || '';
                return `${label}: ${value} (${pct.toFixed(1)}%)`;
              },
            },
          },
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Excel
  // ---------------------------------------------------------------------------

  /** `"3 / 8 -S"` -> `"3/8"`, que es lo que se espera en la hoja. */
  private toMarkingsText(markings: string | null | undefined): string {
    if (!markings || String(markings).includes('undefined')) {
      return '-';
    }
    const [completed, rest] = String(markings).split('/');
    if (rest === undefined) {
      return '-';
    }
    return `${completed.trim()}/${rest.replace('-S', '').trim()}`;
  }

  private buildExcelConfigAssistances(): ExcelDownloadConfig {
    return {
      title: 'Reporte de Asistencias',
      filters: this.describeFilters({
        'Total Nombradas': this.dashboardResponse.totalNameds,
        'Total Empleados': this.dashboardResponse.totalEmployees,
        'Total Asistencias': this.dashboardResponse.totalAssistances,
        'Total Capacitaciones': this.dashboardResponse.totalTalks,
        'Total Personas Nombradas': this.dashboardResponse.totalPersonNameds,
        'Total Faltas': this.dashboardResponse.totalNoAssistances,
      }),
      data: this.assistancesData,
      headers: [
        { header: 'Fecha de trabajo', value: 'workerDate' },
        { header: 'Turno', value: 'turn' },
        { header: 'Nombrada', value: 'named' },
        { header: 'Navío', value: 'ship' },
        { header: 'Muelle', value: 'muelle' },
        { header: 'Empleado', value: 'employee' },
        { header: 'Posición', value: 'position' },
        { header: 'Marcaciones', value: 'markingsText' },
      ],
      fileName: 'Reporte_Asistencias',
    };
  }

  private buildExcelConfigNameds(): ExcelDownloadConfig {
    return {
      title: 'Detalle de Nombradas',
      filters: this.describeFilters({ 'Total Registros': this.namedsTotal }),
      data: this.namedsData,
      headers: [
        { header: 'Fecha', value: 'date' },
        { header: 'Navío', value: 'ship' },
        { header: 'Muelle', value: 'location' },
        { header: 'Número', value: 'number' },
        { header: 'Turno', value: 'turn' },
        { header: 'Personal', value: 'staffCount' },
        { header: 'Asistentes', value: 'assistantsCount' },
      ],
      fileName: 'Detalle_Nombradas',
    };
  }

  /**
   * Cabecera del Excel con los filtros de la consulta. Antes iba un `Período`
   * vacío: la hoja descargada no decía a qué rango ni a qué filtros
   * correspondía.
   */
  private describeFilters(totals: Record<string, any>): Record<string, any> {
    const applied: Record<string, any> = {
      Período: this.filters.startDate
        ? `${this.filters.startDate} a ${this.filters.endDate}`
        : '',
    };
    if (this.filters.namedId) applied['Nombrada'] = this.filters.namedId;
    if (this.filters.ship) applied['Navío'] = this.filters.ship;
    if (this.filters.turn) applied['Turno'] = this.filters.turn;
    if (this.filters.position) applied['Cargo'] = this.filters.position;
    return { ...applied, ...totals };
  }

  async onExcelDownload(config: ExcelDownloadConfig) {
    try {
      if (config.title === 'Reporte de Asistencias') {
        // La hoja lleva el resultado completo de la consulta, no la página que
        // se está viendo.
        const res = await lastValueFrom(
          this.dashboardService.getDashboardAssistances({
            ...this.filters,
            limit: exportLimit(this.assistancesTotal),
            page: 1,
          })
        );
        await this.excelService.downloadExcel({
          ...config,
          data: res.data.map((row) => ({
            ...row,
            markingsText: this.toMarkingsText(row.markings),
          })),
        });
        return;
      }

      const res = await lastValueFrom(
        this.dashboardService.getDashboardNameds({
          ...this.filters,
          limit: exportLimit(this.namedsTotal),
          page: 1,
        })
      );
      await this.excelService.downloadExcel({ ...config, data: res.data });
    } catch (error) {
      // Un fallo de la API ya lo avisa el interceptor; uno al armar la hoja
      // solo quedaba en la consola y el boton parecia no hacer nada.
      if (!(error instanceof HttpErrorResponse)) {
        this.notificationService.show('No se pudo generar el Excel', 'error');
      }
    } finally {
      this.loaderService.hide();
    }
  }
}
