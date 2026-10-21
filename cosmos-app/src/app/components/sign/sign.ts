import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EmployeeRegisterService } from '../../modules/employee-register/services/employee-register.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-sign',
  imports: [],
  templateUrl: './sign.html',
  styleUrl: './sign.scss'
})
export default class Sign {

  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private employeeRegisterService = inject(EmployeeRegisterService)
  private notificationService = inject(NotificationService)

  employeeId = signal<string>(this.route.snapshot.params['id'])

  // Obtenemos una referencia al elemento <canvas> del template
  @ViewChild('signatureCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;


  private context!: CanvasRenderingContext2D;
  private isDrawing = false;
  /** Hay al menos un trazo. Sin el se guardaba una firma en blanco. */
  private hasStroke = false;
  /** Evita el doble envio al pulsar dos veces "Guardar". */
  readonly saving = signal(false);
  private canvas!: HTMLCanvasElement;

  // Guardamos las referencias a los manejadores de eventos para poder eliminarlos luego
  private boundStartDrawing!: (event: MouseEvent | TouchEvent) => void;
  private boundDraw!: (event: MouseEvent | TouchEvent) => void;
  private boundStopDrawing!: () => void;


  ngAfterViewInit(): void {
    // Usamos ngAfterViewInit para asegurarnos de que el <canvas> ya está disponible en el DOM
    this.canvas = this.canvasRef.nativeElement;
    const ctx = this.canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No se pudo obtener el contexto 2D del canvas.');
    }
    this.context = ctx;

    // Configuramos el estilo del trazo
    this.context.strokeStyle = '#000000'; // Color del trazo: negro
    this.context.lineWidth = 2;          // Ancho del trazo: 2px
    this.context.lineCap = 'round';      // Extremos de la línea redondeados

    // Creamos las funciones "bound" para mantener el contexto 'this'
    this.boundStartDrawing = this.startDrawing.bind(this);
    this.boundDraw = this.draw.bind(this);
    this.boundStopDrawing = this.stopDrawing.bind(this);

    // Agregamos los event listeners para el mouse
    this.canvas.addEventListener('mousedown', this.boundStartDrawing);
    this.canvas.addEventListener('mousemove', this.boundDraw);
    this.canvas.addEventListener('mouseup', this.boundStopDrawing);
    this.canvas.addEventListener('mouseleave', this.boundStopDrawing);

    // Agregamos los event listeners para dispositivos táctiles
    this.canvas.addEventListener('touchstart', this.boundStartDrawing);
    this.canvas.addEventListener('touchmove', this.boundDraw);
    this.canvas.addEventListener('touchend', this.boundStopDrawing);
  }

  ngOnDestroy(): void {
    // Es una buena práctica eliminar los event listeners para prevenir memory leaks
    this.canvas.removeEventListener('mousedown', this.boundStartDrawing);
    this.canvas.removeEventListener('mousemove', this.boundDraw);
    this.canvas.removeEventListener('mouseup', this.boundStopDrawing);
    this.canvas.removeEventListener('mouseleave', this.boundStopDrawing);

    this.canvas.removeEventListener('touchstart', this.boundStartDrawing);
    this.canvas.removeEventListener('touchmove', this.boundDraw);
    this.canvas.removeEventListener('touchend', this.boundStopDrawing);
  }

  private startDrawing(event: MouseEvent | TouchEvent): void {
    event.preventDefault(); // Previene el comportamiento por defecto (como el scroll en táctil)
    this.isDrawing = true;
    const coords = this.getCoordinates(event);
    this.context.beginPath();
    this.context.moveTo(coords.x, coords.y);
  }

  private draw(event: MouseEvent | TouchEvent): void {
    if (!this.isDrawing) return;
    event.preventDefault();
    const coords = this.getCoordinates(event);
    this.context.lineTo(coords.x, coords.y);
    this.context.stroke();
    this.hasStroke = true;
  }

  private stopDrawing(): void {
    this.isDrawing = false;
    this.context.closePath();
  }

  private getCoordinates(event: MouseEvent | TouchEvent): { x: number; y: number } {
    const canvasRect = this.canvas.getBoundingClientRect();
    let clientX, clientY;

    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      // Es un TouchEvent
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }
    // El lienzo mide 500x200 pero en un movil se pinta encogido al ancho de la
    // pantalla (`max-width: 100%`). Sin escalar, el trazo salia desplazado
    // respecto al dedo, cada vez mas cuanto mas a la derecha.
    const scaleX = canvasRect.width ? this.canvas.width / canvasRect.width : 1;
    const scaleY = canvasRect.height ? this.canvas.height / canvasRect.height : 1;
    return {
      x: (clientX - canvasRect.left) * scaleX,
      y: (clientY - canvasRect.top) * scaleY
    };
  }

  /**
   * Limpia el contenido del canvas.
   */
  public clearCanvas(): void {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasStroke = false;
  }

  /**
   * Guarda la firma como una imagen en formato data URL y la emite.
   */

  convertToFile(dataUrl: string): File {
    const byteString = atob(dataUrl.split(',')[1]);
    const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    return new File([blob], 'signature.png', { type: mimeString });
  }

  public saveSignature(): void {
    if (this.saving()) {
      return;
    }
    if (!this.hasStroke) {
      this.notificationService.show('Dibuje la firma antes de guardarla', 'error');
      return;
    }
    // toDataURL() convierte el contenido del canvas a un string base64
    const dataUrl = this.canvas.toDataURL('image/png');

    this.saving.set(true);
    this.employeeRegisterService.saveSignature(this.employeeId(), this.convertToFile(dataUrl)).subscribe({
      next: (response) => {
        this.notificationService.show('Firma guardada correctamente', 'success');
        this.router.navigate([`/registro/${this.employeeId()}`]);
      },
      error: (error) => {
        this.saving.set(false);
        this.notificationService.show('Error al guardar la firma', 'error');
      }
    });
  }

}   
