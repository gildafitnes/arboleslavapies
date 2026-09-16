# Lavapiés Riega — v0.2.1

Prototipo estático para coordinar cuidado vecinal y memoria del arbolado de Lavapiés / Embajadores.

## Qué funciona ya

- Mapa Leaflet + OpenStreetMap.
- Buscar una dirección o un árbol por ID.
- Geolocalización "cerca de mí".
- Ficha individual de cada árbol.
- Estado vecinal de riego por colores.
- Riego, compromiso, comentario e incidencia como aportaciones.
- Alta de nuevos lugares directamente sobre el mapa.
- Identidad pseudónima opcional con alias único y código secreto.
- Detección automática al día siguiente si dos personas pidieron el mismo alias.
- El segundo usuario conserva su código y sólo tiene que escoger otro alias.
- Consulta aproximada de calle / portal cercano al abrir una ficha.
- Moderación preparada para nuevas ubicaciones.
- Datos públicos separados de solicitudes privadas.

## Importante sobre la identidad

El código secreto se genera en el navegador y se guarda en ese dispositivo. GitHub sólo publica su hash SHA-256. Si dos personas crean el mismo alias antes de una actualización, el procesador acepta la primera solicitud. Cuando la segunda persona vuelva a la web después de la actualización, su navegador verá que ese alias pertenece a otro hash y le pedirá elegir otro nombre, reutilizando el mismo código.

Esto es una identidad comunitaria, no un sistema de seguridad bancaria.

## Probar la web en tu ordenador

Desde la carpeta del proyecto:

```bash
python -m http.server 8000 --directory docs
```

Abre:

```text
http://localhost:8000
```

No abras `index.html` haciendo doble clic: algunas funciones del navegador necesitan que la web se sirva por HTTP.

## Cargar el arbolado real de Embajadores

Windows: doble clic en `ACTUALIZAR_ARBOLES.bat`.

O manualmente:

```bash
python -m pip install -r requirements.txt
python scripts/import_madrid.py --barrio EMBAJADORES --out docs/data/trees.geojson
```

El importador consulta el recurso oficial 2026 del Ayuntamiento de Madrid (`300761-8-arbolado-especies`) y convierte las coordenadas ETRS89 / UTM 30N a latitud / longitud.

## Configurar el correo del proyecto

Edita `docs/config.js`:

```js
projectEmail: "tu-correo@ejemplo.org",
```

Mientras esté vacío, las aportaciones se descargan como JSON para poder probar todo. Cuando pongas un email, la web abre un correo ya rellenado; la persona sólo tiene que pulsar Enviar.

## Procesar solicitudes

Si guardas los JSON recibidos en `submissions/`:

```bash
python scripts/process_submissions.py
```

El script:

1. procesa primero las nuevas identidades;
2. resuelve alias duplicados por orden de entrada;
3. valida los códigos secretos;
4. publica sólo datos saneados en `docs/data/`;
5. elimina los JSON privados después de procesarlos.

Nunca publica el código secreto.

## Subirlo a GitHub Pages

La web pública está dentro de `docs/`, precisamente para usar el modo más sencillo de GitHub Pages:

1. sube esta carpeta completa a un repositorio;
2. ve a **Settings → Pages**;
3. en **Build and deployment**, elige **Deploy from a branch**;
4. rama `main` y carpeta `/docs`;
5. guarda.

No necesita GitHub Actions ni Cloudflare.

## Datos y licencia

Inventario base: Portal de Datos Abiertos del Ayuntamiento de Madrid, conjunto **Arbolado en parques y zonas verdes de Madrid (detalle)**, recurso 2026. Licencia CC BY 4.0. El conjunto fue actualizado el 27/07/2026 y tiene cobertura hasta el 07/07/2026.

OpenStreetMap se usa como cartografía base.
