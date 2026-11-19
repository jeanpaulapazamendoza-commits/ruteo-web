"use server";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "@/auth";
import { unaFila } from "@/lib/db";

/**
 * Fotos de prueba de entrega.
 *
 * El almacén de Neon habla S3, y las claves se quedan en el servidor: el
 * conductor manda la foto a esta acción y nunca ve una credencial. Para
 * mirarla después se firma una URL temporal; el bucket es privado, así que
 * una foto de entrega no queda accesible a quien dé con su dirección.
 */
const BUCKET = process.env.STORAGE_BUCKET!;

const s3 = new S3Client({
  region: process.env.STORAGE_REGION!,
  endpoint: process.env.STORAGE_ENDPOINT!,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_KEY_ID!,
    secretAccessKey: process.env.STORAGE_SECRET!,
  },
});

/**
 * Guarda la foto de una parada y devuelve su clave.
 *
 * Comprueba contra la base que la parada sea de quien la manda: la consulta
 * va con su identidad, así que el RLS devuelve vacío si la parada es de otra
 * empresa, o de la ruta de otro conductor.
 */
export async function guardarFoto(datos: FormData): Promise<string> {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");

  const paradaId = String(datos.get("paradaId") ?? "");
  const foto = datos.get("foto");
  if (!paradaId || !(foto instanceof Blob)) throw new Error("Falta la foto.");
  if (foto.size > 5 * 1024 * 1024) throw new Error("La foto pesa más de 5 MB.");

  const parada = await unaFila<{ org_id: string }>(
    sesion.user.id,
    "select org_id from paradas where id = $1",
    [paradaId],
  );
  if (!parada) throw new Error("Esa parada no es tuya.");

  // La empresa va delante en la clave para que las fotos de cada cliente
  // queden separadas y se puedan borrar por lotes al cerrar una cuenta.
  const clave = `${parada.org_id}/${paradaId}-${Date.now()}.jpg`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: clave,
      Body: Buffer.from(await foto.arrayBuffer()),
      ContentType: "image/jpeg",
    }),
  );

  return clave;
}

/**
 * URL temporal para ver una foto guardada.
 *
 * Se comprueba primero que la parada sea visible para quien pregunta, porque
 * una URL firmada ya no pasa por el RLS: cualquiera con ese enlace vería la
 * foto hasta que caduque.
 */
export async function verFoto(claveFoto: string): Promise<string | null> {
  const sesion = await auth();
  if (!sesion?.user) return null;

  const permitida = await unaFila(
    sesion.user.id,
    "select 1 from paradas where foto_url = $1 limit 1",
    [claveFoto],
  );
  if (!permitida) return null;

  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: claveFoto }),
    { expiresIn: 60 * 10 },
  );
}
