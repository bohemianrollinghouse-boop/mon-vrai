/*
 * Ajoute « Le concept » et « Vous êtes pro ? » aux menus, sans toucher au reste.
 *
 * Écriture brute et idempotente : une entrée déjà présente (repérée par son id) n'est
 * pas dupliquée, et l'ordre des entrées existantes ne bouge pas. Rien n'est écrit sans
 * --apply.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=<env> scripts/add-menu-entries.ts [--apply]
 */
import { db } from "@/lib/firebase/admin";
import { now } from "@/lib/db/helpers";

const APPLY = process.argv.includes("--apply");

type Item = { id: string; label: string; target: { kind: string; slug?: string; key?: string } };

/** Insère l'entrée après `afterId`, ou en fin de liste. Sans effet si elle existe déjà. */
function insert(items: Item[], entry: Item, afterId?: string): { items: Item[]; changed: boolean } {
  if (items.some((i) => i.id === entry.id)) return { items, changed: false };
  const at = afterId ? items.findIndex((i) => i.id === afterId) : -1;
  const next = [...items];
  next.splice(at >= 0 ? at + 1 : items.length, 0, entry);
  return { items: next, changed: true };
}

async function main() {
  console.log(`\nBase : ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}${process.env.FIRESTORE_EMULATOR_HOST ? " (ÉMULATEUR)" : "  ⚠️  BASE RÉELLE"}`);
  console.log(APPLY ? "Mode : ÉCRITURE\n" : "Mode : répétition à blanc\n");

  const headerRef = db().collection("menus").doc("header");
  const header = await headerRef.get();
  let items = (header.data()?.items ?? []) as Item[];
  let changed = false;

  // « Le concept » précède « Notre histoire » : on explique le produit avant le récit.
  const concept = insert(items, { id: "concept", label: "Le concept", target: { kind: "page", slug: "le-concept" } }, "catalogue");
  items = concept.items;
  changed ||= concept.changed;
  console.log(concept.changed ? "~ en-tête : + Le concept (après Catalogue)" : "= en-tête : Le concept déjà présent");

  // « Vous êtes pro ? » ferme le menu, comme dans la maquette.
  const pro = insert(items, { id: "pro", label: "Vous êtes pro ?", target: { kind: "page", slug: "pro" } });
  items = pro.items;
  changed ||= pro.changed;
  console.log(pro.changed ? "~ en-tête : + Vous êtes pro ? (en dernier)" : "= en-tête : Vous êtes pro ? déjà présent");

  if (items.length > 8) {
    console.log(`\n⚠️  ${items.length} entrées d'en-tête : le schéma en accepte 8 au plus. Rien n'a été écrit.`);
    return;
  }
  if (APPLY && changed) await headerRef.set({ items, updatedAt: now() }, { merge: true });

  const footerRef = db().collection("menus").doc("footer");
  const footer = await footerRef.get();
  const columns = (footer.data()?.columns ?? []) as { id: string; heading: string; items: Item[] }[];
  let footerChanged = false;
  for (const c of columns) {
    if (c.id !== "boutique") continue;
    const r = insert(c.items, { id: "f-pro", label: "Vous êtes pro ?", target: { kind: "page", slug: "pro" } });
    c.items = r.items;
    footerChanged = r.changed;
    console.log(r.changed ? "~ pied « Boutique » : + Vous êtes pro ?" : "= pied « Boutique » : Vous êtes pro ? déjà présent");
  }
  if (APPLY && footerChanged) await footerRef.set({ columns, updatedAt: now() }, { merge: true });

  console.log(APPLY ? "\nTerminé." : "\nRien n'a été écrit. Relancer avec --apply.\n");
}

main();
