import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./crypto";

describe("lib/crypto", () => {
  it("round-trips a secret", () => {
    const secret = "ploi-token-123!@#";
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptSecret("not-a-payload")).toThrow(
      "Invalid encrypted payload.",
    );
  });

  it("rejects a tampered ciphertext", () => {
    const encrypted = encryptSecret("authentic");
    const [iv, tag] = encrypted.split(":");
    const tampered = `${iv}:${tag}:${Buffer.from("tampered").toString("base64")}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const encrypted = encryptSecret("authentic");
    const [iv, , data] = encrypted.split(":");
    const badTag = Buffer.alloc(16, 1).toString("base64");
    expect(() => decryptSecret(`${iv}:${badTag}:${data}`)).toThrow();
  });
});
