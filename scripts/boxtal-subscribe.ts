import { createSubscription, listSubscriptions, type BoxtalMode } from "@/lib/boxtal/client";

/*
 * Déclare (une fois) les webhooks Boxtal vers le site : étiquette créée, suivi modifié.
 *   Prod  : NODE_OPTIONS=--conditions=react-server tsx --env-file=.env.production.local scripts/boxtal-subscribe.ts https://monvrai.fr
 *   Test  : ... scripts/boxtal-subscribe.ts https://monvrai.fr test
 * Chaque environnement (live/test) a ses propres souscriptions et son propre secret.
 */
async function main() {
  const site = process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL;
  const mode: BoxtalMode = process.argv[3] === "test" ? "test" : "live";
  const secret = mode === "test" ? process.env.BOXTAL_WEBHOOK_SECRET_TEST : process.env.BOXTAL_WEBHOOK_SECRET;
  if (!site || !secret) throw new Error(`URL du site et ${mode === "test" ? "BOXTAL_WEBHOOK_SECRET_TEST" : "BOXTAL_WEBHOOK_SECRET"} requis`);
  const url = `${site.replace(/\/$/, "")}/api/boxtal/webhook`;
  const existing = await listSubscriptions(mode);
  for (const type of ["DOCUMENT_CREATED", "TRACKING_CHANGED"] as const) {
    const found = existing.find((s) => s.eventType === type && s.callbackUrl === url);
    if (found) {
      console.log(`[${mode}] ${type} : déjà souscrit (${found.id}, ${found.status})`);
      continue;
    }
    const created = await createSubscription(type, url, secret, mode);
    console.log(`[${mode}] ${type} : souscrit → ${created.id} (${created.status})`);
  }
}
main().then(() => process.exit(0));
