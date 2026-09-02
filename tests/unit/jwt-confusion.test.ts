// Unit test — N2: alg-confusion JWT untuk verifySession (T-08).
// Murni — tanpa DB, tanpa server. Target: BUKTIKAN verifySession MENOLAK
// token dengan alg berbeda dari HS256 yang dipakai app (jose dipin
// `algorithms: [SESSION_ALG]`), termasuk klasik "alg none" dan RS256.
//
// Konstruksi token:
//   - alg none   → string manual base64url(header).base64url(payload). (jose
//                  SignJWT tidak mengizinkan alg none — token dibangun manual
//                  via Buffer, bukan di-skip.)
//   - HS384/512  → jose SignJWT dgn SECRET APP yang sama tapi alg berbeda —
//                  varian confusion terkuat (secret valid, cuma alg diganti).
//   - RS256      → keypair RSA self-generated (bukan secret app).
//   - kontrol +  → signSession helper app (harus DITERIMA — cegah test "lolos
//                  semua" karena verifySession rusak menolak segalanya).
// Tamper/expired → bonus (sudah pola gotcha #10: flip char TENGAH).
import { beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import { signSession, verifySession } from "@/lib/auth";

const APP_SECRET = "unit-test-secret";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

// Token manual TANPA signature — serangan "alg none" klasik (unsigned JWT).
function unsignedToken(payload: unknown): string {
  const header = { alg: "none", typ: "JWT" };
  return `${b64url(header)}.${b64url(payload)}.`;
}

beforeAll(() => {
  process.env.JWT_SECRET = APP_SECRET;
});

describe("N2 — verifySession menolak alg-confusion", () => {
  it("alg none (unsigned, payload role ADMIN) → ditolak (null)", async () => {
    const token = unsignedToken({ memberId: "attacker-1", role: "ADMIN" });
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("alg HS384 dgn secret app → ditolak (null)", async () => {
    const secret = new TextEncoder().encode(APP_SECRET);
    const token = await new SignJWT({ memberId: "attacker-1", role: "ADMIN" })
      .setProtectedHeader({ alg: "HS384" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("alg HS512 dgn secret app → ditolak (null)", async () => {
    const secret = new TextEncoder().encode(APP_SECRET);
    const token = await new SignJWT({ memberId: "attacker-1", role: "ADMIN" })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("alg RS256 (keypair RSA self-generated, bukan secret app) → ditolak (null)", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = await new SignJWT({ memberId: "attacker-1", role: "ADMIN" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("KONTROL POSITIF: token signSession app (HS256) → DITERIMA, payload benar", async () => {
    const token = await signSession({ memberId: "member-1", role: "ADMIN" });
    // exp ikut dikembalikan sejak sliding session (dipakai middleware untuk
    // keputusan refresh) — assert shape lengkap.
    await expect(verifySession(token)).resolves.toMatchObject({
      memberId: "member-1",
      role: "ADMIN",
      exp: expect.any(Number) as number,
    });
  });

  it("bonus: signature ditamper (flip char TENGAH) → ditolak (null)", async () => {
    const token = await signSession({ memberId: "member-1", role: "ANGGOTA" });
    const parts = token.split(".");
    const sig = parts[2].split("");
    const mid = Math.floor(sig.length / 2);
    sig[mid] = sig[mid] === "a" ? "b" : "a";
    const tampered = `${parts[0]}.${parts[1]}.${sig.join("")}`;
    await expect(verifySession(tampered)).resolves.toBeNull();
  });

  it("bonus: token expired → ditolak (null)", async () => {
    const secret = new TextEncoder().encode(APP_SECRET);
    const expired = await new SignJWT({ memberId: "member-1", role: "ANGGOTA" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("-1s")
      .sign(secret);
    await expect(verifySession(expired)).resolves.toBeNull();
  });
});
