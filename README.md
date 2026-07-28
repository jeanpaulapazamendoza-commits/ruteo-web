# RuteoTiendas — frontend web

Interfaz de planificación last mile en Next.js, conectada a Supabase.
Sustituye progresivamente a la app Streamlit (`../ruteo-tiendas-v2`), que
sigue siendo la herramienta de trabajo hasta que esta alcance paridad.

## Arrancar en local

```bash
npm run dev
```

Abre <http://localhost:3005>. La primera vez, pulsa **Crear una** en la pantalla
de acceso: se creará tu empresa y quedarás como administrador.

## Variables de entorno

`.env.local` (ya creado, ignorado por git):

```
NEXT_PUBLIC_SUPABASE_URL=https://vfrebzeszunlublugosk.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

La *publishable key* es pública por diseño: no da acceso a nada porque cada
tabla está protegida con RLS. Nunca pongas aquí la `service_role`.

## Estructura

```
src/
  proxy.ts                  Renueva la sesión y protege rutas
  lib/supabase/client.ts    Cliente para el navegador
  lib/supabase/server.ts    Cliente para Server Components
  components/               Nav lateral, formulario de acceso, piezas de UI
  app/
    login/                  Acceso y registro
    (app)/                  Zona autenticada (nav + contenido)
      planificador/         Pantalla principal
      tiendas/              Maestro de puntos de entrega
      torre/ despachos/ flota/   Pendientes
```

## Notas de esta versión de Next.js (16.2)

Dos cosas que rompen si se sigue documentación antigua:

1. **`middleware.ts` ahora se llama `proxy.ts`** y exporta `proxy`, no
   `middleware`. Los ejemplos de Supabase todavía usan el nombre viejo; con ese
   nombre el archivo no se ejecuta y la sesión nunca se renueva, sin ningún
   error visible. Para comprobar que está activo, `npm run build` debe listar
   `ƒ Proxy (Middleware)`.
2. **`cookies()` es asíncrono**: hay que usar `await cookies()`.

## Base de datos

El esquema vive en Supabase (proyecto `vfrebzeszunlublugosk`) e incluye
organizaciones, perfiles, tiendas, vehículos, despachos, rutas, paradas y
escenarios. Todas las tablas llevan `org_id` y políticas RLS: un usuario solo
ve los datos de su empresa. Las funciones auxiliares están en el esquema
`private` para que no queden expuestas como endpoints de la API.

Al registrarse un usuario, un trigger crea su empresa y su perfil
automáticamente.

### Crear usuarios de prueba por SQL

Si insertas filas en `auth.users` a mano, rellena con `''` las columnas de
token (`confirmation_token`, `recovery_token`, `email_change`, …). Si quedan en
`NULL`, el inicio de sesión falla con *"Database error querying schema"*.
Es preferible registrarse desde la propia interfaz.

### Validación de correos

Supabase rechaza dominios que no considera válidos (por ejemplo
`@ruteotiendas.app`) con *"Email address is invalid"*. Usa un dominio real al
registrarte.

## El motor de optimización

El clustering y el ruteo con OR-Tools viven en `../motor-api` (FastAPI), extraídos
de la app de Streamlit. Para trabajar en local hay que levantar los dos:

```bash
# terminal 1 — motor
cd ../motor-api && python -m uvicorn api:app --port 8010

# terminal 2 — web
npm run dev
```

La URL del motor se configura con `NEXT_PUBLIC_MOTOR_API` en `.env.local`.

## Estado actual

| Listo | Pendiente |
|---|---|
| Acceso, registro y cierre de sesión | Despliegue en Vercel + Render |
| Protección de rutas | App del conductor (PWA) para el POD |
| Maestro de tiendas + importación Excel/CSV | Gestión de flota y conductores |
| Planificador con mapa, flota, ventanas y costos | Hojas de ruta imprimibles y QR |
| Selección manual por polígono | Realtime (hoy la torre sondea cada 20 s) |
| Guardar despachos y consultar el histórico | |
| Torre de control con avance en vivo | |
