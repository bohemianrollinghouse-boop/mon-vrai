import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { publicUrl } from "@/lib/db/media";
import { storage } from "@/lib/firebase/admin";
import { cropKey, type CropReq } from "./render";

/*
 * Recadrage des images d'une newsletter, AVANT l'envoi.
 *
 * Le modèle décrit chaque emplacement par une boîte en pixels (552 × 520 pour un héros,
 * 271 × 300 pour une demi-colonne…). Dans un navigateur, `object-fit: cover` suffisait à
 * y faire tenir n'importe quelle photo — mais aucun client de messagerie ne connaît cette
 * propriété : Gmail et Outlook la retirent, et la photo d'origine se retrouve affichée à
 * sa taille réelle dans une boîte trop petite. C'est ce qui donnait une image énorme dont
 * on ne voyait qu'un coin.
 *
 * Le recadrage est donc fait ici, pour de vrai : une dérivée JPEG aux dimensions exactes
 * de la boîte (en ×2 pour les écrans fins), déposée dans le bucket sous un nom déterminé
 * par ses paramètres. Deux envois du même modèle réutilisent donc le même fichier, et
 * l'e-mail ne porte plus qu'une balise `<img>` ordinaire, comprise partout.
 *
 * Rien ici ne doit faire échouer un envoi : une image qu'on ne sait pas retailler repart
 * telle quelle, au pire comme avant.
 */

/** Facteur de résolution : la boîte fait 552 px dans l'e-mail, le fichier 1104 px. */
const DPR = 2;

/** Qualité JPEG des dérivés. Au-delà, le poids grimpe sans gain visible en messagerie. */
const QUALITY = 80;

export type CropMap = Record<string, string>;

/*
 * `object-position` du modèle (« 50% 40% ») ramené au vocabulaire de sharp. On ne garde
 * que l'axe vertical : c'est le seul que les modèles déplacent, pour choisir entre un
 * visage et ce qu'on tient dans les mains.
 */
function gravity(pos: string): "north" | "centre" | "south" {
  const y = Number.parseFloat(pos.split(/\s+/)[1] ?? "50");
  if (!Number.isFinite(y)) return "centre";
  if (y <= 35) return "north";
  if (y >= 65) return "south";
  return "centre";
}

/*
 * Voile sombre du bas d'un héros. Le titre blanc était posé par-dessus la photo en CSS
 * (`position:absolute` + dégradé) : les deux disparaissent en messagerie, et le texte
 * devenait illisible. On cuit donc le dégradé dans l'image — le contraste ne dépend plus
 * d'aucune propriété facultative.
 */
function scrimOverlay(w: number, h: number): Buffer {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".62"/><stop offset=".55" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`,
  );
}

/** Chemin du fichier dans le bucket, déterminé par la demande : le recadrage est idempotent. */
function cropPath(r: CropReq): string {
  const hash = createHash("sha1").update(cropKey(r)).digest("hex").slice(0, 20);
  return `newsletter/crops/${hash}-${r.w}x${r.h}.jpg`;
}

/*
 * Octets de l'image d'origine. Une image de la médiathèque est lue directement dans le
 * bucket (pas d'aller-retour HTTP, et rien à exposer publiquement) ; une image externe —
 * les visuels produits encore servis par Shopify — est téléchargée.
 */
async function sourceBytes(url: string): Promise<Buffer> {
  const bucket = storage().bucket();
  const local = /\/v0\/b\/([^/]+)\/o\/([^?]+)/.exec(url);
  if (local && decodeURIComponent(local[1]) === bucket.name) {
    const [bytes] = await bucket.file(decodeURIComponent(local[2])).download();
    return bytes;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image inaccessible (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function cropOne(r: CropReq): Promise<string> {
  const bucket = storage().bucket();
  const path = cropPath(r);
  const file = bucket.file(path);

  const [exists] = await file.exists();
  if (!exists) {
    const w = r.w * DPR;
    const h = r.h * DPR;
    let img = sharp(await sourceBytes(r.url), { failOn: "none" })
      .rotate() // respecte l'orientation EXIF : sans ça, une photo de téléphone part couchée
      .resize(w, h, { fit: "cover", position: gravity(r.pos) });
    if (r.scrim) img = img.composite([{ input: scrimOverlay(w, h), blend: "over" }]);
    const bytes = await img.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    await file.save(bytes, {
      contentType: "image/jpeg",
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
    });
  }
  return publicUrl(bucket.name, path);
}

/**
 * Recadre toutes les images demandées par un rendu et renvoie la table
 * `clé → URL de la dérivée`, à repasser au rendu définitif.
 */
export async function resolveCrops(reqs: CropReq[]): Promise<CropMap> {
  const unique = new Map<string, CropReq>();
  for (const r of reqs) if (r.url) unique.set(cropKey(r), r);

  const out: CropMap = {};
  await Promise.all(
    [...unique].map(async ([key, r]) => {
      try {
        out[key] = await cropOne(r);
      } catch {
        // Une image qu'on ne sait pas retailler ne doit pas empêcher la newsletter de
        // partir : elle repart à l'identique, comme avant ce module.
      }
    }),
  );
  return out;
}
