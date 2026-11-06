# shellcheck shell=bash
# Funciones comunes de migrar-datos.sh y migrar-archivos.sh. No se ejecuta solo.
#
# Quien lo carga define: paso, info, error, TMP, y para el firewall RG y DB.

HERR="${HERR:-$HOME/.local/mongo}"     # mongodump, mongorestore y mongosh
REGLA=""                               # regla temporal abierta en DocumentDB

# Cambia la base de una URI de Mongo, conservando credenciales y opciones.
#   con_base <uri> <base>   (base vacia: sin base, autentica contra admin)
con_base() {
  local u="$1" q="" pre scheme resto hosts
  pre="${u%%\?*}"
  [[ "$u" == *\?* ]] && q="?${u#*\?}"
  scheme="${pre%%://*}://"
  resto="${pre#*://}"
  hosts="${resto%%/*}"
  printf '%s%s/%s%s' "$scheme" "$hosts" "$2" "$q"
}

# Host de una URI, sin credenciales, para mostrarlo.
host_de() { local r="${1#*://}"; r="${r#*@}"; echo "${r%%[/?]*}"; }

ping_mongo() { # <uri>
  timeout 40 "$HERR/bin/mongosh" "$1" --quiet --eval 'db.runCommand({ ping: 1 }).ok' 2> /dev/null | grep -qx 1
}

ip_publica() { curl -fsS https://api.ipify.org; }

# Instala mongodump/mongorestore y mongosh en $HERR (Cloud Shell no los trae
# ni tiene Docker). Toma la ultima version publicada y comprueba el checksum.
herramientas() {
  paso "Herramientas de Mongo"
  mkdir -p "$HERR/bin"
  if ! "$HERR/bin/mongodump" --version > /dev/null 2>&1; then
    local json url sha d ok=0
    json=$(curl -fsS https://downloads.mongodb.org/tools/db/release.json)
    # Cloud Shell es Azure Linux; se prueban varias compilaciones hasta que una arranque.
    for d in rhel93 rhel88 amazon2023 rhel10 ubuntu2204; do
      url=$(jq -r --arg d "$d" '.versions[0].downloads[] | select(.name==$d and .arch=="x86_64") | .archive.url' <<< "$json")
      sha=$(jq -r --arg d "$d" '.versions[0].downloads[] | select(.name==$d and .arch=="x86_64") | .archive.sha256' <<< "$json")
      [ -n "$url" ] || continue
      info "Probando $(basename "$url")"
      curl -fsSL "$url" -o "$TMP/tools.tgz"
      echo "$sha  $TMP/tools.tgz" | sha256sum -c --quiet - || error "checksum incorrecto de $url"
      rm -rf "$TMP/tools" && mkdir -p "$TMP/tools"
      tar -xzf "$TMP/tools.tgz" -C "$TMP/tools" --strip-components=1
      if "$TMP/tools/bin/mongodump" --version > /dev/null 2>&1; then
        cp "$TMP/tools/bin/"* "$HERR/bin/"; ok=1; break
      fi
    done
    [ "$ok" = 1 ] || error "ninguna compilacion de mongodb-database-tools arranca en esta Cloud Shell"
  fi
  if ! "$HERR/bin/mongosh" --version > /dev/null 2>&1; then
    local json url sha
    json=$(curl -fsS https://downloads.mongodb.com/compass/mongosh.json)
    url=$(jq -r '.versions[0].downloads[] | select(.archive.url | endswith("-linux-x64.tgz")) | .archive.url' <<< "$json" | head -1)
    sha=$(jq -r '.versions[0].downloads[] | select(.archive.url | endswith("-linux-x64.tgz")) | .archive.sha256' <<< "$json" | head -1)
    [ -n "$url" ] || error "no se encontro mongosh para linux-x64"
    info "Descargando $(basename "$url")"
    curl -fsSL "$url" -o "$TMP/mongosh.tgz"
    echo "$sha  $TMP/mongosh.tgz" | sha256sum -c --quiet - || error "checksum incorrecto de $url"
    mkdir -p "$TMP/mongosh"
    tar -xzf "$TMP/mongosh.tgz" -C "$TMP/mongosh" --strip-components=1
    cp "$TMP/mongosh/bin/"* "$HERR/bin/"
  fi
  info "mongodump $("$HERR/bin/mongodump" --version | head -1 | awk '{print $NF}'), mongosh $("$HERR/bin/mongosh" --version)"
}

# Abre una IP en el firewall de DocumentDB ($RG/$DB) y espera a que la base
# responda en <uri>. Se cierra con cerrar_firewall (llamarlo en el trap EXIT).
abrir_firewall() { # <ip> <uri-de-prueba>
  local regla i
  regla="$DB/tmp-migracion-$(echo "$1" | tr . -)"
  az resource create -g "$RG" --resource-type Microsoft.DocumentDB/mongoClusters/firewallRules \
    -n "$regla" --api-version 2025-09-01 -o none \
    -p "{\"properties\":{\"startIpAddress\":\"$1\",\"endIpAddress\":\"$1\"}}"
  REGLA="$regla"
  info "Firewall de $DB abierto a $1 (se cierra al terminar)."
  for i in $(seq 1 18); do
    ping_mongo "$2" && { info "DocumentDB responde."; return 0; }
    sleep 10
  done
  error "DocumentDB $DB no responde desde $1"
}

cerrar_firewall() {
  [ -n "$REGLA" ] || return 0
  az resource delete -g "$RG" --resource-type Microsoft.DocumentDB/mongoClusters/firewallRules \
    -n "$REGLA" --api-version 2025-09-01 -o none 2> /dev/null \
    && echo "   Firewall de $DB cerrado." \
    || echo "   AVISO: no se pudo cerrar la regla $REGLA de $DB. Borrarla en el portal (Networking)."
  REGLA=""
}
