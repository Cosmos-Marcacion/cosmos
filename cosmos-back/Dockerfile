# Cambiamos de Alpine a Debian Bookworm Slim (Ligero, pero 100% compatible)
FROM node:20-bookworm-slim

# Establecer el directorio de trabajo
WORKDIR /app

# La operacion es en Lima. Las horas criticas ya se convierten de forma
# explicita (common/time/lima.ts), pero el resto del codigo que usa la zona del
# proceso (rangos de fechas del panel, agrupaciones por dia) necesita esto para
# no desplazarse cinco horas.
ENV TZ=America/Lima

# Instalar las librerías gráficas necesarias para Canvas en Debian
# Al usar apt-get, instalamos lo necesario y luego limpiamos la caché para no pesar tanto
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# LibreOffice Calc en modo consola: es quien convierte el formato a PDF.
#
# El PDF no se dibuja, se convierte del mismo .xlsx que se descarga, y para
# renderizarlo igual que Excel hace falta un motor de hoja de cálculo de verdad:
# las plantillas llevan 3 MB de imágenes, 1500 celdas combinadas, áreas de
# impresión y una escala de página distinta por hoja.
#
# `--no-install-recommends` evita arrastrar el escritorio entero (Java incluido)
# y deja la capa en torno a 400 MB en vez de más de 1 GB.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libreoffice-calc \
    libreoffice-core \
    && rm -rf /var/lib/apt/lists/*

# Fuentes. Las plantillas usan Calibri, Arial, Arial Narrow, Times New Roman,
# Verdana, Tahoma, Wingdings, Agency FB y Arial Nova Cond Light. Debian no trae
# ninguna: sin esto, LibreOffice sustituye por su cuenta y cambian los anchos y
# los saltos de línea justo en las dos hojas más cargadas (CHARLA lleva 350
# celdas en Arial Nova Cond Light y ASISTENCIA 265 entre Arial Narrow y Agency
# FB), además de los símbolos de casilla del ATS, que van en Wingdings.
#
# Estos paquetes son métricamente compatibles: Carlito ocupa exactamente lo que
# Calibri, Caladea lo que Cambria y Liberation lo que Arial y Times.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    fonts-liberation \
    fonts-liberation2 \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Fuentes propias, opcionales. Agency FB y Arial Nova Cond Light no tienen
# equivalente libre, así que si se dispone de licencia basta con dejar los .ttf
# en `fonts/` y se instalan aquí. Sin esa carpeta la imagen se construye igual.
COPY fonts/ /usr/local/share/fonts/cosmos/
RUN fc-cache -f && fc-list | wc -l

# Copiar los archivos de dependencias
COPY package*.json ./

# `npm ci` y no `npm install`: instala exactamente el arbol del lock, el mismo
# que pasaron los gates de calidad.
RUN npm ci

# Copiar el resto del código
COPY . .

# Compilar y quitar las dependencias de desarrollo, que no se usan en marcha.
RUN npm run build && npm prune --omit=dev && npm cache clean --force

# El puerto lo decide PORT. Azure Container Apps espera el 3000 (target-port);
# Coolify fija el suyo en el .env.
ENV NODE_ENV=production
EXPOSE 3000

# Sin privilegios de root. La API solo escribe en el temporal del sistema
# (conversion a PDF), y LibreOffice y fontconfig usan el HOME de `node`.
USER node

# `node` directo y no `npm run start:prod`: npm no reenvia SIGTERM al proceso,
# y sin la senal la API no puede cerrar con calma al retirarse una revision.
CMD ["node", "dist/main"]
