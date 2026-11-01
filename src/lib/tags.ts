/**
 * Reads the embedded Title and Artist text tags from a file (display only; nothing is stored).
 * MP3 (ID3v2.2–2.4, ID3v1), M4A/MP4, FLAC, Ogg Vorbis and Opus. Returns {} when there is no usable tag.
 */
export interface Tags {
  title?: string;
  artist?: string;
}

async function read(file: Blob, start: number, length: number): Promise<Uint8Array> {
  if (length <= 0 || start < 0 || start >= file.size) return new Uint8Array(0);
  return new Uint8Array(await file.slice(start, start + length).arrayBuffer());
}

const be32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b: Uint8Array, o: number): number => ((b[o + 3] << 24) | (b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0;
const syncsafe = (b: Uint8Array, o: number): number => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const ascii = (b: Uint8Array, s: number, e: number): string => String.fromCharCode(...b.subarray(s, e));
const clean = (s: string | undefined): string | undefined => {
  const t = s?.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t : undefined;
};

/** ID3 text frame payload: encoding byte + text (several values may be separated by NUL). */
function id3Text(data: Uint8Array): string[] {
  if (data.length < 2) return [];
  const enc = data[0];
  const body = data.subarray(1);
  const decode = (bytes: Uint8Array, label: string) => new TextDecoder(label).decode(bytes);
  let text: string;
  try {
    if (enc === 1) {
      const le = body[0] === 0xff && body[1] === 0xfe;
      const be = body[0] === 0xfe && body[1] === 0xff;
      text = decode(be || le ? body.subarray(2) : body, be ? 'utf-16be' : 'utf-16le');
    } else if (enc === 2) text = decode(body, 'utf-16be');
    else if (enc === 3) text = decode(body, 'utf-8');
    else text = decode(body, 'windows-1252');
  } catch {
    return [];
  }
  return text.split('\u0000').map((s) => s.trim()).filter(Boolean);
}

async function readId3v2(file: Blob): Promise<Tags | null> {
  const head = await read(file, 0, 10);
  if (head.length < 10 || ascii(head, 0, 3) !== 'ID3') return null;
  const version = head[3];
  if (version < 2 || version > 4) return null;
  const end = Math.min(10 + syncsafe(head, 6), file.size);
  let pos = 10;
  if (head[5] & 0x40 && version > 2) {
    const ext = await read(file, pos, 4);
    pos += version === 4 ? syncsafe(ext, 0) : be32(ext, 0) + 4;
  }
  const idLen = version === 2 ? 3 : 4;
  const hdrLen = version === 2 ? 6 : 10;
  const titleId = version === 2 ? 'TT2' : 'TIT2';
  const artistId = version === 2 ? 'TP1' : 'TPE1';
  const out: Tags = {};
  for (let guard = 0; pos + hdrLen <= end && guard < 400; guard++) {
    const h = await read(file, pos, hdrLen);
    if (h.length < hdrLen || h[0] === 0) break;
    const id = ascii(h, 0, idLen);
    const size = version === 2 ? (h[3] << 16) | (h[4] << 8) | h[5] : version === 4 ? syncsafe(h, 4) : be32(h, 4);
    if (size <= 0 || pos + hdrLen + size > end) break;
    if ((id === titleId || id === artistId) && size < 4096) {
      const values = id3Text(await read(file, pos + hdrLen, size));
      if (id === titleId) out.title = clean(values[0]);
      else out.artist = clean(values.join(', '));
      if (out.title && out.artist) break;
    }
    pos += hdrLen + size;
  }
  return out;
}

async function readId3v1(file: Blob): Promise<Tags> {
  const b = await read(file, file.size - 128, 128);
  if (b.length < 128 || ascii(b, 0, 3) !== 'TAG') return {};
  const field = (s: number, e: number) => clean(new TextDecoder('windows-1252').decode(b.subarray(s, e)));
  return { title: field(3, 33), artist: field(33, 63) };
}

/** Vorbis comment block: vendor string, then KEY=value entries. */
function vorbisComments(b: Uint8Array, start: number): Tags {
  const out: Tags = {};
  try {
    let o = start;
    o += 4 + le32(b, o);
    const count = le32(b, o);
    o += 4;
    const td = new TextDecoder('utf-8');
    for (let i = 0; i < count && i < 500 && o + 4 <= b.length; i++) {
      const len = le32(b, o);
      o += 4;
      if (o + len > b.length) break;
      const entry = td.decode(b.subarray(o, o + len));
      o += len;
      const eq = entry.indexOf('=');
      if (eq < 1) continue;
      const key = entry.slice(0, eq).toUpperCase();
      const value = clean(entry.slice(eq + 1));
      if (key === 'TITLE' && !out.title) out.title = value;
      else if (key === 'ARTIST' && !out.artist) out.artist = value;
    }
  } catch {
    /* truncated comment block: keep what was read */
  }
  return out;
}

async function readFlac(file: Blob): Promise<Tags> {
  let pos = 4;
  for (let guard = 0; guard < 64; guard++) {
    const h = await read(file, pos, 4);
    if (h.length < 4) break;
    const last = (h[0] & 0x80) !== 0;
    const type = h[0] & 0x7f;
    const len = (h[1] << 16) | (h[2] << 8) | h[3];
    if (type === 4) return vorbisComments(await read(file, pos + 4, Math.min(len, 1 << 20)), 0);
    if (last) break;
    pos += 4 + len;
  }
  return {};
}

async function readOgg(file: Blob): Promise<Tags> {
  const b = await read(file, 0, 256 * 1024);
  for (const [marker, skip] of [['\u0003vorbis', 7], ['OpusTags', 8]] as const) {
    const at = ascii(b, 0, b.length).indexOf(marker);
    if (at >= 0) return vorbisComments(b, at + skip);
  }
  return {};
}

interface Box {
  type: string;
  start: number;
  header: number;
  size: number;
}

async function boxAt(file: Blob, offset: number, limit: number): Promise<Box | null> {
  const h = await read(file, offset, 16);
  if (h.length < 8 || offset + 8 > limit) return null;
  let size = be32(h, 0);
  let header = 8;
  if (size === 1 && h.length >= 16) {
    size = be32(h, 8) * 2 ** 32 + be32(h, 12);
    header = 16;
  } else if (size === 0) size = limit - offset;
  if (size < header || offset + size > limit) return null;
  return { type: ascii(h, 4, 8), start: offset, header, size };
}

async function findBox(file: Blob, from: number, to: number, type: string): Promise<Box | null> {
  for (let pos = from, guard = 0; pos < to && guard < 200; guard++) {
    const box = await boxAt(file, pos, to);
    if (!box) return null;
    if (box.type === type) return box;
    pos += box.size;
  }
  return null;
}

async function readMp4(file: Blob): Promise<Tags> {
  const moov = await findBox(file, 0, file.size, 'moov');
  if (!moov) return {};
  let box: Box | null = moov;
  for (const name of ['udta', 'meta', 'ilst']) {
    // 'meta' is a full box: four bytes of version/flags precede its children
    const from: number = box.start + box.header + (box.type === 'meta' ? 4 : 0);
    box = await findBox(file, from, box.start + box.size, name);
    if (!box) return {};
  }
  const text = async (type: string): Promise<string | undefined> => {
    const item = await findBox(file, box!.start + box!.header, box!.start + box!.size, type);
    if (!item) return undefined;
    const data = await findBox(file, item.start + item.header, item.start + item.size, 'data');
    if (!data || data.size > 4096) return undefined;
    const payload = await read(file, data.start + data.header + 8, data.size - data.header - 8);
    return clean(new TextDecoder('utf-8').decode(payload));
  };
  return { title: await text('©nam'), artist: await text('©ART') };
}

export async function readTags(file: Blob): Promise<Tags> {
  try {
    const head = await read(file, 0, 12);
    if (head.length < 4) return {};
    const magic = ascii(head, 0, 4);
    if (magic === 'fLaC') return await readFlac(file);
    if (magic === 'OggS') return await readOgg(file);
    if (head.length >= 8 && ascii(head, 4, 8) === 'ftyp') return await readMp4(file);
    const v2 = await readId3v2(file);
    if (v2 && (v2.title || v2.artist)) return v2;
    return await readId3v1(file);
  } catch {
    return {};
  }
}
