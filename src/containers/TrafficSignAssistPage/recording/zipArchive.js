/**
 * Packs the frames of a recording into a ZIP file.
 *
 * A recorded drive is only useful once it is off the phone, and a folder of JPEGs next to a
 * manifest is exactly the shape a training set wants. This builds that file in the browser with no
 * library: the entries are stored, not compressed, because JPEGs do not shrink any further and
 * leaving out the compressor leaves out most of the code.
 *
 * The format is the original PKZIP one, which every operating system opens.
 */

/** Signatures, from the ZIP specification. */
const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

/** Store, i.e. no compression. */
const METHOD_STORED = 0;

/** The version of the specification these entries need. */
const VERSION = 20;

const buildCrcTable = () => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
};

const CRC_TABLE = buildCrcTable();

/**
 * The CRC-32 checksum of some bytes, which every entry of a ZIP has to carry.
 *
 * @param {Uint8Array} bytes - The bytes to check
 * @returns {number} the checksum, as an unsigned 32 bit number
 */
export const crc32 = bytes => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/**
 * Packs a date into the two 16 bit fields MS-DOS used, which is what ZIP still stores.
 *
 * @param {Date} date - The date to pack
 * @returns {{time: number, date: number}} the packed fields
 */
export const toDosDateTime = date => ({
  // Seconds are stored in units of two, which is why they are halved here.
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  // Years count from 1980.
  date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

const encodeName = name => new TextEncoder().encode(name);

/**
 * Builds a ZIP file.
 *
 * @param {Array<Object>} entries - `{ name, bytes }` per file, `bytes` being a Uint8Array
 * @param {Date} [modifiedAt] - The timestamp to put on every entry
 * @returns {Uint8Array} the bytes of the ZIP file
 */
export const buildZip = (entries, modifiedAt = new Date()) => {
  const { time, date } = toDosDateTime(modifiedAt);

  const prepared = entries.map(entry => {
    const name = encodeName(entry.name);
    return { name, bytes: entry.bytes, crc: crc32(entry.bytes) };
  });

  const localSize = prepared.reduce((sum, e) => sum + 30 + e.name.length + e.bytes.length, 0);
  const centralSize = prepared.reduce((sum, e) => sum + 46 + e.name.length, 0);

  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let offset = 0;

  // Every entry, each preceded by its own header.
  const offsets = [];
  prepared.forEach(entry => {
    offsets.push(offset);

    view.setUint32(offset, LOCAL_FILE_HEADER, true);
    view.setUint16(offset + 4, VERSION, true);
    view.setUint16(offset + 6, 0, true); // flags
    view.setUint16(offset + 8, METHOD_STORED, true);
    view.setUint16(offset + 10, time, true);
    view.setUint16(offset + 12, date, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.bytes.length, true); // compressed size
    view.setUint32(offset + 22, entry.bytes.length, true); // uncompressed size
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true); // extra field length
    offset += 30;

    output.set(entry.name, offset);
    offset += entry.name.length;
    output.set(entry.bytes, offset);
    offset += entry.bytes.length;
  });

  // The directory at the end, which is what an unpacker reads first.
  const centralStart = offset;
  prepared.forEach((entry, index) => {
    view.setUint32(offset, CENTRAL_DIRECTORY_HEADER, true);
    view.setUint16(offset + 4, VERSION, true); // version made by
    view.setUint16(offset + 6, VERSION, true); // version needed
    view.setUint16(offset + 8, 0, true); // flags
    view.setUint16(offset + 10, METHOD_STORED, true);
    view.setUint16(offset + 12, time, true);
    view.setUint16(offset + 14, date, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.bytes.length, true);
    view.setUint32(offset + 24, entry.bytes.length, true);
    view.setUint16(offset + 28, entry.name.length, true);
    view.setUint16(offset + 30, 0, true); // extra field length
    view.setUint16(offset + 32, 0, true); // comment length
    view.setUint16(offset + 34, 0, true); // disk number
    view.setUint16(offset + 36, 0, true); // internal attributes
    view.setUint32(offset + 38, 0, true); // external attributes
    view.setUint32(offset + 42, offsets[index], true);
    offset += 46;

    output.set(entry.name, offset);
    offset += entry.name.length;
  });

  view.setUint32(offset, END_OF_CENTRAL_DIRECTORY, true);
  view.setUint16(offset + 4, 0, true); // this disk
  view.setUint16(offset + 6, 0, true); // disk with the directory
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true); // comment length

  return output;
};
