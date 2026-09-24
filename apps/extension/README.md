# Email Tracker — activación y detección de compose en Gmail

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
- `src/content.ts`: selecciona el proveedor e inicia la detección en Gmail.
- `src/providers/EmailProviderAdapter.ts`: contrato `canHandle`, `start`, `stop` y callback de detección.
- `src/providers/selectProvider.ts`: selecciona Gmail por HTTPS y host exacto; otros sitios quedan sin adapter.
- `src/providers/gmail/`: observer y estrategias DOM centralizadas de Gmail.
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

## Milestone 4: GmailAdapter

La detección funciona con estado `Activated` o `Not activated`. Solo notifica
ventanas de composición; no modifica el DOM, el cuerpo ni ningún correo, no
intercepta Send, no extrae destinatarios y no llama al backend. Outlook mantiene
el mensaje inicial del content script, sin adapter.

`GmailAdapter` recibe el documento y un callback. Al iniciar hace un escaneo inicial
y mantiene un único `MutationObserver` sobre el documento para altas de nodos y
cambios de los atributos `role`, `name` y `contenteditable`. Revisa los subárboles
añadidos y sus diálogos contenedores, sin recorrer todo el documento en cada
mutación, sin polling y sin observar cada pulsación de texto. Esto permite detectar
compose existentes, simultáneos y abiertos más tarde, también cuando Gmail monta
los controles por etapas. `stop()` desconecta el observer y descarta sus pendientes;
`start()` es idempotente y permite reiniciarlo.

Un `WeakSet` recuerda cada elemento de diálogo durante la vida del adapter. Editar,
mover, minimizar o reinsertar el mismo elemento no produce otra notificación.
Cerrar un compose y abrir otro con un nuevo elemento genera otra detección.
El log de validación es fijo, una vez por elemento, sin contenido ni datos sensibles:

```text
Email Tracker: Gmail compose detected
```

### Selectores y límites

Todas las estrategias están en `src/providers/gmail/gmailSelectors.ts`:

- Contenedor: `[role="dialog"]`.
- Asunto: `input[name="subjectbox"]` dentro del mismo diálogo.
- Editor: `[role="textbox"][contenteditable="true"]` dentro del mismo diálogo.

Se exige la combinación de las tres señales. No se depende de clases ofuscadas
ni de etiquetas traducidas. `subjectbox` es un nombre interno que Gmail puede
cambiar; Gmail no ofrece un contrato público de su DOM. Variantes sin estas
señales, respuestas inline y redacción en otra ventana del navegador con estructura
distinta no están cubiertas. No se comprueba visibilidad: un compose montado pero
oculto puede notificarse. Si Gmail reutiliza exactamente el mismo elemento de
diálogo para otro compose, no habrá una segunda notificación. Si faltan señales,
el adapter sigue observando sin notificar.

Los tests Vitest + jsdom usan fixtures pequeños para verificar el comportamiento;
no sustituyen la comprobación manual contra Gmail real. No se incluyen E2E.

### Validación manual en Chrome

1. Desde la raíz, ejecuta `npm run build`.
2. Abre `chrome://extensions` y recarga **Email Tracker**. Si aún no está cargada,
   activa **Developer mode**, pulsa **Load unpacked** y selecciona `apps/extension/dist`.
3. Abre o recarga Gmail Web (`https://mail.google.com/`); recargar la extensión no
   actualiza el content script de una pestaña que ya estaba abierta.
4. Abre DevTools → **Console**, habilita mensajes de nivel **Info** y filtra por
   `Email Tracker`. Comprueba el mensaje inicial `Email Tracker extension active`.
5. Crea un correo nuevo y verifica `Email Tracker: Gmail compose detected`.
6. Abre una segunda ventana de redacción manteniendo la primera. Debe haber una
   detección por cada ventana; Chrome puede agrupar los mensajes iguales con un contador.
7. Escribe en asunto y cuerpo, cambia el foco y realiza otras acciones. El número
   de detecciones de esas ventanas debe permanecer estable.
8. Cierra una ventana, abre otra nueva y comprueba una nueva detección.
9. Espera varios minutos y abre otro compose: también debe detectarse.
10. Para verificar el escaneo inicial, deja un compose abierto y recarga Gmail;
    cuando Gmail restaure el compose debe aparecer su detección.

No hace falta activar la licencia ni enviar correos. Edge permite el mismo flujo
desde `edge://extensions`. La validación real en ambos navegadores es manual.
