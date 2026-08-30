# 🚀 Poner RuteoTiendas en internet

Son **dos servicios** y se despliegan en este orden:

| Pieza | Dónde | Por qué ahí |
|---|---|---|
| `motor-api` (Python + OR-Tools) | **Render** | Vercel no ejecuta servidores Python persistentes |
| `ruteo-web` (Next.js) | **Vercel** | Es su terreno natural |

La web habla con el motor a través de su propio proxy (`/api/motor`), así que
**no hay CORS que configurar** y la dirección del motor se cambia en el panel de
Vercel sin recompilar nada.

---

## Paso 1 — Subir el código a GitHub

Crea **dos repositorios vacíos** en <https://github.com/new> (sin README, sin
.gitignore):

- `ruteo-motor`
- `ruteo-web`

Luego, en una terminal:

```bash
cd "D:\Archivos Escritorio\geolocalizacion\motor-api"
git remote add origin https://github.com/TU_USUARIO/ruteo-motor.git
git branch -M main
git push -u origin main
```

```bash
cd "D:\Archivos Escritorio\geolocalizacion\ruteo-web"
git remote add origin https://github.com/TU_USUARIO/ruteo-web.git
git branch -M main
git push -u origin main
```

> Los archivos `.env.local` **no se suben**: están en `.gitignore`. Las claves
> se configuran en los paneles de Render y Vercel.

---

## Paso 2 — Motor en Render (~5 min)

1. Entra a <https://dashboard.render.com/> → **New** → **Web Service**.
2. Conecta el repositorio `ruteo-motor`.
3. Render leerá `render.yaml`. Si prefieres configurarlo a mano:
   - **Runtime**: Python 3
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn api:app --host 0.0.0.0 --port $PORT`
   - **Health check path**: `/salud`
4. **Create Web Service** y espera al primer build (instalar OR-Tools y
   scikit-learn tarda varios minutos).
5. Copia la URL que te da, del estilo `https://ruteo-motor.onrender.com`.
6. Compruébalo abriendo `https://ruteo-motor.onrender.com/salud` →
   debe responder `{"estado":"ok"}`.

> **El plan gratuito se duerme a los 15 minutos** sin uso. La primera petición
> después tarda ~50 s en despertar; las siguientes son normales. Cuando lo uses
> en serio, el plan Starter ($7/mes) lo mantiene despierto.

---

## Paso 3 — Web en Vercel (~5 min)

1. Entra a <https://vercel.com/new> e importa el repositorio `ruteo-web`.
2. Vercel detecta Next.js solo. Antes de desplegar, abre
   **Environment Variables** y añade las tres:

   | Nombre | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://vfrebzeszunlublugosk.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (el de tu `.env.local`) |
   | `MOTOR_API_URL` | la URL de Render del paso 2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | *Settings → API → service_role* en Supabase ¹ |

   ¹ **Solo** para que un admin pueda crear usuarios de su equipo desde la app.
   Es una clave **secreta**: va únicamente aquí (variable de servidor en Vercel)
   y en tu `.env.local`, **nunca** con prefijo `NEXT_PUBLIC_` ni en el navegador.
   Sin ella, el resto de la app funciona; solo el botón «Crear usuario» avisará
   que falta configurarla.

3. **Deploy**. En un par de minutos tendrás tu dirección
   `https://ruteo-web-xxxx.vercel.app`.

> `MOTOR_API_URL` es una variable **de servidor**: si mañana cambias de
> proveedor, la editas en Vercel y surte efecto sin volver a compilar.
> Las `NEXT_PUBLIC_*` sí requieren un redespliegue al cambiarlas.

---

## Paso 4 — Comprobar que quedó bien

1. Abre `https://TU-APP.vercel.app/api/motor` en el navegador. Debe responder
   `{"motor":"https://…onrender.com","ok":true,…}`. Si dice `ok:false`, el
   motor está dormido o la URL está mal.
2. Entra a la app, ve al **Planificador** y pulsa **Agrupar tiendas**.
3. Calcula rutas y guarda el despacho.

---

## Después de esto

- **Cada `git push` a `main` redespliega solo**, en ambas plataformas.
- Supabase no necesita cambios: la clave publicable es pública por diseño y cada
  tabla está protegida con RLS.
- Añade tu dominio propio en Vercel → *Settings → Domains* cuando quieras.

## Si algo falla

| Síntoma | Causa habitual |
|---|---|
| «No se pudo contactar al motor» | Render dormido (espera 1 min) o `MOTOR_API_URL` mal escrita |
| «El motor tardó demasiado» | Baja los segundos de optimización por ruta, o usa el motor de línea recta |
| El build de Vercel falla | Revisa que las tres variables de entorno estén puestas |
| Entras y te devuelve al login | Faltan las variables de Supabase |
