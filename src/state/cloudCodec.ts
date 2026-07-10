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

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

// Espelho do encode, usado na resposta do PULL: o servidor devolve o save
// gzip+base64 quando o cliente anuncia suporte (corta o Fast Origin Transfer da
// restauração cross-device). Volta pro JSON cru se não vier `encoding` ou se o
// browser não tiver DecompressionStream. Nunca lança — na dúvida devolve null
// pra que o chamador trate como "nada novo" em vez de corromper o save.
export async function decodeCloudPayload(
  wireData: string,
  encoding?: string,
): Promise<string | null> {
  if (!encoding) return wireData;
  if (encoding !== 'gzip-base64' || typeof DecompressionStream === 'undefined') return null;
  try {
    const bytes = base64ToBytes(wireData);
    const restored = await new Response(
      new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer();
    return new TextDecoder().decode(restored);
  } catch {
    return null;
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
