import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import * as faceapi from 'face-api.js';
import { FaceUtilsService } from './face-utils.service';
import { loadFaceModels } from './face-api-loader';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';

export interface FaceDetectionStatus {
  status: '✅ Distancia Correcta' | '📱 Acércate' | '📱 Aléjate' | '❌ No se detecta rostro' | '❌ No se pudo obtener el descriptor' | '⏳ Procesando...' | string;
  descriptor: number[] | null;
  confidence?: number;
  faceBox?: { x: number; y: number; width: number; height: number };
}

export interface FaceDetectionOptions {
  inputSize?: number;
  scoreThreshold?: number;
  detectionInterval?: number;
  minFaceWidth?: number;
  maxFaceWidth?: number;
}

@Injectable({
  providedIn: 'root'
})
export class FaceService {
  private readonly destroy$ = new Subject<void>();

  private http = inject(HttpClient);

  // Signals para el estado del servicio
  private readonly _modelsLoaded = signal(false);
  private readonly _isDetecting = signal(false);
  private readonly _detectionError = signal<string | null>(null);

  // Computed signals
  readonly modelsLoaded = this._modelsLoaded.asReadonly();
  readonly isDetecting = this._isDetecting.asReadonly();
  readonly detectionError = this._detectionError.asReadonly();

  // Subjects para comunicación reactiva
  private readonly _detectionStatus$ = new BehaviorSubject<FaceDetectionStatus>({
    status: '❌ No se detecta rostro',
    descriptor: null
  });

  private readonly _lastDetection$ = new BehaviorSubject<any>(null);
  private readonly _detectionStarted$ = new Subject<void>();
  private readonly _detectionStopped$ = new Subject<void>();

  // Observables públicos
  readonly detectionStatus$ = this._detectionStatus$.asObservable();
  readonly lastDetection$ = this._lastDetection$.asObservable();
  readonly detectionStarted$ = this._detectionStarted$.asObservable();
  readonly detectionStopped$ = this._detectionStopped$.asObservable();

  // Configuración por defecto - Más restrictiva para mejor calidad
  private readonly defaultOptions: Required<FaceDetectionOptions> = {
    inputSize: 320,
    scoreThreshold: 0.8,  // Aumentado de 0.6 para mejor calidad  
    detectionInterval: 200,
    minFaceWidth: 200,    // Más restrictivo para evitar rostros muy pequeños
    maxFaceWidth: 600     // Más restrictivo para evitar rostros muy grandes
  };

  constructor() {
    this.faceUtils = inject(FaceUtilsService);
    this.initializeService();
  }

  private readonly faceUtils: FaceUtilsService;

  private async initializeService(): Promise<void> {
    try {
      await this.getPresition().subscribe((presition) => {
        this.defaultOptions.scoreThreshold = presition;
      });
      await this.loadModels();
    } catch (error) {
      console.error('Error al inicializar el servicio de detección facial:', error);
      this._detectionError.set('Error al cargar los modelos de IA');
    }
  }

  /**
   * Carga los modelos de FaceAPI necesarios para la detección
   */
  public async loadModels(): Promise<void> {
    if (this._modelsLoaded()) {
      return;
    }
    try {
      this._detectionError.set(null);
      await loadFaceModels();
      this._modelsLoaded.set(true);
    } catch (error) {
      const errorMessage = 'Error al cargar los modelos de FaceAPI';
      // Nada de `alert()`: bloquea el WebView de Capacitor hasta que alguien lo
      // toca y el servicio se instancia al arrancar, asi que un fallo de carga
      // congelaba la aplicacion entera antes de pintar la primera pantalla.
      console.error(errorMessage, error);
      this._detectionError.set(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Debug específico para problemas de dimensiones del video
   */
  public debugVideoDimensions(video: HTMLVideoElement): void {
    console.log('🔍 DEBUG DIMENSIONES DEL VIDEO:');
    console.log('Video element:', video);
    console.log('Video properties:', {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      width: video.width,
      height: video.height,
      clientWidth: video.clientWidth,
      clientHeight: video.clientHeight,
      offsetWidth: video.offsetWidth,
      offsetHeight: video.offsetHeight,
      scrollWidth: video.scrollWidth,
      scrollHeight: video.scrollHeight
    });

    console.log('Video styles:', {
      width: video.style.width,
      height: video.style.height,
      objectFit: video.style.objectFit,
      objectPosition: video.style.objectPosition
    });

    console.log('Video computed styles:', {
      width: getComputedStyle(video).width,
      height: getComputedStyle(video).height,
      objectFit: getComputedStyle(video).objectFit
    });

    // Verificar si el video está reproduciéndose
    console.log('Video state:', {
      readyState: video.readyState,
      paused: video.paused,
      ended: video.ended,
      currentTime: video.currentTime,
      duration: video.duration
    });
  }

  /**
   * Fuerza el redimensionamiento del video para optimizar la detección facial
   */
  public forceVideoResize(video: HTMLVideoElement, targetWidth: number = 640, targetHeight: number = 480): void {
    console.log('🔄 Forzando redimensionamiento del video:', {
      currentWidth: video.videoWidth,
      currentHeight: video.videoHeight,
      targetWidth,
      targetHeight
    });

    // Establecer dimensiones CSS del video
    video.style.width = `${targetWidth}px`;
    video.style.height = `${targetHeight}px`;

    // Forzar el recálculo de dimensiones
    video.style.objectFit = 'cover';
    video.style.objectPosition = 'center';

    console.log('✅ Redimensionamiento forzado completado');
  }

  /**
   * Obtiene restricciones de video optimizadas para FaceAPI
   */
  public getOptimizedVideoConstraints(): MediaStreamConstraints {
    const constraints = {
      video: {
        width: { ideal: 640, min: 350, max: 1280 },
        height: { ideal: 480, min: 350, max: 720 },
        facingMode: 'user',
        frameRate: { ideal: 30, min: 15, max: 60 },
        // Configuraciones específicas para mejor detección facial
        aspectRatio: { ideal: 4 / 3 }, // Proporción óptima para FaceAPI
        resizeMode: 'none' // Evitar redimensionamiento automático
      },
      audio: false
    };

    console.log('📹 Restricciones de video optimizadas:', constraints);
    return constraints;
  }

  /**
   * Verifica y corrige las dimensiones del video para asegurar compatibilidad con FaceAPI
   */
  public validateVideoDimensions(video: HTMLVideoElement): { width: number; height: number; isValid: boolean } {
    const videoWidth = video.videoWidth || video.width;
    const videoHeight = video.videoHeight || video.height;

    console.log('🔍 Validando dimensiones del video:', {
      videoWidth,
      videoHeight,
      clientWidth: video.clientWidth,
      clientHeight: video.clientHeight,
      offsetWidth: video.offsetWidth,
      offsetHeight: video.offsetHeight
    });

    // Verificar que el video tenga dimensiones válidas
    if (!videoWidth || !videoHeight || videoWidth === 0 || videoHeight === 0) {
      console.log('videoWidth', videoWidth);
      console.log('videoHeight', videoHeight);
      console.error('❌ Dimensiones del video inválidas:', { videoWidth, videoHeight });
      return { width: 0, height: 0, isValid: false };
    }

    // Verificar que las dimensiones sean razonables para FaceAPI
    const minDimension = 100; // Mínimo recomendado para FaceAPI
    const maxDimension = 1920; // Máximo razonable

    if (videoWidth < minDimension || videoHeight < minDimension) {
      console.warn('⚠️ Video demasiado pequeño para FaceAPI:', { videoWidth, videoHeight, minDimension });
    }

    if (videoWidth > maxDimension || videoHeight > maxDimension) {
      console.warn('⚠️ Video muy grande, puede afectar el rendimiento:', { videoWidth, videoHeight, maxDimension });
    }

    // Verificar proporción (debería ser cercana a 4:3 o 16:9)
    const aspectRatio = videoWidth / videoHeight;
    const expectedRatios = [4 / 3, 16 / 9, 3 / 4, 9 / 16];
    const isGoodRatio = expectedRatios.some(ratio => Math.abs(aspectRatio - ratio) < 0.1);

    if (!isGoodRatio) {
      console.warn('⚠️ Proporción del video inusual:', { aspectRatio, expectedRatios });
    }

    const isValid = videoWidth >= minDimension && videoHeight >= minDimension;

    console.log('✅ Validación de dimensiones completada:', {
      isValid,
      aspectRatio: aspectRatio.toFixed(2),
      isGoodRatio
    });

    return { width: videoWidth, height: videoHeight, isValid };
  }

  /**
   * Inicia la detección facial en tiempo real
   */
  public startFaceDetection(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    options: Partial<FaceDetectionOptions> = {}
  ): () => void {
    if (!this._modelsLoaded()) {
      const error = 'Los modelos no están cargados. Llama a loadModels() primero.';
      console.error(error);
      this._detectionError.set(error);
      throw new Error(error);
    }

    if (this._isDetecting()) {
      console.warn('La detección facial ya está en ejecución');
      return () => { };
    }

    const config = { ...this.defaultOptions, ...options };

    // Usar configuraciones optimizadas para la plataforma
    const optimizedConfig = {
      ...config,
      detectionInterval: this.faceUtils.getOptimalDetectionInterval(),
      inputSize: this.faceUtils.isMobile ? 256 : 320,
      scoreThreshold: this.defaultOptions.scoreThreshold
    };

    this._isDetecting.set(true);
    this._detectionError.set(null);
    this._detectionStarted$.next();

    // Validar dimensiones del video antes de continuar
    const videoValidation = this.validateVideoDimensions(video);
    if (!videoValidation.isValid) {
      console.log('videoValidation', videoValidation);
      this._isDetecting.set(false);
      const error = `Dimensiones del video inválidas: ${videoValidation.width}x${videoValidation.height}`;
      console.error(error);
      this._detectionError.set(error);
      throw new Error(error);
    }

    // Configurar canvas y video para dimensiones correctas
    const displaySize = { width: videoValidation.width, height: videoValidation.height };

    // Asegurar que el canvas tenga las dimensiones correctas del video
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;

    // Configurar el canvas para que coincida con las dimensiones del video
    faceapi.matchDimensions(canvas, displaySize);

    console.log('📐 Configuración de dimensiones:', {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      videoClientWidth: video.clientWidth,
      videoClientHeight: video.clientHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      displaySize
    });

    // Crear contexto del canvas
    const context = canvas.getContext('2d');
    if (!context) {
      this._isDetecting.set(false);
      throw new Error('No se pudo obtener el contexto del canvas');
    }

    // Función de detección optimizada
    const performDetection = async (): Promise<void> => {
      try {
        const detectionOptions = this.faceUtils.getOptimizedDetectionOptions();

        const detections = await faceapi.detectAllFaces(video, detectionOptions)
          .withFaceLandmarks();

        // Limpiar canvas
        context.clearRect(0, 0, canvas.width, canvas.height);

        // LÓGICA MEJORADA: Validación de calidad para evitar confusiones
        if (detections.length > 0) {
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          const faceBox = resizedDetections[0].detection.box;

          console.log('🎯 Rostro detectado, analizando calidad...');
          console.log('📐 Dimensiones del rostro:', { width: faceBox.width, height: faceBox.height });

          // Analizar calidad del rostro usando el servicio de utilidades
          const qualityCheck = this.faceUtils.evaluateFaceQuality(detections[0]);
          const distanceStatus = this.analyzeFaceDistance(faceBox, config, qualityCheck);

          console.log('🔍 Análisis de calidad:', {
            overallScore: qualityCheck.overallScore,
            isGoodQuality: qualityCheck.isGoodQuality,
            issues: qualityCheck.issues,
            distanceStatus: distanceStatus.status
          });

          // Solo proceder si la calidad es buena y la distancia es correcta
          if (distanceStatus.status === '✅ Distancia Correcta' && qualityCheck.isGoodQuality) {
            console.log('✅ Calidad y distancia correctas, obteniendo descriptor...');

            try {
              // Obtener descriptor facial
              const detectionWithDescriptor = await faceapi
                .detectSingleFace(video, detectionOptions)
                .withFaceLandmarks()
                .withFaceDescriptor();

              console.log('🔍 Descriptor obtenido:', detectionWithDescriptor);

              if (detectionWithDescriptor?.descriptor) {
                const status: FaceDetectionStatus = {
                  status: '✅ Distancia Correcta',
                  descriptor: Array.from(detectionWithDescriptor.descriptor),
                  confidence: detectionWithDescriptor.detection.score,
                  faceBox: {
                    x: faceBox.x,
                    y: faceBox.y,
                    width: faceBox.width,
                    height: faceBox.height
                  }
                };

                console.log('✅ ÉXITO: Descriptor obtenido, activando botón:', status);
                this._detectionStatus$.next(status);
                this._lastDetection$.next(detectionWithDescriptor);
              } else {
                console.log('❌ No se pudo obtener el descriptor');
                this._detectionStatus$.next({
                  status: '❌ No se pudo obtener el descriptor',
                  descriptor: null,
                  faceBox: {
                    x: faceBox.x,
                    y: faceBox.y,
                    width: faceBox.width,
                    height: faceBox.height
                  }
                });
              }
            } catch (descriptorError) {
              console.error('❌ Error al obtener descriptor:', descriptorError);
              this._detectionStatus$.next({
                status: '❌ Error al obtener descriptor',
                descriptor: null,
                faceBox: {
                  x: faceBox.x,
                  y: faceBox.y,
                  width: faceBox.width,
                  height: faceBox.height
                }
              });
            }
          } else {
            // Si no cumple las condiciones, mostrar el estado correspondiente
            console.log('⚠️ Condiciones no cumplidas:', {
              distanceStatus: distanceStatus.status,
              qualityScore: qualityCheck.overallScore,
              qualityIssues: qualityCheck.issues
            });

            // Actualizar estado con información de calidad
            this._detectionStatus$.next({
              ...distanceStatus,
              faceBox: {
                x: faceBox.x,
                y: faceBox.y,
                width: faceBox.width,
                height: faceBox.height
              }
            });
          }

          // Dibujar detecciones en el canvas
          faceapi.draw.drawDetections(canvas, resizedDetections);
          faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        } else {
          this._detectionStatus$.next({
            status: '❌ No se detecta rostro',
            descriptor: null
          });
        }
      } catch (error) {
        console.error('Error durante la detección facial:', error);
        this._detectionError.set('Error durante la detección facial');
      }
    };

    // Iniciar detección con intervalo optimizado
    const detectionInterval = setInterval(performDetection, optimizedConfig.detectionInterval);

    // Función de limpieza
    const cleanup = (): void => {
      clearInterval(detectionInterval);
      this._isDetecting.set(false);
      this._detectionStopped$.next();

      // Limpiar canvas
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Resetear estado
      this._detectionStatus$.next({
        status: '❌ No se detecta rostro',
        descriptor: null
      });
    };

    // Retornar función de limpieza
    return cleanup;
  }

  /**
   * Analiza la distancia del rostro basándose en el tamaño del bounding box
   * Versión mejorada con restricciones más estrictas
   */
  private analyzeFaceDistance(
    faceBox: any,
    config: Required<FaceDetectionOptions>,
    qualityCheck?: any
  ): FaceDetectionStatus {
    // Rango más restrictivo para mejor calidad
    const optimalMinWidth = 250;  // Rostros no muy pequeños
    const optimalMaxWidth = 600;  // Rostros no muy grandes

    console.log('🔍 Analizando distancia con restricciones estrictas:', {
      faceBoxWidth: faceBox.width,
      optimalMinWidth,
      optimalMaxWidth,
      qualityCheck: qualityCheck?.overallScore
    });

    // Verificar tamaño del rostro
    if (faceBox.width < optimalMinWidth) {
      return {
        status: '📱 Acércate',
        descriptor: null,
        faceBox: {
          x: faceBox.x,
          y: faceBox.y,
          width: faceBox.width,
          height: faceBox.height
        }
      };
    } else if (faceBox.width > optimalMaxWidth) {
      return {
        status: '📱 Aléjate',
        descriptor: null,
        faceBox: {
          x: faceBox.x,
          y: faceBox.y,
          width: faceBox.width,
          height: faceBox.height
        }
      };
    }

    // Verificar calidad mínima requerida
    if (qualityCheck && qualityCheck.overallScore < this.defaultOptions.scoreThreshold) {  // Umbral más alto
      const firstIssue = qualityCheck.issues[0] || 'Calidad insuficiente';
      return {
        status: `⚠️ ${firstIssue}` as any,
        descriptor: null,
        faceBox: {
          x: faceBox.x,
          y: faceBox.y,
          width: faceBox.width,
          height: faceBox.height
        }
      };
    }

    // Verificar confianza mínima
    if (qualityCheck && qualityCheck.confidence < this.defaultOptions.scoreThreshold) {  // Confianza mínima más alta
      return {
        status: '⚠️ Baja confianza en la detección',
        descriptor: null,
        faceBox: {
          x: faceBox.x,
          y: faceBox.y,
          width: faceBox.width,
          height: faceBox.height
        }
      };
    }

    // Si pasa todas las validaciones
    console.log('faceBox.width', faceBox.width);
    console.log('optimalMinWidth', optimalMinWidth);
    console.log('optimalMaxWidth', optimalMaxWidth);
    if (faceBox.width >= optimalMinWidth && faceBox.width <= optimalMaxWidth) {
      console.log('✅ Distancia y calidad consideradas correctas');
      return {
        status: '✅ Distancia Correcta',
        descriptor: null,
        faceBox: {
          x: faceBox.x,
          y: faceBox.y,
          width: faceBox.width,
          height: faceBox.height
        }
      };
    }

    return {
      status: '❌ No se detecta rostro',
      descriptor: null,
      faceBox: {
        x: faceBox.x,
        y: faceBox.y,
        width: faceBox.width,
        height: faceBox.height
      }
    };
  }

  /**
   * Detiene la detección facial
   */
  public stopFaceDetection(): void {
    if (this._isDetecting()) {
      this._isDetecting.set(false);
      this._detectionStopped$.next();
    }
  }

  /**
   * Obtiene el estado actual de la detección
   */
  public getCurrentStatus(): FaceDetectionStatus {
    return this._detectionStatus$.value;
  }

  /**
   * Verifica si los modelos están cargados
   */
  public areModelsLoaded(): boolean {
    return this._modelsLoaded();
  }

  /**
   * Verifica si la detección está activa
   */
  public isDetectionActive(): boolean {
    return this._isDetecting();
  }

  /**
   * Verifica si la detección actual es válida para activar el botón
   */
  public isCurrentDetectionValid(): boolean {
    const currentStatus = this._detectionStatus$.value;
    return currentStatus.descriptor !== null &&
      currentStatus.status === '✅ Distancia Correcta';
  }

  /**
   * Obtiene información de debug de la detección actual
   */
  public getDetectionDebugInfo(): any {
    const currentStatus = this._detectionStatus$.value;
    return {
      currentStatus,
      modelsLoaded: this._modelsLoaded(),
      isDetecting: this._isDetecting(),
      hasError: this._detectionError() !== null,
      error: this._detectionError()
    };
  }

  /**
   * Método de debug para diagnosticar problemas de detección
   */
  public debugDetection(): void {
    const currentStatus = this._detectionStatus$.value;
    console.log('🔧 DEBUG COMPLETO DE DETECCIÓN:');
    console.log('Estado actual:', currentStatus);
    console.log('Modelos cargados:', this._modelsLoaded());
    console.log('Detección activa:', this._isDetecting());
    console.log('Error:', this._detectionError());

    if (currentStatus.faceBox) {
      console.log('📐 Dimensiones del rostro:', {
        width: currentStatus.faceBox.width,
        height: currentStatus.faceBox.height,
        ratio: currentStatus.faceBox.width / currentStatus.faceBox.height
      });

      // Verificar si cumple los criterios básicos
      const width = currentStatus.faceBox.width;
      const isValidWidth = width >= 120 && width <= 800;
      console.log('✅ Ancho válido (120-800):', isValidWidth, `(${width}px)`);

      if (currentStatus.descriptor) {
        console.log('🎯 Descriptor presente:', currentStatus.descriptor.length, 'valores');
      } else {
        console.log('❌ Sin descriptor');
      }
    }

    console.log('📊 Configuración actual:', this.defaultOptions);
  }

  /**
   * Fuerza la validación de la detección actual
   * Útil para debug y testing
   */
  public forceValidation(): void {
    const currentStatus = this._detectionStatus$.value;
    console.log('🔧 Forzando validación de detección actual:', currentStatus);

    if (currentStatus.faceBox && currentStatus.faceBox.width >= 180 && currentStatus.faceBox.width <= 650) {
      // Si tenemos un rostro detectado en el rango correcto, intentar obtener el descriptor
      console.log('🔄 Intentando obtener descriptor para validación forzada...');

      // Simular una detección válida
      const forcedStatus: FaceDetectionStatus = {
        status: '✅ Distancia Correcta',
        descriptor: currentStatus.descriptor || [1, 2, 3, 4, 5], // Descriptor dummy para testing
        confidence: this.defaultOptions.scoreThreshold,
        faceBox: currentStatus.faceBox
      };

      this._detectionStatus$.next(forcedStatus);
      console.log('✅ Validación forzada completada');
    } else {
      console.log('❌ No se puede forzar validación - rostro fuera de rango o no detectado');
    }
  }

  /**
   * Fuerza la activación del botón sin importar las condiciones
   * SOLO PARA TESTING - NO USAR EN PRODUCCIÓN
   */
  public forceButtonActivation(): void {
    console.log('🚨 FORZANDO ACTIVACIÓN DEL BOTÓN...');

    const forcedStatus: FaceDetectionStatus = {
      status: '✅ Distancia Correcta',
      descriptor: Array.from({ length: 128 }, (_, i) => Math.random() * 2 - 1),
      confidence: 1.0,
      faceBox: {
        x: 200,
        y: 150,
        width: 400,
        height: 400
      }
    };

    this._detectionStatus$.next(forcedStatus);
    console.log('✅ BOTÓN FORZADO A ACTIVARSE:', forcedStatus);

    // Verificar el estado inmediatamente
    setTimeout(() => {
      this.checkButtonState();
    }, 100);
  }

  /**
   * Configura restricciones personalizadas para la detección
   * Útil para ajustar la sensibilidad según el entorno
   */
  public configureRestrictions(options: {
    minConfidence?: number;
    minQuality?: number;
    minFaceWidth?: number;
    maxFaceWidth?: number;
    requireStability?: boolean;
  }): void {
    console.log('⚙️ Configurando restricciones personalizadas:', options);

    // Actualizar configuración por defecto
    if (options.minConfidence !== undefined) {
      this.defaultOptions.scoreThreshold = options.minConfidence;
    }

    if (options.minFaceWidth !== undefined) {
      this.defaultOptions.minFaceWidth = options.minFaceWidth;
    }

    if (options.maxFaceWidth !== undefined) {
      this.defaultOptions.maxFaceWidth = options.maxFaceWidth;
    }

    console.log('✅ Restricciones actualizadas:', this.defaultOptions);
  }

  /**
   * Verifica la estabilidad de la detección para evitar cambios bruscos
   * Útil para evitar confusiones de rostro
   */
  public checkDetectionStability(): boolean {
    const currentStatus = this._detectionStatus$.value;
    const previousStatus = this._lastDetection$.value;

    if (!currentStatus.descriptor || !previousStatus) {
      return false;
    }

    // Verificar que el descriptor no cambie drásticamente
    const currentDescriptor = currentStatus.descriptor;
    const previousDescriptor = previousStatus.descriptor;

    if (currentDescriptor.length !== previousDescriptor.length) {
      return false;
    }

    // Calcular similitud entre descriptores
    let sum = 0;
    for (let i = 0; i < currentDescriptor.length; i++) {
      const diff = currentDescriptor[i] - previousDescriptor[i];
      sum += diff * diff;
    }

    const distance = Math.sqrt(sum);
    const similarity = Math.max(0, 1 - (distance / 0.6)); // Umbral de 0.6

    console.log('🔍 Estabilidad de detección:', { similarity, distance });

    // Considerar estable si la similitud es mayor a 0.8
    return similarity > this.defaultOptions.scoreThreshold;
  }

  /**
   * Verifica el estado del botón en tiempo real
   * Útil para diagnosticar por qué no se activa
   */
  public checkButtonState(): void {
    const currentStatus = this._detectionStatus$.value;
    console.log('🔍 ESTADO ACTUAL DEL BOTÓN:');
    console.log('Status:', currentStatus.status);
    console.log('Descriptor presente:', currentStatus.descriptor !== null);
    console.log('Descriptor length:', currentStatus.descriptor?.length || 0);
    console.log('FaceBox:', currentStatus.faceBox);
    console.log('Confidence:', currentStatus.confidence);

    // Verificar si debería estar activo
    const shouldBeActive = currentStatus.descriptor !== null &&
      currentStatus.status === '✅ Distancia Correcta';

    console.log('✅ Botón debería estar activo:', shouldBeActive);

    if (!shouldBeActive) {
      console.log('❌ RAZONES POR LAS QUE NO ESTÁ ACTIVO:');
      if (currentStatus.descriptor === null) {
        console.log('- No hay descriptor facial');
      }
      if (currentStatus.status !== '✅ Distancia Correcta') {
        console.log('- Status incorrecto:', currentStatus.status);
      }
    }
  }

  /**
   * Método de prueba directo para activar el botón
   * Simula una detección exitosa sin restricciones
   */
  public testButtonActivation(): void {
    console.log('🧪 PRUEBA: Activando botón directamente...');

    const testStatus: FaceDetectionStatus = {
      status: '✅ Distancia Correcta',
      descriptor: Array.from({ length: 128 }, (_, i) => Math.random() * 2 - 1), // Descriptor realista
      confidence: 0.95,
      faceBox: {
        x: 250,
        y: 200,
        width: 350,
        height: 350
      }
    };

    this._detectionStatus$.next(testStatus);
    console.log('✅ PRUEBA COMPLETADA: Estado actualizado:', testStatus);
    console.log('🔍 Verificar si el botón está activo...');
  }

  /**
   * Simula una detección exitosa para testing
   * Útil para verificar que el botón se active correctamente
   */
  public simulateSuccessfulDetection(): void {
    console.log('🧪 Simulando detección exitosa...');

    const simulatedStatus: FaceDetectionStatus = {
      status: '✅ Distancia Correcta',
      descriptor: Array.from({ length: 128 }, (_, i) => Math.random()), // Descriptor dummy de 128 valores
      confidence: this.defaultOptions.scoreThreshold,
      faceBox: {
        x: 200,
        y: 150,
        width: 300, // Ancho en el rango válido
        height: 300
      }
    };

    this._detectionStatus$.next(simulatedStatus);
    console.log('✅ Simulación completada:', simulatedStatus);
  }

  /**
   * Limpia todos los recursos del servicio
   */
  public destroy(): void {
    this.stopFaceDetection();
    this.destroy$.next();
    this.destroy$.complete();
  }

  public getPresition(): Observable<number> {
    return this.http.get<number>(`${environment.api}/presition`);
  }

  ngOnDestroy(): void {
    this.destroy();
  }
}
