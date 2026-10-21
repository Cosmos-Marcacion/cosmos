import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import * as faceapi from 'face-api.js';

export interface FaceDetectionMetrics {
    confidence: number;
    distance: number;
    quality: number;
    lighting: number;
    angle: number;
}

export interface FaceQualityCheck {
    isGoodQuality: boolean;
    issues: string[];
    recommendations: string[];
    overallScore: number;
}

@Injectable({
    providedIn: 'root'
})
export class FaceUtilsService {

    /**
     * Verifica si la aplicación está ejecutándose en un dispositivo móvil
     */
    get isMobile(): boolean {
        return Capacitor.isNativePlatform();
    }

    /**
     * Verifica si la aplicación está ejecutándose en Android
     */
    get isAndroid(): boolean {
        return Capacitor.getPlatform() === 'android';
    }

    /**
     * Verifica si la aplicación está ejecutándose en iOS
     */
    get isIOS(): boolean {
        return Capacitor.getPlatform() === 'ios';
    }

    /**
     * Verifica si la aplicación está ejecutándose en el navegador
     */
    get isWeb(): boolean {
        return Capacitor.getPlatform() === 'web';
    }

    /**
     * Calcula métricas de calidad de la detección facial
     */
    calculateFaceMetrics(detection: any): FaceDetectionMetrics {
        const confidence = detection.detection.score || 0;

        // Calcular distancia basándose en el tamaño del bounding box
        const box = detection.detection.box;
        const distance = this.calculateDistanceFromBox(box);

        // Calcular calidad basándose en la confianza y otros factores
        const quality = this.calculateQualityScore(detection);

        // Calcular iluminación (simulado basándose en la confianza)
        const lighting = this.estimateLighting(detection);

        // Calcular ángulo del rostro
        const angle = this.calculateFaceAngle(detection);

        return {
            confidence,
            distance,
            quality,
            lighting,
            angle
        };
    }

    /**
     * Calcula la distancia del rostro basándose en el tamaño del bounding box
     */
    private calculateDistanceFromBox(box: any): number {
        // Fórmula aproximada: distancia = constante / tamaño del rostro
        const baseDistance = 60; // cm
        const baseSize = 300; // píxeles

        if (box.width <= 0) return 0;

        const distance = (baseDistance * baseSize) / box.width;
        return Math.max(20, Math.min(100, distance)); // Limitar entre 20cm y 100cm
    }

    /**
     * Calcula un score de calidad basándose en múltiples factores
     */
    private calculateQualityScore(detection: any): number {
        let score = 0;

        // Confianza de detección (40% del score)
        score += (detection.detection.score || 0) * 0.4;

        // Tamaño del rostro (30% del score)
        const box = detection.detection.box;
        const sizeScore = Math.min(1, Math.max(0, (box.width - 200) / 200));
        score += sizeScore * 0.3;

        // Presencia de landmarks (30% del score)
        if (detection.landmarks) {
            const landmarksScore = Math.min(1, detection.landmarks.positions.length / 68);
            score += landmarksScore * 0.3;
        }

        return Math.min(1, Math.max(0, score));
    }

    /**
     * Estima la iluminación basándose en la detección
     */
    private estimateLighting(detection: any): number {
        // Simulación simple basada en la confianza
        // En una implementación real, se analizaría el histograma de la imagen
        const confidence = detection.detection.score || 0;

        if (confidence > 0.8) return 0.9;
        if (confidence > 0.6) return 0.7;
        if (confidence > 0.4) return 0.5;
        return 0.3;
    }

    /**
     * Calcula el ángulo del rostro
     */
    private calculateFaceAngle(detection: any): number {
        // Simulación simple - en una implementación real se usarían los landmarks 3D
        const confidence = detection.detection.score || 0;

        // Simular variación de ángulo basada en la confianza
        const baseAngle = 0; // Rostro frontal
        const variation = (1 - confidence) * 30; // Hasta 30 grados de variación

        return Math.abs(baseAngle) + variation;
    }

    /**
     * Evalúa la calidad general de la detección facial
     * Versión más restrictiva para evitar confusiones
     */
    evaluateFaceQuality(detection: any): FaceQualityCheck {
        const metrics = this.calculateFaceMetrics(detection);
        const issues: string[] = [];
        const recommendations: string[] = [];

        // Evaluar confianza - Más restrictivo
        if (metrics.confidence < 0.6) {  // Cambiado de 0.3 a 0.6
            issues.push('Baja confianza en la detección');
            recommendations.push('Asegúrate de estar bien iluminado y frente a la cámara');
        }

        // Evaluar distancia - Más restrictivo
        if (metrics.distance < 30) {  // Cambiado de 15 a 30
            issues.push('Demasiado cerca de la cámara');
            recommendations.push('Aléjate un poco de la cámara');
        } else if (metrics.distance > 80) {  // Cambiado de 120 a 80
            issues.push('Demasiado lejos de la cámara');
            recommendations.push('Acércate un poco a la cámara');
        }

        // Evaluar calidad - Más restrictivo
        if (metrics.quality < 0.5) {  // Cambiado de 0.2 a 0.5
            issues.push('Calidad de imagen insuficiente');
            recommendations.push('Verifica la iluminación y la posición');
        }

        // Evaluar iluminación - Más restrictivo
        if (metrics.lighting < 0.4) {  // Cambiado de 0.2 a 0.4
            issues.push('Iluminación insuficiente');
            recommendations.push('Mejora la iluminación del rostro');
        }

        // Evaluar ángulo - Más restrictivo
        if (metrics.angle > 25) {  // Cambiado de 45 a 25
            issues.push('Rostro no frontal');
            recommendations.push('Mira directamente a la cámara');
        }

        // Calcular score general - Más restrictivo
        const overallScore = (
            metrics.confidence * 0.35 +      // Aumentado peso de confianza
            (1 - Math.abs(metrics.distance - 50) / 50) * 0.25 +  // Aumentado peso de distancia
            metrics.quality * 0.25 +         // Aumentado peso de calidad
            metrics.lighting * 0.15          // Reducido peso de iluminación
        );

        // Umbral más alto para evitar confusiones
        const isGoodQuality = overallScore > 0.7 && issues.length === 0;

        return {
            isGoodQuality,
            issues,
            recommendations,
            overallScore
        };
    }

    /**
     * Optimiza las opciones de detección según la plataforma
     */
    getOptimizedDetectionOptions(): faceapi.TinyFaceDetectorOptions {
        const baseOptions = {
            inputSize: 320,
            scoreThreshold: 0.6
        };

        if (this.isMobile) {
            // En móvil, usar configuración más agresiva para mejor rendimiento
            return new faceapi.TinyFaceDetectorOptions({
                ...baseOptions,
                inputSize: 256, // Tamaño más pequeño para mejor rendimiento
                scoreThreshold: 0.5 // Umbral más bajo para detectar rostros más fácilmente
            });
        }

        // En web, usar configuración estándar
        return new faceapi.TinyFaceDetectorOptions(baseOptions);
    }

    /**
     * Obtiene restricciones de video optimizadas para la plataforma
     */
    getOptimizedVideoConstraints(): MediaStreamConstraints {
        const baseConstraints = {
            video: {
                width: { ideal: 640, min: 320, max: 1280 },
                height: { ideal: 480, min: 240, max: 720 },
                facingMode: 'user',
                frameRate: { ideal: 30, min: 15, max: 60 }
            },
            audio: false
        };

        if (this.isMobile) {
            // En móvil, usar resolución más baja para mejor rendimiento
            return {
                video: {
                    ...baseConstraints.video,
                    width: { ideal: 480, min: 240, max: 720 },
                    height: { ideal: 360, min: 180, max: 540 },
                    frameRate: { ideal: 24, min: 15, max: 30 }
                },
                audio: false
            };
        }

        return baseConstraints;
    }

    /**
     * Calcula el intervalo óptimo de detección según la plataforma
     */
    getOptimalDetectionInterval(): number {
        if (this.isMobile) {
            return 200; // 200ms en móvil para balancear rendimiento y responsividad
        }

        return 150; // 150ms en web para máxima responsividad
    }

    /**
     * Verifica si la detección es suficientemente buena para el registro
     * Versión más restrictiva para evitar confusiones
     */
    isDetectionGoodForRegistration(detection: any): boolean {
        const qualityCheck = this.evaluateFaceQuality(detection);
        // Umbral más alto para evitar confusiones
        return qualityCheck.isGoodQuality && qualityCheck.overallScore > 0.75;
    }

    /**
     * Genera un mensaje de estado amigable para el usuario
     */
    generateUserFriendlyMessage(detection: any): string {
        const qualityCheck = this.evaluateFaceQuality(detection);

        if (qualityCheck.isGoodQuality) {
            return '✅ Rostro detectado correctamente. Mantén la posición.';
        }

        if (qualityCheck.issues.length > 0) {
            return `⚠️ ${qualityCheck.issues[0]}. ${qualityCheck.recommendations[0]}`;
        }

        return '❌ No se detecta rostro. Posiciónate frente a la cámara.';
    }

    /**
     * Calcula la similitud entre dos descriptores faciales
     */
    calculateFaceSimilarity(descriptor1: number[], descriptor2: number[]): number {
        if (descriptor1.length !== descriptor2.length) {
            return 0;
        }

        // Calcular distancia euclidiana
        let sum = 0;
        for (let i = 0; i < descriptor1.length; i++) {
            const diff = descriptor1[i] - descriptor2[i];
            sum += diff * diff;
        }

        const distance = Math.sqrt(sum);

        // Convertir distancia a similitud (0 = muy diferente, 1 = idéntico)
        // Umbral típico: 0.6 para considerar rostros similares
        const threshold = 0.6;
        const similarity = Math.max(0, 1 - (distance / threshold));

        return Math.min(1, similarity);
    }

    /**
     * Verifica si dos rostros son del mismo individuo
     */
    areSamePerson(descriptor1: number[], descriptor2: number[], threshold: number = 0.6): boolean {
        const similarity = this.calculateFaceSimilarity(descriptor1, descriptor2);
        return similarity >= threshold;
    }

    /**
     * Normaliza un descriptor facial
     */
    normalizeDescriptor(descriptor: number[]): number[] {
        const magnitude = Math.sqrt(descriptor.reduce((sum, val) => sum + val * val, 0));
        if (magnitude === 0) return descriptor;

        return descriptor.map(val => val / magnitude);
    }

    /**
     * Obtiene información de rendimiento de la detección
     */
    getPerformanceInfo(): { platform: string; isMobile: boolean; recommendedSettings: any } {
        return {
            platform: Capacitor.getPlatform(),
            isMobile: this.isMobile,
            recommendedSettings: {
                detectionInterval: this.getOptimalDetectionInterval(),
                inputSize: this.isMobile ? 256 : 320,
                scoreThreshold: this.isMobile ? 0.5 : 0.6,
                videoConstraints: this.getOptimizedVideoConstraints()
            }
        };
    }
}
