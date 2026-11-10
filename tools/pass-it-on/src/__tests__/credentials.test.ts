import { describe, expect, it } from "vitest";
import { checkUploadForCredentials, describeCredentialFlags } from "../credentials.js";

describe("checkUploadForCredentials", () => {
  it("blocks the Pub Email & Social Accounts document however it's named", () => {
    for (const name of ["Pub Email & Social Accounts.docx", "pub email and social accounts (1).pdf", "PubEmail_Social_Accounts.xlsx".replace(/_/g, " ")]) {
      expect(checkUploadForCredentials(name, ["nothing here"]).status).toBe("blocked");
    }
  });

  it("blocks by filename even when the text is clean, and never needs the text", () => {
    expect(checkUploadForCredentials("Pub Email & Social Accounts.docx", [])).toMatchObject({ status: "blocked" });
  });

  it("needs confirmation when text mentions a password or pass:", () => {
    const check = checkUploadForCredentials("notes.docx", ["fine", "Instagram password: hunter2", "wifi Pass: abc", "PASSWORDS are in the vault"]);
    expect(check).toEqual({
      status: "needs_confirmation",
      flags: [
        { excerptIndex: 1, term: "password" },
        { excerptIndex: 2, term: "pass:" },
        { excerptIndex: 3, term: "passwords" },
      ],
    });
  });

  it("never puts the secret in a flag", () => {
    const check = checkUploadForCredentials("notes.docx", ["password: hunter2"]);
    expect(JSON.stringify(check)).not.toContain("hunter2");
  });

  it("doesn't flag ordinary words that contain pass", () => {
    expect(checkUploadForCredentials("playbook.docx", ["Guests get a pass at the door", "bypass: none", "passport and compass"])).toEqual({ status: "ok" });
  });

  it("describes the flags for the person confirming", () => {
    const check = checkUploadForCredentials("n.docx", ["password", "password and pass:"]);
    if (check.status !== "needs_confirmation") throw new Error("expected flags");
    expect(describeCredentialFlags(check.flags)).toBe('This file mentions "password", "pass:" in 2 places. Check it holds no logins before uploading.');
  });
});
