import * as faceapi from 'face-api.js';

/**
 * Carga de los modelos de face-api.js.
 *
 * Dos decisiones que estaban mal resueltas y que este modulo centraliza:
 *
 * 1. **De donde salen los pesos.** Antes se pedian al backend
 *    (`<api>/static/models`), unos 6,5 MB por arranque que el APK ya lleva
 *    dentro: `public/models` viaja en los assets de la aplicacion. Pedirlos
 *    por red obligaba a tener cobertura para fichar y anadia una espera larga
 *    en el muelle. Ahora se leen del propio paquete, asi que funciona sin
 *    conexion y sin depender de CORS ni del dominio del API.
 *
 * 2. **Quien los carga.** Cada pantalla los cargaba por su cuenta. face-api
 *    ignora la segunda carga de una red ya cargada, pero dos pantallas
 *    entrando a la vez lanzaban las descargas por duplicado. La promesa se
 *    cachea: la primera llamada carga y las demas esperan a esa misma.
 */

/**
 * Ruta de los modelos dentro de los assets. `public/**` se copia a la raiz del
 * build (ver `angular.json`), y en el WebView de Capacitor la aplicacion se
 * sirve desde `/`, de modo que la ruta absoluta vale igual en web y en Android.
 */
const MODEL_URI = '/models';

/** Carga en curso o ya terminada. Se limpia si falla, para poder reintentar. */
let loading: Promise<void> | null = null;

/**
 * Deja listas las tres redes que usan el registro y el fichaje facial.
 * Es idempotente: llamarla de nuevo no vuelve a descargar nada.
 *
 * @throws si algun modelo no se puede leer. El llamante decide que mensaje
 *         ensena; aqui no se traga el error porque una pantalla de camara sin
 *         modelos no puede hacer nada util.
 */
export function loadFaceModels(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URI),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URI),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URI),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URI),
    ]).then(() => undefined)
      .catch(error => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

/** True cuando las redes ya estan en memoria y se puede detectar. */
export function faceModelsReady(): boolean {
  return (
    faceapi.nets.tinyFaceDetector.isLoaded &&
    faceapi.nets.faceLandmark68TinyNet.isLoaded &&
    faceapi.nets.faceRecognitionNet.isLoaded
  );
}
