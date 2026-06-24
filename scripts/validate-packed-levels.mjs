#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const PACKED_FILE = path.resolve("data/boxoban/packed-levels.ts");
const PACKED_BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const PACKED_CELL_BY_CODE = ["#", " ", ".", "$", "@", "+", "*"];

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.bitOffset = 0;
  }

  read(bits) {
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

function decodeBase64ToBytes(base64) {
  const clean = base64.replace(/=+$/g, "");
  const expectedLength = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(expectedLength);

  let outputIndex = 0;
  let bitBuffer = 0;
  let bitCount = 0;

  for (const char of clean) {
    const value = PACKED_BASE64_ALPHABET.indexOf(char);
    if (value < 0) {
      throw new Error(`Packed level payload contains invalid base64: ${char}`);
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

function extractPackedModule() {
  const source = fs.readFileSync(PACKED_FILE, "utf8");
  const match = source.match(
    /export const packedLevelFiles: PackedLevelFile\[] = ([\s\S]*?) as const;\s+export const packedLevelCount = (\d+);/
  );

  if (!match) {
    throw new Error(`Could not extract packed levels from ${PACKED_FILE}`);
  }

  return {
    files: JSON.parse(match[1]),
    exportedLevelCount: Number(match[2]),
  };
}

function validateDecodedLevel(rows, label) {
  if (rows.length === 0 || rows.length > 31) {
    throw new Error(`${label} has invalid height: ${rows.length}`);
  }

  const width = rows[0]?.length ?? 0;
  if (width <= 0 || width > 31) {
    throw new Error(`${label} has invalid width: ${width}`);
  }

  let playerCount = 0;
  let boxCount = 0;
  let goalCount = 0;

  for (const row of rows) {
    if (row.length !== width) {
      throw new Error(`${label} has ragged rows.`);
    }

    for (const cell of row) {
      if (cell === "@" || cell === "+") {
        playerCount += 1;
      }
      if (cell === "$" || cell === "*") {
        boxCount += 1;
      }
      if (cell === "." || cell === "+" || cell === "*") {
        goalCount += 1;
      }
    }
  }

  if (playerCount !== 1) {
    throw new Error(`${label} has ${playerCount} player starts.`);
  }
  if (boxCount <= 0) {
    throw new Error(`${label} has no boxes.`);
  }
  if (goalCount <= 0) {
    throw new Error(`${label} has no goals.`);
  }
}

function decodeAndValidateEntry(entry) {
  const reader = new BitReader(decodeBase64ToBytes(entry.data));
  const encodedLevelCount = reader.read(16);
  if (encodedLevelCount !== entry.levelCount) {
    throw new Error(
      `${entry.name} declares ${entry.levelCount} levels, payload contains ${encodedLevelCount}.`
    );
  }

  for (let levelIndex = 0; levelIndex < encodedLevelCount; levelIndex += 1) {
    const width = reader.read(5);
    const height = reader.read(5);
    if (width <= 0 || height <= 0 || width > 31 || height > 31) {
      throw new Error(`${entry.name}#${levelIndex} has invalid dimensions.`);
    }

    const rows = [];
    for (let y = 0; y < height; y += 1) {
      let row = "";
      for (let x = 0; x < width; x += 1) {
        const cellCode = reader.read(3);
        const cell = PACKED_CELL_BY_CODE[cellCode];
        if (cell === undefined) {
          throw new Error(`${entry.name}#${levelIndex} has invalid cell code.`);
        }
        row += cell;
      }
      rows.push(row);
    }

    validateDecodedLevel(rows, `${entry.name}#${levelIndex}`);
  }

  return encodedLevelCount;
}

function main() {
  const { files, exportedLevelCount } = extractPackedModule();
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Packed level module contains no files.");
  }
  if (!Number.isInteger(exportedLevelCount) || exportedLevelCount <= 0) {
    throw new Error(`Invalid packedLevelCount: ${exportedLevelCount}`);
  }

  let decodedLevelCount = 0;
  for (const entry of files) {
    decodedLevelCount += decodeAndValidateEntry(entry);
  }

  if (decodedLevelCount !== exportedLevelCount) {
    throw new Error(
      `Decoded ${decodedLevelCount} levels, exported count is ${exportedLevelCount}.`
    );
  }

  console.log(
    `Validated ${decodedLevelCount} packed levels across ${files.length} files.`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
