import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeneratorService } from './services/generator.service';
import { EmployeePicker } from '../../components/employee-picker/employee-picker';
import { IEmployeeResponse } from '../../interfaces/employee.interface';
import { NotificationService } from '../../services/notification.service';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-generator',
  imports: [CommonModule, FormsModule, EmployeePicker],
  templateUrl: './generator.html',
  styleUrl: './generator.scss'
})
export default class Generator {
  private generatorService = inject(GeneratorService);
  private notificationService = inject(NotificationService);

  employees = signal<IEmployeeResponse[]>([]);
  selectedEmployeeId = signal<string>('');
  typeOptions = ['qrcode', 'code128'] as const;
  selectedType = signal<typeof this.typeOptions[number] | ''>('');

  imageUrl = signal<string>('');
  loading = signal<boolean>(false);

  canGenerate = computed(() =>
    !!this.selectedEmployeeId() && !!this.selectedType() && !this.loading()
  );

  ngOnInit() {
    this.getEmployees();
  }

  getEmployees() {
    this.generatorService.getEmployees().subscribe({
      next: (employees) => this.employees.set(employees),
      error: () =>
        this.notificationService.show(
          'No se pudo obtener la lista de empleados',
          'error'
        ),
    });
  }

  generate() {
    if (!this.canGenerate()) return;
    this.loading.set(true);
    this.generatorService
      .generateQR(this.selectedEmployeeId(), this.selectedType() as string)
      // `finalize` y no `complete`: un observable que termina en error nunca
      // completa, asi que con `complete` el indicador se quedaba encendido tras
      // un fallo y el boton deshabilitado para siempre. Recargar la pagina era
      // la unica forma de reintentar.
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ url }) => {
          this.imageUrl.set(url);
          this.notificationService.show('Código generado correctamente', 'success');
        },
        error: () => {
          this.notificationService.show('No se pudo generar el código', 'error');
        },
      });
  }

  copyLink() {
    const url = this.imageUrl();
    if (!url) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => this.notificationService.show('Enlace copiado al portapapeles'))
        .catch(() => this.notificationService.show('No se pudo copiar el enlace', 'error'));
    }
  }

  downloadImage() {
    const url = this.imageUrl();
    if (!url) return;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.download = 'codigo.png';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
}
