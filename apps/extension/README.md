# Email Tracker — activación y control Track email en Gmail

Una base Manifest V3 para Chrome y Edge, con TypeScript, Vite, HTML y CSS.
El popup muestra el estado local de autorización, solicita el código si no existe
un JWT vigente y guarda la respuesta de `POST /api/activate` en `chrome.storage.local`.
No almacena el código ni muestra el JWT. Incluye un cliente de creación de tracking
sin conexión todavía con Gmail.

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
- `src/providers/gmail/GmailTrackingControls.ts`: inserción y estado temporal por compose.
- `src/ui/TrackingToggle.ts` y `.css`: checkbox accesible y estilos encapsulados.
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
`POST /api/tracking`. Los tokens se restringen a contextos confiables de la
extensión. No existe activación offline ni bypass de desarrollo.

Consulta [la documentación raíz](../../README.md) para crear licencias, variables,
diseño DynamoDB, límites de revocación y comandos de deployment con autorización.

## Milestone 5: GmailAdapter y Track email

La detección y el control visual funcionan con estado `Activated` o `Not activated`.
Cada compose recibe un checkbox **Track email**, inicialmente **OFF**, cerca de
Send. Marcarlo solo cambia su estado temporal: todavía no hace tracking real, no
crea IDs, no llama APIs de tracking, no inserta píxeles, no modifica el contenido
del correo ni intercepta Send. Tampoco extrae asunto ni destinatarios. Outlook
mantiene el mensaje inicial del content script, sin adapter.

`GmailAdapter` recibe el documento y un callback. Al iniciar hace un escaneo inicial
y mantiene un único `MutationObserver` sobre el documento para altas de nodos y
cambios de los atributos `role`, `name`, `contenteditable`, `aria-label` y
`data-tooltip`. Revisa los subárboles
añadidos y sus diálogos contenedores, sin recorrer todo el documento en cada
mutación, sin polling y sin observar cada pulsación de texto. Esto permite detectar
compose existentes, simultáneos y abiertos más tarde, también cuando Gmail monta
los controles por etapas. `stop()` desconecta el observer y descarta sus pendientes;
`start()` es idempotente y permite reiniciarlo. También reintenta colocar el control
cuando aparecen las acciones, sin crear un observer adicional.

`GmailTrackingControls` guarda los controles en un `WeakMap` por elemento de
compose. El checkbox es la fuente de su estado; cambiar uno no afecta los demás.
No se persiste en `chrome.storage` ni sobrevive a una recarga de Gmail. Si Gmail
reconstruye el área de acciones, se vuelve a insertar el mismo control conservando
ON/OFF. No se mantienen listas fuertes de compose ni listeners globales: al retirar
un compose, su control, listener y estado pueden liberarse con él. Reinsertar el
mismo elemento conserva su estado; abrir otro elemento nuevo empieza OFF.

El componente usa un input checkbox nativo dentro de su label: Tab permite llegar
al control y Espacio lo activa/desactiva. Los estilos y el input están dentro de un
Shadow DOM y todas las clases usan el prefijo `email-tracker-toggle`. El CSS se
empaqueta como texto en `content.js`, sin necesitar cambios de manifiesto ni Vite.
El control utiliza colores de sistema con fondo propio para mantener contraste
en temas claros y oscuros.

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
- Acciones: botones nativos o `[role="button"]` con `data-tooltip` o `aria-label`.

Para encontrar Send se prefiere el atajo Ctrl/Control/Cmd/Command/⌘ + Enter/Return
en esos atributos, eliminando marcas Unicode de dirección. No depende del texto
visible ni exclusivamente de la palabra inglesa Send. El fallback admite etiquetas
exactas `Send` o `Enviar`, con un atajo opcional entre paréntesis. Si no reconoce
ninguna señal, no adivina y sigue esperando mutaciones.

Se añade el control al final de la celda `td` de Send, fuera de su grupo de botones.
En layouts sin tabla se inserta después de `[role="group"]` o del propio botón,
dentro de su contenedor. No mueve ni reemplaza elementos nativos. Rechaza posiciones
dentro del editor, botones, contenedores que contienen el editor, raíces de diálogo
y estructuras de tabla donde no sería válido insertar el control. Los selectores
y la estrategia de ubicación están aislados en `gmailSelectors.ts`.

Se exige la combinación de las tres señales. No se depende de clases ofuscadas
ni de etiquetas traducidas. `subjectbox` es un nombre interno que Gmail puede
cambiar; Gmail no ofrece un contrato público de su DOM. Variantes sin estas
señales, respuestas inline y redacción en otra ventana del navegador con estructura
distinta no están cubiertas. No se comprueba visibilidad: un compose montado pero
oculto puede notificarse. Si Gmail reutiliza exactamente el mismo elemento de
diálogo para otro compose, no habrá una segunda notificación y puede conservar el
estado anterior. Si faltan señales, el adapter sigue observando sin insertar.

Los atributos del atajo, `td` y la estructura del grupo tampoco son un contrato
público. Otros idiomas sin un atajo reconocible, formatos distintos de atajo o
cambios de Gmail pueden impedir la inserción. El control ocupa espacio adicional:
en compose estrechos puede desplazarse a otra línea. El color sigue el esquema del
navegador/sistema, que puede diferir del tema de Gmail, manteniendo un fondo propio.
La colocación, los temas y el teclado requieren validación visual en Gmail real.

Los tests Vitest + jsdom usan fixtures pequeños para verificar el comportamiento;
no sustituyen la comprobación manual contra Gmail real. No se incluyen E2E.

### Validación manual en Chrome

1. Desde la raíz, ejecuta `npm run build`.
2. Abre `chrome://extensions` y recarga **Email Tracker**. Si aún no está cargada,
   activa **Developer mode**, pulsa **Load unpacked** y selecciona `apps/extension/dist`.
3. Abre o recarga Gmail Web (`https://mail.google.com/`); recargar la extensión no
   actualiza el content script de una pestaña que ya estaba abierta.
4. Abre un compose nuevo. Debe aparecer un único **Track email** cerca de Send,
   desmarcado (OFF).
5. Actívalo y desactívalo pulsando el checkbox o su texto. Comprueba también Tab y
   Espacio; el foco debe ser visible y el checkbox debe cambiar sin enviar nada.
6. Deja el primero ON y abre otro compose: el segundo debe empezar OFF. Cambiar el
   segundo no debe cambiar el primero.
7. Escribe asunto y cuerpo, adjunta un archivo de prueba y abre/cierra paneles del
   compose. Debe seguir existiendo solo un control por compose, con el mismo estado.
8. Cierra un compose y abre uno nuevo: debe aparecer un único control OFF.
9. Repite con tema claro y oscuro, y con compose estrecho o ampliado. Comprueba que
   Send y sus opciones siguen visibles y utilizables, sin pulsar Send.
10. Deja un compose abierto y recarga Gmail: al restaurarlo debe tener un único
    control OFF. Opcionalmente comprueba el log de detección en DevTools → Console;
    no se registran cambios del toggle ni contenido del correo.

No hace falta activar la licencia ni enviar correos. Edge permite el mismo flujo
desde `edge://extensions`. La validación real en ambos navegadores es manual.

## Milestone 6: cliente de tracking

`src/api/trackingClient.ts` expone `createTrackingClient().createTracking({ recipient,
subject })` para popup o service worker. Reutiliza `config.apiBaseUrl` (configurada
con `VITE_ACTIVATION_API_URL`) y el storage de activación; obtiene el JWT y envía
`Authorization: Bearer` a `POST /api/tracking`. Sin autorización local vigente no
hace fetch. Los contratos request/response se validan con el paquete shared.

Devuelve `{ trackingId, trackingUrl, createdAt }`; `trackingUrl` apunta al pixel público implementado en el Milestone 7;
el dominio de producción requiere configuración externa al milestone. Un 401 solicita reactivación; errores de validación,
red o backend se convierten en mensajes seguros. El backend verifica la firma y
expiración: el estado local nunca concede permisos por sí mismo.

Este cliente no se invoca automáticamente y no está conectado al checkbox ni a
Send. Gmail no extrae destinatario/asunto ni modifica el correo. Los tests unitarios
usan storage y fetch mockeados. Consulta el README raíz para el ejemplo curl,
síntesis local, diseño CREATED y limitación de revocación de JWT de hasta 24 horas.

## Milestone 7: endpoint público del pixel

El backend implementa `GET /o/{trackingId}` sin JWT. Registra cada carga como OPEN
con timestamp, IP observada y User-Agent raw, y entrega un PNG transparente de 1x1.
Una carga no prueba lectura humana: IP y User-Agent pueden ser de proxies. Todavía
no hay geolocalización ni parsing de navegador/dispositivo.

No cambia la extensión: Gmail no inserta el pixel, no intercepta Send y el checkbox
no llama APIs. El README raíz documenta validación por curl y la política de
resiliencia: tras confirmar EMAIL, un fallo al guardar OPEN devuelve igualmente
200 PNG y puede perder ese evento; un fallo de lectura devuelve 500 seguro.
