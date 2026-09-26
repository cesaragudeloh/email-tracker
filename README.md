# Email Tracker

Extensión Chromium para Google Chrome y Microsoft Edge. El Milestone 10 conecta Send de Gmail con creación de tracking e inserción del pixel cuando Track email
está ON, sobre la consulta protegida, historial, pixel público y activación existentes. El popup obtiene una autorización firmada
por el backend antes de mostrar `Activated`. Una carga del pixel registra una apertura detectada; Gmail añade el pixel antes de reanudar Send; la validación manual real está pendiente.

## Arquitectura implementada

```text
Popup de la extensión → POST /api/activate → API Gateway HTTP API
                                             ↓
                                      Activation Lambda
                                        ↙          ↘
                                  DynamoDB      Secrets Manager

Cliente de extensión → POST /api/tracking → CreateTracking Lambda
                                           (verifica JWT)
                                                 ↓
                                      DynamoDB EmailTracking
                                                 ↑
Cliente de extensión → GET /api/tracking/{trackingId} → GetTracking Lambda
                                                  (JWT + ownership por licencia)
```

- `apps/extension`: Manifest V3, TypeScript strict, Vite, HTML y CSS, sin React.
- `services/tracking-api`: handler, servicio, repositorio DynamoDB, firma JWT y CLI.
- `packages/shared`: contratos Zod, normalización y tipos compartidos.
- `infrastructure/cdk`: dos tablas, un secreto, cuatro Lambdas Node.js 22 y cuatro rutas HTTP.
- Herramientas: Node.js 24 y npm 11 para desarrollo, ESLint, Prettier y Vitest.

La infraestructura está preparada, **no desplegada**. No se configura dominio,
certificado, authorizer externo ni Cognito. La creación y consulta de tracking verifican JWT en Lambda; el pixel es público.

## Instalación y validación local

Desde la raíz:

```sh
npm ci
npm run build
npm run lint
npm test
npm run format:check
```

El build compila primero el paquete compartido, genera la extensión instalable en
`apps/extension/dist`, empaqueta la Lambda y compila CDK. No necesita credenciales
AWS. `npm run format` aplica el formato; conserva `AGENTS.md` sin cambios.

Vitest ejecuta tests unitarios con mocks de DynamoDB, Secrets Manager, `fetch` y
`chrome.storage`. También comprueba firma/expiración de JWT y plantillas CDK.
Los tests resuelven el código fuente compartido y pueden ejecutarse antes del build.
No se usan E2E ni se contacta AWS durante los tests.

Para sintetizar CloudFormation localmente, después del build:

```sh
npm run synth --workspace=@email-tracker/cdk -- --no-lookups
```

Esto genera `infrastructure/cdk/cdk.out/`; no crea recursos. La Lambda se empaqueta
con esbuild y sus dependencias, sin Docker ni bundling remoto durante la síntesis.

## Flujo de activación

1. La extensión crea `installationId` con `crypto.randomUUID()` y lo guarda en
   `chrome.storage.local`. Web Locks serializa la creación entre popup y worker.
2. Al abrir el popup se consulta la autorización local. Un token ausente,
   malformado, expirado o de otra instalación produce `Not activated`.
3. El usuario introduce un código. El cliente envía JSON a `POST /api/activate`.
4. Zod valida UUID y código; se normaliza con `trim().toUpperCase()` y se calcula
   SHA-256. Se aceptan 8–128 caracteres ASCII alfanuméricos, con guiones o guiones
   bajos entre grupos. No se requiere un prefijo visual específico.
5. El backend comprueba existencia, estado `ACTIVE`, expiración y cupos. Una
   instalación ya activa puede reactivarse sin incrementar el contador.
6. Una transacción comprueba de nuevo la licencia y registra la instalación; las
   condiciones evitan superar `maxDevices` incluso ante peticiones simultáneas.
7. La Lambda firma el JWT y solo entrega el resultado después de confirmar el
   registro. La extensión almacena la autorización, nunca el código, y muestra
   `Activated`. El campo del código se limpia al enviarlo.

El endpoint devuelve `{ status, accessToken, expiresIn, licenseId, installationId }`.
Errores: 400 `INVALID_REQUEST`; 403 `INVALID_CODE`, `LICENSE_REVOKED`,
`LICENSE_EXPIRED`, `DEVICE_LIMIT_REACHED` o `INSTALLATION_REVOKED`; 500
`SERVICE_UNAVAILABLE`. Las respuestas incluyen `Cache-Control: no-store`.
No se devuelven errores AWS, hashes ni stack traces.

Los logs de Lambda contienen solo requestId, installationId validado, licenseId
cuando se conoce y el resultado; nunca códigos, hashes, tokens o secretos.

## Diseño DynamoDB

La tabla de licencias tiene claves string `PK`/`SK`, capacidad bajo demanda y retención al retirar
el stack. No utiliza Scan ni GSI:

| Registro          | PK                    | SK                    | Atributos principales                                                                                         |
| ----------------- | --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Búsqueda por hash | `CODE#<sha256>`       | `LOOKUP`              | `licenseId`                                                                                                   |
| Licencia          | `LICENSE#<licenseId>` | `LICENSE`             | `licenseId`, `activationCodeHash`, `status`, `maxDevices`, `activeDevices`, `createdAt`, `expiresAt` opcional |
| Instalación       | `LICENSE#<licenseId>` | `INSTALLATION#<uuid>` | `installationId`, `status`, `activatedAt`, `lastSeenAt`                                                       |

El registro de búsqueda permite dos `GetItem` consistentes para encontrar la
licencia. El CLI crea búsqueda y licencia atómicamente, evitando duplicados. Los
estados son `ACTIVE` y `REVOKED`. Las fechas descriptivas son ISO UTC; `expiresAt`
es epoch en **segundos**, no milisegundos. No se habilita TTL de DynamoDB: expirar
una licencia no debe borrar su historial de autorización.

Una instalación nueva usa `TransactWriteItems`: incremento condicionado a
`activeDevices < maxDevices` y alta con `attribute_not_exists(PK)`. La reactivación
comprueba licencia e instalación activas y solo actualiza `lastSeenAt`. Los
conflictos se releen y reintentan de forma acotada. No hay liberación automática de
cupos ni interfaz administrativa de revocación; no modificar contadores de forma
independiente. Revocar una licencia mediante su campo `status` bloquea nuevas
activaciones y reactivaciones.

## JWT y límites de la autorización local

Se usa `jose`, HS256, `iss=email-tracker`, `aud=email-tracker-extension` y claims
`licenseId`, `installationId`, `iat`, `exp`. La duración predeterminada es 86400
segundos, configurable entre 1 y 86400, y nunca supera la expiración de la licencia.

Secrets Manager genera un secreto JSON `{ "signingKey": "..." }` de 64 caracteres;
Lambda recibe únicamente su ARN y obtiene el valor con `GetSecretValue`. No se
incluye ningún secreto en el repositorio, el manifiesto o la extensión.

El estado local decodifica claims para la UI: **no verifica la firma ni concede
permisos backend**. No se guarda un booleano `isActivated` como autoridad. El acceso
a `chrome.storage.local` se restringe a `TRUSTED_CONTEXTS`, excluyendo content
scripts. El JWT es un bearer token local, no un vínculo criptográfico al dispositivo.
Borrar datos o reinstalar puede crear otro UUID y consumir otro cupo.

La utilidad backend `verifyToken` comprueba firma, algoritmo, issuer, audience y
expiración y claims; se reutiliza en `POST /api/tracking`.
La revocación no invalida automáticamente un JWT ya emitido: el endpoint de tracking no consulta el estado de la licencia y acepta el token hasta `exp` (hasta 24 horas). El popup puede continuar
mostrando `Activated` hasta esa expiración. No existe renovación automática.

## Crear licencias

Después de `npm run build`, preparar una licencia **sin contactar AWS**:

```sh
npm run license:create -- --max-devices 2
```

Opcionalmente añade `--expires-at 2027-12-31T23:59:59Z` (debe ser una fecha futura).
El CLI muestra el código una sola vez y los dos objetos listos para insertar,
con el hash únicamente. El código tiene 192 bits aleatorios. Conserva y entrega el
código de forma privada; no redirijas la salida a archivos, logs ni al repositorio.
El modo de preparación no inserta nada y no permite activar todavía.

Con el backend desplegado, credenciales AWS del administrador y el nombre real de
la tabla obtenido del output `LicenseTableName`:

```sh
npm run license:create -- --max-devices 2 --table NOMBRE_REAL_TABLA --write
```

El SDK usa la cadena habitual de credenciales (`AWS_PROFILE`, `AWS_REGION`, etc.).
El usuario administrativo necesita `dynamodb:PutItem` sobre esa tabla para los dos
Put transaccionales. El CLI no concede permisos ni configura credenciales. Solo
muestra el código tras confirmar la escritura; si falla, termina con error genérico.

## Configuración

| Variable/configuración      | Lugar                                         | Uso                                                       |
| --------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `VITE_ACTIVATION_API_URL`   | `apps/extension/.env.production.local`        | URL pública del output `ApiUrl`, sin `/api/activate`      |
| `VITE_ACTIVATION_API_URL`   | `.env.development.local` dentro del workspace | URL de desarrollo; predeterminado `http://localhost:3000` |
| `LICENSE_TABLE_NAME`        | Entorno Lambda, asignado por CDK              | Tabla de licencias                                        |
| `JWT_SECRET_ARN`            | Entorno Lambda, asignado por CDK              | ARN, nunca valor del secreto                              |
| `JWT_TTL_SECONDS`           | Entorno Lambda, asignado por CDK              | Duración JWT                                              |
| `jwtTtlSeconds`             | Contexto CDK (`-c jwtTtlSeconds=3600`)        | Configura la duración al sintetizar/desplegar             |
| `AWS_PROFILE`, `AWS_REGION` | Shell administrativo                          | Cuenta y región para operaciones AWS                      |

El build de producción sin URL es instalable y muestra `Not activated`; al intentar
activar muestra `Activation service unavailable`. No tiene backend ficticio.
Al definir una URL HTTPS, el build genera un permiso de host limitado a ese origen.
La URL se centraliza en `src/config.ts`. HTTP solo se acepta para localhost en modo
development. La extensión no necesita CORS abierto gracias al permiso de host.

```sh
npm run build:development --workspace=@email-tracker/extension
```

Este comando configura localhost, pero **no inicia un servidor**: no se implementa
un backend local ni un emulador AWS en este milestone.

## Deployment futuro — solo con autorización explícita

Estos comandos **crean o modifican recursos AWS** y no forman parte de la validación
local. Antes, configura la cuenta y región deseadas. El stack utiliza permisos
DynamoDB específicos sobre su tabla (`GetItem`, `PutItem`, `UpdateItem`,
`ConditionCheckItem`), `GetSecretValue` sobre su secreto y escritura sobre su grupo
de logs. La API tiene throttling básico; no se registra el cuerpo de peticiones.

```sh
npm run build
npm run synth --workspace=@email-tracker/cdk -- --no-lookups
# Solo si la cuenta/región aún no está preparada para CDK:
npm run bootstrap --workspace=@email-tracker/cdk -- aws://CUENTA/REGION
npm run deploy --workspace=@email-tracker/cdk -- -c jwtTtlSeconds=86400
```

Guarda los outputs `ApiUrl` y `LicenseTableName`. No se configura
`tracking.cesaragudelo.com`, Route53 ni ACM. Tabla, secreto y logs se retienen al
retirar el stack; el despliegue puede generar costes.

## Validación manual del popup

**Sin AWS:** ejecuta build/lint/tests/format, prepara una licencia sin `--write`,
carga la extensión y verifica `Not activated`, UUID persistente, validación de campo
vacío y mensaje de servicio no disponible al no tener URL. Esto no demuestra una
activación real.

**Con AWS desplegado y licencia insertada:**

1. Configura `VITE_ACTIVATION_API_URL` con el output `ApiUrl` en
   `apps/extension/.env.production.local` y vuelve a ejecutar `npm run build`.
2. Chrome: abre `chrome://extensions`, activa **Developer mode**, pulsa
   **Load unpacked** y selecciona `apps/extension/dist` (Windows:
   `C:\Projects\email-tracker\apps\extension\dist`). Si ya está instalada, pulsa
   **Reload**. En Edge, usa `edge://extensions` con los mismos pasos.
3. Abre **Email Tracker** desde el menú de extensiones. En una instalación nueva,
   comprueba **Status: Not activated** y un UUID. Cierra y abre el popup: debe
   conservar el mismo UUID.
4. Introduce el código creado con `--write` y pulsa **Activate**. Debe mostrar
   **Status: Activated**, ocultar el formulario y no mostrar el JWT.
5. Cierra y abre de nuevo: debe conservar `Activated` mientras el token no expire.
6. Con una licencia de `maxDevices=1`, otro perfil del navegador debe recibir
   **Device limit reached**. No uses el mismo directorio de perfil.
7. Para comprobar reactivación, elimina únicamente la clave `authorization` desde
   el almacenamiento de la extensión en DevTools (sin imprimir su valor), conserva
   `installationId` y vuelve a introducir el código. No debe aumentar el contador.
8. Un código inexistente debe mostrar **Invalid activation code**. Una licencia
   revocada o expirada debe devolver su mensaje correspondiente al reactivarse.

El flujo exitoso de `POST /api/activate`, la persistencia real en DynamoDB y el
acceso IAM a Secrets Manager requieren AWS. Los tests unitarios usan mocks y no
sustituyen esa validación de deployment.

## Fuera del Milestone 10

No se implementan UI de historial, Outlook, geolocalización,
parsing de User-Agent, dashboard ni link tracking. Gmail conserva su adapter
y checkbox del Milestone 5: ahora intercepta Send y crea tracking mediante el worker,
e inserta el pixel al final del body antes de reanudar Send.

Referencias: [transacciones e IAM de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html),
[almacenamiento de extensiones Chromium](https://developer.chrome.com/docs/extensions/reference/api/storage).

## Milestone 6: crear tracking

`POST /api/tracking` requiere `Authorization: Bearer <JWT>` emitido por activación
y JSON con exactamente estos campos:

```json
{
  "recipient": "client@example.com",
  "subject": "Technical Interview Follow-up"
}
```

Zod exige email válido (máximo 254 caracteres) y asunto string de hasta 998
caracteres; permite asunto vacío. Rechaza campos adicionales, incluyendo IDs,
identidades, body, adjuntos o credenciales. El handler limita el cuerpo a 16 KiB.

Devuelve **201** tras persistir:

```json
{
  "trackingId": "8a73e54e-c33f-40ca-a2dc-06626851744d",
  "trackingUrl": "https://tracking.cesaragudelo.com/o/8a73e54e-c33f-40ca-a2dc-06626851744d",
  "createdAt": "2026-09-24T10:00:00.000Z"
}
```

`trackingUrl` apunta a `GET /o/{trackingId}`, implementado en el Milestone 7.
El dominio de producción todavía requiere configuración y despliegue fuera de este alcance.
`TrackingService` genera el UUID con `crypto.randomUUID()` en backend. La tabla
independiente `EmailTracking` usa `PK=TRACKING#{trackingId}`, `SK=EMAIL` y conserva
`trackingId`, `recipient`, `subject`, `createdAt`, `licenseId`, `installationId`,
`status=CREATED`. CREATED significa registro creado, sin confirmar envío.
Un PutItem condicional evita sobrescrituras; crear EMAIL no crea eventos OPEN ni contadores.

La ruta comparte API Gateway con activación y usa una Lambda y un rol propios:
solo `dynamodb:PutItem` sobre la tabla de tracking, lectura del secreto JWT existente
y escritura en su grupo de logs. La tabla es bajo demanda y se retiene al retirar
el stack. El output `TrackingTableName` identifica su nombre físico.

La autorización está aislada en `authorization.ts` y reutiliza `verifyToken` sin
duplicar criptografía. Entrega únicamente la identidad validada al servicio y
permite añadir una comprobación de revocación posteriormente. **Revocar una licencia
no invalida JWT existentes**; siguen autorizando creación hasta su expiración.

Errores: **400** `INVALID_REQUEST`, **401** `UNAUTHORIZED` (token ausente, inválido o
expirado), **500** `SERVICE_UNAVAILABLE`. Fallos de Secrets Manager o DynamoDB son
500 sin detalles internos. Respuestas con `no-store`; logs estructurados contienen
solo requestId, resultado y trackingId en éxito. No se registran tokens ni PII.

Configuración adicional:

- `TRACKING_TABLE_NAME`: inyectada por CDK en CreateTracking Lambda.
- `JWT_SECRET_ARN`: el mismo secreto de activación, nunca su valor.
- `TRACKING_BASE_URL`: opcional, por defecto `https://tracking.cesaragudelo.com`,
  centralizado en `trackingConfig.ts`. Acepta HTTPS o HTTP localhost para desarrollo.
  Definirla al ejecutar CDK la inyecta en Lambda; elimina barras finales.
- La extensión reutiliza `config.apiBaseUrl` y `VITE_ACTIVATION_API_URL` para ambas
  rutas. Se conserva el nombre de variable existente por compatibilidad; su valor
  es la base pública de API Gateway, sin `/api/activate` ni `/api/tracking`.

`createTrackingClient().createTracking({ recipient, subject })` lee la autorización
almacenada desde un contexto confiable (popup o service worker), envía Bearer y
valida la respuesta compartida. Sin autorización local vigente no hace fetch.
Mapea 401 a una indicación de reactivación y los errores de red a indisponibilidad.
Desde el Milestone 9 Gmail la invoca mediante el worker al intentar Send con Track ON.
Los reintentos manuales crean registros nuevos; no se implementa idempotencia.

### Validación sin AWS

```sh
npm run build
npm run lint
npm test
npm run format:check
npm run synth --workspace=@email-tracker/cdk -- --no-lookups
```

Los tests ejercitan JWT reales firmados con claves de prueba, contratos, handler,
servicio, repositorio con DynamoDB mockeado, cliente con storage/fetch mockeados e IAM
sintetizado. No requieren cuenta AWS. Synth genera CloudFormation, sin desplegar.
Carga la extensión compilada y comprueba manualmente que alternar Track email no
produce solicitudes a `/api/tracking` y que el contenido del correo se conserva.

### Validación opcional en AWS

1. Desplegar el stack `EmailTrackerActivation` con los comandos de deployment ya
   documentados: añade tabla EmailTracking, Lambda CreateTracking, logs, IAM e
   integración/ruta en la API existente. No se configura el dominio de tracking.
2. Crear una licencia con el CLI existente usando `--write` y `LicenseTableName`.
3. Activar la extensión o solicitar un JWT con un installationId UUID:

```sh
curl -X POST "$API_BASE_URL/api/activate" \
  -H 'Content-Type: application/json' \
  --data '{"activationCode":"CODIGO_DE_LICENCIA","installationId":"8a73e54e-c33f-40ca-a2dc-06626851744d"}'
```

4. Usar el `accessToken` devuelto como variable local `JWT`, sin guardarlo en el
   repositorio ni compartirlo. `API_BASE_URL` es el output `ApiUrl`:

```sh
curl -i -X POST "$API_BASE_URL/api/tracking" \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  --data '{"recipient":"client@example.com","subject":"Technical Interview Follow-up"}'
```

5. Esperar 201 y comprobar en la tabla el registro EMAIL con CREATED e identidad
   de la licencia/instalación. Repetir sin Authorization debe producir 401; con JWT
   válido y recipient inválido, 400. Para probar el pixel en la URL de API Gateway,
   seguir la validación del Milestone 7.

## Milestone 7: pixel público y eventos OPEN

`GET /o/{trackingId}` no requiere JWT, Authorization ni API key: lo consume el
cliente de correo. `openTrackingHandler` traduce HTTP, `OpenTrackingService` valida
UUID con Zod, confirma EMAIL y construye el evento; `TrackingRepository` ejecuta
GetItem consistente y PutItem sobre la misma tabla `EmailTracking`. Se acepta el
UUID únicamente de `pathParameters` y se normaliza a minúsculas para la clave.

Cada carga crea un registro independiente, incluso en el mismo milisegundo:

```text
PK = TRACKING#{trackingId}
SK = OPEN#{openedAt}#{eventId}
```

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "trackingId": "8a73e54e-c33f-40ca-a2dc-06626851744d",
  "eventType": "OPEN",
  "openedAt": "2026-09-24T21:15:22.123Z",
  "ip": "192.0.2.1",
  "userAgent": "Raw mail client User-Agent"
}
```

`eventId` se genera con `crypto.randomUUID()`; `openedAt` es ISO UTC. La IP procede
exclusivamente de `requestContext.http.sourceIp` de API Gateway HTTP API v2, sin
fallback a X-Forwarded-For. User-Agent se conserva raw con búsqueda de header
insensible a mayúsculas. Ausencias se guardan como `null`. No se copian destinatario,
asunto ni contenido al evento. EMAIL mantiene CREATED; no hay contadores ni deduplicación.

| Condición                              | Respuesta                 | Escritura OPEN           |
| -------------------------------------- | ------------------------- | ------------------------ |
| UUID ausente o inválido                | 400 `INVALID_TRACKING_ID` | Ninguna                  |
| UUID válido sin EMAIL                  | 404 `NOT_FOUND`           | Ninguna                  |
| GetItem falla antes de confirmar EMAIL | 500 `SERVICE_UNAVAILABLE` | Ninguna                  |
| EMAIL existe y PutItem funciona        | 200 `image/png`           | Evento independiente     |
| EMAIL existe y PutItem falla           | **200 `image/png`**       | Puede perderse el evento |

**Política de resiliencia:** solo tras confirmar EMAIL se tolera un fallo de
persistencia. Se registra `OPEN_WRITE_FAILED` con requestId, trackingId, eventId,
eventType y `persistenceSuccess=false`, sin error AWS, stack trace, IP, User-Agent
ni secretos. El destinatario recibe el mismo PNG que en éxito. Se acepta perder
ese evento; no hay colas, reintentos de aplicación ni tareas en segundo plano.
La Lambda usa un intento SDK por operación y timeouts de conexión de 500 ms y
petición de 1500 ms con rechazo al vencer, inferiores al timeout Lambda de 10 s.
GetItem fallido nunca se interpreta como existencia ni como ausencia del EMAIL.
No hay transacción entre lectura y escritura.

El PNG RGBA transparente de 1x1 está precomputado en `pixel.ts`. La respuesta proxy
Lambda contiene body base64 e `isBase64Encoded: true`; HTTP API lo entrega como
bytes PNG al cliente. No se genera la imagen por request. Headers:

```http
Content-Type: image/png
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
Pragma: no-cache
Expires: 0
```

La Lambda dedicada `OpenTrackingFunction` recibe solo `TRACKING_TABLE_NAME` y tiene
GetItem/PutItem sobre EmailTracking y escritura en su grupo de logs. No tiene acceso
a licencias ni Secrets Manager, Scan, Query, UpdateItem o DeleteItem. No se añaden
tablas, dominio personalizado, Route53, ACM, CloudFront o servicios externos.

Una carga significa **Apertura detectada**, no prueba de lectura humana. IP y
User-Agent pueden corresponder a proxies; Gmail puede cachear imágenes, Apple Mail
puede precargarlas y otros clientes pueden bloquearlas. Los headers anti-cache no
garantizan que un proxy solicite el pixel en cada apertura. No hay geolocalización,
parsing de navegador/sistema/dispositivo ni detección de proxies en este milestone.
El Milestone 10 inserta el pixel en Gmail después de crear tracking y antes de reanudar Send.

### Validación local del pixel (sin AWS)

```sh
npm run build
npm run lint
npm test
npm run format:check
npm run synth --workspace=@email-tracker/cdk -- --no-lookups
```

Vitest comprueba firma PNG, CRC de chunks, dimensiones 1x1, datos RGBA con alpha 0,
base64 y headers; verifica 400/404/500, cinco eventos simultáneos independientes y
que un fallo PutItem devuelve exactamente el mismo 200 PNG y genera log seguro.
DynamoDB está mockeado. CDK synth no despliega recursos. No se incluye servidor
local HTTP ni se realizan tests E2E.

### Validación opcional con AWS — no ejecutada automáticamente

1. Desplegar `EmailTrackerActivation` con el flujo de deployment documentado arriba.
   Añade la Lambda del pixel, su rol/logs y la ruta pública a la API existente.
2. Crear licencia con el CLI existente (`--write` sobre LicenseTableName).
3. Activar la extensión u obtener JWT con `POST /api/activate`.
4. Crear EMAIL con `POST /api/tracking` y Bearer, usando el ejemplo anterior.
5. Copiar `trackingId` y usar el output `ApiUrl` como `API_BASE_URL`. No hace falta
   Authorization para el pixel:

```sh
curl -i "$API_BASE_URL/o/$TRACKING_ID" --output /tmp/pixel-response.http
# Alternativa para inspeccionar headers y conservar solo PNG en un archivo:
curl -D - "$API_BASE_URL/o/$TRACKING_ID" --output /tmp/tracking-pixel.png
```

6. Comprobar HTTP 200, Content-Type image/png y headers anti-cache. Cada uno de los
   dos comandos anteriores es una carga independiente.
7. Revisar DynamoDB: `PK=TRACKING#{trackingId}` y
   `SK=OPEN#{openedAt}#{eventId}`, además del EMAIL existente.
8. Repetir llamadas varias veces y comprobar varios eventos OPEN con distintos IDs.
   La IP observada puede ser la del proxy/red de salida del cliente usado para curl.

No se despliega AWS ni se configura el dominio de producción durante la validación local.

## Milestone 8: consulta protegida e historial

`GET /api/tracking/{trackingId}` requiere `Authorization: Bearer <JWT>`.
La Lambda dedicada `getTracking.handler` reutiliza `createAuthorization` y
`verifyToken`: verifica firma, expiración, issuer, audience, licenseId e
installationId. La autorización se ejecuta en Lambda, no en un authorizer de API
Gateway. La ruta nunca entrega metadata sin JWT válido. Los JWT emitidos siguen
siendo válidos hasta expirar aunque se revoque posteriormente la licencia.

El handler valida el UUID exclusivamente desde pathParameters y lo normaliza a
minúsculas. `GetTrackingService` hace GetItem de EMAIL, valida ownership por
**licenseId** y después consulta eventos. Otra instalación autorizada de la misma
licencia puede consultar. EMAIL inexistente y EMAIL de otra licencia producen
exactamente **404 `NOT_FOUND`**: así no se revela si existe un recurso ajeno y no
se leen sus OPEN. UUID inválido produce 400 `INVALID_TRACKING_ID` sin DynamoDB;
JWT ausente, inválido o expirado produce 401 `UNAUTHORIZED`; fallos internos,
500 `SERVICE_UNAVAILABLE` sin detalles. La validación del UUID precede al JWT.

`TrackingRepository.listOpenEvents` usa Query sobre la tabla existente:

```text
PK = TRACKING#{trackingId} AND begins_with(SK, OPEN#)
ScanIndexForward = true
ConsistentRead = true
```

GetItem también es consistente. Se conserva el orden natural ascendente del SK
`OPEN#{openedAt}#{eventId}`, sin ordenar en memoria. El repositorio sigue
LastEvaluatedKey hasta completar todas las páginas: no hay límite deliberado ni
paginación visible. Una consulta normal requiere GetItem + Query; historiales
superiores a una página requieren más Query. No usa Scan ni escribe EMAIL.
La operación queda aislada para incorporar paginación posteriormente. Las lecturas
no forman un snapshot transaccional: aperturas concurrentes pueden aparecer en
esta consulta o en la siguiente. Historias muy grandes siguen sujetas a límites
de tiempo/tamaño de Lambda y API Gateway; no se devuelve un historial parcial
como exitoso si falla una página.

Respuesta **200**, con `Cache-Control: no-store`:

```json
{
  "trackingId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "OPEN_DETECTED",
  "recipient": "client@example.com",
  "subject": "Technical Interview Follow-up",
  "createdAt": "2026-09-24T20:15:00.000Z",
  "openCount": 1,
  "firstOpenedAt": "2026-09-24T20:20:00.000Z",
  "lastOpenedAt": "2026-09-24T20:20:00.000Z",
  "events": [
    {
      "eventId": "8a73e54e-c33f-40ca-a2dc-06626851744d",
      "openedAt": "2026-09-24T20:20:00.000Z",
      "ip": "192.0.2.1",
      "userAgent": "Raw mail client User-Agent"
    }
  ]
}
```

Sin OPEN: `status=CREATED`, `openCount=0`, `firstOpenedAt=null`,
`lastOpenedAt=null`, `events=[]`. Con OPEN: `status=OPEN_DETECTED`,
`openCount=events.length`, primera y última fecha tomadas del primer y último
evento. IP y User-Agent pueden ser null y solo se entregan al dueño autorizado.
No se devuelven claves DynamoDB ni identidades internas. Los eventos son la fuente
de verdad; no se guarda contador redundante ni se introduce SENT. Apertura
detectada no prueba lectura humana.

Los contratos Zod y tipos compartidos incluyen `TrackingStatus`,
`TrackingOpenEventResponse` y `GetTrackingResponse`.
`createTrackingClient().getTracking(trackingId)` obtiene el token desde storage,
usa la configuración API existente, envía Bearer y valida la respuesta. No hace
fetch sin autorización local vigente. Mapea 401 a reactivación, 404 a tracking no
encontrado y errores de red a indisponibilidad. **El popup todavía no consume
este endpoint automáticamente**: no hay polling ni llamadas automáticas.

CDK añade una Lambda, grupo de logs, rol e integración dedicados. El rol solo
permite GetItem/Query sobre EmailTracking, GetSecretValue sobre el secreto JWT
y escritura en sus logs; no permite Scan, escrituras DynamoDB ni acceso a licencias.
Los logs contienen requestId, trackingId y resultado, nunca JWT, IP/User-Agent,
destinatario, asunto o errores internos. No se añaden tablas ni dominios.

No hay geolocalización, parsing de navegador/OS/dispositivo, detección de proxies
o Apple MPP, Outlook, UI de historial,
link tracking ni dashboard.

### Validación del Milestone 8 sin AWS

```sh
npm run build
npm run lint
npm test
npm run format:check
npm run synth --workspace=@email-tracker/cdk -- --no-lookups
```

Tests unitarios Vitest con DynamoDB, JWT, storage y fetch mockeados; la suite
existente además valida JWT reales con claves de prueba. No hay tests E2E ni AWS
real. Carga la extensión compilada en Chrome/Edge y verifica que el popup y el
checkbox no inician consultas de historial.

### Validación opcional del Milestone 8 con AWS

Solo después de autorización explícita, desplegar el stack con el flujo anterior,
crear licencia, obtener JWT con POST /api/activate y crear un tracking con
POST /api/tracking. Usar el output ApiUrl como API_BASE_URL, el token como TOKEN y
el UUID devuelto como TRACKING_ID. Consultar antes de cargar el pixel debe devolver
CREATED, cero eventos y fechas null.

```sh
curl -H "Authorization: Bearer $TOKEN" \
  "$API_BASE_URL/api/tracking/$TRACKING_ID"
# Ejecutar varias veces para generar eventos independientes:
curl "$API_BASE_URL/o/$TRACKING_ID" --output /tmp/tracking-pixel.png
curl -H "Authorization: Bearer $TOKEN" \
  "$API_BASE_URL/api/tracking/$TRACKING_ID"
```

Verificar OPEN_DETECTED, openCount igual al número de eventos, historial ascendente,
firstOpenedAt/lastOpenedAt y metadata. Probar JWT de otra licencia: 404 idéntico al
UUID inexistente. Otro dispositivo de la misma licencia debe recibir 200. Sin
Bearer: 401; UUID inválido: 400. No se despliega automáticamente.

## Milestone 9: Gmail Send y creación de tracking

Send con Track ON se detiene temporalmente para extraer primer To válido y asunto,
llamar POST /api/tracking desde el service worker y asociar la respuesta al compose
en memoria. Después se reanuda el botón nativo. OFF pasa sin API; errores o espera
superior a 20 segundos reanudan sin tracking con un warning fijo. El JWT no cruza
al content script. El Milestone 10 añade el pixel al final del editor antes de reanudar
Send, preservando contenido y firma; el asunto no se modifica.

Ver [documentación de la extensión](apps/extension/README.md#milestone-9-crear-tracking-antes-de-send-en-gmail)
para interceptación, reanudación, duplicados, destinatarios múltiples, limitaciones
DOM y validación manual OFF/ON/error en Chrome. Los tests son unitarios con mocks;
no se validó una sesión Gmail real ni se desplegó AWS. Sin infraestructura nueva.

## Milestone 10: pixel en el compose de Gmail

Se valida la trackingUrl recibida (HTTPS y ruta `/o/`), se añade un img 1x1 con
`data-email-tracker-id` al final del body mediante appendChild y se verifica antes
de reanudar Send. El contexto existente y el DOM evitan duplicados en reintentos.
Body ausente o fallo de inserción producen warning y envío sin tracking; puede
quedar un registro CREATED sin pixel. No hay cambios ni deployment de AWS.

Consultar [inserción y validación manual obligatoria](apps/extension/README.md#milestone-10-insertar-el-pixel-antes-de-reanudar-send).
La aceptación sigue pendiente de comprobar Gmail real en Chrome/Edge y el HTML
recibido con AWS desplegado. Un OPEN no demuestra lectura humana.
