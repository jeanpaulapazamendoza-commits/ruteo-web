import { S3Client } from "@aws-sdk/client-s3";

/**
 * El almacén de archivos, en un solo sitio.
 *
 * El almacén de Neon habla S3. Las credenciales se quedan en el servidor: ni
 * la foto de la entrega ni la guía de remisión pasan por un navegador que
 * sepa una clave. Para mirar un archivo después se firma una URL temporal,
 * porque el bucket es privado y así nada queda accesible a quien dé con su
 * dirección.
 *
 * Había dos clientes idénticos, uno por cada cosa que se sube. Uno solo: un
 * cambio de región o de extremo se hace en un sitio, y no en el sitio que uno
 * recuerde.
 */
export const BUCKET = process.env.STORAGE_BUCKET!;

export const s3 = new S3Client({
  region: process.env.STORAGE_REGION!,
  endpoint: process.env.STORAGE_ENDPOINT!,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_KEY_ID!,
    secretAccessKey: process.env.STORAGE_SECRET!,
  },
});
