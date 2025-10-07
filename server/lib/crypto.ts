import crypto from "node:crypto";

const HEX = process.env.TEAIM_SECRET_KEY || "";
const KEY = Buffer.from(HEX, "hex");

export function encryptSecret(plain: string){
  if (!KEY || KEY.length!==32) throw new Error("TEAIM_SECRET_KEY invalid");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(blob: string){
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0,12);
  const tag= buf.subarray(12,28);
  const enc= buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
