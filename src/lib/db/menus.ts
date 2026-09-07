import "server-only";
import { FooterMenu, HeaderMenu } from "@/lib/domain/types";
import { col, now, parseDoc } from "./helpers";

/*
 * Deux menus, un document chacun. Un menu absent renvoie une structure vide plutôt
 * que null : l'en-tête et le pied de page savent toujours se rendre.
 */

const menus = () => col("menus");

export async function getHeaderMenu(): Promise<HeaderMenu> {
  return (await parseDoc(HeaderMenu, await menus().doc("header").get())) ?? { items: [], updatedAt: 0 };
}

export async function getFooterMenu(): Promise<FooterMenu> {
  return (await parseDoc(FooterMenu, await menus().doc("footer").get())) ?? { columns: [], updatedAt: 0 };
}

export async function saveHeaderMenu(items: HeaderMenu["items"]): Promise<HeaderMenu> {
  const doc = HeaderMenu.parse({ items, updatedAt: now() });
  await menus().doc("header").set(doc);
  return doc;
}

export async function saveFooterMenu(columns: FooterMenu["columns"]): Promise<FooterMenu> {
  const doc = FooterMenu.parse({ columns, updatedAt: now() });
  await menus().doc("footer").set(doc);
  return doc;
}
