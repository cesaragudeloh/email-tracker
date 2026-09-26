Lee AGENTS.md y respeta todas sus instrucciones.

Implementa únicamente el Milestone 11: mostrar trackings e historial básico de aperturas dentro del popup de la extensión.

Objetivo:
permitir que el usuario vea, desde el popup de la extensión, los correos que esta instalación ha creado para tracking y consultar para cada uno:

- subject
- recipient
- estado
- openCount
- firstOpenedAt
- lastOpenedAt
- historial de eventos OPEN

Este milestone debe reutilizar:

- createTracking() existente
- getTracking() existente
- chrome.storage.local
- contratos compartidos existentes

No implementar todavía geolocalización, browser/device parsing ni Outlook.

# Alcance

Implementar únicamente:

- persistencia local mínima de metadata de trackings creados por esta instalación
- listado de trackings en popup
- selección de un tracking
- llamada manual a GET /api/tracking/{trackingId}
- vista de detalle
- openCount
- firstOpenedAt
- lastOpenedAt
- historial básico de eventos
- estados de loading/error
- tests unitarios

No implementar todavía:

- polling automático
- refresh periódico
- push notifications
- browser/device parsing
- geolocalización
- proxy detection
- Outlook
- dashboard web
- link tracking
- attachment tracking
- búsqueda avanzada
- filtros
- paginación visual
- multi-account SaaS

# Problema actual

El backend sabe consultar un tracking por trackingId, pero el popup necesita saber qué trackings fueron creados por esta instalación.

Para el MVP, NO crear un nuevo endpoint backend para listar todos los trackings de la licencia.

Preferencia:
guardar localmente metadata mínima cada vez que createTracking() tiene éxito.

Ejemplo:

{
trackingId,
recipient,
subject,
createdAt
}

Guardar en:

chrome.storage.local

Esto NO es source of truth de aperturas.

DynamoDB sigue siendo source of truth para:

- status
- openCount
- firstOpenedAt
- lastOpenedAt
- events

# Persistencia local

Crear una abstracción dedicada.

Ejemplo:

TrackingHistoryStorage

Responsabilidades:

- addTrackedEmail(...)
- listTrackedEmails()
- getTrackedEmail(...)
- removeTrackedEmail(...) solo si resulta útil
- limitar cantidad local si se decide hacerlo

No mezclar directamente chrome.storage.local por toda la UI.

# Cuándo guardar

Después de createTracking() exitoso en Gmail:

guardar localmente:

- trackingId
- recipient
- subject
- createdAt

No guardar trackingUrl si no se necesita para UI.

No guardar:

- email body
- JWT
- IP
- User-Agent
- OPEN events

# Importante: sólo tras createTracking exitoso

Track OFF:

- no guardar nada

Track ON + createTracking falla:

- no guardar nada

Track ON + createTracking success:

- guardar metadata local

# Orden del listado

Mostrar trackings más recientes primero.

createdAt descending.

# Límite local

Para evitar crecimiento infinito de chrome.storage.local, establecer un límite razonable.

Preferencia MVP:

100 trackings recientes.

Cuando se añade el 101:

- conservar los 100 más recientes

Documentar decisión.

# Popup

Actualizar el popup actual.

Si extensión NO activada:

mantener experiencia actual de activación.

No mostrar historial protegido.

Si Activated:

mostrar una vista principal similar a:

Email Tracker

Activated

Recent tracked emails

[Technical Interview Follow-up]
client@example.com
Created: Sep 25, 08:45

[Proposal]
other@example.com
Created: Sep 24, 16:20

No necesita diseño complejo.

# Selección

Al hacer click en un tracking:

llamar:

getTracking(trackingId)

Mostrar loading.

Después mostrar detalle.

Ejemplo:

Technical Interview Follow-up
client@example.com

Status:
Open detected

Opened:
3 times

First open:
Sep 25, 09:01

Last open:
Sep 25, 10:33

History

09:01
IP: 181.x.x.x

09:12
IP: 181.x.x.x

10:33
IP: 181.x.x.x

User-Agent puede mostrarse en detalle si ya viene del backend, pero evitar una UI demasiado cargada.

Una opción:
mostrar User-Agent en un bloque expandible/simple debajo de cada evento.

# Estados

Mapear backend:

CREATED

a UI:

Not opened yet

Mapear:

OPEN_DETECTED

a:

Open detected

No usar:

Read
Read confirmed
Recipient read

Mantener terminología honesta.

# Open count

Mostrar:

0 opens

1 open

N opens

Usar pluralización simple.

# Fechas

Crear una utilidad de formato.

No hardcodear strings repetidos.

Usar Date/Intl.DateTimeFormat.

No añadir librerías de fecha si no hacen falta.

# Historial

Mostrar eventos oldest → newest o newest → oldest.

Preferencia UI:
newest → oldest

porque el usuario normalmente quiere ver la apertura más reciente primero.

Backend puede devolver oldest → newest.

Invertir en UI si corresponde.

No modificar contrato backend.

# Botón Refresh

Añadir un botón manual:

Refresh

En vista de detalle.

Al pulsarlo:

getTracking(trackingId)

actualiza la información.

No implementar polling automático.

# Volver

Añadir navegación simple:

Back

para volver al listado.

No usar router/framework.

# UI

Seguir sin React.

Usar:

- HTML
- TypeScript
- CSS

Mantener diseño limpio.

No introducir framework UI.

# Arquitectura sugerida

src/
tracking/
historyStorage.ts
historyStorage.test.ts

popup/
popup.ts
popup.css
views/
activationView.ts
trackingListView.ts
trackingDetailView.ts

Puedes ajustar nombres si la estructura actual del popup es diferente.

No sobreingenierizar.

# Background/service worker

Evaluar si getTracking() debe ejecutarse desde background para mantener el JWT fuera del popup/content.

Preferencia:
sí.

La arquitectura actual ya mantiene JWT en service worker para createTracking.

Mantener ese mismo patrón:

Popup
→ chrome.runtime.sendMessage
→ Background
→ trackingClient.getTracking()
→ API

No mover JWT al popup.

No exponer JWT en content script.

# Messaging

Extender trackingMessages.ts.

Añadir mensaje conceptual:

GET_TRACKING

Request:

{
type: "GET_TRACKING",
trackingId
}

Response success:

{
ok: true,
tracking
}

Response failure:

{
ok: false,
error
}

Mantener tipos estrictos.

# Seguridad

No guardar accessToken en metadata de historial.

No exponer JWT al popup.

No exponer información de otros trackings.

Backend ya valida ownership.

No almacenar email body.

# Storage corruption

Si chrome.storage contiene datos inválidos:

- no romper popup
- filtrar entradas inválidas
- manejar de forma segura

Añadir validación con Zod si encaja con arquitectura existente.

# Tracking eliminado/no encontrado

Si getTracking devuelve 404:

mostrar:

Tracking record not found

No eliminarlo automáticamente del almacenamiento en este milestone, salvo que haya razón clara.

# 401

Si getTracking devuelve 401:

mostrar:

Authorization expired

No intentar refresh/re-activation automática.

Mantener popup estable.

# Network error

Mostrar:

Unable to load tracking information

Permitir Retry/Refresh.

# Eventos vacíos

Si status CREATED:

mostrar:

No opens detected yet.

No mostrar historial vacío innecesariamente.

# User-Agent

El backend actualmente devuelve raw User-Agent.

Para este milestone:

puede mostrarse opcionalmente como texto secundario en cada evento.

No parsearlo.

No intentar mostrar browser/device todavía.

# IP

Mostrar IP si existe.

Si null:

Location/network information unavailable

Pero NO llamar esto Location todavía.

Preferir:

IP unavailable

porque geolocalización aún no existe.

# Local tracking record

Definir tipo como:

LocalTrackingRecord

{
trackingId: string;
recipient: string;
subject: string;
createdAt: string;
}

Validar al leer de storage.

# Almacenamiento tras createTracking

Actualizar flujo del Milestone 9/10.

Después de createTracking success:

1. obtener tracking result
2. guardar LocalTrackingRecord
3. insertar pixel
4. reanudar Send

Importante:

si guardar metadata local falla:

- NO bloquear envío
- continuar con pixel/send
- log warning

Storage local es conveniencia UI, no parte crítica del tracking.

# Duplicados local storage

No insertar dos veces el mismo trackingId.

Si ya existe:

- mantener una sola entrada

# Tests unitarios

Usar Vitest + jsdom.

No usar Playwright/Cypress/Selenium.

Añadir tests al menos para:

Storage:

1. guarda tracking
2. lista tracking
3. orden newest first
4. limita a 100
5. elimina duplicado por trackingId
6. tolera storage vacío
7. tolera datos corruptos
8. falla storage sin bloquear caller

Send flow: 9. createTracking success guarda metadata 10. OFF no guarda 11. createTracking failure no guarda 12. storage failure no bloquea pixel/send

Messaging: 13. GET_TRACKING mensaje correcto 14. background llama getTracking 15. success response 16. 401 response 17. 404 response 18. network error

Popup list: 19. Activated muestra list 20. no activated no muestra list 21. vacío muestra mensaje adecuado 22. subject vacío muestra fallback "(No subject)" 23. recipient visible 24. orden correcto

Detail: 25. loading 26. CREATED muestra Not opened yet 27. OPEN_DETECTED muestra Open detected 28. openCount 0 29. openCount 1 30. openCount N 31. firstOpenedAt 32. lastOpenedAt 33. events visibles 34. events newest first 35. IP visible 36. IP null 37. User-Agent visible si se decide mostrar 38. Back funciona 39. Refresh llama getTracking nuevamente 40. error 404 41. error 401 42. network error

No usar AWS real.

# Build size

Vigilar que popup no arrastre dependencias innecesarias.

No optimizar prematuramente.

# README

Actualizar apps/extension/README.md con:

- almacenamiento local de trackings
- límite 100
- DynamoDB como source of truth
- listado del popup
- detalle
- Refresh manual
- status CREATED / OPEN_DETECTED
- limitaciones actuales
- no browser/device parsing
- no geolocalización
- no polling

Actualizar README raíz si corresponde.

# Validación manual sin AWS

Con backend no desplegado:

- popup Activated puede mostrar metadata local si existe
- las consultas getTracking fallarán de forma segura

Pero puede ser difícil crear nuevos records reales sin backend.

Los tests deben cubrir todo offline.

# Validación manual con AWS

Cuando backend esté desplegado:

1. activar extensión
2. enviar correo con Track ON
3. abrir popup
4. comprobar que aparece en Recent tracked emails
5. seleccionar correo
6. comprobar CREATED
7. abrir correo desde destinatario
8. pulsar Refresh
9. comprobar OPEN_DETECTED
10. comprobar openCount
11. repetir apertura
12. Refresh
13. comprobar incremento e historial

No desplegar AWS automáticamente.

# Antes de modificar código

1. Lee AGENTS.md.
2. Revisa estado actual del repo.
3. Inspecciona:
   - popup actual
   - background.ts
   - trackingMessages
   - trackingClient
   - GmailSendController
   - storage activation
4. Resume arquitectura.
5. Explica cómo mantendrás JWT solo en background.
6. Explica cómo guardarás metadata local sin bloquear envío.
7. Explica estructura UI list/detail.
8. Indica archivos exactos a crear/modificar.

No modifiques nada antes de esa revisión.

# Después de implementar

Ejecuta:

npm run build
npm run lint
npm test
npm run format:check

Corrige errores.

Después informa:

- archivos creados/modificados
- modelo de storage local
- límite de historial
- arquitectura messaging popup→background
- UI implementada
- estados/error handling
- cantidad de tests añadidos
- total tests pasando
- impacto build
- validación manual
- limitaciones

No continúes al Milestone 12.

Detente cuando Milestone 11 esté completamente terminado.
