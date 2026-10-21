import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Entrega un archivo generado en el navegador al sistema operativo.
 *
 * En el APK no basta con un `<a download>`: el WebView de Capacitor no trae
 * `DownloadListener`, asi que el click sobre un enlace de descarga se descarta
 * en silencio y el usuario ve el aviso de "descargado" sin que aparezca ningun
 * archivo. Pasaba con el formato de la nombrada y con el Excel de
 * capacitaciones, las dos unicas descargas de la aplicacion.
 *
 * En movil se escribe el archivo en el almacenamiento de la aplicacion y se
 * abre la hoja de compartir, que es la via que permite guardarlo en Descargas,
 * abrirlo con Excel o mandarlo por correo. En el navegador se mantiene el
 * enlace de siempre.
 */
@Injectable({ providedIn: 'root' })
export class FileSaverService {

  async save(blob: Blob, fileName: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await this.saveNative(blob, fileName);
      return;
    }
    this.saveWeb(blob, fileName);
  }

  private async saveNative(blob: Blob, fileName: string): Promise<void> {
    const data = await this.toBase64(blob);

    // `Directory.Cache` no necesita permisos de escritura en ninguna version de
    // Android y el FileProvider ya declarado en el manifiesto puede compartirlo.
    const written = await Filesystem.writeFile({
      path: fileName,
      data,
      directory: Directory.Cache,
    });

    await Share.share({
      title: fileName,
      files: [written.uri],
    });
  }

  private saveWeb(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    // Firefox exige que el enlace este en el documento para que el click cuente.
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revocar en el mismo tick cancelaba la descarga en algunos navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** `Filesystem.writeFile` espera base64 sin el prefijo `data:`. */
  private toBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.readAsDataURL(blob);
    });
  }
}
