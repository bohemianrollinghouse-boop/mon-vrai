import "server-only";
import { Page, type BlockDocument, type PageSeo, type RichBody, type Status } from "@/lib/domain/types";
import { db } from "@/lib/firebase/admin";
import { col, now, parseDoc, parseQuery } from "./helpers";

const pages = () => col("pages");

/*
 * Firestore lit « / » dans un identifiant comme un séparateur de chemin : une adresse
 * imbriquée (« infos/cgv ») ne peut donc pas servir telle quelle d'identifiant. On la
 * transpose ; l'adresse reste stockée en clair dans le champ `slug`, qui fait foi.
 */
const docId = (slug: string) => slug.replaceAll("/", "~");

const pageRef = (slug: string) => pages().doc(docId(slug));

export async function listPages(status?: Status): Promise<Page[]> {
  const base = status ? pages().where("status", "==", status) : pages();
  return parseQuery(Page, base.orderBy("updatedAt", "desc"));
}

export async function getPage(slug: string): Promise<Page | null> {
  return parseDoc(Page, await pageRef(slug).get());
}

/*
 * La page servie à la racine. L'unicité est tenue à l'écriture (setHomePage) ; à la
 * lecture on prend la première marquée, pour qu'un état incohérent affiche une page
 * plutôt que rien.
 */
export async function getHomePage(): Promise<Page | null> {
  const snap = await pages().where("home", "==", true).limit(1).get();
  const page = snap.docs[0] ? parseDoc(Page, snap.docs[0]) : null;
  return page?.status === "published" ? page : null;
}

/*
 * Désigne la page d'accueil. Le drapeau est retiré des autres dans le même lot : deux
 * pages d'accueil rendraient la racine imprévisible. `slug` vide n'en désigne aucune,
 * et le site retombe sur l'accueil historique.
 */
export async function setHomePage(slug: string): Promise<void> {
  const current = await pages().where("home", "==", true).get();
  const batch = db().batch();
  for (const d of current.docs) {
    if (d.id !== docId(slug)) batch.update(d.ref, { home: false, updatedAt: now() });
  }
  if (slug) batch.update(pageRef(slug), { home: true, updatedAt: now() });
  await batch.commit();
}

/** Une page publiée uniquement : ce que le public peut voir. */
export async function getPublishedPage(slug: string): Promise<Page | null> {
  const page = await getPage(slug);
  return page?.status === "published" ? page : null;
}

export type PageInput = {
  slug: string;
  title: string;
  status: Status;
  /** Uniquement à la création : ensuite le SEO a son propre formulaire. */
  seo?: PageSeo;
  /** Uniquement à la création ou à l'import : l'édition passe par savePageBlocks(). */
  body?: RichBody;
};

export async function upsertPage(input: PageInput): Promise<Page> {
  const ref = pageRef(input.slug);
  const existing = parseDoc(Page, await ref.get());
  const doc = Page.parse({
    ...input,
    // Ce formulaire ne porte que la publication : contenu, corps hérité et SEO restent.
    body: input.body ?? existing?.body ?? { json: null, html: "" },
    blocks: existing?.blocks,
    seo: input.seo ?? existing?.seo ?? {},
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  });
  await ref.set(doc);
  return doc;
}

/** Écrit le référencement d'une page, sans toucher au reste. */
export async function savePageSeo(slug: string, seo: PageSeo): Promise<Page | null> {
  const ref = pageRef(slug);
  const existing = parseDoc(Page, await ref.get());
  if (!existing) return null;
  const doc = Page.parse({ ...existing, seo, updatedAt: now() });
  await ref.set(doc);
  return doc;
}

/*
 * Écrit le contenu d'une page. Les réglages (titre, adresse, statut, SEO) ne sont pas
 * touchés : ils ont leur propre formulaire, chacun n'écrit que ce qu'il porte.
 */
export async function savePageBlocks(slug: string, blocks: BlockDocument): Promise<Page | null> {
  const ref = pageRef(slug);
  const existing = parseDoc(Page, await ref.get());
  if (!existing) return null;
  const doc = Page.parse({ ...existing, blocks, updatedAt: now() });
  await ref.set(doc);
  return doc;
}

export async function deletePage(slug: string): Promise<void> {
  await pageRef(slug).delete();
}
