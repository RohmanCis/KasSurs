import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  hashPin,
  verifyPin,
  signSession,
  verifySession,
} from "@/lib/auth";

describe("T-07 hashPin / verifyPin", () => {
  it("hash tidak sama dengan plaintext dan berformat bcrypt", async () => {
    const hash = await hashPin("1234");
    expect(hash).not.toBe("1234");
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/); // $2a$10$...
  });

  it("verify benar → true, salah → false", async () => {
    const hash = await hashPin("1234");
    await expect(verifyPin("1234", hash)).resolves.toBe(true);
    await expect(verifyPin("9999", hash)).resolves.toBe(false);
  });

  it("hash unik per call (salt acak per hash)", async () => {
    const a = await hashPin("1234");
    const b = await hashPin("1234");
    expect(a).not.toBe(b);
    // keduanya tetap valid untuk PIN yang sama
    await expect(verifyPin("1234", b)).resolves.toBe(true);
  });
});

describe("T-08 signSession / verifySession", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "unit-test-secret";
  });

  it("sign → verify roundtrip mengembalikan payload", async () => {
    const token = await signSession({ memberId: "member-1", role: "ADMIN" });
    // exp ikut dikembalikan sejak sliding session (keputusan refresh middleware).
    await expect(verifySession(token)).resolves.toMatchObject({
      memberId: "member-1",
      role: "ADMIN",
      exp: expect.any(Number) as number,
    });
  });

  it("token expired ditolak (null)", async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const expired = await new SignJWT({ memberId: "member-1", role: "ANGGOTA" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("-1s") // sudah lewat
      .sign(secret);
    await expect(verifySession(expired)).resolves.toBeNull();
  });

  it("token tampered (signature rusak) ditolak", async () => {
    const token = await signSession({ memberId: "member-1", role: "ANGGOTA" });
    // ponytail: flip char di TENGAH signature — flip char terakhir base64url
    // hanya mengubah bit yang dibuang saat decode (test bisa lolos palsu).
    const parts = token.split(".");
    const sig = parts[2].split("");
    const mid = Math.floor(sig.length / 2);
    sig[mid] = sig[mid] === "a" ? "b" : "a";
    const tampered = `${parts[0]}.${parts[1]}.${sig.join("")}`;
    await expect(verifySession(tampered)).resolves.toBeNull();
  });

  it("token dengan role tidak dikenal ditolak", async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const bad = await new SignJWT({ memberId: "member-1", role: "SUPERUSER" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(secret);
    await expect(verifySession(bad)).resolves.toBeNull();
  });

  it("gagal jika JWT_SECRET tidak diset", async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    await expect(
      signSession({ memberId: "member-1", role: "ANGGOTA" })
    ).rejects.toThrow("JWT_SECRET");
    process.env.JWT_SECRET = saved;
  });
});
