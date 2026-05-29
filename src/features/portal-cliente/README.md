# Portal del cliente

Experiencia que ve el **cliente vendedor** (no el asesor).

## Hecho (Incremento 3)

- `SeguimientoCliente.tsx` — vista de **solo lectura** del expediente del
  cliente: etapa actual, avance del trámite y contacto. NO muestra notas
  internas, saldos ni otros expedientes.
- Acceso por **enlace privado** con token aleatorio: `/seguimiento/[token]`
  (la ruta está en `src/app/seguimiento/[token]/`). El admin copia ese enlace
  desde el detalle del expediente y se lo comparte al cliente (ej. WhatsApp).

## Futuro

- Login/seguridad real del cliente (hoy el acceso es solo por enlace).
- Subida de documentos y notificaciones.
