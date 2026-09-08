import { createSubscription, listSubscriptions } from "@/lib/boxtal/client";

/*
 * Déclare (une fois) les webhooks Boxtal vers le site : étiquette créée, suivi modifié.
 *   NODE_OPTIONS=--conditions=react-server tsx --env-file=.env.production.local scripts/boxtal-subscribe.ts https://monvrai.fr
 */
async function main() {
  const site = process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.BOXTAL_WEBHOOK_SECRET;
  if (!site || !secret) throw new Error("URL du site et BOXTAL_WEBHOOK_SECRET requis");
  const url = `${site.replace(/\/$/, "")}/api/boxtal/webhook`;
  const existing = await listSubscriptions();
  for (const type of ["DOCUMENT_CREATED", "TRACKING_CHANGED"] as const) {
    const found = existing.find((s) => s.eventType === type && s.callbackUrl === url);
    if (found) {
      console.log(`${type} : déjà souscrit (${found.id}, ${found.status})`);
      continue;
    }
    const created = await createSubscription(type, url, secret);
    console.log(`${type} : souscrit → ${created.id} (${created.status})`);
  }
}
main().then(() => process.exit(0));
