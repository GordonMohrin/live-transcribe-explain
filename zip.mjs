// Packt dist/ als ZIP für das Chrome Web Store Developer Dashboard (manifest.json liegt oben im ZIP).
// Eigener kleiner ZIP-Schreiber (Deflate aus node:zlib), damit es ohne Zusatzprogramm auf jedem System geht.
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";

const { version } = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
const out = `live-transcribe-explain-${version}.zip`;

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk("dist");

const local = [];
const central = [];
let offset = 0;
for (const p of files) {
  const name = Buffer.from(relative("dist", p).replaceAll("\\", "/"));
  const data = readFileSync(p);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4); // Version
  head.writeUInt16LE(0x0800, 6); // UTF-8-Namen
  head.writeUInt16LE(8, 8); // Deflate
  head.writeUInt32LE(0x00210000, 10); // Zeit/Datum fest (1980-01-01): gleiche Eingabe, gleiches ZIP
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  local.push(head, name, packed);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);
  cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(0x00210000, 12);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(packed.length, 20);
  cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(name.length, 28);
  cen.writeUInt32LE(offset, 42);
  central.push(cen, name);
  offset += head.length + name.length + packed.length;
}
const cenSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cenSize, 12);
end.writeUInt32LE(offset, 16);

rmSync(out, { force: true });
writeFileSync(out, Buffer.concat([...local, ...central, end]));
console.log(`Fertig: ${out} (${files.length} Dateien)`);
