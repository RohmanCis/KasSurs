// Unit test — normalizeJson (T-15): logika serialisasi murni, tanpa DB.
// Import dinamis di beforeAll (audit.ts import prisma saat module load —
// butuh DATABASE_URL; tsconfig target es5 → no top-level await).
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Muat .env.local manual — hanya agar module audit.ts bisa di-import
// (prisma singleton init butuh DATABASE_URL); tidak ada query DB di sini.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const value = m[2].replace(/^["']|["']$/g, ""); // strip kutip
  if (!(m[1] in process.env)) process.env[m[1]] = value;
}

let normalizeJson: typeof import("@/lib/audit")["normalizeJson"];

beforeAll(async () => {
  ({ normalizeJson } = await import("@/lib/audit"));
});

describe("normalizeJson (T-15) — serialisasi murni", () => {
  it("Date (nested sekalipun) → ISO string", () => {
    const tgl = new Date("2026-08-31T10:00:00Z");
    expect(
      normalizeJson({ jumlah: 30000, tanggalBayar: tgl, nested: { at: tgl } }),
    ).toEqual({
      jumlah: 30000,
      tanggalBayar: "2026-08-31T10:00:00.000Z",
      nested: { at: "2026-08-31T10:00:00.000Z" },
    });
  });

  it("nested null → JSON null dipertahankan (bukan stripped)", () => {
    expect(normalizeJson({ x: null, y: 1 })).toEqual({ x: null, y: 1 });
  });

  it("nested undefined → key di-strip ({} untuk payload kosong)", () => {
    expect(normalizeJson({ x: undefined, y: 1 })).toEqual({ y: 1 });
    expect(normalizeJson({ x: undefined })).toEqual({});
  });

  it("circular reference → throw loud (kontrak: snapshot harus serializable)", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(() => normalizeJson(obj)).toThrow();
  });
});
