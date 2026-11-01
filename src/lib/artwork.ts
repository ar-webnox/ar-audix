/**
 * Embedded cover-art extraction.
 *
 * Reads only the tag regions of a file (never the whole audio stream) and returns the
 * picture bytes. Supported containers:
 *   - MP3 / AAC with an ID3v2.2, v2.3 or v2.4 tag (APIC / PIC frames)
 *   - M4A / MP4 (moov > udta > meta > ilst > covr)
 *   - FLAC (PICTURE metadata block), also behind a leading ID3 tag
 *   - Ogg Vorbis and Ogg Opus (METADATA_BLOCK_PICTURE / COVERART comments)
 * Anything else (WAV, AIFF, ...) simply has no extractable artwork.
 */

export interface Picture {
  bytes: Uint8Array;
  mime: string;
}

interface Candidate {
  /** ID3 / FLAC picture type. 3 is "front cover". */
  type: number;
  bytes: Uint8Array;
}

/** Upper bound for a single picture or tag, to stay safe on malformed files. */
const MAX_BYTES = 40 * 1024 * 1024;

async function read(file: Blob, start: number, length: number): Promise<Uint8Array> {
  if (length <= 0 || start < 0 || start >= file.size) return new Uint8Array(0);
  return new Uint8Array(await file.slice(start, start + length).arrayBuffer());
}

const be32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b: Uint8Array, o: number): number => ((b[o + 3] << 24) | (b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0;
const syncsafe = (b: Uint8Array, o: number): number =>
  ((b[o] & 127) << 21) | ((b[o + 1] & 127) << 14) | ((b[o + 2] & 127) << 7) | (b[o + 3] & 127);

function ascii(b: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** Identifies an image by its magic bytes. The tag's own MIME field is not trusted. */
export function sniffImage(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 6 && ascii(b, 0, 4) === 'GIF8') return 'image/gif';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  return null;
}

/** Some taggers write a misaligned description; look for a real image start nearby. */
function trimToImage(b: Uint8Array): Uint8Array | null {
  if (sniffImage(b)) return b;
  const limit = Math.min(b.length - 8, 256);
  for (let i = 1; i < limit; i++) {
    if (sniffImage(b.subarray(i, i + 12))) return b.subarray(i);
  }
  return null;
}

function choose(candidates: Candidate[]): Picture | null {
  const rank = (t: number) => (t === 3 ? 0 : t === 0 ? 1 : 2);
  const ordered = [...candidates].sort((a, b) => rank(a.type) - rank(b.type));
  for (const c of ordered) {
    const bytes = trimToImage(c.bytes);
    const mime = bytes ? sniffImage(bytes) : null;
    if (bytes && mime) return { bytes, mime };
  }
  return null;
}

/* ---------------- ID3v2 ---------------- */

function unsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

function parseApic(data: Uint8Array, legacy: boolean): Candidate | null {
  if (data.length < 6) return null;
  const encoding = data[0];
  let i = 1;
  if (legacy) {
    i += 3; // three-letter image format in ID3v2.2
  } else {
    const end = data.indexOf(0, i);
    if (end < 0) return null;
    if (ascii(data, i, end) === '-->') return null; // link to an external image
    i = end + 1;
  }
  const type = data[i++];
  if (encoding === 1 || encoding === 2) {
    while (i + 1 < data.length && !(data[i] === 0 && data[i + 1] === 0)) i += 2;
    i += 2;
  } else {
    const end = data.indexOf(0, i);
    if (end < 0) return null;
    i = end + 1;
  }
  return i < data.length ? { type, bytes: data.subarray(i) } : null;
}

async function readId3(file: Blob): Promise<{ pictures: Candidate[]; end: number } | null> {
  const head = await read(file, 0, 10);
  if (head.length < 10 || ascii(head, 0, 3) !== 'ID3') return null;
  const major = head[3];
  const flags = head[5];
  const size = syncsafe(head, 6);
  const end = 10 + size + (major === 4 && flags & 0x10 ? 10 : 0);
  if (major < 2 || major > 4 || size > MAX_BYTES) return { pictures: [], end };

  let body = await read(file, 10, size);
  if (major < 4 && flags & 0x80) body = unsync(body);
  const tagUnsync = major === 4 && (flags & 0x80) !== 0;

  let pos = 0;
  if (major >= 3 && flags & 0x40 && body.length >= 4) pos = major === 4 ? syncsafe(body, 0) : be32(body, 0) + 4;

  const headerSize = major === 2 ? 6 : 10;
  const pictures: Candidate[] = [];
  while (pos + headerSize <= body.length && body[pos] !== 0) {
    const id = ascii(body, pos, pos + (major === 2 ? 3 : 4));
    const frameSize =
      major === 2
        ? (body[pos + 3] << 16) | (body[pos + 4] << 8) | body[pos + 5]
        : major === 4
          ? syncsafe(body, pos + 4)
          : be32(body, pos + 4);
    const formatFlags = major >= 3 ? body[pos + 9] : 0;
    const start = pos + headerSize;
    const stop = start + frameSize;
    if (frameSize <= 0 || stop > body.length) break;
    pos = stop;
    if (id !== 'APIC' && id !== 'PIC') continue;

    let data = body.subarray(start, stop);
    if (major === 3) {
      if (formatFlags & 0xc0) continue; // compressed or encrypted
      if (formatFlags & 0x20) data = data.subarray(1); // grouping byte
    } else if (major === 4) {
      if (formatFlags & 0x0c) continue; // compressed or encrypted
      const skip = (formatFlags & 0x40 ? 1 : 0) + (formatFlags & 0x01 ? 4 : 0);
      data = data.subarray(skip);
      if (formatFlags & 0x02 || tagUnsync) data = unsync(data);
    }
    const found = parseApic(data, major === 2);
    if (found) pictures.push(found);
  }
  return { pictures, end };
}

/* ---------------- FLAC picture blocks (also used by Ogg) ---------------- */

function parsePictureBlock(b: Uint8Array): Candidate | null {
  if (b.length < 32) return null;
  let o = 0;
  const type = be32(b, o);
  o += 4;
  const mimeLength = be32(b, o);
  o += 4;
  if (o + mimeLength + 4 > b.length) return null;
  o += mimeLength;
  const descLength = be32(b, o);
  o += 4 + descLength;
  if (o + 20 > b.length) return null;
  o += 16; // width, height, depth, colours
  const length = be32(b, o);
  o += 4;
  if (o + length > b.length) return null;
  return { type, bytes: b.subarray(o, o + length) };
}

async function readFlac(file: Blob, at: number): Promise<Candidate[]> {
  const magic = await read(file, at, 4);
  if (ascii(magic, 0, 4) !== 'fLaC') return [];
  const pictures: Candidate[] = [];
  let offset = at + 4;
  for (let i = 0; i < 256; i++) {
    const h = await read(file, offset, 4);
    if (h.length < 4) break;
    const last = (h[0] & 0x80) !== 0;
    const type = h[0] & 0x7f;
    const length = (h[1] << 16) | (h[2] << 8) | h[3];
    if (type === 6 && length <= MAX_BYTES) {
      const c = parsePictureBlock(await read(file, offset + 4, length));
      if (c) pictures.push(c);
    }
    offset += 4 + length;
    if (last) break;
  }
  return pictures;
}

/* ---------------- MP4 / M4A ---------------- */

interface Box {
  type: string;
  start: number;
  header: number;
  size: number;
}

async function boxAt(file: Blob, offset: number, limit: number): Promise<Box | null> {
  const h = await read(file, offset, 16);
  if (h.length < 8) return null;
  let size = be32(h, 0);
  let header = 8;
  if (size === 1) {
    if (h.length < 16) return null;
    size = be32(h, 8) * 4294967296 + be32(h, 12);
    header = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (offset + size > limit) size = limit - offset;
  if (size < header) return null;
  return { type: ascii(h, 4, 8), start: offset, header, size };
}

async function findBox(file: Blob, start: number, end: number, type: string): Promise<Box | null> {
  let offset = start;
  for (let i = 0; i < 1024 && offset + 8 <= end; i++) {
    const box = await boxAt(file, offset, end);
    if (!box) return null;
    if (box.type === type) return box;
    offset += box.size;
  }
  return null;
}

/** Child range of a box. "meta" is a full box with 4 extra version/flag bytes. */
const childRange = (b: Box): [number, number] => [b.start + b.header + (b.type === 'meta' ? 4 : 0), b.start + b.size];

async function descend(file: Blob, from: Box, path: string[]): Promise<Box | null> {
  let current = from;
  for (const type of path) {
    const [start, end] = childRange(current);
    const next = await findBox(file, start, end, type);
    if (!next) return null;
    current = next;
  }
  return current;
}

async function readMp4(file: Blob): Promise<Candidate[]> {
  const moov = await findBox(file, 0, file.size, 'moov');
  if (!moov) return [];
  const ilst = (await descend(file, moov, ['udta', 'meta', 'ilst'])) ?? (await descend(file, moov, ['meta', 'ilst']));
  if (!ilst) return [];
  const [ilstStart, ilstEnd] = childRange(ilst);
  const covr = await findBox(file, ilstStart, ilstEnd, 'covr');
  if (!covr) return [];

  const pictures: Candidate[] = [];
  let offset = covr.start + covr.header;
  const end = covr.start + covr.size;
  while (offset + 8 <= end) {
    const box = await boxAt(file, offset, end);
    if (!box) break;
    const payload = box.size - box.header - 8; // version/flags + locale precede the image
    if (box.type === 'data' && payload > 0 && payload <= MAX_BYTES) {
      pictures.push({ type: 3, bytes: await read(file, box.start + box.header + 8, payload) });
    }
    offset += box.size;
  }
  return pictures;
}

/* ---------------- Ogg Vorbis / Opus ---------------- */

function base64Bytes(text: Uint8Array): Uint8Array {
  let binary = '';
  for (let i = 0; i < text.length; i += 0x8000) binary += String.fromCharCode(...text.subarray(i, i + 0x8000));
  const raw = atob(binary);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let n = 0;
  for (const p of parts) {
    out.set(p, n);
    n += p.length;
  }
  return out;
}

async function readOgg(file: Blob): Promise<Candidate[]> {
  const packets: Uint8Array[][] = [];
  let current: Uint8Array[] = [];
  let offset = 0;
  let total = 0;
  for (let pages = 0; packets.length < 2 && pages < 4000; pages++) {
    const h = await read(file, offset, 27);
    if (h.length < 27 || ascii(h, 0, 4) !== 'OggS') break;
    const count = h[26];
    const table = await read(file, offset + 27, count);
    if (table.length < count) break;
    let bodyLength = 0;
    for (const s of table) bodyLength += s;
    total += bodyLength;
    if (total > MAX_BYTES) break;
    const body = await read(file, offset + 27 + count, bodyLength);
    let p = 0;
    for (const length of table) {
      current.push(body.subarray(p, p + length));
      p += length;
      if (length < 255) {
        packets.push(current);
        current = [];
        if (packets.length === 2) break;
      }
    }
    offset += 27 + count + bodyLength;
  }
  if (packets.length < 2) return [];

  const id = concat(packets[0]);
  let skip: number;
  if (id[0] === 0x01 && ascii(id, 1, 7) === 'vorbis') skip = 7;
  else if (ascii(id, 0, 8) === 'OpusHead') skip = 8;
  else return [];

  const comments = concat(packets[1]);
  let o = skip;
  if (o + 4 > comments.length) return [];
  o += 4 + le32(comments, o); // vendor string
  if (o + 4 > comments.length) return [];
  const count = le32(comments, o);
  o += 4;

  const pictures: Candidate[] = [];
  for (let i = 0; i < count && o + 4 <= comments.length; i++) {
    const length = le32(comments, o);
    o += 4;
    if (o + length > comments.length) break;
    const entry = comments.subarray(o, o + length);
    o += length;
    const eq = entry.indexOf(61); // "="
    if (eq < 1) continue;
    const key = ascii(entry, 0, eq).toUpperCase();
    if (key === 'METADATA_BLOCK_PICTURE') {
      try {
        const c = parsePictureBlock(base64Bytes(entry.subarray(eq + 1)));
        if (c) pictures.push(c);
      } catch {
        // Invalid base64: ignore this entry.
      }
    } else if (key === 'COVERART') {
      try {
        pictures.push({ type: 3, bytes: base64Bytes(entry.subarray(eq + 1)) });
      } catch {
        // Ignore.
      }
    }
  }
  return pictures;
}

/* ---------------- public API ---------------- */

/** Finds the embedded cover picture of an audio file, or null when it has none. Never throws. */
export async function extractPicture(file: Blob): Promise<Picture | null> {
  try {
    const head = await read(file, 0, 12);
    let candidates: Candidate[] = [];
    if (ascii(head, 0, 3) === 'ID3') {
      const id3 = await readId3(file);
      if (id3) {
        candidates = id3.pictures;
        if (candidates.length === 0) candidates = await readFlac(file, id3.end);
      }
    } else if (ascii(head, 4, 8) === 'ftyp') {
      candidates = await readMp4(file);
    } else if (ascii(head, 0, 4) === 'fLaC') {
      candidates = await readFlac(file, 0);
    } else if (ascii(head, 0, 4) === 'OggS') {
      candidates = await readOgg(file);
    }
    return choose(candidates);
  } catch {
    return null;
  }
}

/** Stable id for a picture's contents, so identical covers are stored once. */
export function hashBytes(b: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < b.length; i++) {
    h1 = Math.imul(h1 ^ b[i], 16777619);
    h2 = Math.imul(h2, 33) ^ b[i];
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}-${b.length.toString(36)}`;
}

const THUMB_MAX = 512;

/**
 * Decodes the picture and returns a compact version for storage (max 512px). Pictures that are
 * already small are kept byte-for-byte. Returns null when the browser cannot decode the image.
 */
export async function makeThumbnail(bytes: Uint8Array, mime: string): Promise<Blob | null> {
  const source = new Blob([bytes as BlobPart], { type: mime });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    return null;
  }
  try {
    const { width, height } = bitmap;
    if (width < 1 || height < 1) return null;
    const scale = Math.min(1, THUMB_MAX / Math.max(width, height));
    if (scale === 1 && source.size <= 400_000 && (mime === 'image/jpeg' || mime === 'image/png')) return source;

    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#1e2228';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#1e2228';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}
