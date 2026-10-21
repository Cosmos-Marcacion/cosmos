# Respaldo logico de la base a Blob Storage, como Container Apps Job.
#
# La imagen oficial de Mongo ya trae mongodump y mongosh. La version mayor debe
# coincidir con la del servidor: se fija con --build-arg MONGO_TAG=<n>.
ARG MONGO_TAG=7
FROM mongo:${MONGO_TAG}

# curl y jq para pedir el token de la identidad administrada y subir el fichero
# por la API REST de Blob. Sin azcopy: su inicio de sesion por MSI usa el
# endpoint de maquinas virtuales, no el que Container Apps expone.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl jq ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backup.sh /backup.sh
ENTRYPOINT ["sh", "/backup.sh"]
