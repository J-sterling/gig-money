// Each visitor gets their own demo workspace, held in a signed cookie, so
// judges never see each other's data.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const COOKIE = "gm_ws";
const ID = /^ws_[a-f0-9]{16}$/;

export const newWorkspaceId = () => "ws_" + randomBytes(8).toString("hex");

export function sign(id, secret) {
  return `${id}.${createHmac("sha256", secret).update(id).digest("base64url")}`;
}

export function verify(value, secret) {
  const [id, mac] = String(value ?? "").split(".");
  if (!ID.test(id ?? "") || !mac) return null;
  const want = Buffer.from(sign(id, secret).split(".")[1]);
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

export function readCookie(header, name = COOKIE) {
  for (const part of String(header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export const isWorkspaceId = (id) => ID.test(String(id ?? ""));
