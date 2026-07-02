export type CloudWirePayload = {
  data: string;
  encoding?: 'gzip-base64';
  originalBytes?: number;
};

const MIN_COMPRESS_BYTES = 1024;
const WIRE_METADATA_BYTES = 64;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

// Compressão lossless no navegador. O servidor descompacta antes de persistir,
// então o banco e clientes antigos continuam vendo exatamente o mesmo JSON.
export async function encodeCloudPayload(data: string): Promise<CloudWirePayload> {
  if (!data || typeof CompressionStream === 'undefined') return { data };

  const source = new TextEncoder().encode(data);
  if (source.byteLength < MIN_COMPRESS_BYTES) return { data };

  try {
    const compressed = await new Response(
      new Blob([data]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer();
    const encoded = bytesToBase64(new Uint8Array(compressed));

    // Base64 custa ~33%. Só usa gzip quando o request final ainda fica menor.
    if (encoded.length + WIRE_METADATA_BYTES >= source.byteLength) return { data };
    return {
      data: encoded,
      encoding: 'gzip-base64',
      originalBytes: source.byteLength,
    };
  } catch {
    // Browser sem suporte funcional a CompressionStream: mantém o protocolo antigo.
    return { data };
  }
}

// SHA-256 evita reenvio de um snapshot idêntico sem risco prático de colisão.
// Em browsers antigos sem Web Crypto, a sincronização segue normalmente.
export async function hashCloudPayload(data: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
