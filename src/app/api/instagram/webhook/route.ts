import { NextResponse } from "next/server";
import { verifySignature, webhookVerifyToken } from "@/lib/instagram/client";
import { handleIncoming, type Incoming } from "@/lib/instagram/respond";

/*
 * Webhook Instagram : les commentaires sous nos publications et les messages reçus.
 *
 * Deux méthodes pour une seule adresse, et c'est Meta qui l'impose. Le GET est la
 * poignée de main : au moment où l'on déclare l'adresse dans le tableau de bord, Meta
 * appelle avec un mot de passe convenu et attend qu'on lui renvoie son défi, en texte
 * brut et rien d'autre. Le POST est le travail.
 *
 * Meta attend un 2xx en moins de cinq secondes et rejoue sinon. On répond donc tout de
 * suite et on traite derrière, comme pour Boxtal — le doublon que le rejeu provoquerait
 * est de toute façon arrêté plus bas par `claimEvent`.
 */

/* Le corps brut est nécessaire au calcul de la signature : aucune mise en cache. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const challenge = params.get("hub.challenge") ?? "";
  const expected = webhookVerifyToken();

  if (params.get("hub.mode") !== "subscribe" || !expected || params.get("hub.verify_token") !== expected) {
    return new NextResponse("Vérification refusée", { status: 403 });
  }
  /* Le défi SEUL, en texte brut : enveloppé dans du JSON, Meta refuse l'abonnement. */
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

type CommentValue = {
  from?: { id?: string; username?: string };
  comment_id?: string;
  id?: string;
  parent_id?: string;
  text?: string;
  media?: { id?: string };
};

type MessagingItem = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean };
};

type Payload = {
  object?: string;
  entry?: { id?: string; changes?: { field?: string; value?: CommentValue }[]; messaging?: MessagingItem[] }[];
};

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  let payload: Payload = {};
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (payload.object !== "instagram") return NextResponse.json({ received: true, ignored: "objet inattendu" });

  const incoming = extract(payload);

  /*
   * On répond avant d'avoir fini. Le prix de ce choix : si l'instance meurt en cours
   * de route, la ligne réservée reste « en attente » dans le journal et personne n'a
   * été servi — ça se VOIT, au lieu de se deviner.
   */
  for (const item of incoming) {
    void handleIncoming(item).catch((err) => console.warn("[instagram] webhook :", err));
  }
  return NextResponse.json({ received: true, handled: incoming.length });
}

/*
 * Déplie la notification. Meta range les commentaires dans `changes` et les messages
 * dans `messaging` : deux formes dans une même enveloppe, et rien ne garantit qu'il
 * n'y en ait qu'une par appel.
 */
function extract(payload: Payload): Incoming[] {
  const out: Incoming[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const v = change.value ?? {};
      /* Les deux orthographes existent selon les pages de la documentation. */
      const sourceId = v.comment_id || v.id || "";
      if (!sourceId) continue;
      out.push({
        kind: "comment",
        sourceId,
        text: v.text ?? "",
        fromId: v.from?.id ?? "",
        fromUsername: v.from?.username ?? "",
        mediaId: v.media?.id ?? "",
      });
    }

    for (const m of entry.messaging ?? []) {
      const msg = m.message;
      /*
       * L'écho est NOTRE propre message, que Meta nous renvoie. Le laisser passer, c'est
       * répondre à soi-même sans fin — c'est le pendant, côté messagerie, du garde-fou
       * sur nos propres commentaires.
       */
      if (!msg || msg.is_echo || msg.is_deleted) continue;
      /*
       * Un message sans texte est une photo, un autocollant, une réaction, un accusé de
       * lecture. On ne sait pas y reconnaître un mot-clé, donc on ne fait rien — plutôt
       * que de déclencher une règle attrape-tout sur un cœur envoyé en passant.
       */
      if (!msg.text) continue;
      if (!msg.mid) continue;
      out.push({
        kind: "message",
        sourceId: msg.mid,
        text: msg.text,
        fromId: m.sender?.id ?? "",
        fromUsername: "",
        mediaId: "",
      });
    }
  }
  return out;
}
