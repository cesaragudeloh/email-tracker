# Email Tracker — activación y control Track email en Gmail

Una base Manifest V3 para Chrome y Edge, con TypeScript, Vite, HTML y CSS.
El popup muestra el estado local de autorización, solicita el código si no existe
un JWT vigente y guarda la respuesta de `POST /api/activate` en `chrome.storage.local`.
No almacena el código ni muestra el JWT. Incluye un cliente de creación de tracking
conectado al intento de Send en Gmail cuando Track email está ON (Milestone 9).

## Estructura

- `src/activation/storage.ts`: UUID persistente, bloqueo entre contextos y token local.
- `src/activation/activationService.ts`: estado y coordinación de activación.
- `src/api/client.ts`: HTTP, validación de respuestas y errores seguros.
- `src/config.ts`: URL central del backend.
- `src/popup/`: formulario, estado y estilos.
- `src/background.ts`: inicialización del almacenamiento y puente de creación de tracking.
- `src/content.ts`: selecciona el proveedor e inicia la detección en Gmail.
- `src/providers/EmailProviderAdapter.ts`: contrato `canHandle`, `start`, `stop` y callback de detección.
- `src/providers/selectProvider.ts`: selecciona Gmail por HTTPS y host exacto; otros sitios quedan sin adapter.
- `src/providers/gmail/`: observer y estrategias DOM centralizadas de Gmail.
- `src/providers/gmail/GmailTrackingControls.ts`: inserción y estado temporal por compose.
- `src/providers/gmail/GmailSendController.ts`: interceptación, bloqueo temporal y reanudación.
- `src/api/trackingMessages.ts`: mensajes internos validados entre Gmail y service worker.
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
Send. Marcarlo solo cambia su estado temporal. Desde el Milestone 9, un intento
de Send con ON crea tracking antes de reanudar el envío; marcar el checkbox por
sí solo no llama al backend. No se insertan píxeles ni se modifica el cuerpo. Outlook
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
ON/OFF. No se mantienen listas fuertes de compose. El controlador de envío
usa listeners delegados de captura, retirados por stop(); las claves débiles
permiten liberar el compose cuando termina cualquier llamada pendiente. Reinsertar el
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

Desde el Milestone 9, Send con Track ON lo invoca a través del worker usando
destinatario/asunto del compose. Gmail no modifica el cuerpo. Los tests unitarios
usan storage y fetch mockeados. Consulta el README raíz para el ejemplo curl,
síntesis local, diseño CREATED y limitación de revocación de JWT de hasta 24 horas.

## Milestone 7: endpoint público del pixel

El backend implementa `GET /o/{trackingId}` sin JWT. Registra cada carga como OPEN
con timestamp, IP observada y User-Agent raw, y entrega un PNG transparente de 1x1.
Una carga no prueba lectura humana: IP y User-Agent pueden ser de proxies. Todavía
no hay geolocalización ni parsing de navegador/dispositivo.

Gmail todavía no inserta el pixel. Desde el Milestone 9 se intercepta Send
para crear el registro, pero no se llama GET /o desde Gmail. El README raíz documenta validación por curl y la política de
resiliencia: tras confirmar EMAIL, un fallo al guardar OPEN devuelve igualmente
200 PNG y puede perder ese evento; un fallo de lectura devuelve 500 seguro.

## Milestone 9: crear tracking antes de Send en Gmail

Track OFF deja pasar Send sin llamar al backend ni impedir el evento. Track ON
extrae el primer destinatario principal válido y el asunto, impide temporalmente
el evento y solicita creación de tracking al service worker. Este reutiliza
`trackingClient.createTracking()` y su configuración, validación y autorización
existentes. El JWT permanece en contextos confiables: el content script no lee
storage ni recibe el token. El puente solo acepta mensajes de la propia extensión,
con esquema estricto, desde el frame principal de `https://mail.google.com`.
No hay mensajes desde la página con postMessage ni scripts inyectados en MAIN.

El resultado `{ trackingId, trackingUrl, createdAt }` queda en un WeakMap por
compose, accesible internamente con `GmailSendController.getTracking()`. No se
persiste. El checkbox existente sigue siendo la única fuente de ON/OFF. No se
lee el cuerpo completo, adjuntos, cookies o credenciales Gmail.

**Todavía NO se inserta el pixel, NO se modifica el body y NO se envía trackingUrl
por correo. Por tanto, todavía NO puede detectarse una apertura de un correo real
enviado con esta integración.** Crear el registro tampoco demuestra que Gmail
haya completado el envío: no se introduce estado SENT.

### Interceptación y reanudación

Se escuchan `click` y `keydown` en fase de captura en window, antes de los handlers
de target/document. Se reutiliza la identificación de Send por atributos de atajo
y fallback Send/Enviar; nunca se reemplaza ni se cambia visualmente el botón.
Se cubre click (incluidos hijos del botón), Enter/Espacio con foco en Send y
Ctrl+Enter/Cmd+Enter dentro del compose reconocido. No hay intervalos ni polling.
Los shortcuts interceptados se reanudan como click del botón Send; no reproducen
un diálogo de configuración específico del shortcut. Otras teclas quedan intactas.

Tras resolver creación, se vuelve a localizar Send (por si Gmail reconstruyó las
acciones) y se ejecuta su click nativo. Una marca isResumingSend permite pasar ese
click sin volver a crear tracking. isCreatingTracking bloquea intentos concurrentes,
incluso si se cambia el toggle a OFF mientras se espera. El estado se comparte
entre instancias de adapter para evitar duplicados por listeners adicionales.
start() es idempotente y stop() retira listeners; una operación ya pendiente termina
su reanudación para no abandonar el intento que había detenido.

Los mismos recipient/subject reutilizan un único intento mientras viva ese compose,
incluso tras un fallo o si Gmail mantiene el borrador por validación, cancelación
o Undo Send. No hay retry automático ni en un segundo click con los mismos datos.
Cambiar recipient/subject inicia un intento nuevo. Para reintentar después de
reactivar sin cambiar datos, se puede abrir un compose nuevo. El backend no tiene
idempotencia: un timeout puede dejar un registro creado cuya respuesta no llegó.

Si los datos cambian o el toggle pasa a OFF mientras se espera, se descarta el
resultado y se reanuda sin tracking. Si el compose se cierra, no se intenta enviar
otro compose. Si Send desaparece o está deshabilitado, se libera el bloqueo y se
emite un warning; el usuario puede volver a usar Send cuando Gmail lo reponga.

### Metadata y errores

El contrato backend exige **un solo email válido**. Se usa el primer To válido,
sin cambiar contratos: chips `email`/`data-hovercard-id` en la región To o en la
fila de `input/textarea[name="to"]`, luego valores de esos campos. Se admiten
valores como `Nombre <email>` y listas separadas por coma/punto y coma, tomando
solo el primer email válido. No se agregan Cc/Bcc ni destinatarios de otros
compose o del editor. Con varios To, el registro describe únicamente al primero;
no representa tracking individual de todos los destinatarios.

Subject se lee de `input[name="subjectbox"]` en ese compose; vacío o ausente da
`""`. Si no se obtiene metadata válida (incluido un asunto fuera del límite del
contrato), no se llama al backend y Gmail conserva su validación/envío habitual.
No se modifica destinatario ni asunto.

**Prioridad: no perder ni bloquear permanentemente el correo.** Sin token, token
expirado, 401, fallo de red/backend o worker no disponible, se reanuda sin tracking.
El cliente limita HTTP a 15 segundos y el controlador limita toda la espera a
20 segundos, incluido storage/mensajería. Al vencer, ignora respuestas tardías;
los temporizadores dependen de la ejecución de JavaScript en el navegador.
No hay reactivación ni loops de retry: un 401 requiere reactivar manualmente más
adelante. Los logs son fijos y no contienen recipient, asunto, cuerpo, JWT ni errores
internos:

```text
Email Tracker: tracking created
Email Tracker: tracking unavailable, sending without tracking
```

### Validación manual del Milestone 9 en Chrome

Compilar desde la raíz con `npm run build`, recargar la extensión en
`chrome://extensions` y recargar Gmail. En esa página de extensiones, abrir
**Inspect views → service worker**: el POST se observa en Network del worker,
no en Network de la pestaña Gmail. El warning/éxito se observa en Console de Gmail.
Usar correos de prueba propios: estos pasos sí envían correo mediante Gmail.

**Caso OFF, sin necesidad de AWS:** abrir compose, poner destinatario válido y
asunto, dejar Track OFF y pulsar Send. Gmail debe enviar normalmente. No debe haber
POST /api/tracking en el worker ni log de creación. Sin backend/activación, probar
ON debe continuar por el fallback; esto no demuestra creación exitosa. Los tests
unitarios usan mocks de creación, runtime, storage y fetch para comprobar el flujo
exitoso offline; no hay bypass de licencia ni backend simulado en el build.

**Caso ON con backend ya desplegado:** configurar VITE_ACTIVATION_API_URL, compilar
y recargar extensión/Gmail, activar la extensión, abrir compose con To válido y
asunto, activar Track y pulsar Send. Verificar un solo POST /api/tracking (201), el
log de creación y envío posterior. Confirmar en backend que se creó EMAIL con
recipient/subject. Probar dos compose distintos y doble click: cada compose debe
crear como máximo un registro para esos datos. No compartir/capturar el header
Authorization al recoger evidencia.

**Caso error:** con autorización local vigente, hacer que el endpoint resulte
inaccesible (p. ej., bloqueo de la URL mediante DevTools del worker). Crear un
compose nuevo, activar Track y pulsar Send. Debe aparecer el warning y Gmail debe
continuar, a más tardar tras la espera limitada; también debe continuar sin token
o con token expirado. No debe haber reintentos automáticos. Restaurar el acceso
al terminar. Gmail puede mostrar sus propios diálogos de asunto vacío o validación.

Comprobar además: Send con asunto vacío, Ctrl/Cmd+Enter, Enter/Espacio sobre Send,
compose ampliado, cierre durante la espera y cambios de idioma. El cuerpo recibido
no debe contener imágenes ni URL añadidas por Email Tracker.

### Límites de la validación y del DOM

No se inspeccionó una sesión de Gmail real durante esta implementación ni se
realizaron envíos reales. Los tests Vitest + jsdom modelan las señales DOM indicadas;
la aceptación de click programático y el orden respecto de listeners internos de
Gmail requieren la comprobación manual anterior. Gmail no publica un contrato DOM:
un handler de captura registrado antes en window o un flujo basado en otros eventos
puede escapar a la interceptación. Un evento no cancelable pasa sin crear tracking.
Si Gmail ignora el click programático, el bloqueo ya está liberado y un nuevo click
manual con los mismos datos pasa directamente.

Se conserva el alcance de compose detectables del adapter: diálogos con subjectbox
y editor. Respuestas inline, envío programado, ventanas con otra estructura y
idiomas sin señales reconocibles no están cubiertos. Si Gmail reutiliza la misma
raíz para otro borrador puede conservar estado; una raíz nueva empieza OFF.
No se implementan Outlook, pixel, historial en popup, geolocalización, parsing,
notificaciones ni link tracking. No se añaden recursos AWS ni se despliega nada.
