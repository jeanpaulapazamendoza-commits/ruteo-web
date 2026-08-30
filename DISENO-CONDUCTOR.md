# ESPECIFICACIÓN DE REDISEÑO — APP DEL CONDUCTOR (RuteoTiendas)

Documento único de implementación. Todo lo que aquí se escribe está verificado contra el código real en `D:\Archivos Escritorio\geolocalizacion\ruteo-web`.

---

## 1. DECISIÓN

**Columna vertebral: DIRECCIÓN D — «La Consola del Conductor» (todo al alcance del pulgar).**

**Por qué:** es la única de las cuatro que no sustituye la página con scroll por un presupuesto fijo de píxeles (`100dvh` + tres capas + safe-areas + teclado de iOS), que es el punto donde los tres jueces de campo dijeron lo mismo sobre A, B y C: *lo primero que se cae por debajo del borde son los tres botones de estado*. D fija abajo lo único que debe estar fijo —las tres decisiones— y deja arriba una zona de lectura que degrada haciendo scroll en vez de romperse; además conserva el mapa y la lista (el *look-ahead* con el que el conductor decide dónde estaciona), que A, B y C sacrifican; y su fase 1 es la mejor relación coste/impacto de las cuatro (~20 h para 1 toque y 0 espera).

**Injertos, con procedencia explícita:**

| Injerto | De dónde | Qué arregla |
|---|---|---|
| **La parada activa es derivada, no almacenada**: `activa = fijada ?? primera pendiente`, y `fijada` solo se escribe con un toque explícito | juez de ingeniería de D | mata el auto-avance ciego y la selección rancia, que era el peor fallo de D |
| **La identidad viaja dentro del botón**: `✓ ENTREGADO` + segunda línea `#13 · BODEGA LOS ÁNGELES` | juez de campo de D | mata la clase entera de "marqué la parada equivocada" a coste cero |
| **Etiqueta `FUERA DE SECUENCIA`** cuando la activa no es la primera pendiente | dirección A | legaliza saltarse el orden sin que el conductor se pierda |
| **La retención del deshacer vive DENTRO de la cola** (`retenerHasta` en IndexedDB), no en un `setTimeout` de React | juez de ingeniería de C | elimina el fallo silencioso: hoy `BarraConductor` ya llama a `sincronizar()` en `visibilitychange`, así que un deshacer de React subiría igualmente |
| **Cinco motivos como cinco botones sin preselección, y tocar el motivo guarda**; **rejilla de chips en vez de `<input type=number>`**; **parcial deshabilitado si `bultos===1`** | dirección B | mata por la forma los tres bugs de datos verificados en `RutaReparto.tsx:385`, `:395-397` y el zoom de iOS |
| **La regla del sol**: el color va en rellenos, raíles, discos y bordes; el texto siempre en `ink`, `ink-2` o blanco. `ink-3` prohibido en texto | dirección B / dirección C | `text-ok` sobre blanco es 3,3:1; hoy toda la app del conductor comunica el estado así |
| **Triple redundante de estado**: raíl sólido de 6 px + fondo pálido + glifo + texto en `ink` | dirección D (su mejor idea) | estado legible al sol, con guantes y con daltonismo |
| **Carril de deshacer que no se apoya nunca sobre los botones**, con `📷 Foto` y `✎ Recibió` dentro | juez de campo de A | recupera el dato `recibe`, que el camino de un toque perdía |
| **Compresión de la foto ANTES de encolar, en el momento de capturarla** | jueces de ingeniería de B y C | evita 80 MB de fotos crudas en IndexedDB sin devolver la espera al camino crítico |
| **`invalidateSize` con `ResizeObserver`** y colores del mapa por prop opcional | juez de ingeniería de D | el mapa cambia de alto al plegar/desplegar; hoy Leaflet no re-mide nunca |

**Lo que se descarta de raíz:** la hoja inferior arrastrable de 3 anclajes (A), el mapa como fondo a pantalla completa (A), la pantalla de una sola parada sin lista (B) y el riel de línea de tiempo con ancla y capas fijas (C). Los tres primeros pierden el *look-ahead*; el tercero, además, es una tabla de coordenadas absolutas que no sobrevive a un Android de 412×915.

---

## 2. PRINCIPIO RECTOR

> **Arriba se lee y se elige; abajo se decide. Nada de lo que se toca 25 veces al día cambia de sitio, de tamaño ni de significado, y ninguna decisión espera a la red, al GPS ni a la cámara.**

Tres corolarios que resuelven las dudas futuras sin volver a preguntar:

1. **Si algo se toca, mide ≥ 44 px; si se toca 25 veces al día, mide ≥ 64 px.** Si no cabe, se quita otra cosa, no se encoge esta.
2. **Ámbar = ahora** (la parada activa y el botón que el pulgar pulsa). Nada más es ámbar: ni la alarma de la cola, ni los estados, ni los avisos. Si algo pide ámbar y no es "ahora", va en navy con raíl semántico.
3. **Ninguna escritura obligatoria puede salir sin haber sido tocada.** Ningún campo obligatorio tiene valor por defecto; el último toque obligatorio *es* el guardado.

---

## 3. ANATOMÍA COMPLETA

Medidas sobre **375×812 con la PWA instalada** (`safe-area-top 44`, `safe-area-bottom 34`, lienzo útil **734 px**). Contenedor de todo: `mx-auto w-full max-w-[560px]`.

Se añade a `src/app/globals.css`:

```css
:root { --consola: 210px; --carril: 56px; }
@keyframes cuenta { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.cuenta { transform-origin: left; animation: cuenta 3s linear forwards; }
```

### 3.A · `/conductor` — lista de rutas

| # | Bloque | Alto | Contenido y clases |
|---|---|---|---|
| 0 | `safe-area-top` | 44 | `bg-navy-900` (`<div className="h-[env(safe-area-inset-top)] bg-navy-900" />`) |
| 1 | **Cabecera** `sticky top-0 z-30` | 56 | `flex h-14 items-center gap-2.5 border-b border-line bg-navy-900 px-3`. Teja: `grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-amber text-[17px] font-extrabold text-navy-900` → `R`. Nombre: `min-w-0 flex-1 truncate text-[17px] font-bold text-white`. Botón menú: `grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-[17px] text-white active:bg-white/10` → `⋯` |
| 2 | Aire | 12 | `bg-canvas` |
| 3 | Título | 24 | `px-3 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-2` → **`TUS RUTAS DE HOY`** |
| 4 | Aire | 8 | |
| 5 | **Tarjeta de ruta** (una por ruta, `gap-2.5`) | 124 c/u | ver abajo |
| — | Relleno inferior | — | `pb-[calc(var(--consola)+env(safe-area-inset-bottom)+12px)]` |
| 6 | **Consola de lista** `fixed bottom-0` | 138 + safe | ver abajo |

**Tarjeta de ruta (124 px)** — `<button>`, no `<Link>`: **tocar la tarjeta selecciona, la consola abre.**

```
<button className="w-full rounded-[14px] border-2 bg-surface p-3 text-left
   [border-line | border-amber-600 bg-amber-050 si seleccionada]">
  fila 1 (28px): flex items-center gap-2
     <span className="rounded-[7px] bg-navy-800 px-2 py-1 text-[13px] font-bold text-white">R-03</span>
     <span className="min-w-0 flex-1 truncate text-[17px] font-bold text-ink">Almacén Lurín</span>
     <span className="num shrink-0 text-[14px] font-semibold text-ink-2">14 nov</span>
  fila 2 (24px, mt-2): <span className="num text-[17px] font-bold text-ink">25</span> paradas ·
     <span className="num ...">148</span> bultos · <span className="num ...">47</span> km
     → contenedor: text-[17px] font-bold text-ink-2
  fila 3 (4px, mt-2): barra
     <div className="h-1 overflow-hidden rounded-full bg-canvas">
       <div className="h-full rounded-full bg-ok" style={{width: `${pct}%`}} />   // bg-live si pct<100
     </div>
  fila 4 (20px, mt-2): text-[14px] font-semibold
     con salida_real → text-ink-2:  "Salió 08:14 · 12 de 25 hechas"
     sin salida_real → text-ink:    "Sin iniciar"
</button>
```

**Consola de lista (fixed bottom, 138 px + safe-area)** — `fixed inset-x-0 bottom-0 z-40 border-t-2 border-line-strong bg-surface pb-[env(safe-area-inset-bottom)]`, interior `mx-auto w-full max-w-[560px]`:

- **D0 · franja de sincronía**, 44 px (§6, idéntica en las dos pantallas).
- Aire 10 px.
- **Botón único**, 72 px, `mx-3 flex h-[72px] w-[calc(100%-24px)] items-center justify-center rounded-[10px] border border-amber-600 bg-amber text-[17px] font-extrabold text-navy-900 active:bg-amber-600`
  - con una ruta o con una seleccionada → **`Abrir R-03 ▶`**
  - con varias y ninguna seleccionada → texto **`Toca una ruta para abrirla`**, clases `border-line-strong bg-surface-2 text-ink-2`, `pointer-events-none`
  - sin rutas → **`Actualizar`**, `border-line-strong bg-surface text-ink`
- Aire 12 px.

> **No hay `redirect()` automático cuando solo hay una ruta.** Un redirect convierte el botón "volver" en una trampa (entras, sales, vuelve a entrar). Un toque en un objetivo de 72 px a 100 px del pulgar cuesta menos que eso.

### 3.B · `/conductor/[rutaId]` — la ruta

Tres zonas: **cabecera 60 · zona de lectura (scroll) · consola 210 fija**. La zona de lectura es el `<main>` normal con scroll de página; **no** hay `overflow:hidden` ni `100dvh` en ninguna parte.

| # | Bloque | Alto | Contenido y clases |
|---|---|---|---|
| 0 | `safe-area-top` | 44 | `bg-navy-900` |
| 1 | **Cabecera de ruta** `sticky top-0 z-30` | 56 | `flex h-14 items-center gap-1 bg-navy-900 px-1.5` |
| | · volver | 44×44 | `grid h-11 w-11 place-items-center text-[17px] text-white active:bg-white/10` → `‹` (`<Link href="/conductor">`) |
| | · pastilla | — | `rounded-[7px] bg-navy-700 px-2 py-1 text-[13px] font-bold text-white` → `R-03` |
| | · contador | — | `num ml-2 text-[17px] font-extrabold text-white` → `12/25` |
| | · empuje | — | `flex-1` |
| | · plegar mapa | 44×44 | `grid h-11 w-11 place-items-center rounded-[10px] text-[17px] text-white active:bg-white/10` → `🗺` (`aria-label="Mostrar u ocultar el mapa"`) |
| | · menú | 44×44 | `⋯` idem lista |
| 2 | **Regla de avance** | 4 | `h-1 w-full bg-navy-700` con hijo `h-full bg-ok` (`bg-live` si <100 %), `style={{width:`${pct}%`}}`, `transition-[width] duration-200` |
| 3 | Aire | 12 | `bg-canvas` |
| 4 | **Caja del mapa** (§5) | 44 + 200 | plegable; oculta entera mientras `!salida` |
| 5 | Aire | 12 | |
| 6 | **Renglón de cerradas** | 48 | ver abajo |
| 7 | Aire | 8 | |
| 8 | **Lista de paradas** | 76 c/u, `gap-2` | ver abajo |
| 9 | Relleno | — | `pb-[calc(var(--consola)+var(--carril)+env(safe-area-inset-bottom)+12px)]` |
| 10 | **Consola** `fixed bottom-0` | 210 + safe | ver abajo |
| 11 | **Carril de deshacer** `fixed`, sobre la consola | 56 | solo 8 s tras cerrar una parada |

**Renglón de cerradas (48 px)** — `<button>` que pliega/despliega:
`flex h-12 w-full items-center gap-2 rounded-[12px] border border-line bg-surface px-3 text-left`
- glifo: `text-[17px] text-ink-2` → `▾` / `▸`
- texto: `flex-1 text-[14px] font-bold text-ink` → **`12 cerradas · 10 conformes · 2 con incidencia`**
- si `cerradas === 0`, el renglón no se pinta.

**Fila de parada (76 px)** — `id={"parada-"+p.id}`, `scroll-mt-[76px]`, `flex h-[76px] items-stretch overflow-hidden rounded-[12px] border-2` (borde: `border-line`; si es la activa `border-amber-600`):

```
<i className="w-1.5 shrink-0 bg-[ok|warn|bad|line-strong]" />          ← raíl de 6px
<button className="flex min-w-0 flex-1 items-center gap-2.5 px-3 text-left
                   bg-[surface | ok-bg | warn-bg | bad-bg]  (amber-050 si es la activa)">
  <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-full
        text-[17px] font-bold
        [pendiente: bg-canvas text-ink | activa: bg-amber text-navy-900 | cerrada: bg-surface text-ink-2 border border-line-strong]">14</span>
  <span className="min-w-0 flex-1">
    <span className="block truncate text-[17px] font-bold text-ink">MINIMARKET DON PEPE ⭐</span>
    <span className="block truncate text-[14px] font-medium text-ink-2">2 bultos · SJL · 09:00–13:00</span>
  </span>
  <span className="shrink-0 text-[17px] text-ink">✓</span>              ← glifo: · ✓ ◑ ✕
</button>
<a  className="grid w-11 shrink-0 place-items-center border-l border-line
               bg-surface text-[17px] text-navy-800"                     ← navegar sin seleccionar
    href={enlaceNavegacion(p.lat,p.lon,appPreferida)} target="_blank" rel="noopener noreferrer">▶</a>
```

- Segunda línea de una parada **cerrada**: `Entregado 14:32 · recibió Juan Pérez` / `Parcial 3 de 4` / `No entregado · Local cerrado`.
- El `⭐` de prioridad va en `text-amber-600` inmediatamente tras el nombre.
- **Tocar la fila (el `<button>`) solo selecciona**: fija `fijada = p.id`. Nunca escribe nada.

**LA CONSOLA (fixed bottom, 210 px + safe-area)**

```
<div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line-strong bg-surface
                pb-[env(safe-area-inset-bottom)]">
  <div className="mx-auto w-full max-w-[560px]">
```

| slot | alto | contenido |
|---|---|---|
| **D0** franja de sincronía | 44 | §6 |
| aire | 8 | |
| **D1** ficha de la parada activa | 64 | ver abajo |
| aire | 10 | |
| **D2** fila de acción | 72 | ver abajo |
| aire | 12 | |

**D1 · ficha de la parada activa** — `flex h-16 items-center gap-2.5 px-3`

- disco: `num grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber text-[17px] font-extrabold text-navy-900` → `13`
- centro `min-w-0 flex-1`:
  - **si la activa es la primera pendiente** (caso normal): una sola línea, `truncate text-[24px] font-extrabold leading-none tracking-tight text-ink` → `BODEGA LOS ÁNGELES`
  - **si es una fijada fuera de secuencia**: línea 1 `text-[13px] font-bold uppercase tracking-[0.1em] text-amber-600` → **`FUERA DE SECUENCIA`**; línea 2 `truncate text-[24px] …` con el nombre. (Mismos 64 px: la etiqueta ocupa el hueco del interlineado.)
  - **si la activa está cerrada**: línea 1 `text-[13px] font-bold uppercase tracking-[0.1em] text-ink-2` → `YA MARCADA`; línea 2, el nombre.
- bultos: `num shrink-0 text-[17px] font-bold text-ink-2` → `4 blt`
- ficha completa: `grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-line-strong bg-surface text-[17px] text-ink-2` → `▾` (abre la Hoja de ficha, §4.6)

**D2 · fila de acción** — `flex h-[72px] items-stretch px-3`, anchos exactos sobre 375 px: `118 + 16 + flex-1(130) + 10 + 77 = 351`

```
<a  className="grid w-[118px] place-items-center rounded-[10px] bg-navy-800
               text-[14px] font-bold leading-tight text-white active:bg-navy-700"
    href={enlaceNavegacion(activa.lat, activa.lon, appPreferida)} target="_blank" rel="noopener noreferrer">
   ▶ Cómo<br/>llegar
</a>
<div className="w-4" />
<button className="relative flex flex-1 flex-col items-center justify-center gap-1
                   overflow-hidden rounded-[10px] border border-amber-600 bg-amber
                   text-navy-900 active:bg-amber-600">
   <span className="text-[17px] font-extrabold leading-none">✓ ENTREGADO</span>
   <span className="max-w-full truncate px-1 text-[13px] font-bold leading-none">#13 · BODEGA LOS ÁNGELES</span>
   {bloqueado && <i className="cuenta absolute inset-x-0 bottom-0 h-[3px] bg-navy-900/35" />}
</button>
<div className="w-2.5" />
<button className="grid w-[77px] place-items-center rounded-[10px] border-2 border-line-strong
                   bg-surface text-[14px] font-bold leading-tight text-ink active:bg-canvas">
   ⋯<br/>Otro
</button>
```

Variantes de D2 (**la rejilla nunca cambia: mismas tres celdas, mismos anchos, mismas alturas**):

| estado | celda izquierda | celda central | celda derecha |
|---|---|---|---|
| **E0** ruta sin confirmar | *(la rejilla entera es un botón)* **`✓ CONFIRMAR RUTA Y SALIR DEL CD`**, ámbar, 72 px, ancho completo | | |
| **E1** parada pendiente activa | `▶ Cómo llegar` | `✓ ENTREGADO` + `#13 · NOMBRE` | `⋯ Otro` |
| **E1-bloqueado** (3 s tras cerrar) | igual, **activo** | igual pero `pointer-events-none` con la línea de cuenta atrás | igual, **activo** |
| **E3** parada activa ya cerrada | `▶ Cómo llegar` | **`✎ CORREGIR`** + `#13 · NOMBRE`, clases `bg-navy-800 text-white border-navy-800` (**no ámbar**: no es la acción rutinaria) | `⋯ Otro` **deshabilitado visualmente**: `opacity-40 pointer-events-none` |
| **E4** ruta terminada (`cerradas === total`) | `▶ Volver al CD` | **`RESUMEN DEL DÍA`**, `bg-navy-800 text-white` | *(vacía, `invisible`)* |

En **E0**, D1 muestra el CD: disco `bg-navy-800 text-white` con `CD`, nombre `CENTRO DE DISTRIBUCIÓN` a 24/800, derecha `salida 07:30`.
En **E4**, D1 muestra `25/25 · 22 conformes · 2 parciales · 1 no entregada` a 17/700 `text-ink` en dos líneas.

**EL CARRIL DE DESHACER (56 px, 8 s, fixed, nunca sobre los botones)**

```
<div className="fixed inset-x-0 z-50 bottom-[calc(var(--consola)+env(safe-area-inset-bottom))]
                mx-auto w-full max-w-[560px] px-3">
  <div className="flex h-14 items-center gap-2 rounded-[10px] border border-navy-700 bg-navy-800 px-2.5">
    <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-white">✓ #13 entregada</span>
    <button className="h-11 w-[92px] shrink-0 rounded-[9px] bg-white text-[14px] font-bold text-navy-900">Deshacer</button>
    <button className="grid h-11 w-11 shrink-0 place-items-center rounded-[9px] border border-white/40 text-[17px] text-white">📷</button>
    <button className="grid h-11 w-11 shrink-0 place-items-center rounded-[9px] border border-white/40 text-[17px] text-white">✎</button>
  </div>
</div>
```

- Texto según estado: `✓ #13 entregada` · `◑ #13 parcial 3 de 4` · `✕ #13 no entregada`.
- `📷` abre la cámara y adjunta la foto **a la entrega ya cerrada** (§4.5).
- `✎` abre el campo `¿Quién recibió?` (§4.5). En parcial y fallido el rótulo del campo es `Observación`.
- El carril **no ocupa altura de layout**: es `fixed` y el `<main>` ya reserva `var(--carril)` en su `padding-bottom`, así que la última fila de la lista nunca queda tapada. Nada se mueve al aparecer o desaparecer.
- Un nuevo cierre **sustituye** el carril; no se apilan.

**Escala tipográfica completa de la app del conductor (cinco pasos, sin excepciones):**

| px | peso | uso |
|---|---|---|
| **24** | 800 | nombre de la parada activa (D1) y de la hoja |
| **17** | 700/800 | nombres de fila, `12/25`, cifras, botón primario, botones de la hoja |
| **16** | 400/600 | **todos** los `input`, `select` y `textarea`, sin excepción (suelo anti-zoom de iOS Safari) |
| **14** | 600/700 | metadatos, franja D0, botones secundarios, carril |
| **13** | 700 | etiquetas en versalitas (`tracking-[0.1em] uppercase`) y la segunda línea del botón primario |

**Nada por debajo de 13 px. `text-ink-3` queda prohibido en texto en toda `/conductor`** (sobrevive solo en bordes e iconos decorativos). Se sustituye por `text-ink-2` en: `RutaReparto.tsx:177, 269-273, 326, 336, 428`, `BarraConductor.tsx:91` y `app/conductor/page.tsx:89, 96, 104, 112, 116`.

**Color, tabla cerrada:**

| elemento | clases | contraste |
|---|---|---|
| cabecera | `bg-navy-900 text-white` | 15,9:1 |
| consola | `bg-surface border-t-2 border-line-strong` | separación por línea, nunca por sombra |
| `▶ Cómo llegar` | `bg-navy-800 text-white` | 15,2:1 |
| `✓ ENTREGADO`, `Confirmar ruta`, `Abrir R-03`, `Guardar` | `bg-amber text-navy-900 border-amber-600` | **8,7:1** |
| `⋯ Otro`, botones neutros | `bg-surface border-2 border-line-strong text-ink` | 15,9:1 |
| `✎ Corregir` | `bg-navy-800 text-white` | 15,2:1 |
| franja D0 en alarma | `bg-navy-900 text-white` + raíl `border-l-[6px] border-warn` o `border-bad` | ~16:1 |
| estados en lista | raíl `bg-ok/warn/bad/line-strong` + fondo `ok-bg/warn-bg/bad-bg/surface` + texto `text-ink` + glifo | 15,4:1 |
| metadatos | `text-ink-2` | 7,4:1 |

Se prohíbe: `text-ok`, `text-warn`, `text-bad`, `text-live` y `text-ink-3` como color de texto en `/conductor`; ámbar con texto blanco (2,1:1). El literal `#231403` desaparece: se sustituye por `text-navy-900`.

**Movimiento.** Se anima solo: la hoja de resultado (`translateY`, 180 ms `ease-out`), el carril de deshacer (140 ms de entrada, 120 ms de salida), la regla de avance (`width`, 200 ms) y la línea de cuenta atrás del bloqueo (3 s lineal). **No** se anima: alturas, cambios de contenido de la consola, la lista (los estados se recolorean en el mismo frame del toque), el mapa (`setView` seco, sin `flyTo`), ni la pulsación (solo `active:` con cambio de fondo inmediato). No hay spinners, ni skeletons, ni texto "Guardando…" en ninguna parte. `prefers-reduced-motion` ya está resuelto en `globals.css`.

---

## 4. EL FORMULARIO DE ENTREGA

Vive en la **Hoja de resultado**: `fixed inset-0 z-50` con velo `bg-navy-900/45` y panel `absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px] max-h-[88dvh] rounded-t-[14px] bg-surface pb-[env(safe-area-inset-bottom)] flex flex-col`.

Estructura interna, de arriba abajo (la cabecera y las dos franjas inferiores son fijas; solo el bloque central hace scroll):

| franja | alto | contenido |
|---|---|---|
| tirador | 24 | `mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong` (decorativo; se cierra con `Cerrar`, con el velo o con el botón atrás) |
| cabecera | 76 | nombre `truncate text-[24px] font-extrabold text-ink` + línea `text-[14px] font-medium text-ink-2` → `4 bultos · Los Olivos · COD 30012` |
| lectura | `flex-1 overflow-y-auto` | solo en corrección: el resultado anterior completo + miniatura de la foto si la hay |
| **adjuntos** | 56 | `flex h-14 items-center gap-2 border-t border-line px-3`: `📷 Foto` · `✎ Observación` · `Cerrar` (tres botones de 44 px de alto, `text-[14px] font-bold`) |
| **decisión** | ≥ 280 | el paso 1 o el paso 2, sustituido *in situ*, misma altura |

Se abre siempre con `history.pushState({hoja:true},"")`; un `popstate` la cierra (botón atrás de Android). Mientras está abierta, `document.body.style.overflow = "hidden"`.

### 4.1 Paso 1 — elegir el resultado (tres botones de 76 px, 12 px entre ellos, ninguno preseleccionado)

```
<button className="flex h-[76px] w-full items-center gap-3 rounded-[12px] border-2 px-4 text-left">
   <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ok text-[20px] text-white">✓</span>
   <span className="text-[17px] font-bold text-ink">Entregado conforme</span>
</button>
```
- **`✓ Entregado conforme`** — disco `bg-ok`, borde `border-ok`, fondo `bg-ok-bg`
- **`◑ Entregado parcial`** — disco `bg-warn`, borde `border-warn`, fondo `bg-warn-bg`
- **`✕ No entregado`** — disco `bg-bad`, borde `border-bad`, fondo `bg-bad-bg`

Si `parada.bultos === 1`, el botón parcial se pinta `opacity-50 pointer-events-none` y debajo, en 40 px:
> **`Esta parada trae 1 bulto: es entregado o no entregado.`** — `text-[14px] font-semibold text-ink-2`

### 4.2 Entregado conforme (camino largo, desde la hoja)

Paso 2 sustituye el panel por:
- Etiqueta `¿Quién recibió? (opcional)` — `text-[13px] font-bold uppercase tracking-[0.1em] text-ink-2`
- Input `w-full rounded-[10px] border-2 border-line-strong bg-surface px-3 text-[16px] h-14`, `placeholder="Nombre de quien recibe"`
- Botón **`Guardar`**, 72 px, ámbar, ancho completo.

### 4.3 Entregado parcial

Paso 2 sustituye el panel por:
1. Etiqueta `¿Qué faltó? (opcional)` + input de 56 px a 16 px, `placeholder="Ej. faltaron 2 cajas de gaseosa"`.
2. Etiqueta **`¿Cuántos bultos entregaste? (de 4)`** — 13/700 versalitas.
3. **Rejilla de chips**: `grid grid-cols-4 gap-2`, cada chip `h-16 rounded-[12px] border-2 border-line-strong bg-surface num text-[24px] font-extrabold text-ink active:bg-amber active:border-amber-600`, con los valores `1 … bultos-1`.
   - Si `bultos-1 > 8`: chips `1…8` + un noveno chip **`Más…`** que sustituye la rejilla por un teclado de botones (`0-9`, `←`, `OK`, celdas de 64 px) acotado a `1..bultos-1`.
   - **Tocar el chip guarda.** No hay botón `Guardar` en este camino.
   - Nunca hay `<input type="number">`: se elimina el zoom de iOS y el valor inválido es imposible por construcción. El mensaje *"entre 1 y 0"* deja de existir.

### 4.4 No entregado

Paso 2 sustituye el panel por **cinco filas de 64 px**, `flex flex-col gap-2`, cada una:
`flex h-16 w-full items-center gap-3 rounded-[12px] border-2 border-line-strong bg-surface px-4 text-left text-[17px] font-bold text-ink`, precedidas de la etiqueta `¿POR QUÉ NO SE ENTREGÓ?`.

Valores, en el orden de `MOTIVOS_NO_ENTREGA` (no se toca `entregas.ts`):
`Ausencia del cliente` · `Dirección equivocada` · `Local cerrado` · `Cliente rechaza el pedido` · `Otros`

- **Ninguna preseleccionada. Tocar una de las cuatro primeras guarda.**
- `Otros` **no guarda**: sustituye la rejilla por
  - etiqueta `Cuéntanos qué pasó` + input de 56 px a 16 px
  - botón **`Guardar`** de 72 px, ámbar; mientras `!detalle.trim()` va `opacity-50 pointer-events-none` y debajo se lee, en `text-[14px] font-semibold text-ink-2`: **`Escribe qué pasó para poder guardar.`**

### 4.5 Adjuntos y carril

- **`📷 Foto`** (hoja) o **`📷`** (carril): `<input type="file" accept="image/*" capture="environment">` oculto. Al volver de la cámara se llama **inmediatamente a `comprimirFoto()`** y se guarda el `Blob` resultante (~80 KB). Aparece **miniatura de 72×72** (`<img className="h-[72px] w-[72px] rounded-[10px] object-cover" src={URL.createObjectURL(blob)}>`) con dos botones de 44 px: **`Repetir`** y **`Quitar`**.
- **`✎ Recibió`** (carril) / **`✎ Observación`** (hoja): abre un campo de 16 px sobre el carril con el rótulo correspondiente y un botón **`Listo`** de 56 px.
- Adjuntar desde el carril **reescribe la misma fila de la cola** (clave `parada_id`): no duplica, no crea una segunda subida.
- Al abrir la cámara desde el carril se empuja `retenerHasta = Date.now() + 120000` (§6) para que la entrega no suba sin la foto mientras el conductor está fuera de la app.

### 4.6 Hoja de ficha (`▾` de D1)

Hoja idéntica en construcción, 320 px: código (`num`), distrito, `lat, lon` con 5 decimales, y **dos botones de 56 px a ancho completo**: `▶ Abrir en Google Maps` y `▶ Abrir en Waze`. Debajo, `Usar siempre esta app` (interruptor de 44 px) que escribe `localStorage["ruteo:navegador"]`.

### 4.7 Corrección

Se llega tocando la fila de una parada cerrada (o su pin) → D1 muestra `YA MARCADA` → D2 central es `✎ CORREGIR`. La hoja abre **con todo precargado**:
- estado anterior marcado en el paso 1,
- `bultos_entregados` resaltado en la rejilla de chips,
- el motivo resaltado en su fila; si el motivo guardado empieza por `"Otros: "`, se selecciona `Otros` y el resto va al campo de detalle (helper `desglosarMotivo` en `entregas.ts`),
- `recibe` y `observaciones` en sus campos,
- la foto anterior como miniatura, con `Repetir` y `Quitar`.

En la cabecera de lectura, `text-[14px] text-ink-2`: **`Ya la marcaste como Entregado parcial · faltó 1 caja. Puedes corregirlo abajo.`**

### 4.8 Recuento de toques

| caso | % | toques | secuencia |
|---|---|---|---|
| **Entregado conforme** | 70-85 % | **1** | `✓ ENTREGADO` |
| Conforme + quién recibió | ~10 % | **3** + escritura | `✓` → `✎` (carril) → escribe → `Listo` |
| Conforme + foto | ~5 % | **2** + cámara | `✓` → `📷` (carril) |
| **Entregado parcial** | ~7 % | **3** | `⋯ Otro` → `◑ Entregado parcial` → chip `3` |
| Parcial + qué faltó | ~3 % | **3** + escritura | idem, escribiendo antes de tocar el chip |
| **No entregado** (motivo de lista) | ~8 % | **3** | `⋯ Otro` → `✕ No entregado` → `Local cerrado` |
| No entregado · `Otros` | ~2 % | **4** + escritura | … → `Otros` → escribe → `Guardar` |
| Deshacer | — | **1** | `Deshacer` (carril, 8 s) |
| Corregir una cerrada | ~2 % | **3-4** | fila → `✎ Corregir` → cambios → guardar |

Hoy el caso mayoritario son **3 toques + un scroll ciego + hasta 8 s de `await posicionActual()`** (`RutaReparto.tsx:110`, `entregas.ts:105`). Sobre 25 paradas: ~75 toques y ~3 minutos menos por jornada.

### 4.9 El camino de escritura (contrato y orden)

`guardar()` conserva **exactamente** su firma de seis campos (`estado, motivo, bultosEntregados, observaciones, recibe, foto`) con el `motivo` ya compuesto igual que hoy en `RutaReparto.tsx:405-419`. Cambia solo el orden:

```
1. setLista optimista                      (pinta el estado, <16 ms)
2. cerrar hoja / limpiar `fijada`
3. leer posición cacheada de usePosicion() (síncrono, 0 ms)
4. encolar({..., retenerHasta: Date.now() + 8000})   ← ÚNICO camino de escritura
5. mostrar el carril de deshacer 8 s
6. bloquear el botón primario 3 s
7. programar sincronizar() a los 8 s
8. en segundo plano: posicionActual(6000) → parchearPosicion(parada_id) si sigue en cola
```

**No se llama nunca a `marcarParada` directamente desde la UI.** El único camino de subida sigue siendo `sincronizar()`, que ya es idempotente por `keyPath: "parada_id"`. Desaparece la bifurcación por `navigator.onLine` (`RutaReparto.tsx:126`), que miente constantemente en reparto (antena enganchada, cero datos).

**Fallo de la escritura local** (IndexedDB lleno, modo privado): si `encolar()` lanza, se intenta `marcarParada()` directo; si también falla, **se revierte el pintado optimista**, la fila vuelve a pendiente y D0 pasa a rojo (§7).

**Deshacer** = `quitarPendiente(parada_id)` + restaurar el snapshot local. Como la retención vive en la cola, nada llegó nunca al servidor: **no hace falta ningún `revertirParada` contra el RPC, ni migración SQL, ni tocar `marcar_parada`.** Pasados los 8 s el carril desaparece y la corrección se hace por el camino normal (fila → `✎ Corregir`).

---

## 5. EL MAPA

- **Dónde:** en la zona de lectura, primer bloque, **solo cuando la ruta ya está confirmada** (`salida != null`). En E0 no se pinta (no hay nada que seguir todavía).
- **Altura:** barra de plegado de 44 px + caja de **200 px**. La caja es un componente nuevo, `MapaCaja.tsx`, que envuelve al `MapaSeguimiento` existente.
- **Se pliega**: con el botón `🗺` de la cabecera y con la propia barra. El estado vive en `localStorage["ruteo:mapa"]` para que la elección sobreviva a recargas y a volver de Waze.
- **Arranca plegado si `window.innerHeight < 700`** (iPhone SE, Chrome con barra de direcciones): así siempre se ven al menos tres filas de lista. En pantallas altas arranca desplegado.
- **Deja de secuestrar el scroll**: se pasan `dragging={false}`, `scrollWheelZoom={false}`, `doubleClickZoom={false}`, `touchZoom={false}` y `keyboard={false}` al `MapContainer`. La única interacción es tocar un pin.
- **`invalidateSize`**: dentro de `MapaSeguimiento` se añade un hijo `<AjustarTamano/>` con `useMap()` + `ResizeObserver` sobre el contenedor que llama a `map.invalidateSize()` (debounce 120 ms). Se activa con una prop **opcional** `autoAjustar` que la torre de control no pasa. Sin esto, plegar/desplegar deja el mapa en gris con las paradas fuera de encuadre.
- **Tocar un pin = seleccionar**: `onClicParada(id)` hace `setFijada(id)` y `document.getElementById("parada-"+id)?.scrollIntoView({block:"center"})` **instantáneo** (`behavior:"auto"`). Ya no abre ningún formulario.
- **Colores unificados**: se añade una prop opcional `colores?: Record<string,string>` a `MapaSeguimiento`, con los hexadecimales actuales por defecto. El conductor pasa los tokens exactos: `{entregado:"#0e9f6e", parcial:"#c2760b", reprogramado:"#c2760b", fallido:"#d64545", pendiente:"#cbd3e0"}`. **La torre de control no cambia.** El halo ámbar del `siguienteId` se conserva tal cual y se le pasa el `id` de la **parada activa** (no el de la primera pendiente): mapa, lista y consola señalan lo mismo.
- **Barra de plegado (44 px)**: `flex h-11 w-full items-center gap-2 rounded-t-[14px] border border-line bg-surface px-3`, texto `text-[14px] font-bold text-ink` → `Mapa de la ruta`; a la derecha, leyenda de cuatro puntos de 8 px (`bg-ok`, `bg-warn`, `bg-bad`, `bg-line-strong`) y `Ocultar` / `Ver` en `text-[14px] font-semibold text-ink-2`.
- **Sin señal**: si `!enLinea` y el mapa está desplegado, se superpone una banda opaca centrada, `bg-navy-900/90 text-white text-[14px] font-bold px-3 py-2 rounded-[10px]`: **`Mapa sin señal · trabaja con la lista`**. No se precachean teselas (la política de uso de `tile.openstreetmap.org` prohíbe la descarga masiva).

---

## 6. LA COLA OFFLINE

### 6.1 Dónde vive el aviso

**En la franja D0 de la consola, 44 px, presente siempre, en las dos pantallas, a ~180 px del pulgar.** Desaparece por completo de la cabecera: se elimina el bloque `{pendientes > 0 && …}` de `BarraConductor.tsx:108-120`, que hoy aparece y empuja toda la página hacia abajo justo cuando el dedo va a tocar algo.

Cinco estados, todos con la **misma altura**, `flex h-11 w-full items-center gap-2 px-3 text-[14px] font-bold`:

| estado | clases | texto literal |
|---|---|---|
| al día | `bg-surface-2 text-ink-2` | **`✓ Todo subido`** |
| pendientes, con señal (botón) | `border-l-[6px] border-warn bg-navy-900 text-white` | **`↑ 3 sin subir · toca para subirlas`** |
| pendientes, sin señal | `border-l-[6px] border-bad bg-navy-900 text-white` | **`Sin señal · 3 guardadas en el móvil`** |
| subiendo | `bg-navy-900 text-white` | **`Subiendo 3…`** |
| fallo de guardado local | `border-l-[6px] border-bad bg-bad-bg text-ink` | **`No se pudo guardar en el móvil · toca para reintentar`** |

Toda la franja es el objetivo táctil (44×351) y fuerza `sincronizar()`. **El ámbar no aparece aquí**: la alarma es navy con raíl semántico, para que el ámbar siga significando una sola cosa (§2, corolario 2).

Refuerzos: la fila de una parada que sigue en cola lleva un `↑` de 17 px junto al glifo de estado (`text-ink-2`), y en E4 la franja se lee antes de llegar al CD.

### 6.2 Comportamiento

- Los cuatro escuchadores de `BarraConductor.tsx:42-74` (`online`, `offline`, `visibilitychange`, `EVENTO_COLA`) se **mueven enteros** —no se duplican— a `src/hooks/useCola.ts`, que devuelve `{ pendientes, enLinea, sincronizando, error, subir }`. Lo consumen la consola de la lista y la consola de ruta.
- **Retención en la cola.** Se añade `retenerHasta?: number` al tipo `Pendiente` y **una sola línea de filtro** al principio de `sincronizar()`:

```ts
const ahora = Date.now();
const cola = (await listarPendientes()).filter((p) => !p.retenerHasta || p.retenerHasta <= ahora);
```

  Con esto, los tres disparadores existentes (`online`, `visibilitychange`, `EVENTO_COLA`) **no pueden subir algo que todavía se puede deshacer**, sin coordinar temporizadores entre componentes. Es el arreglo que hace correcto el camino de un toque.
- **El contador no parpadea.** `pendientes` cuenta solo lo que ya es un problema:
  `p.intentos > 0 || (Date.now() - p.guardadoEn > 20000)` — con señal, la entrega sube en el segundo 8 y la franja nunca deja de decir `✓ Todo subido`; cuando aparece `↑ 3`, es verdad. El estado `Sin señal` no espera esos 20 s: sale del escuchador `offline`.
- **`parchearPosicion(paradaId, lat, lon)`**: nuevo helper en `cola.ts` que hace `get` + `put` **dentro de la misma transacción `readwrite`**, y no hace nada si la fila ya no existe (para no resucitar un registro que `sincronizar()` acaba de borrar).
- **Reconciliación con el servidor.** `sincronizar()` con `subidas > 0` llama a `router.refresh()`, y `RutaReparto` **fusiona** en vez de sustituir:

```ts
useEffect(() => {
  setLista((prev) => paradas.map((p) => {
    const local = prev.find((x) => x.id === p.id);
    // lo local gana solo mientras siga en cola (servidor aún dice pendiente)
    return local && local.estado_entrega !== "pendiente" && p.estado_entrega === "pendiente" ? local : p;
  }));
}, [paradas]);
```
  Esto arregla el bug latente de hoy: `lista` es `useState(paradas)` y **nunca** se resincroniza, así que el `router.refresh()` de `BarraConductor.tsx:36` no actualiza nada.
- **La compresión sigue antes de encolar** (en el momento de capturar la foto). En IndexedDB nunca entra un blob de 4 MB.
- **Cerrar sesión con cola pendiente** pide confirmación (§7).

---

## 7. ESTADOS VACÍOS Y DE ERROR

| situación | dónde | texto literal |
|---|---|---|
| sin rutas asignadas | `/conductor`, zona de lectura | icono `🚚` (56 px sobre `bg-amber-050`), título 17/800 **`No tienes rutas asignadas`**, cuerpo 14/500 `text-ink-2` **`Cuando el planificador te asigne una ruta, aparecerá aquí con todas sus paradas.`** Consola: botón `Actualizar` |
| ruta sin paradas | `/conductor/[rutaId]` | **`Esta ruta no tiene paradas.`** + **`Avisa al planificador antes de salir del centro de distribución.`** Consola en E0 con el botón de confirmar deshabilitado (`opacity-50 pointer-events-none`) |
| todas las paradas cerradas | consola E4 | D1: **`25/25 · 22 conformes · 2 parciales · 1 no entregada`** |
| ruta terminada con cola | D0 en E4 | **`↑ 2 sin subir · toca para subirlas`** (navy + raíl `warn`) |
| falla `iniciarRuta` | D0, `border-l-[6px] border-bad bg-bad-bg text-ink` | **`No se pudo confirmar la ruta · vuelve a tocar el botón`** (y debajo, en la propia franja, el mensaje del servidor truncado a una línea) |
| falla la escritura local | D0 | **`No se pudo guardar en el móvil · toca para reintentar`**; la fila vuelve a pendiente |
| falla la subida (reintentos) | D0 | **`↑ 3 sin subir · toca para subirlas`**; el detalle del último error se ve en la hoja de la parada: `No subió todavía: <mensaje>` |
| mapa sin señal | sobre la caja del mapa | **`Mapa sin señal · trabaja con la lista`** |
| sin permiso de GPS | ninguno visible | se guarda `gps_lat/gps_lon = null` y todo lo demás funciona igual. **No se muestra ningún aviso**: no es una decisión del conductor y no se puede resolver desde la calle |
| cerrar sesión con cola | hoja de confirmación, dos botones de 64 px | título **`Tienes 3 entregas sin subir`**, cuerpo **`Si cierras sesión ahora podrías perderlas. Conéctate y súbelas primero.`**, botones **`Subir ahora`** (ámbar) y **`Cerrar sesión igualmente`** (`border-2 border-bad bg-surface text-ink`) |
| cerrar sesión sin cola | hoja | **`¿Cerrar sesión?`** + **`Cerrar sesión`** / **`Cancelar`** |
| cuenta bloqueada | ya existe | `CuentaBloqueada` intacto |

---

## 8. QUÉ SE TOCA EN CADA FICHERO

### Nuevos

| fichero | qué contiene |
|---|---|
| `src/hooks/useCola.ts` | los cuatro escuchadores movidos desde `BarraConductor.tsx:42-74`; expone `{pendientes, enLinea, sincronizando, error, subir}`; aplica la regla anti-parpadeo (`intentos>0 || antigüedad>20 s`) |
| `src/hooks/usePosicion.ts` | `watchPosition({enableHighAccuracy:false, maximumAge:60000, timeout:15000})`; arranca al confirmar la ruta, se detiene en `visibilitychange:hidden` y al desmontar; guarda `{lat,lon,t}` en una `ref`; expone `leer()` síncrono que devuelve `null` si `t` tiene más de 90 s |
| `src/lib/estadoParada.ts` | única fuente de verdad visual del estado: `{ railClass, fondoClass, glifo, texto, hex }` para `pendiente/entregado/parcial/fallido/reprogramado` |
| `src/components/conductor/CabeceraConductor.tsx` | las dos variantes de cabecera (lista y ruta) + la regla de avance + el menú `⋯` + el cierre de sesión con confirmación |
| `src/components/conductor/Consola.tsx` | D0 + D1 + D2 con los cinco estados (E0, E1, E1-bloqueado, E3, E4). **Los anchos de D2 son fijos en los cinco.** |
| `src/components/conductor/CarrilDeshacer.tsx` | los 8 s, `Deshacer`, `📷`, `✎` |
| `src/components/conductor/HojaResultado.tsx` | los dos pasos, chips, motivos, adjuntos, miniatura, precarga de corrección, `pushState`/`popstate`, bloqueo del scroll de fondo |
| `src/components/conductor/HojaFicha.tsx` | código, distrito, coordenadas, Maps/Waze de 56 px, preferencia de navegador |
| `src/components/conductor/ListaParadas.tsx` | renglón de cerradas + filas de 76 px con raíl, glifo y `▶` lateral |
| `src/components/conductor/MapaCaja.tsx` | barra de plegado, altura, `localStorage`, banda de "sin señal", `dynamic import` del mapa |

### Modificados

| fichero | qué se cambia | qué se deja intacto |
|---|---|---|
| `src/app/conductor/layout.tsx` | quita `<BarraConductor>` y cambia `<main>` a `className="mx-auto w-full max-w-[560px] flex-1"` (fuera `px-3 pb-24 pt-3`; el relleno inferior lo pone cada página) | la comprobación de sesión, la lectura de `perfiles` y `CuentaBloqueada` |
| `src/app/conductor/page.tsx` | añade la lectura de `perfiles.nombre`; monta `CabeceraConductor variante="lista"`; tarjetas de 124 px como `<button>` de selección; consola de lista; tipografías nuevas; fuera `ink-3` | la consulta a `rutas` y el filtro `hoyMenos(2)` |
| `src/app/conductor/[rutaId]/page.tsx` | elimina el `<Link>` "← Tus rutas" (pasa al `‹` de la cabecera) | **la consulta entera y las diez props de `RutaReparto`, incluido `orgId`** |
| `src/components/RutaReparto.tsx` | de 631 a ~230 líneas: orquestador. Estado: `lista`, `salida`, `fijada`, `hoja`, `carril`, `bloqueo`, `error`. `activa` derivada. `guardar()` reordenado (§4.9). `ocupado` se parte en `confirmando` y `guardando`. **Se borra el `router.refresh()` por parada (`:158`)**. Se añade el `useEffect` de fusión (§6.2). Se borran `FormularioEntrega`, `BotonEstado`, `Campo` y `Punto` | la firma de las props y el objeto de seis campos que recibe `guardar` |
| `src/components/BarraConductor.tsx` | **se elimina** (solo lo usaba `conductor/layout.tsx`, verificado). Su lógica va a `useCola` y su marcado a `CabeceraConductor` | — |
| `src/components/MapaSeguimiento.tsx` | **solo se añaden props opcionales**: `colores?`, `autoAjustar?`, y los cinco flags de interacción (`dragging`, `scrollWheelZoom`, `touchZoom`, `doubleClickZoom`, `keyboard`) con los valores de hoy por defecto. Se añade el hijo `AjustarTamano` con `useMap` + `ResizeObserver`, activo solo si `autoAjustar` | `COLOR_ESTADO` y `TEXTO_ESTADO` como valores por defecto, `iconoParada`, `iconoCD`, el halo ámbar, los tooltips |
| `src/lib/cola.ts` | `retenerHasta?: number` en `Pendiente`; el filtro de una línea en `sincronizar()`; `parchearPosicion()`; `retener(paradaId, ms)` | **`keyPath: "parada_id"`, `EVENTO_COLA`, `encolar`, `quitarPendiente`, `anotarFallo` y el bucle de subida de `sincronizar` no se tocan** |
| `src/lib/entregas.ts` | se añade `desglosarMotivo(motivo)` y se baja el `msMax` por defecto de `posicionActual` de 8000 a 6000 | **`marcarParada`, `iniciarRuta`, `subirFoto`, `comprimirFoto`, `enlaceNavegacion`, `ESTADOS_ENTREGA` y `MOTIVOS_NO_ENTREGA` no se tocan** |
| `src/app/globals.css` | se añaden `--consola`, `--carril` y la animación `cuenta` | los tokens de `@theme`: **no se crea ni se modifica ninguno** |

### NO SE TOCA — riesgo real

- **`src/components/ui.tsx`.** `Pastilla` la usan 14 sitios de la torre de control y del planificador. La app del conductor **deja de importarla**; el componente se queda como está.
- **`src/components/TorreControl.tsx` y `MapaRutas.tsx`.** Comparten `MapaSeguimiento`; por eso todo lo nuevo del mapa entra como prop opcional con el comportamiento actual por defecto.
- **Los RPC `marcar_parada` e `iniciar_ruta`, el bucket `pod` y el esquema.** Cero migraciones SQL. El deshacer es local por construcción (§4.9), así que nunca se pide al servidor volver a `pendiente` y no aparece el problema del `foto_url` pegajoso.
- **La clave `parada_id` de IndexedDB.** La idempotencia de re-marcar y de adjuntar desde el carril depende de ella.
- **El objeto de seis campos con el `motivo` ya compuesto** (`Otros: …` en fallido, texto de "qué faltó" en parcial, `null` en conforme).
- **`orgId`.** Viaja desde `[rutaId]/page.tsx` hasta `subirFoto`; si llega vacío la subida falla en silencio. No es cosmético: se pasa igual.

---

## 9. ORDEN DE IMPLEMENTACIÓN

| # | Paso | Prueba de que está hecho | h |
|---|---|---|---|
| **1** | **Parches de datos y legibilidad en la pantalla actual.** `motivo` arranca en `null` con validación `Elige el motivo de la no entrega.`; el botón parcial se deshabilita con `bultos===1` mostrando el texto de §4.1; los seis campos de `RutaReparto` suben a **16 px**; `ink-3` → `ink-2` en los once sitios listados | En iPhone, tocar cualquier campo **no** hace zoom. Marcar "No entregado" y guardar sin elegir motivo **no** graba "Ausencia del cliente". Una parada de 1 bulto no ofrece parcial | 3 |
| **2** | **Cola con retención + `usePosicion` + `guardar()` optimista** (sin cambiar todavía el layout). Fuera el `router.refresh()` por parada; fusión de `lista` con props | Modo avión: marcar tres paradas y bloquear la pantalla inmediatamente después de cada una; al desbloquear, las tres siguen en la cola y ninguna se ha perdido. Con señal, el estado se pinta en menos de 100 ms y no aparece "Guardando…" | 8 |
| **3** | **`useCola` + `CabeceraConductor` + `Consola` + `CarrilDeshacer`.** Se elimina `BarraConductor`. `activa` derivada con `fijada`. Bloqueo de 3 s | El aviso de cola nunca desplaza el contenido. `✓ ENTREGADO` lleva el nombre dentro. Salir a Waze y volver deja la consola apuntando a lo mismo. Dos toques seguidos en el botón primario no cierran dos paradas | 10 |
| **4** | **`HojaResultado`**: dos pasos, chips, cinco motivos, adjuntos con miniatura, corrección precargada. Se borra `FormularioEntrega` | Los recuentos de toques de §4.8 se cumplen exactamente. Corregir una parcial muestra los bultos anteriores ya seleccionados | 10 |
| **5** | **`ListaParadas` + `MapaCaja` + `estadoParada` + colores del mapa por prop** | Plegar y desplegar el mapa no lo deja en gris. Arrastrar sobre el mapa desplaza la página. El verde del pin y el del raíl son el mismo. La torre de control se ve idéntica a antes | 8 |
| **6** | **E0 / E4, `HojaFicha`, menú `⋯`, cierre de sesión con confirmación, estados vacíos y de error** | Los textos de §7 aparecen literalmente | 6 |
| **7** | **QA de campo**: iPhone con la PWA instalada y sin instalar, Android de gama baja, modo avión, a las 14:00 al sol, con guante, jornada completa de dos conductores | Ningún "deshacer" accidental; ninguna entrega perdida; ninguna acción fuera de pantalla en iPhone SE | 8 |

**Total ≈ 53 h.** Los pasos 1 y 2 son desplegables por separado y capturan, sin tocar el layout, el fin de los 8 segundos y los tres bugs de datos. Si hay que parar, se para después del paso 3: la app ya es la dirección D.

---

## 10. LO QUE DELIBERADAMENTE NO SE HACE

1. **Nada de `100dvh` con `overflow:hidden`, capas fijas ni presupuestos de píxeles que deban sumar exactamente la altura de la pantalla.** Solo la consola es `fixed`; todo lo demás es una página con scroll. Es la razón por la que se eligió D: en un Android con la fuente del sistema al 130 %, un nombre de tienda de tres líneas o Chrome con la barra de direcciones, esta pantalla se alarga; no expulsa los botones fuera del borde.
2. **No hay hoja inferior arrastrable.** Los gestos con guantes fallan y nadie se los enseña al conductor nuevo. Todo se hace con toques sobre objetivos de 44-76 px.
3. **El mapa no es el fondo de la pantalla ni ocupa el 61 %.** Sin cobertura sería un rectángulo gris justo en sótanos y mercados, y `watchPosition` en alta precisión durante ocho horas mata un Android viejo a las 16:00 — y con él, la cola de IndexedDB hasta que lo carguen.
4. **No se precachean teselas.** La política de uso de `tile.openstreetmap.org` prohíbe la descarga masiva; cambiar de proveedor es una decisión de coste recurrente, no de rediseño.
5. **No se implementa `revertirParada` contra el servidor ni ninguna migración SQL.** El deshacer vive dentro de la ventana de retención de la cola; pasados los 8 s, corregir es re-marcar. Esto evita además el `foto_url` pegajoso de `marcar_parada`, que dejaría el POD de una entrega deshecha colgado de una parada "pendiente".
6. **No se toca `ui.tsx` ni la torre de control.** La `Pastilla` de 10 px desaparece de `/conductor`, pero sigue existiendo para las otras catorce pantallas que la usan.
7. **No hay barra de navegación inferior de cinco iconos** (el préstamo más obvio de la referencia). Ese espacio es la consola. Historial, perfil e incidencias, si algún día existen, viven en el menú `⋯`.
8. **No se ofrece el estado `reprogramado`** aunque exista en `ESTADOS_ENTREGA`: hoy la UI del conductor no lo ofrece y no hay ninguna operación que lo pida desde la calle.
9. **No se persiste la parada seleccionada entre recargas.** `fijada` se limpia sola al recargar y la consola vuelve a la primera pendiente, que es el estado correcto en el 95 % de los casos y siempre es visible en D1 y dentro del botón.
10. **No se añade "quién recibió" al camino de un toque.** Está en el carril, a un toque, durante 8 segundos. Si alguna empresa lo exige como obligatorio, eso es un ajuste de negocio que sube el caso mayoritario a tres toques y anula la mitad del valor del rediseño: se decide antes, no se diseña "por si acaso".
11. **No se optimiza para escritorio ni tablet.** La consola se centra en `max-w-[560px]` y ya está: la app del conductor es una app de teléfono, y la torre de control existe.