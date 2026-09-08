import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CreateShippingOrderRequest, PackageTracking, ShippingDocument, ShippingOrder } from "./client-types";

export type { BoxtalAddress, CreateShippingOrderRequest, PackageTracking, ShippingDocument, ShippingOrder } from "./client-types";

/*
 * Client Boxtal (API v3). Deux applications distinctes chez Boxtal, donc deux paires de
 * clés : « API v3 » pour expédier, « composant carte » pour le jeton de la carte des
 * points relais. L'API accepte l'authentification Basic (accessKey:secretKey) ; on
 * l'utilise directement, pas besoin de gérer des jetons côté serveur — sauf pour la
 * carte, qui exige un jeton à passer au navigateur.
 *
 * Sans clés, tout renvoie null / lève une erreur explicite : le site fonctionne, la
 * livraison se saisit à la main dans l'admin.
 */

const API = process.env.BOXTAL_API_URL ?? "https://api.boxtal.com";

export function boxtalConfigured(): boolean {
  return Boolean(process.env.BOXTAL_ACCESS_KEY && process.env.BOXTAL_SECRET_KEY);
}

export function boxtalMapConfigured(): boolean {
  return Boolean(process.env.BOXTAL_MAP_ACCESS_KEY && process.env.BOXTAL_MAP_SECRET_KEY);
}

function basic(access: string | undefined, secret: string | undefined): string {
  if (!access || !secret) throw new Error("Clés Boxtal manquantes");
  return `Basic ${Buffer.from(`${access}:${secret}`).toString("base64")}`;
}

type Envelope<T> = { status: number; content?: T; errors?: { code: string; parameters?: { field?: string; message?: string }[] }[] };

async function call<T>(method: string, path: string, body?: unknown, query?: Record<string, string | string[] | undefined>): Promise<T> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, item);
  }
  const res = await fetch(url, {
    method,
    headers: { Authorization: basic(process.env.BOXTAL_ACCESS_KEY, process.env.BOXTAL_SECRET_KEY), "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: Envelope<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as Envelope<T>) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.code}${e.parameters?.length ? " : " + e.parameters.map((p) => [p.field, p.message].filter(Boolean).join(" ")).join(", ") : ""}`).join(" · ");
    throw new Error(`Boxtal ${method} ${path} → ${res.status}${detail ? ` (${detail})` : ""}`);
  }
  return (json?.content ?? (json as unknown)) as T;
}

/* ---------- Carte des points relais ---------- */

let mapToken: { token: string; expiresAt: number } | null = null;

/** Jeton pour le composant carte, mis en cache jusqu'à peu avant son expiration. */
export async function getMapToken(): Promise<string | null> {
  if (!boxtalMapConfigured()) return null;
  if (mapToken && mapToken.expiresAt > Date.now() + 60_000) return mapToken.token;
  const res = await fetch(new URL("/iam/account-app/token", API), {
    method: "POST",
    headers: { Authorization: basic(process.env.BOXTAL_MAP_ACCESS_KEY, process.env.BOXTAL_MAP_SECRET_KEY) },
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn("[boxtal] jeton carte refusé :", res.status);
    return null;
  }
  const data = (await res.json()) as { accessToken: string; expiresIn: number };
  mapToken = { token: data.accessToken, expiresAt: Date.now() + (data.expiresIn ?? 3600) * 1000 };
  return mapToken.token;
}

/* ---------- Points relais (côté serveur, pour vérification) ---------- */

export type ParcelPoint = {
  code: string;
  name: string;
  compatibleNetworks?: string[];
  location: { street?: string; city?: string; postalCode?: string; countryIsoCode?: string; position?: { latitude: number; longitude: number } };
};

export async function searchParcelPoints(address: { countryIsoCode: string; postalCode: string; city: string; street?: string }, networks: string[]): Promise<{ parcelPoint: ParcelPoint; distanceFromSearchLocation: number }[]> {
  return call("GET", "/shipping/v3.2/parcel-point-by-network", undefined, { ...address, searchNetworks: networks });
}

/* ---------- Expéditions ---------- */

export function createShippingOrder(req: CreateShippingOrderRequest): Promise<ShippingOrder> {
  return call("POST", "/shipping/v3.1/shipping-order", req);
}
export function getShippingOrder(id: string): Promise<ShippingOrder> {
  return call("GET", `/shipping/v3.1/shipping-order/${encodeURIComponent(id)}`);
}
export function getShippingDocuments(id: string): Promise<ShippingDocument[]> {
  return call("GET", `/shipping/v3.1/shipping-order/${encodeURIComponent(id)}/shipping-document`);
}
export function getShippingTracking(id: string): Promise<PackageTracking[]> {
  return call("GET", `/shipping/v3.1/shipping-order/${encodeURIComponent(id)}/tracking`);
}
export function cancelShippingOrder(id: string): Promise<unknown> {
  return call("DELETE", `/shipping/v3.1/shipping-order/${encodeURIComponent(id)}`);
}

/* ---------- Webhooks ---------- */

export type Subscription = { id: string; eventType: "DOCUMENT_CREATED" | "TRACKING_CHANGED"; callbackUrl: string; status: string };

export function listSubscriptions(): Promise<Subscription[]> {
  return call("GET", "/shipping/v3.1/subscription");
}
export function createSubscription(eventType: Subscription["eventType"], callbackUrl: string, webhookSecret: string): Promise<Subscription> {
  return call("POST", "/shipping/v3.1/subscription", { eventType, callbackUrl, webhookSecret });
}

/** Signature `x-bxt-signature` = HMAC-SHA256 (hex) du corps brut avec le secret de la souscription. */
export function verifyBoxtalSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.BOXTAL_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const candidates = [signature.trim(), signature.trim().replace(/^sha256=/i, "")];
  return candidates.some((c) => {
    const b = Buffer.from(c.toLowerCase());
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
