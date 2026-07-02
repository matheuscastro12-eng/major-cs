import { gunzipSync } from 'node:zlib';

export const MAX_CLOUD_SAVE_BYTES = 2_000_000;
const MAX_ENCODED_BYTES = 2_000_000;

export class CloudSavePayloadError extends Error {}

function assertJson(data: string): void {
  if (!data) return; // tombstone
  try {
    JSON.parse(data);
  } catch {
    throw new CloudSavePayloadError('save inválido');
  }
}

// Aceita o protocolo antigo (JSON puro) e o novo transporte gzip+base64.
// O retorno é sempre o JSON original para manter o formato do banco inalterado.
export function decodeCloudSavePayload(
  wireData: string,
  encoding: unknown,
  originalBytes: unknown,
): string {
  if (encoding == null || encoding === '') {
    if (Buffer.byteLength(wireData, 'utf8') > MAX_CLOUD_SAVE_BYTES) {
      throw new CloudSavePayloadError('save grande demais');
    }
    assertJson(wireData);
    return wireData;
  }

  if (encoding !== 'gzip-base64') {
    throw new CloudSavePayloadError('codificação inválida');
  }

  const expectedBytes = Number(originalBytes);
  if (!Number.isInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_CLOUD_SAVE_BYTES) {
    throw new CloudSavePayloadError('tamanho original inválido');
  }
  if (
    wireData.length > MAX_ENCODED_BYTES
    || wireData.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(wireData)
  ) {
    throw new CloudSavePayloadError('payload comprimido inválido');
  }

  try {
    const compressed = Buffer.from(wireData, 'base64');
    const restored = gunzipSync(compressed, { maxOutputLength: MAX_CLOUD_SAVE_BYTES + 1 });
    if (restored.byteLength !== expectedBytes || restored.byteLength > MAX_CLOUD_SAVE_BYTES) {
      throw new CloudSavePayloadError('tamanho descompactado inválido');
    }
    const data = restored.toString('utf8');
    if (!Buffer.from(data, 'utf8').equals(restored)) {
      throw new CloudSavePayloadError('save não está em UTF-8');
    }
    assertJson(data);
    return data;
  } catch (error) {
    if (error instanceof CloudSavePayloadError) throw error;
    throw new CloudSavePayloadError('não foi possível descompactar o save');
  }
}
