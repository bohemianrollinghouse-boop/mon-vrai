"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { clientAuth } from "@/lib/firebase/client";
import { PillButton } from "./ui";

/*
 * Choix du mot de passe, puis connexion immédiate. Le compte est créé côté serveur
 * (l'action vérifie le jeton), mais la session, elle, suit le même chemin que pour un
 * client : on se connecte auprès de Firebase dans le navigateur et on échange le jeton
 * obtenu contre le cookie de session. Un seul mécanisme de session sur tout le site.
 */

type Result = { ok: true; email: string } | { ok: false; error: string };

const field = "w-full rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ink";

export function ActivationForm({ token, email, action }: { token: string; email: string; action: (fd: FormData) => Promise<Result> }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirm") ?? "")) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setPending(true);
    try {
      const result = await action(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const cred = await signInWithEmailAndPassword(clientAuth(), result.email, password);
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      if (!res.ok) throw new Error("Session refusée");
      router.push("/partenaire");
      router.refresh();
    } catch {
      setError("Impossible d'ouvrir la session. Réessayez dans un instant.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="email" value={email} readOnly aria-label="Votre e-mail" className={`${field} text-subtle`} />
      <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Mot de passe · 8 caractères minimum" className={field} />
      <input name="confirm" type="password" required minLength={8} autoComplete="new-password" placeholder="Confirmer le mot de passe" className={field} />
      {error && (
        <p role="alert" className="rounded-[14px] bg-danger-bg px-4 py-3 text-[0.8125rem] font-semibold text-danger">
          {error}
        </p>
      )}
      <PillButton variant="dark" size="lg" disabled={pending} className="w-full">
        {pending ? "Activation…" : "Créer mon accès"}
      </PillButton>
      <span className="text-[0.6875rem] leading-relaxed text-subtle">
        Votre adresse est déjà confirmée : vous avez ouvert le lien que nous y avons envoyé. Aucun e-mail de vérification ne vous sera demandé.
      </span>
    </form>
  );
}
