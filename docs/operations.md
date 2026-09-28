# Runbook de deployment y operación MVP

**Pendiente de ejecutar.** Los comandos AWS de este documento son instrucciones
para un deployment futuro autorizado, no pasos realizados durante Milestone 15.
Los comandos locales build/test/synth no despliegan. Usar una terminal privada sin
shell tracing (`set -x`), grabación de sesión ni captura de tokens/códigos.

Registrar responsable, fecha, commit, cuenta/región previstas y resultado de cada
paso. Detenerse ante una cuenta/zona incorrecta o un diff no esperado.

## 1. Instalar y configurar AWS CLI

Instalar AWS CLI en el mismo entorno de terminal donde se ejecuta Node/npm.
Configurar el perfil/credenciales apropiado (sesión temporal o método establecido
por el administrador). AWS SDK y CDK usan la cadena predeterminada; no copiar
credenciales al repositorio ni a la extensión. Confirmar `aws --version`.
Para usar un perfil existente, definir `AWS_PROFILE` en esa terminal; no hay
profile/account/region hardcodeados en el código.

## 2. Confirmar identidad

```sh
aws sts get-caller-identity
```

Comprobar cuenta y ARN con el administrador. No continuar con identidad inesperada.
Este comando es lectura real AWS y no se ejecutó durante este milestone.

## 3. Configurar región y preparar artefactos

Definir `AWS_REGION` y `AWS_DEFAULT_REGION` con la región acordada. No asumir
us-east-1: ACM debe estar en la misma región del HTTP API regional.
Después de instalar Node 24/npm 11:

```sh
npm ci
npm run build
npm run lint
npm test -- --maxWorkers=2
npm run format:check
```

Cuenta y región se resuelven por CDK según perfil/entorno. Mantener los mismos
valores en synth, diff, deploy y comandos administrativos. Si se usará GeoLite2,
aportar la MMDB antes de este primer build; el paso 9 explica también cómo añadirla
posteriormente con un nuevo build/diff/deploy autorizado.

## 4. Obtener HOSTED_ZONE_ID y habilitar dominio

En Route53 identificar la zona **pública existente** `cesaragudelo.com` en la misma
cuenta. Confirmar delegación de nameservers y ausencia de registros en conflicto
para `tracking.cesaragudelo.com`. No crear otra hosted zone ni CNAME manual.
Definir en la terminal el ID real sin `/hostedzone/` y:

```sh
export ENABLE_CUSTOM_DOMAIN=true
export TRACKING_BASE_URL=https://tracking.cesaragudelo.com
npm run synth --workspace=@email-tracker/cdk -- --no-lookups
```

`HOSTED_ZONE_ID` debe ser una variable ya definida por el operador. Si se omite,
synth genera el parámetro requerido `HostedZoneId`; aportar su valor real en deploy
con `--parameters EmailTrackerActivation:HostedZoneId=ID_REAL`, o preferiblemente
volver a sintetizar con la variable. Los ejemplos ID_REAL/CUENTA/REGION son
placeholders, no valores utilizables. No se consulta AWS para resolver la zona.

Revisar `infrastructure/cdk/cdk.out/EmailTrackerActivation.template.json`: dos
tablas, cuatro Lambdas, secreto, logs, HTTP API, certificado exacto sin wildcard,
alias A IPv4 y mapping raíz `$default`. No hay AAAA ni CloudFront.

## 5. CDK bootstrap (solo si falta)

Confirmar primero que la cuenta/región necesita bootstrap. Este paso crea recursos
reales y requiere autorización del operador:

```sh
npm run bootstrap --workspace=@email-tracker/cdk -- aws://CUENTA/REGION
```

Sustituir CUENTA/REGION por los valores confirmados, no inventados.

## 6. CDK diff

```sh
npm run diff --workspace=@email-tracker/cdk -- --no-lookups --no-change-set
```

Este diff consulta AWS; `--no-change-set` evita crear un change set para el análisis.
Revisar especialmente IAM, retención, nombres/rutas, variables de URL, dominio y
DNS. No ampliar permisos de las Lambdas para el CLI administrativo. Guardar solo
evidencia no sensible de la revisión y resolver cambios inesperados antes de seguir.

## 7. CDK deploy

Con el diff revisado, mismo entorno y aprobación del deployment:

```sh
npm run deploy --workspace=@email-tracker/cdk -- --no-lookups
```

Mantener `ENABLE_CUSTOM_DOMAIN`, `HOSTED_ZONE_ID` y las demás variables en futuras
actualizaciones para evitar retirar recursos accidentalmente. No omitir revisiones
IAM. ACM usa validación DNS en Route53; esperar emisión y propagación. No crear
certificado manual ni modificar DNS por fuera del stack para resolverlo a ciegas.

## 8. Revisar outputs y HTTPS

- `TrackingDomain`: `https://tracking.cesaragudelo.com`.
- `ApiCustomDomain`: `tracking.cesaragudelo.com`.
- `ApiUrl`: execute-api, solo diagnóstico.
- `LicenseTableName`, `TrackingTableName`: tablas reales para CLI/inspección.

Comprobar DNS, certificado ISSUED, hostname, cadena TLS y mapping sin prefijo de
stage. GET `/` puede devolver 404 porque no es una ruta del producto; no usarlo
como único indicador de salud. Verificar las rutas documentadas en el smoke test.

## 9. Configurar GeoLite2 si se utiliza

Obtener **GeoLite2 City MMDB** mediante la cuenta MaxMind del operador; revisar
condiciones/licencia. Guardarla fuera del repositorio, sin publicar claves ni DB.
No hay descarga automática ni servicio HTTP de geolocalización.

```sh
GEOLITE2_CITY_DB_PATH=/ruta/privada/GeoLite2-City.mmdb npm run build
```

Build copia el archivo a `services/tracking-api/build/lambda/GeoLite2-City.mmdb`;
Lambda busca `/var/task/GeoLite2-City.mmdb`. Si el archivo configurado no es legible,
build falla. Si la variable se omite, build elimina cualquier copia anterior del
bundle: no olvidar la variable al actualizar. Renovar la DB es responsabilidad
operativa. Si se añadió después del paso 7, repetir synth/diff y deploy autorizado
para subir el nuevo asset antes de probar geo. Sin DB el pixel y OPEN siguen
funcionando; geo queda no disponible. Comprobar cold start/tamaño con la DB real.

## 10. Build e instalación de extensión de producción

Verificar `.env.production` y ausencia de overrides locales no deseados:
`VITE_ACTIVATION_API_URL=https://tracking.cesaragudelo.com`.
Ejecutar `npm run build` (con MMDB si se están preparando también assets backend).
Inspeccionar `apps/extension/dist/manifest.json`: permiso del dominio y matches
Gmail/Outlook. En `chrome://extensions` o `edge://extensions`, activar Developer
mode, cargar la carpeta `dist`, recargar extensión y pestañas del proveedor.
No distribuir el repositorio/backend ni credenciales dentro del paquete de extensión.

## 11. Crear licencia real

Con nombre de tabla y región confirmados, ejecutar en terminal privada:

```sh
npm run license:create -- --max-devices 2 --table TABLE_NAME --region REGION --write
npm run license:list -- --table TABLE_NAME --region REGION
```

Copiar el código mostrado una única vez a un destino privado apropiado; no a logs,
capturas, documentos de pruebas ni Git. List permite verificar el ID y contadores,
no recuperar el código. No usar el código de un dry-run previo, que no fue almacenado.
Confirmar permisos mínimos descritos en el README. Un fallo/timeout de create no
prueba que DynamoDB no haya escrito; revisar list antes de repetir y crear otra licencia.

## 12. Activar extensión

Introducir el código en el popup. Confirmar Activated, persistence tras reload y
una instalación en `license:installations`. No mostrar JWT ni capturar Authorization.
Probar código inválido y límite maxDevices con perfiles de prueba controlados;
reinstalar/borrar storage crea otro installationId y puede consumir otro cupo.

## 13. Validar Gmail

Ejecutar los checks Gmail del [smoke checklist](smoke-test.md) con correo propio,
Track OFF/ON, click Send, doble click, pixel único, preservación de contenido y
fallback. Repetir en Chrome y Edge. Anotar variantes DOM/idioma.

## 14. Validar Outlook

Repetir los mismos checks para las cuentas/hosts Outlook disponibles. Distinguir
compose nuevo, inline y pop-out; no asumir equivalencia entre interfaces. Lo no
probado queda pendiente, no aprobado.

## 15. Validar pixel y evento

Usar exclusivamente el trackingId de un correo propio creado con la API/extension.
Una request directa al pixel crea un OPEN, aunque ninguna persona haya leído.
Confirmar 200 image/png, PNG transparente y evento independiente por request
recibida. UUID inválido debe fallar; tracking inexistente no debe crear eventos.
Fallos de enriquecimiento no impiden pixel; fallo de persistencia puede devolver
error, no se debe interpretar un PNG cualquiera como éxito de almacenamiento.

## 16. Validar popup

Listado reciente, detalle, Refresh, conteo y fechas. Comparar eventos recibidos
con DynamoDB; validar geo/browser/OS/device y Unknown ante datos no disponibles.
Compatibilidad con históricos sin enriquecimiento se prueba con fixtures unitarios;
si no hay históricos reales, marcar ese check de producción como no aplicable,
sin editar DynamoDB manualmente para fabricarlos.

## 17. Revisar CloudWatch

En los grupos de cada Lambda revisar requestId, resultados y errores. Correlacionar
trackingId con pruebas sin copiar IP/UA, tokens ni destinatarios a informes.
Revisar errores/latencia/throttling (stage 5 requests/s, burst 10) y logs de geo
no disponible. No habilitar logging de cuerpos, Authorization ni secretos.

## 18. Revisar DynamoDB

Usar consola/lecturas administrativas autorizadas, sin ediciones manuales. Verificar
EMAIL y cada `OPEN#timestamp#eventId`, atributos opcionales y conteo derivado.
En tabla de licencias comprobar lookup hash, LICENSE, INSTALLATION y cupos con CLI.
Cada apertura debe conservarse por separado. Establecer proceso de revisión de
costes/retención: tablas, secreto y logs se retienen al retirar el stack; logs
expiran al mes. El MVP no automatiza borrado ni liberación de dispositivos.

## 19. Probar revoke y cerrar evidencia

En una licencia de prueba propia:

```sh
npm run license:installations -- --license-id LICENSE_ID --table TABLE_NAME --region REGION
npm run license:revoke -- --license-id LICENSE_ID --table TABLE_NAME
npm run license:revoke -- --license-id LICENSE_ID --table TABLE_NAME --region REGION --write
npm run license:revoke -- --license-id LICENSE_ID --table TABLE_NAME --region REGION --write
npm run license:list -- --table TABLE_NAME --region REGION
```

Ambas escrituras deben dejar REVOKED sin borrar registros ni contadores. Intentar
activar y reactivar debe devolver LICENSE_REVOKED. El JWT ya emitido puede seguir
operando hasta exp; comprobarlo sin registrar su valor. El pixel sigue público y
puede registrar solicitudes para emails anteriores. No hay un comando un-revoke
ni blacklist de tokens en el MVP. Cerrar [checklist](smoke-test.md) indicando lo
pendiente y fallos. Nunca declarar producción validada solo porque synth pasó.
