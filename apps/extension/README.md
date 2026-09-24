# Email Tracker — extensión Chromium base

Milestone 2: una sola extensión Manifest V3 para Google Chrome y Microsoft Edge.
El popup muestra `Email Tracker` y `Status: Not activated`. El content script
únicamente escribe `Email Tracker extension active` en la consola de los tres
sitios declarados. El service worker únicamente registra su inicio.

No hay activación real, adaptadores de correo, tracking ni llamadas a servicios.
No se solicitan permisos de APIs ni `host_permissions` adicionales: los patrones
de `content_scripts.matches` limitan dónde se ejecuta el script. El navegador
puede mostrar el acceso a esos sitios durante la instalación.

## Estructura

```text
public/manifest.json    Manifiesto copiado a dist/ por Vite
popup.html              Entrada HTML del popup
src/content.ts          Script común a los tres sitios
src/background.ts       Service worker de tipo module
src/popup/popup.ts       Presentación del estado fijo
src/popup/popup.css      Estilos del popup
vite.config.ts          Compilación del popup, worker y content script
```

El HTML está en la raíz del workspace para generar `dist/popup.html` directamente.
No se añade configuración de entornos hasta que exista algo que configurar.

## Compilar y verificar

Con Node.js 24 y npm 11, desde la raíz del monorepo:

```sh
npm ci
npm run build --workspace=@email-tracker/extension
npm run lint
npm test
npm run format:check
```

TypeScript comprueba los tipos en modo strict sin emitir archivos; Vite genera
el paquete instalable. La primera compilación limpia `dist/`, copia el manifiesto
y genera el popup y el worker. La segunda añade `content.js` como IIFE autónoma,
sin imports de módulos, conservando el resto de los archivos.

```text
dist/
├── manifest.json
├── popup.html
├── popup.js
├── assets/popup-<hash>.css
├── content.js
└── background.js
```

Todos los recursos son locales; no hace falta servidor de desarrollo.
No hay lógica de negocio que justifique pruebas unitarias en este milestone;
Vitest mantiene la configuración raíz y puede terminar sin encontrar tests.
No se utilizan pruebas E2E. La carga real se verifica manualmente.

## Validación manual en Google Chrome

1. Ejecuta el build indicado arriba.
2. Abre `chrome://extensions`.
3. Activa **Developer mode** (Modo de desarrollador).
4. Pulsa **Load unpacked** (Cargar descomprimida).
5. Selecciona `apps/extension/dist`, no la carpeta fuente. En este proyecto bajo
   Windows, la ruta es `C:\Projects\email-tracker\apps\extension\dist`.
6. Comprueba que aparece **Email Tracker**, está habilitada y no muestra errores.
7. En el menú de extensiones de la barra de herramientas, abre **Email Tracker**;
   opcionalmente fíjala para acceder a su icono directamente.
8. Comprueba que el popup muestra **Email Tracker**, **Status:** y **Not activated**,
   con estilos aplicados.
9. Abre Gmail Web en `https://mail.google.com/` e inicia sesión si hace falta.
10. Abre DevTools con F12 o Ctrl+Shift+I, selecciona **Console** y recarga Gmail.
    Comprueba el mensaje `Email Tracker extension active`. Mantén habilitado el
    nivel **Info** y desactiva filtros de texto o de contexto que oculten el log.
11. Repite la comprobación en `https://outlook.office.com/` y
    `https://outlook.live.com/` con una sesión disponible. Si el proveedor redirige
    a otro dominio, el script no se ejecutará allí: el alcance son los tres hosts
    solicitados, sin ampliar permisos.
12. En `chrome://extensions`, inspecciona el enlace del service worker de la
    extensión. No debe haber errores. Es normal que quede inactivo al no tener
    tareas pendientes; al iniciarse registra `Email Tracker background ready`.

## Validación manual en Microsoft Edge

1. Usa exactamente el mismo `apps/extension/dist` generado anteriormente.
2. Abre `edge://extensions`.
3. Activa **Developer mode** (Modo de desarrollador).
4. Pulsa **Load unpacked** (Cargar descomprimida).
5. Selecciona `apps/extension/dist` (en Windows:
   `C:\Projects\email-tracker\apps\extension\dist`).
6. Comprueba que **Email Tracker** aparece habilitada y sin errores.
7. Abre **Email Tracker** desde el menú de extensiones de la barra de herramientas.
8. Comprueba **Email Tracker**, **Status:** y **Not activated** en el popup.
9. Abre `https://mail.google.com/`, abre DevTools → **Console** y recarga la página.
   Debe aparecer `Email Tracker extension active`; habilita **Info** y elimina
   filtros si no lo ves.
10. Repite en los dos hosts de Outlook e inspecciona el service worker desde
    `edge://extensions`, con las mismas consideraciones que en Chrome.

Después de cada cambio, vuelve a compilar, pulsa **Reload** (Recargar) en la tarjeta
de la extensión y recarga las pestañas de correo ya abiertas.

Referencias oficiales: [carga local en Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)
y [carga local en Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading).
