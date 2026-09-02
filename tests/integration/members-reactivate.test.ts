// Integration test — reaktivasi anggota nonaktif via PATCH /api/members/[id]
// (QA #3, 2026-09-01): statusAktif:true diterima (audit UPDATE tercatat);
// statusAktif:false DITOLAK 400 (penonaktifan harus lewat endpoint deactivate
// dengan last-admin guard — tidak bisa dilewati via PATCH). Pattern sama
// members-patch.test.ts (env manual, mock cookies, salt per-file `t`).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const value = m[2].replace(/^["']|["']$/g, "");
  if (!(m[1] in process.env)) process.env[m[1]] = value;
}
process.env.JWT_SECRET = "integration-test-secret";

const cookieStore = vi.hoisted(() => new Map<string, { value: string; options: unknown }>());
vi.mock("next/headers", () => ({
  cookies: () => ({
    set: (name: string, value: string, options: unknown) => {
      cookieStore.set(name, { value, options });
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
    get: (name: string) => cookieStore.get(name) ?? undefined,
  }),
}));

type PatchHandler = (request: Request, context: { params: { id: string } }) => Promise<Response>;
let PATCH: PatchHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];

const uniq = String(Date.now()) + "t";
const actorNoHp = `08${uniq.slice(-9)}1`;
let actorId: string;
const createdMemberIds: string[] = [];

function patchMember(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

beforeAll(async () => {
  ({ PATCH } = await import("@/app/api/members/[id]/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  actorId = await prisma.member
    .create({
      data: { nama: "Test Admin", noHp: actorNoHp, pinHash: "integration-test-hash", role: "ADMIN" },
    })
    .then((m) => m.id);

  cookieStore.set("session", {
    value: await signSession({ memberId: actorId, role: "ADMIN" }),
    options: {},
  });
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { memberId: { in: createdMemberIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId }, { entityId: { in: createdMemberIds } }] },
  });
  await prisma.member.deleteMany({ where: { id: { in: [...createdMemberIds, actorId] } } });
});

describe("PATCH /api/members/[id] — reaktivasi (QA #3)", () => {
  it("statusAktif:true pada member nonaktif → 200, DB aktif lagi, audit UPDATE tercatat", async () => {
    const m = await prisma.member.create({
      data: { nama: "Cici Nonaktif", noHp: `08${uniq}2`, pinHash: "x", statusAktif: false },
    });
    createdMemberIds.push(m.id);

    const res = await patchMember(m.id, { statusAktif: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: m.id, statusAktif: true, role: "ANGGOTA" });

    const db = await prisma.member.findUnique({ where: { id: m.id } });
    expect(db?.statusAktif).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { actorId, entityType: "Member", entityId: m.id, aksi: "UPDATE" },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.dataLama).toMatchObject({ statusAktif: false });
    expect(audit?.dataBaru).toMatchObject({ statusAktif: true });
  });

  it("statusAktif:false → 400 (penonaktifan wajib lewat endpoint deactivate + last-admin guard)", async () => {
    const m = await prisma.member.create({
      data: { nama: "Dedi Aktif", noHp: `08${uniq}3`, pinHash: "x" },
    });
    createdMemberIds.push(m.id);

    const res = await patchMember(m.id, { statusAktif: false });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_INPUT");

    const db = await prisma.member.findUnique({ where: { id: m.id } });
    expect(db?.statusAktif).toBe(true);
  });

  it("statusAktif:true digabung field lain (nama) → keduanya ter-update", async () => {
    const m = await prisma.member.create({
      data: { nama: "Eno Nonaktif", noHp: `08${uniq}4`, pinHash: "x", statusAktif: false },
    });
    createdMemberIds.push(m.id);

    const res = await patchMember(m.id, { statusAktif: true, nama: "Eno Kembali" });
    expect(res.status).toBe(200);
    expect(await prisma.member.findUnique({ where: { id: m.id } })).toMatchObject({
      nama: "Eno Kembali",
      statusAktif: true,
    });
  });
});
