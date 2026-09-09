import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { uploadMedia } from "@/lib/db/media";

/*
 * Remplacement d'image dans une newsletter : l'admin choisit un fichier sur son ordinateur,
 * on le stocke (médiathèque + bucket) et on renvoie son URL publique, que l'aperçu éditable
 * pose comme source. Le recadrage centré est fait à l'affichage (object-fit: cover), donc on
 * conserve l'image d'origine — pas de retaille destructive côté serveur.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Aucun fichier." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Le fichier doit être une image." }, { status: 400 });

  try {
    const media = await uploadMedia({ bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, filename: file.name, alt: "" });
    return NextResponse.json({ url: media.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
