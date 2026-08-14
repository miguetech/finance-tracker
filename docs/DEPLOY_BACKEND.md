# Guía de despliegue del backend para compartir la app (dueño)

> Guía para **personas sin conocimientos técnicos**. Todo se hace con clicks en Google, una sola vez. El backend es un servicio gratis de Google que deja que otras personas usen tu app **sin ver ni tocar tu hoja de cálculo**.

## ¿Qué hace esta guía?

Tu hoja de cálculo (con tus clientes, facturas, gastos...) queda **privada y solo para ti**. El backend actúa como un "portero" que:

- Revisa **quién entra** (con su cuenta de Google).
- Revisa **qué puede ver y qué puede editar** cada persona, según el rol que tú le diste.
- Le muestra la app a esa persona, pero **nunca le enseña la hoja**.

Todo el control está en tus manos.

---

## 1. Requisitos

Antes de empezar, ten esto listo:

- Tu cuenta de Google (la misma con la que usas la hoja).
- Tu app web **ya desplegada** y funcionando (tienes una dirección tipo `tua-app.com`).
- Una computadora con **Node.js y pnpm** instalados (solo para el paso del archivo `Code.js`, lo haces el dueño **una sola vez**).

---

## 2. Cómo funciona (en pocas palabras)

```
Persona invitada → abre el link que le compartiste
        │
        ▼
tu-app.com/?vista=1&api=<url-del-backend>
        │
        ▼
Backend (Google Apps Script, privado) → revisa el email y el rol
        │
        ▼
La app muestra solo lo que su rol permite  (la hoja NUNCA se muestra)
```

---

## 3. Paso a paso

### Paso 1: Generar el archivo `Code.js`

> Este paso lo haces en tu computadora, una sola vez.

1. Abre una terminal en la carpeta del proyecto (`finance-tracker`).
2. Escribe:

```bash
pnpm build:script
```

3. El comando crea un archivo en `apps/script/dist/Code.js`. Es un solo archivo con todo el backend adentro.

**[CAPTURA 1: resultado del comando `pnpm build:script` en la terminal]**

### Paso 2: Pegar el backend en Google Apps Script

1. Abre **tu hoja** de FinanceTracker.
2. Menú **Extensiones → Apps Script** (se abre una ventana nueva).

**[CAPTURA 2: menú Extensiones → Apps Script]**

3. En la pestaña `Code.gs` (izquierda), **borra todo** y pega el contenido completo de `apps/script/dist/Code.js`.

**[CAPTURA 3: editor de Apps Script con el código pegado]**

### Paso 3: Publicar el backend como "Aplicación web"

1. Botón **Deploy → New deployment**.

**[CAPTURA 4: menú Deploy → New deployment]**

2. Elige el tipo **Web app**.
3. Configura dos opciones importantes:
   - **Execute as (Ejecutar como)**: **Me** (tú, el dueño). Así el backend siempre actúa con tu identidad y nadie más necesita acceso a la hoja.
   - **Who has access (Quién tiene acceso)**: **Anyone** (cualquier persona). No te preocupes: aunque cualquiera pueda "llamar a la puerta", **sin tu link y sin un rol asignado no ve nada**.
4. Click en **Deploy**.
5. Google te mostrará una **pantalla de autorización** pidiendo que permitas al script acceder a tu hoja de cálculo. **Acéptala** (elige tu cuenta y *Allow*). Si te avisa que *"Google has not verified this app"*, es **normal** para un script personal: dale a *Advanced → Go to ... (unsafe)*. Esto solo lo haces tú, el dueño, en este paso.
6. Copia la **URL del deployment** (termina en `/exec`). Se parece a `https://script.google.com/macros/s/AKfycb.../exec`.

**[CAPTURA 5: pantalla de New deployment con la URL del Web app]**

> Si ya desplegaste antes: usa **Manage deployments → Edit** y **New version**; la URL no cambia.

### Paso 4: Pegar la URL del backend en la app

1. Abre tu app web e inicia sesión con tu cuenta (tú eres el **dueño**).
2. Ve a la sección **Compartir** (menú lateral).
3. En "URL del backend", pega la URL del paso anterior y dale **Guardar**.

**[CAPTURA 6: sección Compartir con la URL del backend guardada]**

> **IMPORTANTE — la pantalla de Google que ve el invitado:** tu app usa el inicio de sesión de Google, y en la configuración de Google Cloud la pantalla de consentimiento suele estar en **modo Testing** (solo tú apareces como usuario de prueba). Eso haría que un invitado vea *"app in testing mode / access blocked"* al entrar. Para que las personas invitadas puedan entrar:
>
> - En **Google Cloud Console** → *APIs & Services → OAuth consent screen*, publica la app (botón **Publish app**) para que cualquiera con tu link pueda usar el inicio de sesión, **o**
> - Agrega cada persona invitada como **test user** en esa misma pantalla (solo sirve para equipos muy pequeños).
>
> Publicar la app es lo recomendado. Hazlo **antes** de compartir el link.

### Paso 5: Copiar el link para invitar personas

1. En la misma sección **Compartir**, dale a **Copiar link**.
2. El link queda así:

```
tu-app.com/?vista=1&api=<url-del-backend>
```

3. **Ese link** es lo único que compartes. Quien lo abra entra en "modo visita" y solo ve lo que su rol permite.

**[CAPTURA 7: mensaje "Link copiado" en la sección Compartir]**

---

## 4. Tabla de roles

| Rol | Qué puede hacer |
|---|---|
| **admin (dueño)** | Todo: ver y editar todo. Es **automático** (tu email), no se elige ni se elimina. |
| **asistente** | Ve y **edita** solo los módulos que tú elijas (clientes, gastos, facturas...). |
| **solo_lectura** | Ve **todo**, pero no puede editar nada. |
| **ver_facturas** | Ve panel, facturas y clientes (solo lectura). |
| **ver_reportes** | Ve panel y reportes (solo lectura). |
| **ver_gastos** | Ve panel y gastos (solo lectura). |
| **ver_empleados** | Ve panel y empleados (solo lectura). |
| **ver_cuentas** | Ve panel, proveedores y cuentas por pagar (solo lectura). |
| **personalizado** | Tú eliges módulo por módulo **qué puede ver** (y con asistente, qué editar). |

### Cómo agregar o quitar a alguien

1. Sección **Compartir → Agregar**.
2. Escribe el **email de Google** de la persona.
3. Elige el **rol** (si eliges *Asistente* o *Personalizado*, marca los módulos con los botoncitos).
4. **Guardar**. Para quitar el acceso: botón **Eliminar** junto al email — pierde el acceso de inmediato.

---

## 5. Reglas de seguridad (MUY IMPORTANTE)

Sigue estas reglas siempre:

1. **NUNCA compartas la hoja de cálculo** por Google (ni "solo lectura"). Si lo haces, la persona ve tus datos directo, fuera de la app, y los roles dejan de proteger nada.
2. **NUNCA** des acceso al **proyecto de Apps Script** (ni *editor* ni *viewer*). Ese proyecto contiene la lógica; nadie más que tú debe tocarlo.
3. El **único** link que compartes es el de la app: `tu-app.com/?vista=1&api=<url-del-backend>`.
4. Solo compartes el link con **personas de confianza**. El link no pide contraseña: la "llave" es la cuenta de Google de la persona + el rol que le diste.
5. Si una persona ya no debe entrar: **Elimínala** de la sección Compartir. Eso basta, aunque conserve el link.

---

## Concurrencia de folios

Si dos personas emiten facturas al mismo tiempo, el número de folio podría duplicarse. El backend serializa sus propias escrituras con un candado de Apps Script (`LockService`) alrededor de la asignación de folios, de modo que las peticiones simultáneas al backend no chocan entre sí. Aún queda una ventana mínima de carrera si tú, como dueño, emites una factura **directamente desde tu sesión** (sin pasar por el backend) mientras otra persona la emite por el backend. Para evitar el problema, emite desde un solo lugar a la vez.

---

## 6. Solución de problemas

### El invitado ve "Sin acceso" o una pantalla vacía
- Verifica que su **email exacto** está en la sección Compartir (el backend compara el email de su cuenta de Google).
- Verifica que la **URL del backend** guardada en la sección Compartir es la correcta (termina en `/exec`).
- Pide que abra el link **en una ventana normal**, sin modo incógnito, e inicie sesión con esa cuenta.

### El invitado ve "app in testing mode / access blocked"
- Es la **pantalla de consentimiento de OAuth** en modo Testing. Publica la app en Google Cloud Console (*APIs & Services → OAuth consent screen → Publish app*) o agrega a esa persona como **test user**. Ver el aviso del Paso 4.

### El link abre la app pero pide iniciar sesión en Google
- Es normal: la persona entra con **su** cuenta de Google. El backend la reconoce por el email.

### "Origin no está permitido" / error de CORS
- El backend rechaza peticiones que no vienen de tu app. Verifica:
  - El link compartido empieza por la dirección **exacta** de tu app (`tu-app.com/...`), sin `www` extra ni dirección de prueba.
  - No cambiaste la URL de la app después de copiar el link (por ejemplo, de `localhost` a producción). Genera un **link nuevo** desde la sección Compartir.
- Revisa que el deployment del Web app está **"Anyone"** (Paso 3).

### El backend deja de responder / errores intermitentes
- **Cuotas de Apps Script**: el servicio gratis tiene límites diarios. Si la app es para muchas personas, revisa la página de cuotas de Apps Script y, si hace falta, busca aumentar el límite (versión pagada) o repartir el uso.
- Prueba **redesplegar** (Paso 3 → Manage deployments → New version) y **guardar de nuevo** la URL en Compartir.

### Hice un cambio y quiero que se refleje
- Después de cambiar el backend: corre `pnpm build:script`, **reemplaza todo** el contenido en `Code.gs` y despliega una **nueva versión** (Paso 3). La URL del deployment no cambia.

---

## Resumen rápido

1. `pnpm build:script` → genera `apps/script/dist/Code.js`.
2. Pegarlo en **Extensiones → Apps Script** (borrar antes).
3. **Deploy → New deployment → Web app**: Ejecutar como **Me**, acceso **Anyone**.
4. Copiar URL (`.../exec`) → pegarla en la app → sección **Compartir → Guardar**.
5. **Copiar link** → compartirlo con quien quieras → asignarles rol en **Compartir → Agregar**.
