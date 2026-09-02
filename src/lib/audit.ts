// =====================================================================
// KasSurs — Helper Audit Log (T-15)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 2 schema AuditLog,
// Bagian 3 AuditLogEntry) & .agents/1-PRD.md FR-21.
// - Append-only: hanya create di tabel audit_logs, tidak ada update/delete
//   (FR-21) — helper ini hanya menyediakan recordAuditLog.
// - Dipanggil reusable di tiap endpoint create/update/delete Payment
//   (T-20/21/22) dan Expense (T-24/25/26): dataLama = snapshot sebelum,
//   dataBaru = snapshot sesudah, actorId = admin yang login.
// - Serialisasi: dataLama/dataBaru adalah kolom Json Prisma. Snapshot
//   record Prisma mengandung Date — diserialisasi ke ISO string via
//   JSON.parse(JSON.stringify(...)) sebelum ditulis (rekursif, tanggal
//   selalu ISO 8601 sesuai konvensi proyek).
// - Transaksional: recordAuditLog menerima txClient opsional agar bisa
//   enlist di prisma.$transaction yang sama (FR-21 atomicity — record +
//   audit sukses/gagal bersama).
// =====================================================================

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { AuditAction, AuditEntityType } from "@/lib/types";

// Normalisasi ke bentuk aman untuk kolom Json Prisma (json-safe):
// - Date → ISO string (rekursif via JSON.stringify), tanggal selalu ISO 8601.
// - nested null → JSON null dipertahankan (bukan stripped); hanya top-level
//   null yang ditangani caller sebagai Prisma.DbNull (SQL NULL).
// - nested undefined → key di-strip oleh JSON.stringify ({}).
// - Non-serializable (BigInt/circular) → throw loud by design: snapshot
//   seharusnya selalu record Prisma biasa; throw lebih baik daripada
//   audit diam-diam hilang/rusak.
export function normalizeJson(data: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
}

export async function recordAuditLog(
  actorId: string,
  aksi: AuditAction,
  entityType: AuditEntityType,
  entityId: string,
  dataLama: Record<string, unknown> | null,
  dataBaru: Record<string, unknown> | null,
  // Wajib diisi saat dipanggil dalam prisma.$transaction — audit enlist
  // di tx yang sama, rollback bersama record terkait (FR-21 atomicity).
  txClient?: Prisma.TransactionClient,
): Promise<void> {
  const db = txClient ?? prisma;
  await db.auditLog.create({
    data: {
      actorId,
      aksi,
      entityType,
      entityId,
      dataLama: dataLama === null ? Prisma.DbNull : normalizeJson(dataLama),
      dataBaru: dataBaru === null ? Prisma.DbNull : normalizeJson(dataBaru),
    },
  });
}
