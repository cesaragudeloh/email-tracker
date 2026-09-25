import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { TRANSPARENT_PNG_BASE64 } from './pixel.js';

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
it('decodes a complete PNG with valid signature, chunks and CRCs', () => {
  const bytes = Buffer.from(TRANSPARENT_PNG_BASE64, 'base64');
  expect(bytes.toString('base64')).toBe(TRANSPARENT_PNG_BASE64);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const types: string[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    types.push(bytes.toString('ascii', offset + 4, offset + 8));
    expect(crc32(bytes.subarray(offset + 4, offset + 8 + length))).toBe(
      bytes.readUInt32BE(offset + 8 + length),
    );
    offset += 12 + length;
  }
  expect(offset).toBe(bytes.length);
  expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
});
it('represents exactly a transparent 1x1 RGBA image', () => {
  const bytes = Buffer.from(TRANSPARENT_PNG_BASE64, 'base64');
  expect(bytes.readUInt32BE(16)).toBe(1);
  expect(bytes.readUInt32BE(20)).toBe(1);
  expect([...bytes.subarray(24, 29)]).toEqual([8, 6, 0, 0, 0]);
  const compressedLength = bytes.readUInt32BE(33);
  // One scanline: filter None, R=0, G=0, B=0, alpha=0.
  expect([...inflateSync(bytes.subarray(41, 41 + compressedLength))]).toEqual([
    0, 0, 0, 0, 0,
  ]);
});
