import "server-only";
import { CatalogueContent, ContactContent, ContactMessage, HomeContent, StoryContent } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Contenus structurés des pages système (accueil, notre histoire, contact) : un
 * document chacun dans la collection `content`. Absent → null ; c'est à la page de
 * décider quoi afficher (et au seed de les créer).
 */

const content = () => col("content");

export async function getHomeContent(): Promise<HomeContent | null> {
  return parseDoc(HomeContent, await content().doc("home").get());
}

export async function saveHomeContent(input: Omit<HomeContent, "updatedAt">): Promise<HomeContent> {
  const doc = HomeContent.parse({ ...input, updatedAt: now() });
  await content().doc("home").set(doc);
  return doc;
}

export async function getCatalogueContent(): Promise<CatalogueContent | null> {
  return parseDoc(CatalogueContent, await content().doc("catalogue").get());
}

export async function saveCatalogueContent(input: Omit<CatalogueContent, "updatedAt">): Promise<CatalogueContent> {
  const doc = CatalogueContent.parse({ ...input, updatedAt: now() });
  await content().doc("catalogue").set(doc);
  return doc;
}

export async function getStoryContent(): Promise<StoryContent | null> {
  return parseDoc(StoryContent, await content().doc("story").get());
}

export async function saveStoryContent(input: Omit<StoryContent, "updatedAt">): Promise<StoryContent> {
  const doc = StoryContent.parse({ ...input, updatedAt: now() });
  await content().doc("story").set(doc);
  return doc;
}

export async function getContactContent(): Promise<ContactContent | null> {
  return parseDoc(ContactContent, await content().doc("contact").get());
}

export async function saveContactContent(input: Omit<ContactContent, "updatedAt">): Promise<ContactContent> {
  const doc = ContactContent.parse({ ...input, updatedAt: now() });
  await content().doc("contact").set(doc);
  return doc;
}

/* ---------- Messages du formulaire de contact ---------- */

const messages = () => col("messages");

export async function saveContactMessage(
  input: Omit<ContactMessage, "id" | "createdAt" | "read">,
): Promise<ContactMessage> {
  const doc = ContactMessage.parse({ ...input, id: newId("msg"), createdAt: now(), read: false });
  await messages().doc(doc.id).set(doc);
  return doc;
}

export async function listContactMessages(limit = 200): Promise<ContactMessage[]> {
  return parseQuery(ContactMessage, messages().orderBy("createdAt", "desc").limit(limit));
}

export async function markMessageRead(id: string, read = true): Promise<void> {
  await messages().doc(id).update({ read });
}
