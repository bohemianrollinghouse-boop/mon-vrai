import "server-only";
import { Customer, type Address } from "@/lib/domain/types";
import { col, now, parseDoc, parseQuery } from "./helpers";

/*
 * Fiche client, indexée par l'uid Firebase Auth. Créée à la première connexion ou à
 * la première commande. L'e-mail y est copié depuis Auth pour pouvoir lister et
 * chercher sans interroger Auth à chaque fois.
 */

const customers = () => col("customers");

export async function getCustomer(uid: string): Promise<Customer | null> {
  return parseDoc(Customer, await customers().doc(uid).get());
}

export async function listCustomers(limit = 200): Promise<Customer[]> {
  return parseQuery(Customer, customers().orderBy("createdAt", "desc").limit(limit));
}

export async function ensureCustomer(uid: string, email: string, name = ""): Promise<Customer> {
  const ref = customers().doc(uid);
  const existing = parseDoc(Customer, await ref.get());
  if (existing) return existing;
  const doc = Customer.parse({ uid, email, name, addresses: [], createdAt: now() });
  await ref.set(doc);
  return doc;
}

export async function updateCustomer(
  uid: string,
  patch: Partial<Pick<Customer, "name" | "addresses" | "stripeCustomerId" | "newsletter" | "tiimeClientId">>,
): Promise<void> {
  await customers().doc(uid).set(patch, { merge: true });
}

export async function addAddress(uid: string, address: Address): Promise<void> {
  const c = await getCustomer(uid);
  if (!c) throw new Error(`Client ${uid} introuvable`);
  await updateCustomer(uid, { addresses: [...c.addresses, address] });
}

/**
 * Suppression RGPD : la fiche disparaît, les commandes restent (obligation comptable)
 * mais sont détachées du compte. L'appelant supprime aussi l'utilisateur Auth.
 */
export async function eraseCustomer(uid: string): Promise<void> {
  const orders = await col("orders").where("customerUid", "==", uid).get();
  const batch = col("orders").firestore.batch();
  for (const d of orders.docs) {
    batch.update(d.ref, { customerUid: null, updatedAt: now() });
  }
  batch.delete(customers().doc(uid));
  await batch.commit();
}
