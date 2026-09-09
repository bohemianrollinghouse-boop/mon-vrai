"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { clientAuth } from "@/lib/firebase/client";

/*
 * Bandeau « adresse non vérifiée » de l'espace client. Tant que Firebase n'a pas confirmé
 * l'e-mail, les commandes passées en invité avec cette adresse ne sont pas rattachées au
 * compte (voir listOrdersForUser). Au chargement, on relit l'état côté Firebase : si
 * l'adresse vient d'être confirmée, on renouvelle le cookie de session (qui porte
 * email_verified) et on rafraîchit la page — sans demander de se reconnecter.
 */
export function VerifyEmailNotice({ email }: { email: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = clientAuth().currentUser;
      if (!user) return;
      await user.reload().catch(() => undefined);
      if (cancelled || !user.emailVerified) return;
      const idToken = await user.getIdToken(true);
      const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
      if (res.ok && !cancelled) router.refresh();
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function resend() {
    const user = clientAuth().currentUser;
    if (!user) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      await sendEmailVerification(user);
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-tint-sand px-7 py-5 text-sm text-tint-sand-ink">
      <span className="font-semibold">
        Confirmez votre adresse {email} pour retrouver vos commandes passées sans compte. Un lien vous a été envoyé à l'inscription.
      </span>
      {state === "sent" ? (
        <span className="text-xs font-bold">E-mail renvoyé. Pensez aux courriers indésirables.</span>
      ) : state === "error" ? (
        <span className="text-xs font-bold">Envoi impossible pour le moment. Déconnectez-vous puis reconnectez-vous et réessayez.</span>
      ) : (
        <button type="button" onClick={resend} disabled={state === "sending"} className="rounded-pill bg-ink px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
          {state === "sending" ? "…" : "Renvoyer le lien"}
        </button>
      )}
    </div>
  );
}
