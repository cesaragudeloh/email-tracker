# Smoke test manual reusable

**Estado inicial: pendiente.** Copiar esta checklist para cada validación autorizada.
Marcar cada caso como aprobado/fallido/no aplicable y explicar lo pendiente.
No es un test E2E automatizado; usar únicamente cuentas y destinatarios de prueba propios.

| Ejecución                                        | Valor     |
| ------------------------------------------------ | --------- |
| Fecha, responsable y commit/build                | Pendiente |
| Cuenta AWS / región / stack                      | Pendiente |
| Dominio y estado ACM/DNS                         | Pendiente |
| Navegador / versión / OS                         | Pendiente |
| Proveedor / host / idioma / tipo de compose      | Pendiente |
| GeoLite2 empaquetada y fecha de DB               | Pendiente |
| Resultado / incidencias / evidencia sin secretos | Pendiente |

No copiar códigos, JWT, Authorization, IP/UA raw ni datos personales al informe.
Repetir los casos de providers en **Chrome y Edge**, **Gmail y Outlook**, anotando
las combinaciones realmente probadas. Si una variante no está disponible, dejarla
pendiente; no extrapolar compatibilidad.

## Domain

- [ ] DNS del dominio apunta al custom domain regional, sin CNAME conflictivo.
- [ ] HTTPS válido para `tracking.cesaragudelo.com`; ACM ISSUED y TLS correcto.
- [ ] Mapping raíz sin prefijo de stage; endpoints `/api/activate`, `/api/tracking`,
      `/api/tracking/{trackingId}` y `/o/{trackingId}` en el mismo dominio.
- [ ] Manifest compilado permite el dominio definitivo; no usa execute-api como producto.
- [ ] Un 404 de `/` no se confunde con caída de API; comprobar rutas reales.

## Activation

- [ ] Instalación nueva muestra Not activated y mantiene installationId al recargar.
- [ ] Código válido almacenado en AWS produce Activated; código inválido es rechazado.
- [ ] Reload de popup, extensión y navegador conserva autorización vigente.
- [ ] Reactivar la misma instalación no aumenta activeDevices.
- [ ] Nuevos perfiles hasta maxDevices activan; el siguiente recibe DEVICE_LIMIT_REACHED.
- [ ] JWT expirado requiere reactivación; no hay renovación automática ni bypass local.

## Gmail

- [ ] Compose nuevo detectado sin controles duplicados al mutar el DOM.
- [ ] Dos compose simultáneos tienen toggles independientes, inicialmente OFF.
- [ ] Track OFF envía normalmente, sin POST tracking ni pixel propio.
- [ ] Track ON con destinatario válido hace un solo POST al intentar Send.
- [ ] Doble click/reintento y atajo soportado no crean tracking/envíos duplicados.
- [ ] Pixel propio único con UUID y URL definitiva; mensaje, firma, links e imágenes se conservan.
- [ ] Correo recibido contiene pixel; inspeccionar original sin guardar el cuerpo en informes.
- [ ] Fallo backend, 401, metadata incompleta o fallo de pixel permiten fallback sin bloquear envío.
- [ ] OFF tras intento fallido retira pixel propio; no altera contenido ajeno.

## Outlook

- [ ] Mismos checks Gmail: detección, controles únicos y dos compose independientes.
- [ ] Track OFF: envío normal sin POST/pixel.
- [ ] Track ON: una creación, un pixel y un envío, incluso con doble click.
- [ ] Correo recibido conserva contenido/firma y URL del pixel.
- [ ] Fallback de API/metadata/pixel no deja el envío bloqueado.
- [ ] Probar hosts disponibles: office.com, live.com y office365.com, indicando pendientes.
- [ ] Inline/pop-out/atajos: validar solo las variantes reconocidas; sin metadata, envío sin tracking.

## Tracking

- [ ] POST autenticado devuelve 201, UUID backend y `https://tracking.cesaragudelo.com/o/{trackingId}`.
- [ ] POST/GET protegidos sin JWT o con token inválido/expirado devuelven 401.
- [ ] Otra licencia no puede consultar ese tracking (404 según modelo de ownership).
- [ ] Pixel válido público devuelve 200 image/png transparente 1×1.
- [ ] Cada request recibida produce un registro OPEN independiente; solicitud directa también cuenta.
- [ ] UUID inválido/tracking inexistente no genera registros OPEN.
- [ ] GET history autenticado devuelve eventos, openCount, firstOpenedAt y lastOpenedAt coherentes.
- [ ] Sin eventos: CREATED, openCount 0 y fechas nulas. Con eventos: OPEN_DETECTED.
- [ ] Caché puede impedir nuevas requests; no exigir una request por cada apertura humana.

## Metadata

- [ ] País/región/ciudad aproximados si la IP y GeoLite2 permiten localización.
- [ ] Sin DB/IP localizable, geo unavailable y OPEN sigue disponible.
- [ ] Browser/version, OS y Desktop/Mobile/Tablet/Unknown según UA recibido.
- [ ] UA desconocido o de proxy se interpreta como desconocido/proxy, no identidad del destinatario.
- [ ] Comparar popup con evento almacenado; no inferir ubicación real del destinatario.

## Popup

- [ ] Recent list muestra creaciones locales; 100 más recientes como máximo.
- [ ] Detail muestra asunto/destinatario, estado, conteo, fechas e historial.
- [ ] Refresh consulta de nuevo; Back vuelve a lista; no hay polling.
- [ ] Errores 401/404/red son recuperables y no borran historial local.
- [ ] Eventos históricos sin geo/device siguen mostrando Unknown/no disponible, si existen.
      Sin históricos reales, documentar no aplicable y evidencia de tests unitarios.

## Admin

- [ ] Create dry-run no contacta AWS ni permite activar el código no almacenado.
- [ ] Create --write muestra código una sola vez y persiste solo hash, ACTIVE y contadores.
- [ ] List muestra campos administrativos, no hashes, código, JWT ni secretos.
- [ ] Installations muestra fechas/estado por licencia, sin tokens; revisar paginación con mocks
      unitarios si el volumen real no alcanza múltiples páginas.
- [ ] Revoke sin --write anuncia el cambio sin llamadas AWS; no valida existencia.
- [ ] Revoke --write cambia a REVOKED; repetir es consistente y conserva historial/cupos.
- [ ] Licencia inexistente es error y no crea un registro nuevo.
- [ ] Nuevas activaciones y reactivaciones de revocada son denegadas.
- [ ] JWT previo puede seguir válido hasta exp; pixel de correo anterior permanece público.

## Observabilidad y cierre

- [ ] CloudWatch sin códigos/JWT/secretos/cuerpos; revisar errores y throttling.
- [ ] DynamoDB EMAIL/OPEN separados y licencias/instalaciones consistentes, sin ediciones manuales.
- [ ] Documentar límites: Open detected no demuestra lectura humana; geo/device pueden ser del proxy.
- [ ] Registrar fallos, variantes no probadas y decisión del operador. No marcar producción validada
      por build/tests/synth solamente.
