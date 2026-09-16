# Árboles Lavapiés — v0.3

Mapa vecinal estático para cuidar, documentar y construir una memoria del arbolado de Lavapiés / Embajadores.

## v0.3

- Nombre definitivo: **Árboles Lavapiés**.
- Interfaz en Arial Bold Italic / mayúsculas; textos largos en Arial normal.
- Identidad visible en la cabecera con indicador y panel de árboles habituales, compromisos y actividad.
- Incidencias con categorías para poder ordenarlas automáticamente.
- Sección **¿Qué es?** con fuente municipal, advertencias, versión, revisión y última actualización.
- Guía del jardinerx urbanx y buzón de sugerencias.
- Semana anterior / actual / siguiente en cada árbol.
- Comentarios y respuestas sencillas.
- Archivo fotográfico y preparación de fotos WebP sin EXIF.
- Zoom máximo corregido a 19 para evitar que desaparezca el mapa base.
- Marcadores Canvas más ligeros para los miles de árboles de Embajadores.
- Nuevos lugares, fotos y sugerencias pasan a `pending/` para revisión.

## Correo del proyecto

No tiene que ser Gmail. En `docs/config.js` puedes poner cualquier dirección:

```js
projectEmail: "tu-correo@ejemplo.org",
```

La web usa `mailto:`: abre el cliente de correo del visitante y no depende del proveedor. La automatización que lea tu bandeja por la noche se configurará aparte; por eso conviene decidir el proveedor antes de hacer esa pieza.

## Datos municipales

Windows: ejecuta `ACTUALIZAR_ARBOLES.bat`. El importador descarga Embajadores del inventario oficial del Ayuntamiento y genera `docs/data/trees.geojson`.

## Publicación

GitHub Pages: `main` → `/docs`.
