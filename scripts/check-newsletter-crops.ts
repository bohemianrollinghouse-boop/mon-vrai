/*
 * Vérification de bout en bout du recadrage des newsletters.
 *
 * Le défaut qu'on ne veut plus jamais revoir : la dérivée était bien fabriquée et bien
 * déposée, mais sous un préfixe que `storage.rules` n'ouvre pas à la lecture. Côté
 * serveur, tout allait bien ; le destinataire, lui, recevait un carré vide.
 *
 * Ce script ferme la boucle : il dépose une image, la fait recadrer par le vrai
 * `resolveCrops`, puis RÉCUPÈRE l'URL produite comme le ferait un client de messagerie —
 * sans identifiants, en HTTP nu. Si les règles refusent l'accès, il le dit.
 *
 * Il vérifie aussi qu'un dépôt hors de `media/` serait bien refusé : sans ce second
 * test, on ne saurait pas si le premier réussit parce que les règles sont bonnes ou
 * parce qu'elles laissent tout passer.
 *
 *   pnpm emulators                      # dans un autre terminal
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local \
 *     scripts/check-newsletter-crops.ts
 *
 * N'écrit que dans le bucket visé par l'environnement chargé — à lancer sur les
 * émulateurs, pas sur la production.
 */
import sharp from "sharp";
import { uploadMedia } from "@/lib/db/media";
import { storage } from "@/lib/firebase/admin";
import { resolveCrops } from "@/lib/newsletter/crops";
import { cropKey, type CropReq } from "@/lib/newsletter/render";

/** Une photo verticale, comme celles qui sortent d'un téléphone : c'est le cas qui cassait. */
async function photoDeTelephone(): Promise<Buffer> {
  const svg = `<svg width="1800" height="2400" xmlns="http://www.w3.org/2000/svg">
    <rect width="1800" height="2400" fill="#8FA37E"/>
    <circle cx="900" cy="1200" r="420" fill="#FBF8F3"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/** Récupère une URL comme le ferait une messagerie : aucun identifiant, aucun en-tête. */
async function litCommeUnDestinataire(url: string): Promise<{ ok: boolean; status: number; type: string; taille: number }> {
  const res = await fetch(url);
  const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
  return { ok: res.ok, status: res.status, type: res.headers.get("content-type") ?? "", taille: buf.byteLength };
}

/** Couleur du centre d'une dérivée, relue après coup comme le ferait un œil. */
async function centre(url: string): Promise<{ r: number; g: number; b: number }> {
  const res = await fetch(url);
  const { data } = await sharp(Buffer.from(await res.arrayBuffer())).resize(1, 1, { fit: "cover" }).raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

/*
 * Deux pièges de `sharp` que rien ne signale côté serveur :
 *   - une image CMJN (ce que rend Photoshop) ressort en NÉGATIF sans `toColourspace` :
 *     un rouge devient cyan. Adobe y stocke des valeurs inversées ;
 *   - le JPEG n'ayant pas de transparence, une couverture détourée se pose sur du noir
 *     sans `flatten`.
 * On fabrique les deux cas et on relit la couleur obtenue.
 */
async function verifieLesCouleurs(): Promise<boolean> {
  const cas = [
    {
      nom: "JPEG CMJN",
      bytes: await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 220, g: 30, b: 30 } } }).toColourspace("cmyk").jpeg().toBuffer(),
      ext: "jpg",
      mime: "image/jpeg",
      attendu: (c: { r: number; g: number; b: number }) => c.r > 140 && c.b < 110,
      dit: "doit rester rouge, pas devenir cyan",
    },
    {
      nom: "PNG transparent",
      bytes: await sharp({ create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer(),
      ext: "png",
      mime: "image/png",
      attendu: (c: { r: number; g: number; b: number }) => c.r > 200 && c.g > 200 && c.b > 200,
      dit: "doit se poser sur du blanc, pas sur du noir",
    },
  ];

  let tout = true;
  for (const k of cas) {
    const m = await uploadMedia({ bytes: k.bytes, mime: k.mime, filename: `verif-couleurs.${k.ext}`, alt: "" });
    const req: CropReq = { url: m.url, w: 200, h: 200, pos: "50% 50%" };
    const derivee = (await resolveCrops([req]))[cropKey(req)];
    if (!derivee) {
      console.log(`  ${k.nom} : aucune dérivée produite`);
      tout = false;
      continue;
    }
    const c = await centre(derivee);
    const ok = k.attendu(c);
    if (!ok) tout = false;
    console.log(`  ${k.nom} : rvb(${c.r}, ${c.g}, ${c.b}) — ${ok ? "OK" : "ÉCHEC"}, ${k.dit}`);
  }
  return tout;
}

async function main() {
  const bucket = storage().bucket();
  console.log(`Bucket : ${bucket.name}\n`);

  // 1. Une image dans la médiathèque, comme celle qu'on choisit par le crayon.
  const media = await uploadMedia({ bytes: await photoDeTelephone(), mime: "image/jpeg", filename: "verification-recadrage.jpg", alt: "" });
  console.log(`Source déposée : ${media.path}`);

  // 2. Le vrai recadrage, avec la vraie demande d'un héros de newsletter.
  const req: CropReq = { url: media.url, w: 552, h: 520, pos: "50% 40%", scrim: true };
  const crops = await resolveCrops([req]);
  const derivee = crops[cropKey(req)];
  if (!derivee) throw new Error("Aucune dérivée produite : le recadrage lui-même a échoué (voir la trace ci-dessus).");
  console.log(`Dérivée produite : ${decodeURIComponent(new URL(derivee).pathname.split("/o/")[1] ?? derivee)}`);

  // 3. La lecture publique — le seul test qui compte, celui qui manquait.
  const lecture = await litCommeUnDestinataire(derivee);
  console.log(`\nLecture publique de la dérivée : ${lecture.status} ${lecture.type} (${Math.round(lecture.taille / 1024)} Ko)`);

  // 4. Le témoin : hors de media/, les règles doivent refuser. Sans lui, un succès en 3
  //    ne prouverait rien — il pourrait venir de règles trop ouvertes.
  const hors = "newsletter/crops/temoin.jpg";
  await bucket.file(hors).save(Buffer.from("x"), { contentType: "image/jpeg" });
  const refus = await litCommeUnDestinataire(derivee.replace(encodeURIComponent(decodeURIComponent(new URL(derivee).pathname.split("/o/")[1] ?? "")), encodeURIComponent(hors)));
  console.log(`Lecture d'un dépôt hors de media/ : ${refus.status} (doit être refusé)`);
  await bucket.file(hors).delete({ ignoreNotFound: true });

  // 5. Les couleurs. Une image CMJN ressortait en négatif (un rouge devenait cyan), et une
  //    image transparente se posait sur du noir. Deux défauts invisibles côté serveur.
  const couleurs = await verifieLesCouleurs();

  const bon = lecture.ok && lecture.type.startsWith("image/") && lecture.taille > 0;
  const temoinBon = !refus.ok;
  console.log(`\n${bon && temoinBon ? "OK" : "ÉCHEC"} — la dérivée est ${bon ? "lisible" : "ILLISIBLE"} publiquement, et un dépôt hors de media/ est ${temoinBon ? "bien refusé" : "À TORT ACCESSIBLE"}.`);
  console.log(`${couleurs ? "OK" : "ÉCHEC"} — les couleurs sont fidèles (CMJN non inversé, transparence sur blanc).`);
  if (!(bon && temoinBon && couleurs)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
