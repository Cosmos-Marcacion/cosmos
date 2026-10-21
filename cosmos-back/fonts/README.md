# Fuentes propias del formato

Las plantillas de Cosmos usan fuentes de Office que Debian no distribuye. La
imagen instala equivalentes metricamente compatibles (Liberation, Carlito,
Caladea), que ocupan lo mismo pero no dibujan igual, y para dos de ellas no hay
equivalente ninguno:

| Fuente                 | Donde se nota            | Sustituto libre        |
|------------------------|--------------------------|------------------------|
| Arial Nova Cond Light  | CHARLA, 350 celdas       | no hay                 |
| Agency FB              | ASISTENCIA, 104 celdas   | no hay                 |
| Arial Narrow           | ASISTENCIA, 161 celdas   | Liberation Sans Narrow |
| Wingdings              | ATS, 20 casillas         | aproximado             |
| Calibri, Arial, Times  | todo el libro            | Carlito, Liberation    |

Para que el PDF salga identico al que imprime Excel, deja aqui los `.ttf`
correspondientes, copiados de una maquina con licencia de Office, y reconstruye
la imagen. Se instalan solos: el `Dockerfile` copia esta carpeta a
`/usr/local/share/fonts/cosmos/` y refresca la cache.

Sin ellos el formato sale completo y con los datos correctos, pero los anchos y
los saltos de linea de esas dos hojas no coinciden exactamente con el original.

Los ficheros de fuente no se versionan: son material licenciado.
