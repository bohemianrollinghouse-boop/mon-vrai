import { NextResponse } from "next/server";
import { setNewsletterOptOut } from "@/lib/db/newsletter";
import { verifyUnsubscribeToken } from "@/lib/newsletter/unsub";

/*
 * Désinscription en un clic depuis un lien signé de la newsletter. Pas d'authentification :
 * le jeton HMAC prouve que le lien vient bien d'un e-mail que nous avons envoyé à cette
 * adresse. Réponse : une page de confirmation sobre.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const email = verifyUnsubscribeToken(token);
  const ok = Boolean(email);
  if (email) await setNewsletterOptOut(email).catch(() => undefined);

  const body = ok
    ? `<h1>C'est fait.</h1><p>Vous ne recevrez plus la newsletter de Mon Vrai${email ? ` à l'adresse ${escapeHtml(email)}` : ""}. Vous continuerez à recevoir les e-mails liés à vos commandes.</p>`
    : `<h1>Lien invalide</h1><p>Ce lien de désinscription n'est plus valable. Écrivez-nous et nous nous en occupons.</p>`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Désinscription</title>
<style>body{margin:0;background:#fbf8f3;color:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{background:#fff;border-radius:24px;padding:48px 40px;max-width:520px;margin:24px;text-align:center}h1{font-size:24px;margin:0 0 12px}p{color:#666;line-height:1.6}a{color:#111}</style></head>
<body><div class="card">${body}<p style="margin-top:20px"><a href="https://monvrai.fr">Retour à la boutique</a></p></div></body></html>`;

  return new NextResponse(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
