export const PACKED_BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const PACKED_CELL_BY_CODE = ["#", " ", ".", "$", "@", "+", "*"] as const;

export class BitReader {
  private readonly bytes: Uint8Array;
  private bitOffset = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  read(bits: number): number {
    if (bits <= 0) {
      return 0;
    }
    if (this.bitOffset + bits > this.bytes.length * 8) {
      throw new Error("Packed level payload ended unexpectedly.");
    }

    let value = 0;
    for (let bitIndex = 0; bitIndex < bits; bitIndex += 1) {
      const absoluteBit = this.bitOffset + bitIndex;
      const byteIndex = absoluteBit >> 3;
      const bitInByte = 7 - (absoluteBit & 7);
      const byte = this.bytes[byteIndex];
      if (byte === undefined) {
        throw new Error("Packed level payload ended unexpectedly.");
      }
      const bit = (byte >> bitInByte) & 1;
      value = (value << 1) | bit;
    }

    this.bitOffset += bits;
    return value;
  }
}

export function decodeBase64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/g, "");
  const expectedLength = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(expectedLength);

  let outputIndex = 0;
  let bitBuffer = 0;
  let bitCount = 0;

  for (const char of clean) {
    const value = PACKED_BASE64_ALPHABET.indexOf(char);
    if (value < 0) {
      continue;
    }

    bitBuffer = (bitBuffer << 6) | value;
    bitCount += 6;

    while (bitCount >= 8) {
      bitCount -= 8;
      bytes[outputIndex] = (bitBuffer >> bitCount) & 0xff;
      outputIndex += 1;
    }
  }

  return outputIndex === bytes.length ? bytes : bytes.slice(0, outputIndex);
}

export function decodePackedRows(
  data: string,
  expectedLevelCount: number
): string[][] {
  const reader = new BitReader(decodeBase64ToBytes(data));
  const encodedLevelCount = reader.read(16);
  const levelCount = Math.min(encodedLevelCount, expectedLevelCount);
  const levels: string[][] = [];

  for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
    const width = reader.read(5);
    const height = reader.read(5);
    if (width <= 0 || height <= 0) {
      throw new Error("Packed level has invalid dimensions.");
    }

    const rows: string[] = [];
    for (let y = 0; y < height; y += 1) {
      let row = "";
      for (let x = 0; x < width; x += 1) {
        const cellCode = reader.read(3);
        const cell = PACKED_CELL_BY_CODE[cellCode];
        if (cell === undefined) {
          throw new Error("Packed level includes an unknown tile code.");
        }
        row += cell;
      }
      rows.push(row);
    }

    levels.push(rows);
  }

  return levels;
}
