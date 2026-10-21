import asyncio
import websockets
import json
import base64
import logging
import http # Necesario para los códigos de estado HTTP
from pyzkfp import ZKFP2

# --- Configuración ---
HOST = 'localhost'
PORT = 9876
# ¡Importante! Añade aquí la URL de tu aplicación web para permitir la conexión.
ALLOWED_ORIGINS = [
    "http://localhost:4201",  # Para desarrollo local de Angular
    "https://cosmos-app.marcostorresalarcon.com"      # La dirección de tu aplicación en producción
]
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Variables para manejar el escáner ---
zkfp2 = None
is_initialized = False

# --- Funciones para controlar el escáner ---

def initialize_scanner():
    """Inicializa la librería y se conecta al escáner."""
    global zkfp2, is_initialized
    try:
        logging.info("Intentando inicializar la librería ZKFP2...")
        zkfp2 = ZKFP2()
        zkfp2.Init()
        logging.info("Librería inicializada.")
        
        device_count = zkfp2.GetDeviceCount()
        if device_count > 0:
            logging.info(f"Se encontraron {device_count} dispositivos. Conectando al primero...")
            zkfp2.OpenDevice(0)
            is_initialized = True
            logging.info("Escáner conectado y listo para usar.")
            return True
        else:
            logging.warning("No se encontraron escáneres conectados.")
            zkfp2.Terminate()
            return False
    except Exception as e:
        logging.error(f"Error detallado al inicializar el escáner: {e}", exc_info=True)
        return False

def capture_fingerprint():
    """Activa el escáner y captura la huella."""
    global is_initialized, zkfp2
    
    if not is_initialized or not zkfp2:
        # Intentar reinicializar si no está inicializado
        if not initialize_scanner():
            return None, "El escáner no está disponible y no se pudo reinicializar."
    
    try:
        logging.info("Esperando huella...")
        capture = zkfp2.AcquireFingerprint()
        
        if capture:
            template, image = capture
            template_b64 = base64.b64encode(template).decode('utf-8')
            logging.info("Huella capturada exitosamente.")
            return template_b64, None
        else:
            logging.warning("No se pudo capturar la huella (tiempo de espera agotado o error).")
            return None, "No se pudo capturar la huella."
    except Exception as e:
        logging.error(f"Error durante la captura de huella: {e}")
        # Marcar como no inicializado para intentar reinicializar en la próxima captura
        is_initialized = False
        return None, f"Error durante la captura: {str(e)}"

def reconnect_scanner():
    """Intenta reconectar el escáner si se perdió la conexión."""
    global is_initialized, zkfp2
    
    if is_initialized and zkfp2:
        try:
            # Verificar si el dispositivo sigue respondiendo
            device_count = zkfp2.GetDeviceCount()
            if device_count > 0:
                return True
        except:
            pass
    
    # Si llegamos aquí, necesitamos reinicializar
    logging.info("Intentando reconectar el escáner...")
    return initialize_scanner()

def shutdown_scanner():
    """Libera los recursos del escáner al cerrar."""
    if is_initialized and zkfp2:
        zkfp2.Terminate()
        logging.info("Conexión con el escáner terminada.")

# --- Lógica del Servidor de Comunicación (WebSocket) ---

async def process_origin_check(path, request_headers):
    """
    Función simplificada para evitar errores de compatibilidad.
    La verificación de origen se hace en el handler principal.
    """
    # Permitir todas las conexiones inicialmente
    # La verificación de seguridad se hace en el handler
    return None

async def handler(websocket):
    """
    Maneja los mensajes del cliente una vez que la conexión está establecida y verificada.
    """
    client_address = websocket.remote_address
    
    # Verificación de origen en el handler (más confiable)
    try:
        # Obtener el origen de la conexión WebSocket
        origin = websocket.request_headers.get('Origin') if hasattr(websocket, 'request_headers') else None
        
        if origin and origin not in ALLOWED_ORIGINS:
            logging.warning(f"Conexión rechazada desde origen no permitido: {origin}")
            await websocket.close(1008, "Origen no permitido")
            return
            
    except Exception as e:
        logging.warning(f"No se pudo verificar el origen: {e}")
        # Continuar con la conexión si no se puede verificar
    
    logging.info(f"Cliente web conectado exitosamente desde {client_address}")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                command = data.get('command')
                logging.info(f"Comando recibido desde {client_address}: {command}")

                if command == 'CAPTURE_FINGERPRINT':
                    template, error_msg = capture_fingerprint()
                    if template:
                        response = {"status": "success", "template": template}
                    else:
                        response = {"status": "error", "message": error_msg}
                    await websocket.send(json.dumps(response))
                elif command == 'PING':
                    # Comando de ping para mantener la conexión activa
                    await websocket.send(json.dumps({"status": "success", "message": "pong"}))
                elif command == 'SCANNER_STATUS':
                    # Comando para verificar el estado del escáner
                    status = {
                        "initialized": is_initialized,
                        "device_connected": is_initialized and zkfp2 is not None,
                        "message": "Escáner listo" if is_initialized else "Escáner no disponible"
                    }
                    await websocket.send(json.dumps({"status": "success", "data": status}))
                elif command == 'RECONNECT_SCANNER':
                    # Comando para forzar la reconexión del escáner
                    success = reconnect_scanner()
                    response = {
                        "status": "success" if success else "error",
                        "message": "Escáner reconectado" if success else "No se pudo reconectar el escáner"
                    }
                    await websocket.send(json.dumps(response))
                elif command == 'TEST_CONNECTION':
                    # Comando de prueba para verificar la conexión
                    response = {
                        "status": "success",
                        "message": "Conexión WebSocket funcionando correctamente",
                        "timestamp": asyncio.get_event_loop().time(),
                        "client_address": str(client_address)
                    }
                    await websocket.send(json.dumps(response))
                else:
                    await websocket.send(json.dumps({"status": "error", "message": "Comando no reconocido"}))

            except json.JSONDecodeError as e:
                logging.error(f"Error decodificando JSON desde {client_address}: {e}")
                await websocket.send(json.dumps({"status": "error", "message": "Formato JSON inválido"}))
            except Exception as e:
                logging.error(f"Error procesando el mensaje desde {client_address}: {e}")
                await websocket.send(json.dumps({"status": "error", "message": "Error interno en el agente"}))
    
    except websockets.exceptions.ConnectionClosed:
        logging.info(f"Cliente web desconectado: {client_address}")
    except Exception as e:
        logging.error(f"Error inesperado en la conexión con {client_address}: {e}")
    finally:
        logging.info(f"Conexión cerrada con {client_address}")

# --- Función Principal para Iniciar Todo ---

async def main():
    """Inicializa el escáner y arranca el servidor WebSocket."""
    if not initialize_scanner():
        logging.error("El servidor no puede iniciar. Revisa la conexión del escáner y los drivers.")
        return

    # Configuración más robusta del servidor WebSocket
    server = await websockets.serve(
        handler, 
        HOST, 
        PORT, 
        process_request=process_origin_check,
        ping_interval=30,      # Ping cada 30 segundos
        ping_timeout=15,       # Timeout de ping de 15 segundos
        close_timeout=15,      # Timeout de cierre de 15 segundos
        max_size=1024 * 1024,  # Tamaño máximo de mensaje: 1MB
        max_queue=32           # Cola máxima de mensajes
    )
    
    logging.info(f"Servidor WebSocket iniciado en ws://{HOST}:{PORT}")
    logging.info(f"Orígenes permitidos: {ALLOWED_ORIGINS}")
    
    try:
        await asyncio.Future()  # Mantener el servidor corriendo
    except KeyboardInterrupt:
        logging.info("Deteniendo servidor...")
    finally:
        server.close()
        await server.wait_closed()
        logging.info("Servidor detenido.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Servidor detenido.")
    finally:
        shutdown_scanner()