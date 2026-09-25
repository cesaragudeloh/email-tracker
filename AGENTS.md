# AGENTS.md

## Proyecto

Este repositorio contiene el MVP de una extensión de seguimiento de correos electrónicos.

La extensión debe ser compatible con:

- Google Chrome
- Microsoft Edge

Y debe funcionar inicialmente con:

- Gmail Web
- Outlook Web

El objetivo es permitir al remitente activar tracking para un correo y posteriormente consultar si se detectó una apertura.

---

## Funcionalidad principal

Para cada correo con tracking habilitado, el sistema debe poder registrar:

- Si se detectó una apertura.
- Número total de aperturas.
- Fecha y hora de cada apertura.
- Ubicación aproximada basada en IP cuando sea posible:
  - país
  - región
  - ciudad
- Navegador detectado cuando sea posible.
- Sistema operativo cuando sea posible.
- Tipo de dispositivo cuando sea posible:
  - Desktop
  - Mobile
  - Tablet
  - Unknown
- User-Agent recibido.
- IP observada por el backend.
- Historial completo de eventos de apertura.

Cada apertura debe almacenarse como un evento independiente.

No almacenar únicamente un contador.

---

## Limitaciones del tracking

Una solicitud al tracking pixel NO debe considerarse prueba definitiva de que una persona leyó el correo.

El sistema debe utilizar términos como:

- Open detected
- Apertura detectada

Evitar afirmaciones como:

- Recipient definitely read the email
- El destinatario leyó el correo

Tener en cuenta:

- Gmail puede utilizar proxies y caché para imágenes.
- Apple Mail Privacy Protection puede precargar imágenes.
- VPNs y proxies pueden alterar la ubicación.
- El User-Agent puede corresponder a un proxy.
- Algunos clientes pueden bloquear imágenes completamente.

---

## Arquitectura

La arquitectura general debe ser:

Chrome / Edge Extension
        |
        v
API Gateway
        |
        v
AWS Lambda
        |
        v
Amazon DynamoDB

El dominio de producción para tracking será:

https://tracking.cesaragudelo.com

La URL del pixel será:

https://tracking.cesaragudelo.com/o/{trackingId}

---

## Stack tecnológico

Usar principalmente TypeScript.

### Extensión

- TypeScript
- Manifest V3
- Vite
- HTML
- CSS
- Chrome Extension APIs
- chrome.storage.local
- MutationObserver

No utilizar React inicialmente salvo que exista una necesidad clara.

### Backend

- Node.js
- TypeScript
- AWS Lambda
- Amazon API Gateway HTTP API
- Amazon DynamoDB

### Infraestructura

- AWS CDK
- TypeScript

### Utilidades

- Zod para validación
- ua-parser-js para análisis de User-Agent
- MaxMind GeoLite2 para geolocalización IP

### Testing

Usar únicamente tests unitarios.

Framework:

- Vitest

Puede utilizarse jsdom para probar lógica DOM cuando sea necesario.

No utilizar:

- Playwright
- Cypress
- Selenium
- tests E2E

Las pruebas reales de Gmail y Outlook se realizarán manualmente.

---

## Estructura esperada del repositorio

Mantener una estructura similar a:

email-tracker/
|
├── apps/
│   └── extension/
|
├── services/
│   └── tracking-api/
|
├── infrastructure/
│   └── cdk/
|
├── packages/
│   └── shared/
|
├── AGENTS.md
├── package.json
├── tsconfig.json
├── README.md
└── .gitignore

La estructura puede ajustarse si existe una razón técnica clara.

No introducir complejidad innecesaria.

---

## Extensión

Debe existir una única extensión compatible con Chrome y Edge.

No crear dos proyectos separados.

La extensión debe detectar el proveedor actual y utilizar adaptadores independientes:

- GmailAdapter
- OutlookAdapter

La lógica específica de Gmail y Outlook debe mantenerse separada.

La lógica común debe reutilizarse.

Ejemplo conceptual:

EmailProviderAdapter
    |
    ├── GmailAdapter
    |
    └── OutlookAdapter

La lógica común debe encargarse de:

- comunicación con backend
- configuración
- tracking
- almacenamiento local
- estado
- historial
- autenticación de la extensión

---

## Gmail

La extensión debe funcionar en:

https://mail.google.com/*

Gmail es una aplicación dinámica.

Usar MutationObserver u otro mecanismo robusto para detectar nuevas ventanas de composición.

Evitar depender de clases CSS generadas o altamente inestables.

Preferir:

- role
- aria-label
- atributos semánticos
- estructura DOM estable
- data attributes cuando existan

Todos los selectores de Gmail deben estar centralizados.

---

## Outlook

La extensión debe funcionar inicialmente en:

https://outlook.office.com/*
https://outlook.live.com/*

Mantener todos los selectores de Outlook centralizados.

No duplicar lógica compartida con Gmail.

---

## Tracking pixel

Cada correo rastreado debe incluir una URL única:

https://tracking.cesaragudelo.com/o/{trackingId}

El trackingId debe ser un UUID válido generado por el backend.

El endpoint del pixel debe:

1. Validar trackingId.
2. Obtener timestamp.
3. Obtener IP cuando esté disponible.
4. Obtener User-Agent.
5. Intentar determinar navegador.
6. Intentar determinar sistema operativo.
7. Intentar determinar tipo de dispositivo.
8. Intentar determinar ubicación aproximada.
9. Guardar un evento OPEN independiente en DynamoDB.
10. Devolver un PNG transparente de 1x1.

El endpoint debe responder rápidamente.

Si falla el enriquecimiento de ubicación o User-Agent, el pixel debe seguir respondiendo.

---

## DynamoDB

Mantener todos los eventos de apertura.

Diseño sugerido:

PK:
TRACKING#{trackingId}

Registro del correo:

SK:
EMAIL

Eventos:

SK:
OPEN#{timestamp}#{eventId}

Ejemplo:

TRACKING#abc
    EMAIL
    OPEN#2026-09-24T10:10:00Z#uuid1
    OPEN#2026-09-24T10:30:00Z#uuid2
    OPEN#2026-09-24T11:15:00Z#uuid3

No almacenar únicamente openCount.

El historial de eventos es la fuente de verdad.

---

## API

Endpoints iniciales:

POST /api/activate

POST /api/tracking

GET /api/tracking/{trackingId}

GET /o/{trackingId}

El endpoint:

GET /o/{trackingId}

debe ser público.

Los demás endpoints deben requerir autorización válida.

---

## Sistema de activación

La extensión no debe funcionar únicamente por estar instalada.

Debe requerir un código de activación.

Flujo:

1. La extensión genera un installationId.
2. El usuario introduce un activationCode.
3. La extensión llama:
   POST /api/activate
4. El backend valida el código.
5. Si es válido, devuelve un token firmado.
6. La extensión almacena el token.
7. Las APIs protegidas requieren ese token.

Sin token válido:

- no se puede crear tracking
- no se puede consultar tracking
- la extensión debe mostrarse como no activada

---

## Licencias

Las licencias deben soportar:

- ACTIVE
- REVOKED

Campos sugeridos:

- licenseId
- activationCodeHash
- status
- maxDevices
- createdAt
- expiresAt

No almacenar códigos de activación en texto plano.

Guardar únicamente un hash seguro del activationCode.

Para el MVP puede utilizarse SHA-256.

---

## Instalaciones

Cada extensión debe tener un installationId único.

Guardar installationId en:

chrome.storage.local

El backend debe poder asociar:

licenseId
    |
    └── installationId

Debe ser posible limitar el número máximo de dispositivos por licencia.

---

## Tokens

Después de una activación válida, el backend debe emitir un token firmado.

Puede utilizarse JWT.

El token debe contener como mínimo:

- licenseId
- installationId
- issuedAt
- expiration

La clave de firma nunca debe estar:

- en la extensión
- en GitHub
- hardcodeada en código fuente

Guardar secretos en AWS Secrets Manager o mecanismo equivalente de AWS.

---

## Seguridad

Nunca:

- almacenar contraseñas de Gmail
- almacenar contraseñas de Outlook
- almacenar cookies de Gmail
- almacenar cookies de Outlook
- almacenar tokens de sesión de Gmail u Outlook
- almacenar el cuerpo completo del correo
- almacenar adjuntos
- exponer credenciales AWS en la extensión
- hardcodear secretos
- subir archivos .env con secretos

Aplicar principio de mínimo privilegio en IAM.

Validar todas las entradas del backend.

No permitir consultas arbitrarias a DynamoDB desde la extensión.

La extensión solo debe comunicarse con APIs públicas controladas por nuestro backend.

---

## Privacidad

Guardar únicamente lo necesario.

Puede guardarse:

- destinatario
- asunto
- timestamps
- trackingId
- IP observada
- User-Agent
- ubicación aproximada
- metadata del evento

No guardar el contenido completo del correo.

---

## Configuración

No hardcodear URLs de entorno por todo el proyecto.

Debe existir una configuración para:

- development
- production

Ejemplo:

development:
http://localhost

production:
https://tracking.cesaragudelo.com

---

## Calidad de código

Usar:

- TypeScript strict
- async/await
- interfaces explícitas
- funciones pequeñas
- nombres descriptivos
- manejo consistente de errores
- separación entre handlers, services y repositories

Evitar:

- any salvo necesidad justificada
- clases gigantes
- handlers Lambda gigantes
- lógica duplicada
- estado global innecesario
- dependencias innecesarias
- sobreingeniería

---

## Tests

Crear tests unitarios para lógica importante.

Backend:

- creación de tracking
- validación de UUID
- validación de activationCode
- generación de hashes
- emisión y validación de JWT
- repositorio DynamoDB
- múltiples eventos OPEN
- parsing de User-Agent
- GeoService mediante mocks
- manejo de errores

Extensión:

- generación de installationId
- manejo del estado de activación
- API client
- generación del tracking pixel
- prevención de controles duplicados
- lógica de adapters cuando pueda probarse con jsdom

No crear tests E2E.

---

## Forma de trabajar

Trabajar siempre por milestones pequeños.

Antes de modificar código:

1. Revisar los archivos existentes.
2. Entender la arquitectura actual.
3. Explicar brevemente qué se va a cambiar.
4. Indicar qué archivos se crearán o modificarán.

Después de implementar:

1. Ejecutar build.
2. Ejecutar lint.
3. Ejecutar tests unitarios.
4. Corregir errores encontrados.
5. Explicar cómo validar manualmente lo implementado.

No continuar automáticamente al siguiente milestone.

Detenerse cuando se complete el milestone solicitado.

No modificar código funcional no relacionado con la tarea actual.

No implementar funcionalidades futuras salvo que sean estrictamente necesarias para el milestone actual.

---

## Alcance fuera del MVP

No implementar todavía:

- link tracking
- attachment tracking
- campañas
- CRM
- templates
- billing
- pagos
- suscripciones
- dashboard web complejo
- aplicación móvil
- Gmail móvil
- Outlook móvil
- Google Workspace Add-on
- Outlook native Add-in
- Slack
- Teams
- push notifications
- analytics avanzados

---

## Prioridad

La prioridad del MVP es demostrar este flujo:

Correo creado
    |
Track activado
    |
Tracking ID creado
    |
Pixel insertado
    |
Correo enviado
    |
Destinatario abre el correo
    |
GET /o/{trackingId}
    |
Lambda
    |
Evento OPEN
    |
DynamoDB
    |
Extensión consulta historial
    |
Open detected