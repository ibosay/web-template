// Browsers have these; the jsdom the tests run in does not, so they come from Node here.
const { TextDecoder, TextEncoder } = require('util');

global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

import { buildZip, crc32, toDosDateTime } from './zipArchive';

const bytesOf = text => new TextEncoder().encode(text);
const readUint32 = (zip, offset) =>
  new DataView(zip.buffer, zip.byteOffset, zip.byteLength).getUint32(offset, true);

describe('crc32', () => {
  it('matches the check value of the standard', () => {
    // The CRC-32 of "123456789" is the value every implementation is checked against.
    expect(crc32(bytesOf('123456789'))).toEqual(0xcbf43926);
  });

  it('is zero for no bytes', () => {
    expect(crc32(new Uint8Array(0))).toEqual(0);
  });

  it('differs for different content', () => {
    expect(crc32(bytesOf('a'))).not.toEqual(crc32(bytesOf('b')));
  });
});

describe('toDosDateTime', () => {
  it('packs a date the way the format expects', () => {
    // 2026-09-21 14:30:00
    const { time, date } = toDosDateTime(new Date(2026, 8, 21, 14, 30, 0));

    expect(date).toEqual(((2026 - 1980) << 9) | (9 << 5) | 21);
    expect(time).toEqual((14 << 11) | (30 << 5) | 0);
  });
});

describe('buildZip', () => {
  const entries = [
    { name: 'manifest.json', bytes: bytesOf('{"frames":1}') },
    { name: 'frames/0001.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) },
  ];

  it('starts with the signature of a local file header', () => {
    expect(readUint32(buildZip(entries), 0)).toEqual(0x04034b50);
  });

  it('ends with the end of central directory record', () => {
    const zip = buildZip(entries);

    expect(readUint32(zip, zip.length - 22)).toEqual(0x06054b50);
  });

  it('counts every entry in the directory', () => {
    const zip = buildZip(entries);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

    expect(view.getUint16(zip.length - 22 + 8, true)).toEqual(2);
    expect(view.getUint16(zip.length - 22 + 10, true)).toEqual(2);
  });

  it('stores the content unchanged, so that it can be read back', () => {
    const zip = buildZip([entries[0]]);
    const nameLength = 'manifest.json'.length;
    const content = zip.slice(30 + nameLength, 30 + nameLength + entries[0].bytes.length);

    expect(new TextDecoder().decode(content)).toEqual('{"frames":1}');
  });

  it('writes the checksum of the content into the header', () => {
    const zip = buildZip([entries[0]]);

    expect(readUint32(zip, 14)).toEqual(crc32(entries[0].bytes));
  });

  it('builds an archive with no entries at all', () => {
    const zip = buildZip([]);

    expect(zip).toHaveLength(22);
    expect(readUint32(zip, 0)).toEqual(0x06054b50);
  });
});
