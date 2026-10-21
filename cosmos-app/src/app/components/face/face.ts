import { Component, ElementRef, ViewChild, OnDestroy, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { NotificationService } from '../../services/notification.service';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EmployeeRegisterService } from '../../modules/employee-register/services/employee-register.service';
import * as faceapi from 'face-api.js';
import { firstValueFrom } from 'rxjs';
import { loadFaceModels } from '../../services/face-api-loader';
import {
  CameraFacing,
  DEFAULT_CAMERA_FACING,
  describeCameraError,
  hasSeveralCameras,
  openFacingCamera,
  otherFacing,
  stopStream,
} from '../../services/camera-stream';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-face',
  standalone: true,
  imports: [CommonModule, Icon],
  templateUrl: './face.html',
  styleUrl: './face.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Face implements OnDestroy {
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement?: ElementRef<HTMLCanvasElement>;

  private notificationService = inject(NotificationService);
  private route = inject(ActivatedRoute)
  private employeeRegisterService = inject(EmployeeRegisterService);
  private router = inject(Router);
  id = this.route.snapshot.params['id'];
  private videoStream: MediaStream | null = null;
  private cameraStarting: Promise<void> | null = null;
  private destroyed = false;
  private detectionInterval: any;
  /**
   * Hay una deteccion o un guardado en curso.
   *
   * El intervalo dispara cada segundo sin esperar a la vuelta anterior, y entre
   * la pausa de 1,5 s y la peticion un rostro valido pasaba varias veces: se
   * enviaba el registro dos o tres veces y se navegaba otras tantas.
   */
  private busy = false;
  private readonly MATCH_THRESHOLD = 0.42;
  private readonly MIN_FACE_SIZE = 150;
  private readonly MAX_FACE_SIZE = 400;
  private readonly MIN_CONFIDENCE = 0.68;
  private readonly LANDMARKS_QUALITY_THRESHOLD = 0.62;

  loadingMessage = signal<string>('Iniciando...');
  /** Camara abierta; se empieza por la trasera. */
  facing = signal<CameraFacing>(DEFAULT_CAMERA_FACING);
  /** Solo se ofrece cambiar si el equipo tiene mas de una camara. */
  canSwitchCamera = signal(false);
  /** Se esta guardando el rostro: no se cambia de camara a medias. */
  saving = signal(false);
  process = signal<number>(0);
  faceValidationStatus = signal<{
    isValid: boolean;
    distance: 'correct' | 'too_close' | 'too_far' | 'unknown';
    precision: 'optimal' | 'good' | 'poor' | 'unknown';
    message: string;
  }>({
    isValid: false,
    distance: 'unknown' as const,
    precision: 'unknown' as const,
    message: 'Analizando rostro...'
  });

  async ngOnInit() {
    // Si los modelos no cargan no se abre la camara: el bucle de deteccion
    // llamaria a `detectAllFaces` sin redes y reventaria una vez por segundo,
    // dejando al usuario mirando una camara que nunca reconoce nada.
    if (!(await this.loadModels()) || this.destroyed) {
      return;
    }
    await this.startCamera();
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.stopDetectionLoop();
    this.stopCamera();
  }

  /**
   * Pasa de la trasera a la delantera y al reves.
   *
   * El stream anterior se cierra antes de abrir el nuevo: muchos Android no
   * abren dos camaras a la vez y el segundo `getUserMedia` fallaba con
   * `NotReadableError`.
   */
  async switchCamera() {
    if (this.cameraStarting || this.saving() || this.destroyed) return;
    this.stopDetectionLoop();
    this.stopCamera();
    this.cleanCanvas();
    this.process.set(0);
    this.facing.set(otherFacing(this.facing()));
    this.loadingMessage.set('Cambiando de cámara...');
    await this.startCamera();
  }

  private async loadModels(): Promise<boolean> {
    this.loadingMessage.set('Cargando el reconocimiento facial...');
    try {
      await loadFaceModels();
      this.loadingMessage.set('Iniciando camara...');
      return true;
    } catch (error) {
      // El fallo se traga en la interfaz, pero tiene que quedar en logcat: sin
      // esto, un problema al servir los pesos solo se ve como una pantalla que
      // no arranca, sin ninguna pista de por que.
      console.error('[face] no se pudieron cargar los modelos', error);
      this.loadingMessage.set('No se pudo cargar el reconocimiento facial.');
      this.notificationService.show('Error al cargar los modelos de IA.', 'error');
      this.router.navigate([`/registro/${this.id}`]);
      return false;
    }
  }

  private startCamera(): Promise<void> {
    // Mientras `getUserMedia` espera, `videoStream` sigue en null: sin guardar
    // la apertura en curso, dos llamadas seguidas abrian dos streams.
    if (this.videoStream) return Promise.resolve();
    this.cameraStarting ??= this.openCamera().finally(() => (this.cameraStarting = null));
    return this.cameraStarting;
  }

  private async openCamera() {
    try {
      const stream = await openFacingCamera(this.facing(), () => !this.destroyed);
      if (!stream) return;
      this.videoStream = stream;
      if (this.videoElement) {
        this.videoElement.nativeElement.srcObject = this.videoStream;
      }
      this.startDetectionLoop()
      this.canSwitchCamera.set(await hasSeveralCameras());
    } catch (error) {
      console.error('[face] no se pudo abrir la camara', error);
      const info = describeCameraError(error);
      this.loadingMessage.set(`${info.title} ${info.hint}`);
      this.notificationService.show(info.title, 'error');
      // Si la que falla es una de las dos, la otra puede estar libre.
      if (info.kind !== 'denied') this.canSwitchCamera.set(await hasSeveralCameras());
    }
  }

  private stopCamera() {
    stopStream(this.videoStream);
    this.videoStream = null;
  }

  cleanCanvas() {
    if (this.canvasElement) {
      const context = this.canvasElement.nativeElement.getContext('2d');
      context?.clearRect(0, 0, this.canvasElement.nativeElement.width, this.canvasElement.nativeElement.height);
    }
  }

  private startDetectionLoop() {
    if (this.detectionInterval) return;
    this.detectionInterval = setInterval(() => this.detectAndRecognize(), 1000);
  }

  private stopDetectionLoop() {
    clearInterval(this.detectionInterval);
    this.detectionInterval = null;
  }

  private async detectAndRecognize() {
    if (!this.videoElement || !this.canvasElement || this.busy || this.destroyed) {
      return;
    }
    this.busy = true;
    try {
      await this.detectOnce();
    } catch (error) {
      console.error('[face] fallo en la deteccion', error);
    } finally {
      this.busy = false;
    }
  }

  private async detectOnce() {
    if (!this.videoElement || !this.canvasElement) {
      return;
    }
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const displaySize = { width: video.clientWidth, height: video.clientHeight };
    faceapi.matchDimensions(canvas, displaySize);

    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
      .withFaceLandmarks(true)
      .withFaceDescriptors();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    const context = canvas.getContext('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);

    if (resizedDetections.length === 0) {
      this.handleNoFaceDetected();
    } else if (resizedDetections.length === 1) {
      const validation = this.validateFaceQuality(resizedDetections[0], displaySize);
      this.faceValidationStatus.set(validation);

      if (validation.isValid) {
        await this.handleValidFaceDetected(resizedDetections[0]);
      } else {
        this.loadingMessage.set(validation.message);
      }
    } else {
      this.loadingMessage.set('Se detectó más de un rostro. Por favor, asegúrese de que solo su cara esté visible.');
    }
  }

  private validateFaceQuality(detection: any, displaySize: { width: number; height: number }) {
    let validation = {
      isValid: false,
      distance: 'unknown' as 'correct' | 'too_close' | 'too_far' | 'unknown',
      precision: 'unknown' as 'optimal' | 'good' | 'poor' | 'unknown',
      message: 'Analizando calidad del rostro...'
    };

    try {
      const faceBox = detection.detection.box;
      const faceSize = Math.max(faceBox.width, faceBox.height);
      const faceArea = faceBox.width * faceBox.height;
      const displayArea = displaySize.width * displaySize.height;
      const faceAreaPercentage = (faceArea / displayArea) * 100;

      if (faceSize >= this.MIN_FACE_SIZE && faceSize <= this.MAX_FACE_SIZE) {
        validation.distance = 'correct';
      } else if (faceSize < this.MIN_FACE_SIZE) {
        validation.distance = 'too_far';
        validation.message = 'Acérquese más a la cámara';
      } else {
        validation.distance = 'too_close';
        validation.message = 'Aléjese un poco de la cámara';
      }

      const confidence = detection.detection.score || 0;
      const landmarks = detection.landmarks;
      const descriptor = detection.descriptor;

      let landmarksQuality = 1.0;
      if (landmarks && landmarks.positions) {
        const positions = landmarks.positions;
        const totalLandmarks = positions.length;
        let validLandmarks = 0;

        for (let i = 0; i < totalLandmarks; i++) {
          const pos = positions[i];
          if (pos && pos.x !== undefined && pos.y !== undefined) {
            validLandmarks++;
          }
        }

        landmarksQuality = validLandmarks / totalLandmarks;
      }

      let descriptorQuality = 0;
      if (descriptor) {
        const descriptorValidation = this.validateFaceDescriptor(descriptor);
        descriptorQuality = descriptorValidation.quality;
      }

      const overallPrecision = (confidence * 0.4 + landmarksQuality * 0.3 + descriptorQuality * 0.3);

      if (overallPrecision >= 0.72 && confidence >= this.MIN_CONFIDENCE && landmarksQuality >= this.LANDMARKS_QUALITY_THRESHOLD && descriptorQuality >= this.MATCH_THRESHOLD) {
        validation.precision = 'optimal';
      } else if (overallPrecision >= 0.62 && confidence >= 0.62 && landmarksQuality >= 0.52 && descriptorQuality >= 0.22) {
        validation.precision = 'good';
      } else {
        validation.precision = 'poor';
        if (confidence < this.MIN_CONFIDENCE) {
          validation.message = 'Confianza de detección baja. Mejore la iluminación.';
        } else if (landmarksQuality < this.LANDMARKS_QUALITY_THRESHOLD) {
          validation.message = 'Landmarks de baja calidad. Mantenga el rostro estable.';
        } else if (descriptorQuality < this.MATCH_THRESHOLD) {
          validation.message = 'Calidad del descriptor insuficiente. Ajuste la posición.';
        } else {
          validation.message = 'Mejore la iluminación y mantenga el rostro estable';
        }
      }

      if (validation.distance === 'correct' && validation.precision === 'optimal') {
        validation.isValid = true;
        validation.message = 'Rostro detectado correctamente. Puede proceder con el registro.';
      } else if (validation.distance === 'correct' && validation.precision === 'good') {
        validation.isValid = true;
        validation.message = 'Rostro detectado. Puede proceder con el registro.';
      } else {
        validation.isValid = false;
        if (validation.distance !== 'correct') {
          validation.message = `Distancia: ${validation.message}`;
        } else if (validation.precision === 'poor') {
          validation.message = 'Mejore la iluminación y mantenga el rostro estable';
        }
      }

    } catch (error) {
      validation.message = 'Error al analizar el rostro';
    }

    return validation;
  }

  private handleNoFaceDetected() {
    this.loadingMessage.set('No se detectó ningún rostro');
    this.faceValidationStatus.set({
      isValid: false,
      distance: 'unknown',
      precision: 'unknown',
      message: 'No se detectó ningún rostro'
    });

    this.process.set(this.process() + 1);
    if (this.process() > 50) {
      this.stopDetectionLoop();
      this.notificationService.show('No se detectó ningún rostro. Asegúrese de que su cara esté bien iluminada y centrada.', 'error');
      this.router.navigate([`/registro/${this.id}`]);
    }
  }

  private async handleValidFaceDetected(detection: any) {
    this.process.set(0);
    this.loadingMessage.set(this.faceValidationStatus().message);

    this.drawDetectionBox(detection);

    if (this.faceValidationStatus().isValid) {
      await new Promise(resolve => setTimeout(resolve, 1500));

      try {
        const descriptor = detection.descriptor;
        if (descriptor && descriptor.length > 0) {
          this.loadingMessage.set('Guardando rostro...');
          const descriptorArray = Array.from(descriptor);
          // Se para el bucle antes de enviar: el registro se hace una sola vez.
          this.stopDetectionLoop();
          this.saving.set(true);
          await firstValueFrom(this.employeeRegisterService.registerFace(this.id, descriptorArray as number[]));
          this.notificationService.show('Rostro registrado con éxito.', 'success');
          this.router.navigate([`/registro/${this.id}`]);
        } else {
          this.notificationService.show('No se pudo obtener el descriptor facial.', 'error');
        }
      } catch (error) {
        this.saving.set(false);
        // 409: el rostro ya se reconoce como el de otra ficha. El aviso con el
        // nombre lo pinta el interceptor; reanudar la deteccion volveria a
        // capturar la misma cara y a repetir el aviso cada pocos segundos.
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.loadingMessage.set('Este rostro ya está registrado para otra persona. No se ha guardado.');
          return;
        }
        this.notificationService.show('Error al registrar el rostro.', 'error');
        // Se reanuda la deteccion para poder reintentar sin salir de la pantalla.
        if (!this.destroyed) {
          this.loadingMessage.set('No se pudo guardar. Mire a la cámara para reintentar.');
          this.startDetectionLoop();
        }
      }
    }
  }

  private validateFaceDescriptor(descriptor: Float32Array) {
    if (!descriptor || descriptor.length === 0) {
      return {
        isValid: false,
        quality: 0,
        message: 'Descriptor facial no válido'
      };
    }

    try {
      const mean = descriptor.reduce((sum, val) => sum + val, 0) / descriptor.length;
      const variance = descriptor.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / descriptor.length;
      const standardDeviation = Math.sqrt(variance);

      const quality = Math.min(standardDeviation / 0.5, 1.0);
      const isValid = quality >= this.MATCH_THRESHOLD;

      return {
        isValid,
        quality,
        message: isValid
          ? `Calidad del descriptor: ${(quality * 100).toFixed(1)}%`
          : `Calidad insuficiente: ${(quality * 100).toFixed(1)}% (mínimo ${(this.MATCH_THRESHOLD * 100).toFixed(1)}%)`
      };
    } catch (error) {
      return {
        isValid: false,
        quality: 0,
        message: 'Error al analizar descriptor facial'
      };
    }
  }

  private drawDetectionBox(detection: any) {
    if (!this.canvasElement) return;

    const canvas = this.canvasElement.nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return;

    const box = detection.detection.box;
    const validation = this.faceValidationStatus();

    let color = '#ff0000';
    if (validation.isValid) {
      color = validation.precision === 'optimal' ? '#00ff00' : '#ffff00';
    }

    context.strokeStyle = color;
    context.lineWidth = 2;
    context.strokeRect(box.x, box.y, box.width, box.height);

    context.fillStyle = color;
    context.font = '16px Arial';
    context.fillText(validation.message, box.x, box.y - 10);
  }
}

