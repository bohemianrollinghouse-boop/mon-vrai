import "server-only";
import { Page, type RichBody, type Seo, type Status } from "@/lib/domain/types";
import { col, now, parseDoc, parseQuery } from "./helpers";

const pages = () => col("pages");

export async function listPages(status?: Status): Promise<Page[]> {
  const base = status ? pages().where("status", "==", status) : pages();
  return parseQuery(Page, base.orderBy("updatedAt", "desc"));
}

export async function getPage(slug: string): Promise<Page | null> {
  return parseDoc(Page, await pages().doc(slug).get());
}

/** Une page publiée uniquement : ce que le public peut voir. */
export async function getPublishedPage(slug: string): Promise<Page | null> {
  const page = await getPage(slug);
  return page?.status === "published" ? page : null;
}

export type PageInput = {
  slug: string;
  title: string;
  body: RichBody;
  status: Status;
  seo?: Seo;
};

export async function upsertPage(input: PageInput): Promise<Page> {
  const ref = pages().doc(input.slug);
  const existing = parseDoc(Page, await ref.get());
  const doc = Page.parse({
    ...input,
    seo: input.seo ?? {},
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  });
  await ref.set(doc);
  return doc;
}

export async function deletePage(slug: string): Promise<void> {
  await pages().doc(slug).delete();
}
