# Email Tracker — activación de la extensión

Una base Manifest V3 para Chrome y Edge, con TypeScript, Vite, HTML y CSS.
El popup muestra el estado local de autorización, solicita el código si no existe
un JWT vigente y guarda la respuesta de `POST /api/activate` en `chrome.storage.local`.
No almacena el código, no muestra el JWT y no implementa tracking.

## Estructura

- `src/activation/storage.ts`: UUID persistente, bloqueo entre contextos y token local.
- `src/activation/activationService.ts`: estado y coordinación de activación.
- `src/api/client.ts`: HTTP, validación de respuestas y errores seguros.
- `src/config.ts`: URL central del backend.
- `src/popup/`: formulario, estado y estilos.
- `src/background.ts`: inicialización del almacenamiento al iniciar el worker.
- `src/content.ts`: solo registra `Email Tracker extension active` en los tres hosts.
- `public/manifest.json`: base del manifiesto; Vite añade el permiso del host configurado.

## Compilar

Desde la raíz del monorepo:

```sh
npm ci
npm run build
npm run lint
npm test
npm run format:check
```

El paquete compartido debe compilarse antes de compilar este workspace aisladamente.
`dist/` contiene manifiesto, popup, JS/CSS, worker, content script y los chunks
locales que Vite genere. Se carga la carpeta completa. No se necesita servidor Vite.

Copia `.env.example` a `.env.production.local` en este workspace y define
`VITE_ACTIVATION_API_URL` con la URL HTTPS pública de API Gateway cuando exista.
Sin URL configurada, el build de producción sigue siendo instalable pero la
activación responde con un mensaje de servicio no disponible.

Para un backend local que ya esté disponible, `npm run build:development --workspace=@email-tracker/extension` usa `http://localhost:3000` por defecto.
El proyecto no incluye servidor local de activación en este milestone.

## Probar manualmente

1. Compila. Abre `chrome://extensions` o `edge://extensions`.
2. Activa **Developer mode** → **Load unpacked** → selecciona `apps/extension/dist`.
3. Abre **Email Tracker** desde el menú de extensiones.
4. Verifica **Status: Not activated** y un UUID que no cambia al reabrir.
5. Un campo vacío debe mostrar **Enter a valid activation code**.
6. Con backend desplegado y una licencia insertada, introduce su código y pulsa
   **Activate**. Debe mostrar **Status: Activated**, sin exponer el token.
7. Cierra y abre de nuevo para comprobar persistencia. La expiración se revisa
   al abrir, recuperar foco y periódicamente mientras el popup está abierto.
8. Después de cada build, recarga la extensión y las pestañas de correo.

El estado del popup es informativo; el backend debe validar los JWT para autorizar
futuras funcionalidades. Los tokens se restringen a contextos confiables de la
extensión. No existe activación offline ni bypass de desarrollo.

Consulta [la documentación raíz](../../README.md) para crear licencias, variables,
diseño DynamoDB, límites de revocación y comandos de deployment con autorización.
