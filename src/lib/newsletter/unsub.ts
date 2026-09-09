import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Lien de désinscription signé : le jeton contient l'adresse et une signature HMAC, pour
 * qu'on puisse désabonner sans authentifier le visiteur, sans qu'il puisse désabonner
 * quelqu'un d'autre. Clé = secret serveur stable (celui des Server Actions).
 */

function key(): string {
  return process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || process.env.RESEND_API_KEY || "mon-vrai-newsletter";
}

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64url = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const sign = (email: string) => createHmac("sha256", key()).update(email.toLowerCase()).digest("hex");

export function unsubscribeToken(email: string): string {
  return `${b64url(email.toLowerCase())}.${sign(email)}`;
}

export function unsubscribeUrl(siteUrl: string, email: string): string {
  return `${siteUrl.replace(/\/$/, "")}/api/newsletter/unsubscribe?t=${encodeURIComponent(unsubscribeToken(email))}`;
}

/** Renvoie l'e-mail si le jeton est valide, sinon null. */
export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  let email: string;
  try {
    email = unb64url(token.slice(0, dot));
  } catch {
    return null;
  }
  const provided = token.slice(dot + 1);
  const expected = sign(email);
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected)) ? email : null;
}
