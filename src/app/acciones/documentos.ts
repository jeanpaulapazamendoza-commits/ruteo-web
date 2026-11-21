"use server";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "@/auth";
import { BUCKET, s3 } from "@/lib/almacen";
import { comoUsuario, unaFila } from "@/lib/db";
import type { Documento } from "@/lib/documentos";

/**
 * Los documentos de una parada.
 *
 * La guía de remisión, el acta de conformidad firmada, la factura. Hasta
 * ahora el único archivo que admitía una parada era la foto de la entrega, y
 * con eso no se contesta a un cliente que pide su guía sellada.
 *
 * El archivo va al almacén y en la base queda su clave. La fila se escribe
 * con la identidad de quien sube, así que el RLS decide a qué parada puede
 * colgarse: si la parada es de otra empresa —o de la ruta de otro conductor—
 * el insert no encuentra nada que copiar y no escribe.
 */

/**
 * Qué se admite subir.
 *
 * Lista blanca y no lista negra: lo que no está aquí no entra. Un almacén que
 * acepta cualquier tipo acaba sirviendo un .html con JavaScript desde el
 * mismo sitio desde el que se sirven las URL firmadas.
 */
const ADMITIDOS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const PESO_MAX = 10 * 1024 * 1024;

/** Los documentos colgados de una parada, el más reciente primero. */
export async function documentosDeParada(paradaId: string) {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");

  return comoUsuario<Documento>(
    sesion.user.id,
    `select d.id, d.tipo, d.nombre, d.peso, a.nombre as autor, d.creado_en,
            (d.autor = $2 or private.mi_rol() = 'admin') as mio
       from documentos d
       left join perfiles a on a.id = d.autor
      where d.parada_id = $1
      order by d.creado_en desc, d.id desc`,
    [paradaId, sesion.user.id],
  );
}

/** Sube un documento y devuelve su fila. */
export async function guardarDocumento(datos: FormData): Promise<Documento> {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");

  const paradaId = String(datos.get("paradaId") ?? "");
  const tipo = String(datos.get("tipo") ?? "").trim();
  const archivo = datos.get("archivo");

  if (!paradaId) throw new Error("Falta la parada.");
  if (!tipo) throw new Error("Elige el tipo de documento.");
  if (!(archivo instanceof File)) throw new Error("Falta el archivo.");
  if (archivo.size === 0) throw new Error("Ese archivo está vacío.");
  if (archivo.size > PESO_MAX) {
    throw new Error("El archivo pesa más de 10 MB. Reduce el escaneo o súbelo en PDF.");
  }

  const extension = ADMITIDOS[archivo.type];
  if (!extension) {
    throw new Error("Solo se admiten PDF e imágenes (JPG, PNG o WEBP).");
  }

  // La empresa va delante en la clave, como en las fotos: así los archivos de
  // cada cliente quedan separados y se pueden borrar por lotes al cerrar una
  // cuenta. El reloj evita que dos subidas del mismo punto se pisen.
  const parada = await unaFila<{ org_id: string }>(
    sesion.user.id,
    "select org_id from paradas where id = $1",
    [paradaId],
  );
  if (!parada) throw new Error("Esa parada no es tuya.");

  const clave = `${parada.org_id}/doc/${paradaId}-${Date.now()}.${extension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: clave,
      Body: Buffer.from(await archivo.arrayBuffer()),
      ContentType: archivo.type,
    }),
  );

  // El nombre del archivo lo escribe quien sea: se recorta y se le quita la
  // ruta, que algunos navegadores mandan entera.
  const nombre = (archivo.name.split(/[\\/]/).pop() ?? "documento").slice(0, 200);

  const filas = await comoUsuario<Documento>(
    sesion.user.id,
    `insert into documentos (org_id, parada_id, tipo, clave, nombre, peso, autor)
     select p.org_id, p.id, $2, $3, $4, $5, $6 from paradas p where p.id = $1
     returning id, tipo, nombre, peso, creado_en, true as mio,
               (select nombre from perfiles where id = $6) as autor`,
    [paradaId, tipo.slice(0, 40), clave, nombre, archivo.size, sesion.user.id],
  );

  if (!filas.length) {
    // El RLS rechazó la fila; el archivo ya está arriba y no debe quedarse
    // suelto, porque nada lo nombraría nunca.
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: clave })).catch(() => {});
    throw new Error("Esa parada no es tuya.");
  }

  return filas[0];
}

/**
 * URL temporal para abrir un documento.
 *
 * La clave se busca con la identidad de quien pregunta, nunca se recibe del
 * navegador: una URL firmada ya no pasa por el RLS, así que quien tuviera el
 * enlace vería el archivo hasta que caducara.
 */
export async function verDocumento(id: number): Promise<string | null> {
  const sesion = await auth();
  if (!sesion?.user) return null;

  const fila = await unaFila<{ clave: string; nombre: string }>(
    sesion.user.id,
    "select clave, nombre from documentos where id = $1",
    [id],
  );
  if (!fila) return null;

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: fila.clave,
      // Que el navegador lo abra con su nombre de verdad y no con la clave.
      ResponseContentDisposition: `inline; filename="${fila.nombre.replace(/"/g, "")}"`,
    }),
    { expiresIn: 60 * 10 },
  );
}

/**
 * Retira un documento.
 *
 * Primero la fila: si el RLS no deja borrarla, el archivo sigue en su sitio y
 * se puede volver a intentar. Al contrario quedaría una fila que nombra un
 * archivo que ya no existe, y eso en pantalla es un enlace roto.
 */
export async function borrarDocumento(id: number) {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");

  const filas = await comoUsuario<{ clave: string }>(
    sesion.user.id,
    "delete from documentos where id = $1 returning clave",
    [id],
  );
  if (!filas.length) throw new Error("Ese documento no es tuyo.");

  await s3
    .send(new DeleteObjectCommand({ Bucket: BUCKET, Key: filas[0].clave }))
    .catch(() => {
      /* la fila ya no está; un archivo huérfano no rompe ninguna pantalla */
    });
}
