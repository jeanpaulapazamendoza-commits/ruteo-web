# Guía de RuteoTiendas — para avanzar por tu cuenta

Este documento explica **qué tecnologías usa el proyecto, dónde está cada
cosa, cómo funciona todo junto y cuándo tendrás que empezar a pagar**.
Está pensado para que puedas seguir tú solo sin ayuda.

---

## 1. Qué es el proyecto en una frase

Una plataforma web para **planificar rutas de reparto** (last mile): subes un
archivo con las tiendas del día, el sistema las agrupa y calcula el mejor
recorrido, se lo reparte a los conductores en su celular, y ves en vivo qué
se entregó y qué no. Sirve a **varias empresas a la vez**, cada una viendo
solo sus datos.

---

## 2. Las tres piezas del sistema

El proyecto son **tres cosas separadas** que trabajan juntas. Es importante
entender esto porque cada una vive en un sitio distinto:

```
                 ┌─────────────────────────┐
   Navegador ───▶│  ruteo-web (Next.js)     │  ← la aplicación que se ve
   del usuario   │  desplegada en VERCEL    │
                 └───────────┬─────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼                              ▼
   ┌──────────────────┐          ┌──────────────────────┐
   │ motor-api        │          │ Supabase             │
   │ (Python/FastAPI) │          │ base de datos +      │
   │ en RENDER        │          │ login + fotos        │
   │ calcula rutas    │          │ (es la memoria)      │
   └──────────────────┘          └──────────────────────┘
```

1. **`ruteo-web`** — la aplicación web. Es lo que el usuario ve y toca.
   Vive en **Vercel** (dirección: `ruteo-web.vercel.app`).

2. **`motor-api`** — el "cerebro matemático". Recibe una lista de puntos y
   devuelve el mejor orden para visitarlos. Vive en **Render**
   (dirección: `ruteo-motor.onrender.com`). Está aparte porque el cálculo es
   en Python y Vercel no ejecuta Python.

3. **Supabase** — la memoria de todo: usuarios, contraseñas, tiendas, rutas,
   entregas y las fotos de prueba de entrega. Es una base de datos en la nube.

---

## 3. Tecnologías, explicadas

### La aplicación web (`ruteo-web`)

| Tecnología | Versión | Qué hace, en cristiano |
|---|---|---|
| **Next.js** | 16.2 | El marco (framework) sobre el que está construida toda la web. Decide qué página se muestra en cada dirección. |
| **React** | 19.2 | La librería para armar las pantallas con "componentes" (piezas reutilizables). |
| **TypeScript** | 5 | JavaScript con seguridad: avisa de errores antes de publicar. Todo el código `.ts`/`.tsx`. |
| **Tailwind CSS** | 4 | Los estilos (colores, tamaños, espacios). Las clases raras tipo `text-[13px]` son de aquí. |
| **Leaflet** + react-leaflet | 1.9 / 5.0 | Los mapas. El mapa gris con los puntos y las rutas. Usa mapas gratis de OpenStreetMap/CARTO. |
| **@supabase/ssr** + supabase-js | | La conexión con la base de datos y el login. |
| **read-excel-file** | 9.3 | Lee los Excel que sube el usuario. |

### El motor de rutas (`motor-api`)

| Tecnología | Qué hace |
|---|---|
| **FastAPI** + uvicorn | El servidor Python que recibe las peticiones de la web. |
| **Google OR-Tools** | La joya: resuelve el "problema del viajante" (en qué orden visitar N puntos para hacer menos kilómetros). Gratis y sin límite. |
| **scikit-learn** | Agrupa las tiendas en zonas (clustering K-Means). |
| **pandas / numpy / scipy** | Manejo de datos y matemáticas. |
| **OSRM** (servicio externo) | Calcula distancias por **calles reales**, no en línea recta. Es gratis (servidor público) pero sin garantía. |

### La memoria (Supabase)

| Parte | Qué hace |
|---|---|
| **Postgres** | La base de datos donde se guarda todo. |
| **Auth** | El sistema de login (correo + contraseña). |
| **Storage** | Donde se guardan las fotos de entrega (bucket `pod`, privado). |
| **RLS** (Row Level Security) | **La regla de oro de la seguridad**: cada empresa solo puede leer sus propias filas. Es lo que hace posible vender a varias empresas sin que se vean entre sí. |

### Cómo se instaló como "app" en el celular

No es una app de la tienda de Google/Apple. Es una **PWA**: una web que el
conductor guarda en su pantalla de inicio y se abre a pantalla completa,
funciona sin señal y sube las entregas cuando vuelve la cobertura. Eso lo
hacen los archivos `public/manifest.json`, `public/sw.js` y la cola offline.

---

## 4. Dónde está cada cosa (rutas de archivos)

Todo cuelga de `C:\Users\jeanm\OneDrive\Escritorio\geolocalizacion\`.

### Carpetas principales

```
geolocalizacion/
├── ruteo-web/          ← LA APLICACIÓN WEB (repo de GitHub: ruteo-web)
├── motor-api/          ← EL MOTOR DE RUTAS (repo de GitHub: ruteo-motor)
└── datasetmass/        ← el proyecto viejo de Streamlit (ya no se usa)
```

### Dentro de `ruteo-web/`

```
ruteo-web/
├── GUIA.md             ← este documento
├── DESPLIEGUE.md       ← cómo publicar en internet paso a paso
├── package.json        ← lista de tecnologías y sus versiones
├── .env.local          ← claves secretas (NO se sube a GitHub)
│
├── public/             ← archivos que se sirven tal cual
│   ├── manifest.json   ← convierte la web en app instalable
│   ├── sw.js           ← permite abrir la app sin señal
│   └── icono-*.png     ← el icono de la app
│
└── src/                ← TODO EL CÓDIGO
    ├── app/            ← LAS PÁGINAS (cada carpeta = una dirección web)
    ├── components/     ← LAS PIEZAS de pantalla reutilizables
    └── lib/            ← LA LÓGICA (hablar con la base, calcular, etc.)
```

### Las páginas (`src/app/`)

Cada carpeta con un `page.tsx` es **una dirección de la web**. La regla de
Next.js: la carpeta se llama igual que la dirección.

| Archivo | Dirección | Qué es |
|---|---|---|
| `(app)/planificador/page.tsx` | `/planificador` | Subir archivo, agrupar y calcular rutas. **La pantalla principal.** |
| `(app)/torre/page.tsx` | `/torre` | Torre de control: ver en vivo qué entregó cada conductor. |
| `(app)/despachos/page.tsx` | `/despachos` | Lista de todos los ruteos guardados. |
| `(app)/despachos/[id]/page.tsx` | `/despachos/123` | Detalle de un ruteo: asignar conductores, borrarlo. |
| `(app)/zonas/page.tsx` | `/zonas` | Dibujar zonas fijas de reparto. |
| `(app)/flota/page.tsx` | `/flota` | (pantalla vacía, para el futuro) |
| `(app)/equipo/page.tsx` | `/equipo` | Gestionar usuarios (solo admin). |
| `(app)/tiendas/page.tsx` | `/tiendas` | Tiendas guardadas del sistema viejo (mantenimiento). |
| `(app)/organizaciones/page.tsx` | `/organizaciones` | Padrón de empresas (**solo tú, desarrollador**). |
| `(app)/organizaciones/[id]/page.tsx` | `/organizaciones/123` | Ficha de una empresa cliente. |
| `conductor/page.tsx` | `/conductor` | **La app del conductor**: sus rutas del día. |
| `conductor/[rutaId]/page.tsx` | `/conductor/123` | Una ruta: marcar cada entrega. |
| `login/page.tsx` | `/login` | Pantalla de inicio de sesión. |
| `api/motor/[[...ruta]]/route.ts` | `/api/motor/*` | Puente entre la web y el motor (evita problemas de conexión). |
| `api/admin/usuarios/route.ts` | `/api/admin/usuarios` | Crear usuarios (usa la clave secreta). |
| `api/admin/organizaciones/route.ts` | | Dar de alta empresas (solo desarrollador). |

> **`(app)`** entre paréntesis es un truco de Next.js: agrupa páginas que
> comparten el menú lateral, pero **no** aparece en la dirección. Por eso
> `(app)/planificador` se ve como `/planificador`, no `/app/planificador`.
> `[id]` entre corchetes es un comodín: vale para cualquier número.

### Los componentes (`src/components/`) — las piezas de pantalla

| Archivo | Qué dibuja |
|---|---|
| `Planificador.tsx` | Todo el planificador (el más grande, ~1000 líneas). |
| `MapaRutas.tsx` | El mapa con puntos, zonas y rutas. |
| `MapaSeguimiento.tsx` | El mapa de la torre (puntos verde/gris según estado). |
| `TorreControl.tsx` | La torre de control con la barra de progreso. |
| `RutaReparto.tsx` | La pantalla del conductor para marcar entregas. |
| `BarraConductor.tsx` | La cabecera de la app del conductor (aviso "sin señal"). |
| `CargarArchivo.tsx` | El cuadro para subir el Excel/CSV y ponerle nombre. |
| `EditorZonas.tsx` | Dibujar zonas en el mapa. |
| `AsignarRutas.tsx` | Repartir rutas entre conductores. |
| `GestionEquipo.tsx` | Tabla de usuarios (activar, cambiar rol, crear). |
| `PadronEmpresas.tsx` | La tabla de empresas (desarrollador). |
| `FichaEmpresa.tsx` | El detalle de una empresa (desarrollador). |
| `BorrarDespacho.tsx` | El botón de borrar un ruteo. |
| `CuentaBloqueada.tsx` | La pantalla de "cuenta desactivada / servicio suspendido". |
| `NavLateral.tsx` | El menú lateral azul. |
| `ui.tsx` | Piezas pequeñas reutilizables (tarjetas, pastillas, cabecera). |

### La lógica (`src/lib/`) — el "cómo"

Aquí no hay pantallas, solo funciones que hacen el trabajo pesado.

| Archivo | De qué se encarga |
|---|---|
| `motor.ts` | Hablar con el motor de rutas (agrupar, rutear). |
| `despachos.ts` | Guardar/borrar ruteos, comprimir el trazado de las rutas. |
| `zonas.ts` | Decidir si un punto cae dentro de una zona. |
| `plantilla.ts` | Leer el Excel/CSV y entender sus columnas. |
| `entregas.ts` | Estados de entrega, comprimir fotos, abrir Waze/Maps. |
| `cola.ts` | La cola offline: guardar entregas sin señal y subirlas después. |
| `supabase/client.ts` | Conexión a la base **desde el navegador**. |
| `supabase/server.ts` | Conexión a la base **desde el servidor**. |

### El motor (`motor-api/motor_ruteo/`)

| Archivo | Qué calcula |
|---|---|
| `api.py` | El servidor: recibe peticiones y responde. |
| `clustering.py` | Agrupar tiendas en zonas equilibradas. |
| `ruteo.py` | El orden óptimo de visita (OR-Tools). |
| `geo.py` | Distancias entre puntos (línea recta u OSRM). |
| `tiempo.py` | Horas de llegada estimadas, ventanas horarias. |

---

## 5. La base de datos (Supabase)

Son **11 tablas**. Las que importan:

| Tabla | Guarda |
|---|---|
| `organizaciones` | Las empresas clientes. Tiene `activa` (para suspender). |
| `perfiles` | Los usuarios: nombre, rol, a qué empresa pertenecen, si es desarrollador. |
| `despachos` | Cada ruteo (el "documento" del día). |
| `rutas` | Cada ruta dentro de un despacho, con su conductor. |
| `paradas` | Cada punto de entrega, con su estado y su foto. |
| `zonas` | Las zonas fijas dibujadas en el mapa. |
| `importaciones` | Registro de cada archivo subido. |
| `vehiculos` | La flota (aún poco usada). |
| `tiendas` | Tiendas del sistema viejo (compatibilidad). |

> `VentasCarnes` y `escenarios` son de otros experimentos, no de este proyecto.

### El concepto más importante: RLS (aislamiento por empresa)

Cada tabla tiene una regla: **"solo puedes ver filas donde `org_id` sea tu
empresa"**. La función `private.mi_org()` devuelve tu empresa, y si tu empresa
está suspendida, devuelve *nada* — y entonces no ves ningún dato. Así, con un
solo interruptor (`organizaciones.activa`), cortas o devuelves todo el acceso.

Hay **25 funciones** en la base que encapsulan las operaciones delicadas
(guardar un despacho, marcar una entrega, crear un usuario) para que la regla
de seguridad se cumpla siempre.

### La jerarquía de permisos

```
Desarrollador (tú)   → da de alta y suspende empresas; ve el padrón (solo totales)
   │
   └── Admin de empresa → su equipo, crear choferes, borrar ruteos
          │
          └── Planificador → sube archivos, dibuja zonas, calcula rutas
                 │
                 └── Conductor → solo su app de reparto
```

---

## 6. El flujo completo, paso a paso

1. **El planificador** entra a `/planificador`, sube el Excel del día y le
   pone nombre. → se crea un **despacho** en estado *Cargado*.
2. Pulsa **Agrupar** → la web manda los puntos al **motor** (Render), que los
   reparte en zonas. Pulsa **Calcular rutas** → el motor devuelve el orden
   óptimo. → el despacho pasa a *Planificado*.
3. En la **ficha del despacho** (`/despachos/123`), el admin asigna cada ruta
   a un conductor. → pasa a *Asignado*.
4. **El conductor** abre `/conductor` en su celular, confirma su ruta, y va
   marcando cada entrega (entregado / parcial / no entregado) con foto.
   → el despacho pasa a *En reparto* y luego *Cerrado*.
5. **El admin** ve todo en vivo en la **Torre de control** (`/torre`).

---

## 7. Límites gratis y cuándo empezar a pagar

Ahora mismo **todo está en plan gratuito**. Aquí están los límites reales y la
señal de que ya toca pagar.

### Vercel (la web) — plan Hobby (gratis)

| Límite | Cuándo lo tocas |
|---|---|
| Uso **no comercial** | ⚠️ **Este es el que importa.** En cuanto cobres a una empresa por usarlo, técnicamente debes pasar a **Pro ($20/mes)**. Mientras sea prueba, gratis. |
| 100 GB de tráfico/mes | Difícil de tocar con pocas empresas. |

**→ Pagar cuando:** tengas tu primer cliente que pague. Pro = $20/mes.

### Supabase (la memoria) — plan Free (gratis)

| Límite gratis | Cuándo lo tocas |
|---|---|
| **500 MB** de base de datos | Los datos (rutas, paradas) pesan poco: ~19 MB al mes con 1500 puntos/día. Dura ~2 años. |
| **1 GB** de fotos de entrega | ⚠️ **Este es el primero que se llena.** Con 1500 entregas/día y foto, ~3 GB/mes. **Se llena en ~10 días.** |
| El proyecto **se pausa a los 7 días** sin actividad | En pruebas, si no entras una semana, se duerme (se despierta solo al entrar). |
| 50.000 usuarios | Irrelevante. |

**→ Pagar cuando:** empieces a usar fotos de entrega en serio, o cuando no
quieras que se pause. Pro = $25/mes (incluye 8 GB de fotos y no se pausa).

### Render (el motor) — plan Free (gratis)

| Límite gratis | Cuándo lo tocas |
|---|---|
| **Se duerme a los 15 min** sin uso | La primera ruta del día tarda ~50 s en despertar. Molesto pero funciona. |
| 750 horas/mes | Suficiente. |

**→ Pagar cuando:** te moleste la espera de 50 s o tengas reparto todos los
días. Starter = $7/mes (nunca se duerme).

### Resumen: la línea de tiempo del pago

```
HOY (pruebas)                    $0/mes    Todo gratis
   │
   ▼
1er cliente que paga             $52/mes   Vercel Pro + Supabase Pro + Render Starter
   │                                       + OSRM propio recomendado (~$12)
   ▼
Varias empresas                  ~$64-120  El costo casi no sube; el margen crece
```

**Regla simple:** mientras sea prueba tuya, **$0**. El día que una empresa te
pague, sube los tres a plan pago (~$52-64/mes) — con lo que cobras a **un**
cliente ya lo cubres de sobra.

---

## 8. Cómo publicar un cambio (sin mí)

El proyecto se **actualiza solo** cada vez que subes código a GitHub:

```bash
cd ruteo-web
git add -A
git commit -m "descripción de lo que cambiaste"
git push
```

- Al hacer `push` a **`ruteo-web`** → Vercel republica la web sola (~2 min).
- Al hacer `push` a **`ruteo-motor`** (carpeta `motor-api`) → Render republica
  el motor solo.

Si Render no republica solo: entra a dashboard.render.com → servicio
`ruteo-motor` → **Manual Deploy → Deploy latest commit**.

### Para probar en tu PC antes de publicar

```bash
cd ruteo-web
npm install        # solo la primera vez
npm run dev        # abre http://localhost:3005
```

### Las claves secretas (`.env.local`)

Este archivo **no se sube a GitHub** (está en `.gitignore`). Contiene:

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — para
  conectar con la base (son públicas, no pasa nada).
- `SUPABASE_SERVICE_ROLE_KEY` — **la clave maestra**. Con ella se crean
  usuarios y empresas. NUNCA la pongas con prefijo `NEXT_PUBLIC_` ni la
  compartas: quien la tenga puede todo.
- `MOTOR_API_URL` — la dirección del motor.

Las mismas claves están puestas en el panel de Vercel (Settings → Environment
Variables) para la versión publicada.

---

## 9. Dónde mirar cuando algo falla

| Síntoma | Dónde mirar |
|---|---|
| "No se pudo contactar el motor" | Render dormido (espera 1 min) o `MOTOR_API_URL` mal. |
| Rutear da error con archivos sin la columna "distrito" | El motor de Render está desactualizado → Manual Deploy. |
| El conductor no ve sus rutas | Que la ruta esté asignada a él y el despacho no esté "Cargado". |
| Un usuario no ve datos | Su empresa puede estar suspendida, o su cuenta desactivada. |
| Errores al construir en Vercel | Falta alguna variable de entorno. |

**Documentos de apoyo en el repo:**
- `DESPLIEGUE.md` — publicar desde cero paso a paso.
- `AGENTS.md` — nota técnica sobre esta versión de Next.js.

---

## 10. Lo que queda pendiente

- **Render**: republicar el motor para el arreglo de archivos sin "distrito".
- **Flota**: la pantalla `/flota` está vacía, para gestionar vehículos.
- **OSRM propio**: hoy usa el público (gratis, sin garantía). Para producción
  seria conviene uno propio (~$12/mes).
