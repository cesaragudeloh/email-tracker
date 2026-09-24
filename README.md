# Email Tracker

Proyecto para una extensión compatible con Chrome y Edge que permitirá activar
seguimiento en correos de Gmail Web y Outlook Web y consultar aperturas detectadas.
Una apertura detectada no demuestra que una persona haya leído el correo: los
proxies, las cachés y la precarga de imágenes pueden afectar los resultados.

## Arquitectura prevista

Extensión → API Gateway → AWS Lambda → DynamoDB.
El backend registrará cada apertura como un evento independiente. La infraestructura
se definirá mediante AWS CDK y el código común vivirá en `packages/shared`.
Esta arquitectura aún no está implementada.

## Stack

La base actual utiliza Node.js 24, npm 11 con workspaces, TypeScript en modo strict,
ESLint, Prettier y Vitest para pruebas unitarias. Los paquetes usan módulos ESM.
Vite, Manifest V3 y las dependencias de AWS se incorporarán en futuros milestones.

## Estructura

```text
apps/extension/         Base de la futura extensión Chrome/Edge
services/tracking-api/ Base del futuro backend
infrastructure/cdk/    Base de la futura infraestructura AWS CDK
packages/shared/      Base del código compartido
```

Cada workspace contiene `package.json`, `tsconfig.json` y `src/index.ts`.
La configuración TypeScript se hereda de `tsconfig.json` en la raíz;
la extensión incluye tipos DOM y el backend y la infraestructura incluyen tipos Node.js.

## Instalación y validación

Desde la raíz, con Node.js 24 y npm 11:

```sh
npm install
npm run build
npm run lint
npm test
npm run format:check
```

Con el lockfile disponible, `npm ci` permite reinstalar las versiones fijadas.
`npm run build` compila los cuatro workspaces y genera JavaScript, declaraciones
de tipos y source maps dentro de sus carpetas `dist/`, ignoradas por Git.
Para compilar un paquete individual: `npm run build --workspace=@email-tracker/shared`.
`npm run format` aplica Prettier; `npm run format:check` verifica el formato sin editar.
`AGENTS.md` se conserva sin cambios y se excluye del formateo automático.

Vitest busca archivos `*.test.ts` y `*.spec.ts` dentro de `src/` en los cuatro
workspaces. Usa un entorno Node.js y no introduce globals de testing; los futuros
tests deben importar sus utilidades desde `vitest`. Los tests se excluyen del build.
Todavía no hay lógica ni pruebas unitarias: `npm test` termina correctamente sin
tests mediante `passWithNoTests`. Se deberá retirar esa opción al añadir las
primeras pruebas. No se utilizan pruebas E2E.

Para verificar manualmente la base, ejecuta los comandos anteriores y comprueba
que existen `dist/index.js` y `dist/index.d.ts` en cada workspace. `npm ls --workspaces --depth=0` debe listar los cuatro paquetes locales. `git status --short` no debe
mostrar `node_modules/` ni los directorios `dist/`.

## Estado actual

Milestone 1: configuración inicial del monorepo. Los puntos de entrada son módulos
vacíos compilables. No hay extensión instalable, manifiesto, integraciones con
Gmail/Outlook, handlers, recursos AWS, tracking pixel, activación, JWT,
geolocalización ni análisis de User-Agent. No se necesitan credenciales AWS ni
archivos `.env` para validar este milestone.
