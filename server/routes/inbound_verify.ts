import { Router } from "express";
import crypto from "node:crypto";
import { requireProject } from "../auth/projectAccess";

export const inboundVerify = Router();

inboundVerify.post("/verify", requireProject("admin"), async (req, res) => {
  try {
    const provider = String(req.body?.provider || "").toLowerCase();
    if (!provider) return res.status(400).json({ ok:false, error:"provider required" });

    if (provider === "mailgun") {
      const key = process.env.MAILGUN_SIGNING_KEY || "";
      const { timestamp, token, signatureHex } = req.body?.mailgun || {};
      if (!key || !timestamp || !token || !signatureHex)
        return res.status(400).json({ ok:false, error:"timestamp, token, signatureHex required" });
      const mac = crypto.createHmac("sha256", key);
      mac.update(String(timestamp) + String(token));
      const expected = mac.digest("hex");
      const sigBuf = Buffer.from(signatureHex);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length)
        return res.json({ ok:true, provider, valid: false, expected });
      const valid = crypto.timingSafeEqual(sigBuf, expBuf);
      return res.json({ ok:true, provider, valid, expected });
    }

    if (provider === "postmark") {
      const secret = process.env.POSTMARK_SIGNING_SECRET || "";
      const { signatureHeaderBase64, rawBody } = req.body?.postmark || {};
      if (!secret || !signatureHeaderBase64 || typeof rawBody !== "string")
        return res.status(400).json({ ok:false, error:"signatureHeaderBase64 & rawBody required" });
      const mac = crypto.createHmac("sha256", secret);
      mac.update(Buffer.from(rawBody, "utf8"));
      const expected = mac.digest("base64");
      const sigBuf = Buffer.from(signatureHeaderBase64);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length)
        return res.json({ ok:true, provider, valid: false, expected });
      const valid = crypto.timingSafeEqual(sigBuf, expBuf);
      return res.json({ ok:true, provider, valid, expected });
    }

    return res.status(400).json({ ok:false, error:"unsupported provider" });
  } catch (e:any) {
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});
