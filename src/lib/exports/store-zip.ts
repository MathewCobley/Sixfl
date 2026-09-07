export type ZipEntry = { name: string; data: Uint8Array };

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP STORE: artwork is already compressed. No resampling, shell, or temporary files.
 * Standard local headers + central directory + EOCD; UTF-8 names (APPNOTE bit 11).
 * Intentionally bounded to small, non-ZIP64 exports. */
export function createStoreZip(entries: ZipEntry[], limitBytes = 65 * 1024 * 1024): Buffer {
  if (!entries.length || entries.length > 1000) throw new Error("Invalid ZIP entry count.");
  const seen = new Set<string>();
  let total = 22;
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith("/") || /[\\:\u0000-\u001f]/.test(entry.name) ||
        entry.name.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Unsafe ZIP filename.");
    const key = entry.name.normalize("NFC").toLowerCase();
    if (seen.has(key)) throw new Error("Duplicate ZIP filename.");
    seen.add(key);
    const length = Buffer.byteLength(entry.name);
    if (length > 65535) throw new Error("ZIP filename is too long.");
    total += 30 + 46 + 2 * length + entry.data.byteLength;
  }
  if (total > limitBytes || total >= 0xffffffff) throw new Error("Logo pack is too large. Select fewer teams.");
  const output = Buffer.alloc(total);
  const records: Array<{ name: Buffer; size: number; crc: number; offset: number }> = [];
  let at = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8"), size = entry.data.byteLength, crc = crc32(entry.data);
    records.push({ name, size, crc, offset: at });
    output.writeUInt32LE(0x04034b50, at);
    output.writeUInt16LE(20, at + 4);
    output.writeUInt16LE(0x0800, at + 6);
    output.writeUInt16LE(33, at + 12); // 1980-01-01; deterministic archive metadata.
    output.writeUInt32LE(crc, at + 14);
    output.writeUInt32LE(size, at + 18);
    output.writeUInt32LE(size, at + 22);
    output.writeUInt16LE(name.length, at + 26);
    name.copy(output, at + 30);
    output.set(entry.data, at + 30 + name.length);
    at += 30 + name.length + size;
  }
  const directoryAt = at;
  for (const record of records) {
    output.writeUInt32LE(0x02014b50, at);
    output.writeUInt16LE(20, at + 4);
    output.writeUInt16LE(20, at + 6);
    output.writeUInt16LE(0x0800, at + 8);
    output.writeUInt16LE(33, at + 14);
    output.writeUInt32LE(record.crc, at + 16);
    output.writeUInt32LE(record.size, at + 20);
    output.writeUInt32LE(record.size, at + 24);
    output.writeUInt16LE(record.name.length, at + 28);
    output.writeUInt32LE(record.offset, at + 42);
    record.name.copy(output, at + 46);
    at += 46 + record.name.length;
  }
  output.writeUInt32LE(0x06054b50, at);
  output.writeUInt16LE(entries.length, at + 8);
  output.writeUInt16LE(entries.length, at + 10);
  output.writeUInt32LE(at - directoryAt, at + 12);
  output.writeUInt32LE(directoryAt, at + 16);
  return output;
}
