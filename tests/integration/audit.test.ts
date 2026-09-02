// Integration test — recordAuditLog (T-15) di DB dev.
// Pattern sama dgn tests/integration/login.test.ts: env .env.local dimuat
// manual sebelum import; beforeAll + dynamic import (tsconfig target es5,
// no top-level await); cleanup deleteMany di afterAll.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const value = m[2].replace(/^["']|["']$/g, ""); // strip kutip
  if (!(m[1] in process.env)) process.env[m[1]] = value;
}

let recordAuditLog: typeof import("@/lib/audit")["recordAuditLog"];
let prisma: typeof import("@/lib/prisma")["prisma"];
let actorId: string;

// Salt `h` per-file: Date.now() identik antar file tidak masalah — noHp
// selalu memuat salt → beda dari file test lain.
const noHp = `08${String(Date.now()).slice(-10)}h`;
const dummyNoHp = `${noHp}1`;

beforeAll(async () => {
  // Import dinamis setelah env termuat (sama pola login.test.ts).
  ({ recordAuditLog } = await import("@/lib/audit"));
  ({ prisma } = await import("@/lib/prisma"));

  // Actor (FK audit_logs.actor_id → members.id, onDelete: Restrict).
  actorId = await prisma.member
    .create({
      data: { nama: "Test Actor", noHp, pinHash: "integration-test-hash" },
    })
    .then((m) => m.id);
});

afterAll(async () => {
  // Cleanup per test-run: hapus row audit + actor test + dummy member tx.
  await prisma.auditLog.deleteMany({ where: { actorId } });
  await prisma.member.deleteMany({ where: { id: actorId } });
  await prisma.member.deleteMany({ where: { noHp: dummyNoHp } });
});

describe("recordAuditLog (T-15) — DB", () => {
  it("menulis row audit_logs dengan field benar; dataLama null → SQL NULL", async () => {
    await recordAuditLog(actorId, "CREATE", "Payment", "pay-1", null, { jumlah: 30000 });

    const row = await prisma.auditLog.findFirst({ where: { actorId, entityId: "pay-1" } });
    expect(row).not.toBeNull();
    expect(row?.actorId).toBe(actorId);
    expect(row?.aksi).toBe("CREATE");
    expect(row?.entityType).toBe("Payment");
    expect(row?.entityId).toBe("pay-1");
    expect(row?.dataLama).toBeNull(); // DbNull → SQL NULL → null saat readback
    expect(row?.dataBaru).toEqual({ jumlah: 30000 });
    expect(row?.timestamp).toBeInstanceOf(Date);
  });

  it("dataBaru null → SQL NULL (DbNull readback null)", async () => {
    await recordAuditLog(actorId, "DELETE", "Expense", "exp-1", { jumlah: 5000 }, null);

    const row = await prisma.auditLog.findFirst({ where: { actorId, entityId: "exp-1" } });
    expect(row?.dataLama).toEqual({ jumlah: 5000 });
    expect(row?.dataBaru).toBeNull();
  });

  it("transaksional: create dummy + audit di tx yang sama → audit tersimpan", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.member.create({
        data: { nama: "Dummy Member", noHp: dummyNoHp, pinHash: "integration-test-hash" },
      });
      await recordAuditLog(actorId, "CREATE", "Payment", "pay-tx", null, { jumlah: 30000 }, tx);
    });

    const row = await prisma.auditLog.findFirst({ where: { actorId, entityId: "pay-tx" } });
    expect(row).not.toBeNull();
    expect(row?.dataBaru).toEqual({ jumlah: 30000 });
    // dummy member ikut tersimpan → membuktikan tx yang sama benar dipakai
    await expect(
      prisma.member.findFirst({ where: { noHp: dummyNoHp } }),
    ).resolves.not.toBeNull();
  });

  it("transaksional rollback: tx throw → audit row TIDAK tersimpan", async () => {
    const countBefore = await prisma.auditLog.count({ where: { actorId } });

    await expect(
      prisma.$transaction(async (tx) => {
        await recordAuditLog(
          actorId,
          "UPDATE",
          "Payment",
          "pay-tx-rollback",
          { jumlah: 1 },
          { jumlah: 2 },
          tx,
        );
        throw new Error("simulasi gagal — rollback");
      }),
    ).rejects.toThrow("simulasi gagal");

    const countAfter = await prisma.auditLog.count({ where: { actorId } });
    expect(countAfter).toBe(countBefore);
    const row = await prisma.auditLog.findFirst({
      where: { actorId, entityId: "pay-tx-rollback" },
    });
    expect(row).toBeNull();
  });
});
