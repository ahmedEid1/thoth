import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

const client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  if (!res.Body) throw new Error(`empty body for ${key}`);
  return await res.Body.transformToByteArray();
}

export async function getSignedGetUrl(key: string, expiresInSeconds: number): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}
