// Minimal ZIP reader/writer — no dependencies.
// Writer: STORE (no compression) entries with CRC32; every reader accepts
// stored entries. Reader inflates deflated entries with the web platform's
// DecompressionStream("deflate-raw") — available in Chromium/WebKit/Tauri.

// ── CRC32 ───────────────────────────────────────────────────────

let crcTable: Uint32Array | null = null;

function table(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

function crc32(data: Uint8Array): number {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Writer ──────────────────────────────────────────────────────

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function writeStr(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

export function zipSync(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + nameBytes.length + e.data.length);
    const lv = new DataView(local.buffer);
    writeStr(lv, 0, "PK\x03\x04");
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method: store
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x21, true); // mod date (1996-01-01, arbitrary valid)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(e.data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    writeStr(cv, 0, "PK\x01\x02");
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); // method store
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    // 30 extra len, 32 comment len, 34 disk, 36 int attrs = 0
    cv.setUint32(38, 0, true); // ext attrs
    cv.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  writeStr(ev, 0, "PK\x05\x06");
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const l of locals) { out.set(l, pos); pos += l.length; }
  for (const c of centrals) { out.set(c, pos); pos += c.length; }
  out.set(end, pos);
  return out;
}

// ── Reader ──────────────────────────────────────────────────────

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) throw new Error("DecompressionStream unavailable in this runtime");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DS("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export async function unzipAsync(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, Uint8Array>();

  // Locate End Of Central Directory (scan backwards for signature)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a ZIP file");

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));

    // Read local header to find data start (local header may have different name/extra lengths)
    if (view.getUint32(localOffset, true) !== 0x04034b50) { p += 46 + nameLen + extraLen + commentLen; continue; }
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);

    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error(`Unsupported compression method ${method} in ${name}`);

    if (!name.endsWith("/")) files.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

export async function readZipEntry(bytes: Uint8Array, name: string): Promise<string | null> {
  const files = await unzipAsync(bytes);
  const entry = files.get(name);
  if (!entry) return null;
  return new TextDecoder().decode(entry);
}
