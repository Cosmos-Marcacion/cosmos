import { Capacitor } from '@capacitor/core';

/**
 * Configuración para asegurar la compatibilidad del DOM con Ionic
 */
export const DOMCompatibilityConfig = {
    /**
     * Configuración para elementos de video
     */
    video: {
        autoplay: true,
        muted: true,
        playsinline: true,
        controls: false
    },

    /**
     * Configuración para elementos de canvas
     */
    canvas: {
        display: 'block',
        maxWidth: '100%',
        height: 'auto'
    },

    /**
     * Configuración para botones
     */
    button: {
        cursor: 'pointer',
        border: 'none',
        outline: 'none',
        fontFamily: 'inherit'
    },

    /**
     * Configuración para inputs
     */
    input: {
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: 'inherit'
    },

    /**
     * Configuración para imágenes
     */
    image: {
        maxWidth: '100%',
        height: 'auto',
        display: 'block'
    },

    /**
     * Configuración para SVG
     */
    svg: {
        display: 'block',
        maxWidth: '100%',
        height: 'auto'
    },

    /**
     * Configuración para contenedores
     */
    container: {
        width: '100%',
        maxWidth: '100%',
        margin: '0 auto',
        padding: '0'
    },

    /**
     * Aplica estilos de compatibilidad al DOM
     */
    applyCompatibilityStyles(): void {
        if (typeof document !== 'undefined') {
            try {
                // Aplicar estilos a elementos de video
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    if (video instanceof HTMLElement) {
                        Object.assign(video.style, {
                            display: 'block',
                            maxWidth: '100%',
                            height: 'auto'
                        });
                    }
                });

                // Aplicar estilos a elementos de canvas
                const canvases = document.querySelectorAll('canvas');
                canvases.forEach(canvas => {
                    if (canvas instanceof HTMLElement) {
                        Object.assign(canvas.style, {
                            display: 'block',
                            maxWidth: '100%',
                            height: 'auto'
                        });
                    }
                });

                // Aplicar estilos a botones
                const buttons = document.querySelectorAll('button');
                buttons.forEach(button => {
                    if (button instanceof HTMLElement) {
                        Object.assign(button.style, {
                            cursor: 'pointer',
                            border: 'none',
                            outline: 'none',
                            fontFamily: 'inherit'
                        });
                    }
                });

                // Aplicar estilos a inputs
                const inputs = document.querySelectorAll('input, select, textarea');
                inputs.forEach(input => {
                    if (input instanceof HTMLElement) {
                        Object.assign(input.style, {
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            lineHeight: 'inherit'
                        });
                    }
                });

                // Aplicar estilos a imágenes
                const images = document.querySelectorAll('img');
                images.forEach(img => {
                    if (img instanceof HTMLElement) {
                        Object.assign(img.style, {
                            maxWidth: '100%',
                            height: 'auto',
                            display: 'block'
                        });
                    }
                });

                // Aplicar estilos a SVG
                const svgs = document.querySelectorAll('svg');
                svgs.forEach(svg => {
                    if (svg instanceof HTMLElement) {
                        Object.assign(svg.style, {
                            display: 'block',
                            maxWidth: '100%',
                            height: 'auto'
                        });
                    }
                });

                console.log('✅ Estilos de compatibilidad aplicados al DOM');
            } catch (error) {
                console.warn('⚠️ Error al aplicar estilos de compatibilidad:', error);
            }
        }
    },

    /**
     * Verifica si los elementos están disponibles en el DOM
     */
    waitForElements(selectors: string[], timeout: number = 5000): Promise<boolean> {
        return new Promise((resolve) => {
            const startTime = Date.now();

            const checkElements = () => {
                const allElementsFound = selectors.every(selector => {
                    const element = document.querySelector(selector);
                    return element !== null;
                });

                if (allElementsFound) {
                    resolve(true);
                    return;
                }

                if (Date.now() - startTime > timeout) {
                    console.warn('⚠️ Timeout esperando elementos del DOM');
                    resolve(false);
                    return;
                }

                setTimeout(checkElements, 100);
            };

            checkElements();
        });
    }
};
