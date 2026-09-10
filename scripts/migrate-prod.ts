/*
 * Migration des données vers le modèle « tout en pages de blocs ».
 *
 * Deux phases, à passer dans cet ordre autour du déploiement :
 *
 *   1. les pages, AVANT de déployer. Elles sont invisibles du site en ligne (aucun
 *      menu n'y mène encore), donc sans effet sur les visiteurs.
 *   2. les menus, APRÈS avoir déployé, avec --menus. Les repointer plus tôt enverrait
 *      le site en ligne vers /pages/<slug>, que l'ancien code rend vide.
 *
 * Le nouveau code sait lire les anciennes cibles de menu (voir MenuTarget), donc la
 * phase 2 est un nettoyage, pas une urgence. Les politiques sont lues EN BRUT, sans
 * zod : leur collection n'existe plus dans le nouveau code.
 *
 * Sans risque par défaut : il n'écrit rien tant qu'on ne passe pas --apply.
 *
 *   # répétition à blanc, sur la base visée
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/migrate-prod.ts
 *   # puis, seulement quand le compte rendu est conforme
 *   … scripts/migrate-prod.ts --apply
 *
 * Idempotent : une page déjà composée en blocs n'est pas réécrite (sauf --force),
 * pour ne pas effacer une retouche faite depuis l'admin.
 */
import { htmlToDocument } from "@/lib/blocks/from-html";
import { catalogueToBlocks, contactToBlocks, homeToBlocks, storyToBlocks } from "@/lib/blocks/from-content";
import { getCatalogueContent, getContactContent, getHomeContent, getStoryContent } from "@/lib/db/content";
import { getPage, savePageBlocks, setHomePage, upsertPage } from "@/lib/db/pages";
import { db } from "@/lib/firebase/admin";
import type { BlockDocument } from "@/lib/domain/types";

const APPLY = process.argv.includes("--apply");
/* Les menus ne bougent qu'à la demande : les repointer avant le déploiement casserait
   la navigation du site en ligne, qui résout une cible page vers /pages/<slug>. */
const MENUS = process.argv.includes("--menus");
const FORCE = process.argv.includes("--force");

const plan: string[] = [];
const note = (s: string) => plan.push(s);

/** Crée ou remplace une page composée. Ne touche pas à une page déjà retouchée. */
async function ensurePage(slug: string, title: string, blocks: BlockDocument, html = ""): Promise<void> {
  const existing = await getPage(slug);
  if (existing?.blocks && !FORCE) {
    note(`= ${slug.padEnd(22)} déjà en blocs, laissée telle quelle`);
    return;
  }
  note(`${existing ? "~" : "+"} ${slug.padEnd(22)} « ${title} » · ${blocks.content.length} blocs`);
  if (!APPLY) return;
  await upsertPage({ slug, title, status: "published", body: { json: null, html } });
  await savePageBlocks(slug, blocks);
}

type RawTarget = { kind?: string; key?: string; handle?: string; slug?: string; href?: string; newTab?: boolean };
type RawItem = { id?: string; label?: string; target?: RawTarget };

/* Une cible d'ancien modèle devient une cible de page. */
function retarget(t: RawTarget | undefined, pageSlugs: Set<string>): RawTarget | undefined {
  if (!t) return t;
  if (t.kind === "policy" && t.handle && pageSlugs.has(t.handle)) return { kind: "page", slug: t.handle };
  if (t.kind === "system" && t.key === "story" && pageSlugs.has("notre-histoire")) return { kind: "page", slug: "notre-histoire" };
  if (t.kind === "system" && t.key === "catalogue" && pageSlugs.has("catalogue")) return { kind: "page", slug: "catalogue" };
  if (t.kind === "system" && t.key === "contact" && pageSlugs.has("contact")) return { kind: "page", slug: "contact" };
  if (t.kind === "system" && t.key === "policies" && pageSlugs.has("privacy-policy")) return { kind: "page", slug: "privacy-policy" };
  return t;
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "(défaut)";
  const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  console.log(`\nBase visée : ${projectId}${emulated ? " (ÉMULATEUR)" : "  ⚠️  BASE RÉELLE"}`);
  console.log(APPLY ? "Mode : ÉCRITURE\n" : "Mode : répétition à blanc, aucune écriture\n");

  /* 1. Politiques → pages, découpées aux titres. Lecture brute : la collection et son
        schéma n'existent plus dans le nouveau code. */
  const policies = await db().collection("policies").orderBy("position").get().catch(() => db().collection("policies").get());
  for (const d of policies.docs) {
    const raw = d.data() as { title?: string; body?: { html?: string } };
    const title = raw.title ?? d.id;
    await ensurePage(d.id, title, htmlToDocument(raw.body?.html ?? "", title), raw.body?.html ?? "");
  }
  note(`  ${policies.size} politiques examinées`);

  /* 2. Les quatre pages bâties sur un contenu structuré. */
  const [home, story, catalogue, contact] = await Promise.all([getHomeContent(), getStoryContent(), getCatalogueContent(), getContactContent()]);
  if (story) await ensurePage("notre-histoire", "Notre histoire", storyToBlocks(story, home?.newsletter));
  if (catalogue) await ensurePage("catalogue", "Catalogue", catalogueToBlocks(catalogue, home?.newsletter));
  if (contact) await ensurePage("contact", "Contact", contactToBlocks(contact, home?.newsletter));
  if (home) await ensurePage("accueil", "Accueil", homeToBlocks(home));

  /* 3. Les menus suivent. Lecture brute, pour la même raison qu'au point 1. */
  const slugs = new Set<string>();
  for (const d of policies.docs) slugs.add(d.id);
  for (const s of ["notre-histoire", "catalogue", "contact", "accueil"]) slugs.add(s);

  const header = MENUS ? await db().collection("menus").doc("header").get() : null;
  if (header?.exists) {
    const items = ((header.data()?.items ?? []) as RawItem[]).map((i) => ({ ...i, target: retarget(i.target, slugs) }));
    const changed = JSON.stringify(items) !== JSON.stringify(header.data()?.items);
    note(changed ? "~ menu d'en-tête repointé" : "= menu d'en-tête déjà à jour");
    if (APPLY && changed) await header.ref.set({ items, updatedAt: Date.now() });
  }
  const footer = MENUS ? await db().collection("menus").doc("footer").get() : null;
  if (footer?.exists) {
    const columns = ((footer.data()?.columns ?? []) as { items?: RawItem[] }[]).map((c) => ({
      ...c,
      items: (c.items ?? []).map((i) => ({ ...i, target: retarget(i.target, slugs) })),
    }));
    const changed = JSON.stringify(columns) !== JSON.stringify(footer.data()?.columns);
    note(changed ? "~ menu de pied repointé" : "= menu de pied déjà à jour");
    if (APPLY && changed) await footer.ref.set({ columns, updatedAt: Date.now() });
  }

  if (!MENUS) note("· menus laissés tels quels — les repointer avec --menus APRÈS le déploiement");

  /* 4. La racine est servie par une page — seulement si aucune ne l'est déjà. */
  const flagged = await db().collection("pages").where("home", "==", true).limit(1).get();
  if (flagged.empty && (home || (await getPage("accueil")))) {
    note("~ page d'accueil : accueil");
    if (APPLY) await setHomePage("accueil");
  } else {
    note(`= page d'accueil : ${flagged.docs[0]?.id ?? "aucune"} (inchangée)`);
  }

  /* 5. La collection policies n'a plus de lecteur. On la garde le temps de vérifier
        la mise en ligne ; sa suppression est un second passage, délibéré. */
  note(`  collection policies conservée (${policies.size} documents) — supprimer avec --drop-policies une fois la prod validée`);
  if (APPLY && process.argv.includes("--drop-policies")) {
    const batch = db().batch();
    for (const d of policies.docs) batch.delete(d.ref);
    await batch.commit();
    note(`- collection policies supprimée`);
  }

  console.log(plan.join("\n"));
  console.log(APPLY ? "\nTerminé." : "\nRien n'a été écrit. Relancer avec --apply pour appliquer.\n");
}

main();
