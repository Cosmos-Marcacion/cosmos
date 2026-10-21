import { Component, ElementRef, ViewChild, OnDestroy, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';
import { EmployeeRegisterService } from '../../modules/employee-register/services/employee-register.service';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { NavigationStateService } from '../../services/navigation-state.service';
import { FeedbackSoundService } from '../../services/feedback-sound.service';
import * as faceapi from 'face-api.js';
import { loadFaceModels } from '../../services/face-api-loader';
import {
  CameraErrorInfo,
  CameraFacing,
  DEFAULT_CAMERA_FACING,
  describeCameraError,
  hasSeveralCameras,
  openFacingCamera,
  otherFacing,
  stopStream,
} from '../../services/camera-stream';
import { Icon } from '../icon/icon';
import { identificationParams } from '../../services/mark-identification';

@Component({
  selector: 'app-face',
  standalone: true,
  imports: [CommonModule, Icon],
  templateUrl: './face-mark.html',
  styleUrl: './face-mark.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class FaceMark implements OnDestroy {
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement?: ElementRef<HTMLCanvasElement>;

  private notificationService = inject(NotificationService);
  private employeeRegisterService = inject(EmployeeRegisterService);
  private router = inject(Router);
  private navigationStateService = inject(NavigationStateService);
  private sound = inject(FeedbackSoundService);
  private destroy$ = new Subject<void>();

  loadingMessage = signal<string>('Un momento…');
  feedbackMessage = signal<string>('Mira a la cámara para marcar');
  recognizedUserName = signal<string | null>(null);

  /**
   * En que momento de la captura esta la pantalla.
   *
   * `buscando` mientras no hay una cara valida, `sujetando` durante el segundo y
   * medio en que hay que quedarse quieto, `capturado` en el destello, y
   * `enviando` mientras el servidor responde. La pantalla no tenia ninguno: se
   * pasaba de "ajustando posicion" a otra pantalla sin que nada dijera que la
   * foto ya estaba hecha, y la gente se movia justo en ese momento.
   */
  captureState = signal<'buscando' | 'sujetando' | 'capturado' | 'enviando'>('buscando');

  faceValidationStatus = signal<{
    isValid: boolean;
    distance: 'correct' | 'too_close' | 'too_far' | 'unknown';
    precision: 'optimal' | 'good' | 'poor' | 'unknown';
    message: string;
  }>({
    isValid: false,
    distance: 'unknown' as const,
    precision: 'unknown' as const,
    message: 'Buscando tu cara…'
  });

  /** Fallo de camara con su explicacion; `null` mientras no lo hay. */
  cameraError = signal<CameraErrorInfo | null>(null);

  /** Camara abierta; se empieza por la trasera. */
  facing = signal<CameraFacing>(DEFAULT_CAMERA_FACING);
  /** Solo se ofrece cambiar si el equipo tiene mas de una camara. */
  canSwitchCamera = signal(false);

  private videoStream: MediaStream | null = null;
  private cameraStarting: Promise<void> | null = null;
  private destroyed = false;
  private detectionInterval: any;
  private readonly MATCH_THRESHOLD = 0.42;
  private readonly MIN_FACE_SIZE = 150;
  private readonly MAX_FACE_SIZE = 400;
  private readonly MIN_CONFIDENCE = 0.68;
  private readonly LANDMARKS_QUALITY_THRESHOLD = 0.62;
  private isProcessingCheckIn = false;

  async ngOnInit() {
    this.loadingMessage.set('Preparando el reconocimiento…');
    // Sin modelos no se arranca ni la camara ni el bucle: `detectAllFaces`
    // sin redes cargadas lanza una excepcion por cada vuelta del intervalo.
    if (!(await this.loadModels()) || this.destroyed) {
      return;
    }
    await this.startCamera();
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.stopDetectionLoop();
    this.stopCamera();
  }

  /** Reintento tras un fallo de camara (por ejemplo, ocupada por otra app). */
  retryCamera() {
    this.cameraError.set(null);
    void this.startCamera();
  }

  /**
   * Pasa de la trasera a la delantera y al reves.
   *
   * El stream anterior se cierra antes de abrir el nuevo: muchos Android no
   * abren dos camaras a la vez y el segundo `getUserMedia` fallaba con
   * `NotReadableError`. Mientras se captura o se envia no se cambia, para no
   * cortar una marcacion a medias.
   */
  async switchCamera() {
    if (this.cameraStarting || this.isProcessingCheckIn || this.destroyed) return;
    this.stopDetectionLoop();
    this.stopCamera();
    this.clearCanvas();
    this.cameraError.set(null);
    this.facing.set(otherFacing(this.facing()));
    this.feedbackMessage.set('Mira a la cámara para marcar');
    await this.startCamera();
  }

  private async loadModels(): Promise<boolean> {
    try {
      await loadFaceModels();
      return true;
    } catch (error) {
      // Igual que en el registro: el mensaje de pantalla no dice nada util para
      // diagnosticar, asi que el error real se deja en logcat.
      console.error('[face-mark] no se pudieron cargar los modelos', error);
      this.loadingMessage.set('No se pudo preparar el reconocimiento. Cierra y vuelve a entrar.');
      return false;
    }
  }

  private startCamera(): Promise<void> {
    // La guarda comprueba tambien la apertura en curso: `videoStream` sigue en
    // null mientras `getUserMedia` espera, y dos llamadas seguidas abrian dos
    // streams.
    if (this.videoStream) return Promise.resolve();
    this.cameraStarting ??= this.openCamera().finally(() => (this.cameraStarting = null));
    return this.cameraStarting;
  }

  private async openCamera() {
    try {
      this.loadingMessage.set('Encendiendo la cámara…');
      const stream = await openFacingCamera(this.facing(), () => !this.destroyed);
      if (!stream) return;
      this.videoStream = stream;
      if (this.videoElement) {
        this.videoElement.nativeElement.srcObject = this.videoStream;
      }
      this.loadingMessage.set('');
      this.startDetectionLoop();
      this.canSwitchCamera.set(await hasSeveralCameras());
    } catch (error) {
      console.error('[face-mark] no se pudo abrir la camara', error);
      const info = describeCameraError(error);
      this.cameraError.set(info);
      this.feedbackMessage.set(info.hint);
      this.loadingMessage.set(info.title);
      // Si la que falla es una de las dos, la otra puede estar libre.
      if (info.kind !== 'denied') this.canSwitchCamera.set(await hasSeveralCameras());
    }
  }

  private stopCamera() {
    stopStream(this.videoStream);
    this.videoStream = null;
  }

  private clearCanvas() {
    const canvas = this.canvasElement?.nativeElement;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
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
    if (!this.videoElement || !this.canvasElement || this.isProcessingCheckIn) {
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
        this.feedbackMessage.set(validation.message);
      }
    } else {
      this.feedbackMessage.set('Veo más de una cara. Que solo salga la tuya');
    }
  }

  private validateFaceQuality(detection: any, displaySize: { width: number; height: number }) {
    let validation = {
      isValid: false,
      distance: 'unknown' as 'correct' | 'too_close' | 'too_far' | 'unknown',
      precision: 'unknown' as 'optimal' | 'good' | 'poor' | 'unknown',
      message: 'Buscando tu cara…'
    };

    try {
      const faceBox = detection.detection.box;
      const faceSize = Math.max(faceBox.width, faceBox.height);

      if (faceSize >= this.MIN_FACE_SIZE && faceSize <= this.MAX_FACE_SIZE) {
        validation.distance = 'correct';
      } else if (faceSize < this.MIN_FACE_SIZE) {
        validation.distance = 'too_far';
        validation.message = 'Acércate un poco';
      } else {
        validation.distance = 'too_close';
        validation.message = 'Sepárate un poco';
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
          validation.message = 'Hay poca luz. Ponte de cara a la luz';
        } else if (landmarksQuality < this.LANDMARKS_QUALITY_THRESHOLD) {
          validation.message = 'Quédate quieto un momento';
        } else if (descriptorQuality < this.MATCH_THRESHOLD) {
          validation.message = 'Centra la cara dentro del óvalo';
        } else {
          validation.message = 'Busca más luz y quédate quieto';
        }
      }

      if (validation.distance === 'correct' && validation.precision === 'optimal') {
        validation.isValid = true;
        validation.message = 'Perfecto, no te muevas';
      } else if (validation.distance === 'correct' && validation.precision === 'good') {
        validation.isValid = true;
        validation.message = 'Ahí estás, no te muevas';
      } else {
        validation.isValid = false;
        if (validation.distance !== 'correct') {
          // La distancia ya viene redactada como una instruccion —"Acércate un
          // poco"—, asi que se deja tal cual. Anteponerle "Distancia:" la
          // convertia en una etiqueta de diagnostico.
        } else if (validation.precision === 'poor') {
          validation.message = 'Busca más luz y quédate quieto';
        }
      }

    } catch (error) {
      validation.message = 'No consigo leer tu cara. Inténtalo otra vez';
    }

    return validation;
  }

  private handleNoFaceDetected() {
    this.feedbackMessage.set('No te veo. Ponte frente a la cámara');
    this.faceValidationStatus.set({
      isValid: false,
      distance: 'unknown',
      precision: 'unknown',
      message: 'No te veo. Ponte frente a la cámara'
    });
  }

  private async handleValidFaceDetected(detection: any) {
    if (this.isProcessingCheckIn) return;

    this.feedbackMessage.set(this.faceValidationStatus().message);
    this.drawDetectionBox(detection);

    if (this.faceValidationStatus().isValid) {
      this.isProcessingCheckIn = true;
      // El segundo y medio de espera ya existia; lo que faltaba era contarlo.
      this.captureState.set('sujetando');
      await new Promise(resolve => setTimeout(resolve, 1500));
      this.captureState.set('capturado');
      this.sound.capture();

      try {
        const descriptor = detection.descriptor;
        if (descriptor && descriptor.length > 0) {
          this.captureState.set('enviando');
          this.feedbackMessage.set('Te estoy reconociendo…');
          const descriptorArray = Array.from(descriptor);

          this.employeeRegisterService.checkIn(descriptorArray as number[])
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (response: any) => {
                // Aqui solo se ha reconocido a la persona: la marcacion se hace en
                // la pantalla siguiente, al elegir el punto. Decir "registrada"
                // ya era falso si ese paso fallaba.
                this.notificationService.show('Rostro reconocido', 'success');
                this.navigationStateService.markInternalNavigation();
                const employeeId = response?.user?.id;
                if (!employeeId) {
                  this.notificationService.show('No te hemos reconocido. Inténtalo otra vez', 'error');
                  this.captureState.set('buscando');
                  this.isProcessingCheckIn = false;
                  return;
                }
                this.router.navigate([`/validacion-registro/${employeeId}`], {
                  queryParams: identificationParams({ method: 'rostro', score: response?.distance }),
                });
              },
              error: (error: any) => {
                this.notificationService.show('No te hemos reconocido. Inténtalo otra vez', 'error');
                this.feedbackMessage.set('No te he reconocido. Prueba otra vez');
                this.captureState.set('buscando');
                this.isProcessingCheckIn = false;
              }
            });
        } else {
          this.notificationService.show('No se pudo leer tu cara. Inténtalo otra vez', 'error');
          this.captureState.set('buscando');
          this.isProcessingCheckIn = false;
        }
      } catch (error) {
        this.notificationService.show('No se pudo registrar la marcación', 'error');
        this.captureState.set('buscando');
        this.isProcessingCheckIn = false;
      }
    }
  }

  private validateFaceDescriptor(descriptor: Float32Array) {
    if (!descriptor || descriptor.length === 0) {
      return {
        isValid: false,
        quality: 0,
        message: 'No consigo leer tu cara'
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

