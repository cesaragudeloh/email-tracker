Lee AGENTS.md y respeta todas sus instrucciones.

Implementa únicamente el Milestone 15: cierre administrativo, operativo y documental del MVP Email Tracker.

IMPORTANTE:
AWS real todavía NO está desplegado.

Por tanto:

- NO ejecutar bootstrap
- NO ejecutar deploy
- NO hacer escrituras AWS reales
- NO modificar DNS real
- NO crear recursos reales
- NO avanzar fuera del cierre MVP

# Objetivo

Cerrar el MVP dejando listas las capacidades administrativas y operativas necesarias para manejar licencias y validar el producto después del deployment.

El resultado debe incluir:

- gestión de licencias mediante CLI
- list/revoke
- documentación final
- checklist de deployment
- checklist de smoke testing
- troubleshooting
- seguridad y limitaciones conocidas
- validaciones automáticas

No implementar nuevas funcionalidades de tracking.

# Estado esperado al terminar

El MVP debe quedar preparado para:

1. desplegar AWS
2. configurar dominio
3. crear licencia
4. activar extensión
5. probar Gmail
6. probar Outlook
7. registrar aperturas
8. revisar ubicación/dispositivo
9. consultar historial
10. revocar licencias
11. administrar el MVP sin editar DynamoDB manualmente

# Antes de modificar código

1. Lee AGENTS.md.
2. Revisa el repo completo a alto nivel.
3. Revisa:
   - license CLI actual
   - license repository
   - activation model
   - DynamoDB schema
   - README raíz
   - README extensión
   - CDK outputs/config
   - scripts root
4. Resume:
   - capacidades administrativas actuales
   - carencias para operar el MVP
   - comandos existentes
   - archivos que modificarás
5. No modifiques código antes de esa revisión.

# Gestión administrativa de licencias

Extender el CLI existente.

Debe soportar al menos:

## Create

Ya existente.

Ejemplo:

npm run license:create -- --max-devices 2

Modo real:

npm run license:create -- --max-devices 2 --table TABLE_NAME --write

Mantener comportamiento actual:

- activation code mostrado una sola vez
- solo hash persistido
- status ACTIVE
- maxDevices
- activeDevices
- createdAt

No romper compatibilidad.

# List

Añadir comando administrativo para listar licencias.

Ejemplo deseado:

npm run license:list -- --table TABLE_NAME

Debe mostrar información útil:

- licenseId
- status
- maxDevices
- activeDevices
- createdAt

No mostrar:

- activation code
- secret JWT
- información sensible

Si hay paginación DynamoDB:
manejarla correctamente.

No usar Scan sin considerar implicaciones.

Si Scan es la única opción razonable para MVP administrativo:
documentarlo explícitamente.

No crear índices complejos salvo necesidad demostrable.

# Revoke

Añadir comando:

npm run license:revoke -- --license-id LICENSE_ID --table TABLE_NAME

Debe:

- validar argumentos
- encontrar licencia
- marcar status REVOKED
- mantener información histórica
- no eliminar registros

Debe ser idempotente.

Si ya está REVOKED:
mostrar estado consistente, no fallar innecesariamente.

# Activations después de revoke

Confirmar mediante tests que una licencia REVOKED no puede activar nuevas instalaciones.

No modificar el comportamiento de JWT ya emitidos salvo que el diseño actual lo soporte.

Documentar claramente:

un JWT emitido antes de revocación puede permanecer válido hasta su expiración si ese es el comportamiento actual.

No implementar blacklist distribuida para MVP.

# List installations

Si la estructura actual lo permite razonablemente, añadir:

npm run license:installations -- --license-id LICENSE_ID --table TABLE_NAME

Mostrar:

- installationId
- createdAt/activatedAt si existe
- status si existe

No mostrar JWT.

Si el modelo actual no permite hacerlo limpiamente sin rediseño:
documentarlo y no modificar arquitectura innecesariamente.

# CLI safety

Todos los comandos que escriban deben requerir flag explícito:

--write

cuando sea coherente con el CLI existente.

Ejemplo revoke:

sin --write:
mostrar qué cambio se realizaría

con --write:
ejecutar update real

Si el patrón actual difiere, mantener consistencia con el CLI existente.

No ejecutar nada en AWS durante este milestone.

# AWS configuration

Los CLI deben aceptar configuración explícita:

--table
--region si corresponde

Usar AWS SDK default credential chain.

No hardcodear profile/account/region.

No loggear credenciales.

# Errors CLI

Manejar:

- table missing
- license missing
- invalid license ID
- AWS auth failure
- permission denied
- network error

Errores deben ser claros.

No imprimir stack traces completos por defecto si no aportan valor.

# Scripts root

Añadir scripts claros si no existen:

license:create
license:list
license:revoke
license:installations

Mantener naming consistente.

# Tests CLI

Añadir unit tests al menos para:

1. create mantiene comportamiento actual
2. list devuelve licencias
3. list maneja paginación
4. list no muestra activation code
5. revoke dry-run
6. revoke real
7. revoke ya revocada
8. revoke inexistente
9. revoke argumento inválido
10. revoked license no puede activar
11. AWS error se reporta correctamente
12. installations list si se implementa
13. no secretos en output
14. no escrituras sin --write

# Seguridad

Revisar y documentar:

- activation code solo se muestra una vez
- hash SHA-256 almacenado
- JWT no persistido en logs
- Secrets Manager
- JWT expiración
- revocation limitation
- pixel público
- API protegida
- IP/UA potencialmente pertenecen a proxy
- ubicación aproximada
- Track email no confirma lectura humana

# Privacy / limitations

README debe indicar claramente:

"Open detected" NO significa necesariamente que una persona leyó el correo.

Documentar:

- Gmail image proxy
- Apple Mail Privacy Protection
- caching
- corporate proxies
- VPN
- image blocking
- antivirus/security scanners
- prefetching

Explicar que:

- openCount puede ser mayor o menor que aperturas humanas reales
- ubicación puede ser del proxy
- browser/device puede ser del proxy
- múltiples aperturas pueden no generar múltiples requests

# Deployment runbook

Crear una sección o documento operativo claro.

Debe incluir orden:

1. instalar/configurar AWS CLI
2. aws sts get-caller-identity
3. configurar región
4. obtener HOSTED_ZONE_ID
5. CDK bootstrap
6. CDK diff
7. CDK deploy
8. revisar outputs
9. configurar GeoLite2 si se utiliza
10. build extensión producción
11. crear licencia real
12. activar extensión
13. validar Gmail
14. validar Outlook
15. validar pixel
16. validar popup
17. revisar CloudWatch
18. revisar DynamoDB
19. probar revoke

No ejecutar estos pasos.

# Smoke test checklist

Crear checklist reusable.

## Activation

- código válido
- código inválido
- persistence reload
- maxDevices

## Gmail

- compose detection
- Track OFF
- Track ON
- send unique
- pixel
- fallback

## Outlook

mismos checks.

## Tracking

- POST tracking
- GET pixel
- OPEN event
- GET history
- openCount
- firstOpenedAt
- lastOpenedAt

## Metadata

- geo
- browser
- OS
- device

## Popup

- recent list
- detail
- refresh
- historical event compatibility

## Domain

- HTTPS
- certificate
- DNS
- /api
- /o

## Admin

- create
- list
- revoke
- revoked activation denied

# Troubleshooting

Añadir problemas comunes:

- extension no carga
- content script no detecta compose
- Track email no aparece
- createTracking 401
- activation falla
- pixel no registra
- OPEN no aparece
- geo unavailable
- custom domain DNS pendiente
- certificate pending
- CSP errors Gmail/Outlook
- Gmail proxy
- Outlook CSP warnings
- JWT expired
- license revoked
- max devices reached

Para cada uno:
causa probable + cómo diagnosticar.

# README final

Actualizar README raíz para explicar:

## Producto

Qué hace Email Tracker.

## Arquitectura

Extension
→ API Gateway
→ Lambda
→ DynamoDB
→ Secrets Manager
→ Route53/ACM

## Providers

- Gmail Web
- Outlook Web

## Features MVP

- activation
- Track email
- open detection
- open count
- approximate geo
- browser/device
- popup history
- admin license CLI

## Limitaciones

Listado claro.

## Dev setup

## Tests

## Build

## Deployment

## Admin CLI

## Security

## Privacy

## Troubleshooting

# Architecture diagram

Si README ya usa Mermaid, añadir/actualizar diagrama.

Ejemplo conceptual:

Browser Extension
|
v
tracking.cesaragudelo.com
|
API Gateway
|
+--> Activation Lambda
+--> Tracking Lambda
+--> Open Pixel Lambda
+--> Get Tracking Lambda
|
v
DynamoDB

Secrets Manager
GeoLite2

Mantenerlo simple.

# Version / MVP status

Añadir sección:

MVP Status

Debe distinguir:

Implemented locally:

- Gmail
- Outlook
- activation
- tracking
- popup
- geo/device
- domain infrastructure
- admin CLI

Pending production validation:

- AWS deploy
- DNS
- ACM real
- GeoLite2 real
- E2E production

No afirmar que producción está validada.

# No implementar

No añadir:

- billing
- payments
- SaaS dashboard
- teams
- organization accounts
- Cognito
- SSO
- link tracking
- attachment tracking
- notifications
- analytics dashboard
- reports
- exports
- mobile apps
- Firefox
- Safari extension

# Tests finales

Ejecutar:

npm run build
npm run lint
npm test
npm run format:check

y:

npm run synth --workspace=@email-tracker/cdk -- --no-lookups

Si existe configuración custom domain activable:
validar synth con dominio OFF y ON como en Milestone 14.

# Final report

Al terminar informa:

- archivos modificados
- comandos admin nuevos
- comportamiento create/list/revoke
- installations si aplica
- tests añadidos
- total tests
- build
- lint
- format
- synth
- documentación
- checklist deployment
- checklist smoke
- limitaciones
- qué queda pendiente para producción

No realizar ningún cambio real en AWS.

No avanzar a funcionalidades fuera del MVP.

Detente cuando el Milestone 15 esté terminado.
