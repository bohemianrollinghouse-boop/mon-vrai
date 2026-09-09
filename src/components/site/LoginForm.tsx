"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updateProfile, type UserCredential } from "firebase/auth";
import { clientAuth } from "@/lib/firebase/client";

/*
 * Connexion et création de compte, sur un seul écran. L'authentification se fait
 * auprès de Firebase Auth dans le navigateur ; le jeton obtenu est aussitôt échangé
 * contre un cookie de session côté serveur, seul élément que le reste du site lit.
 */

type Mode = "login" | "register" | "reset";

const field = "w-full rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ink";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();

    try {
      const auth = clientAuth();
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setNotice("Si un compte existe pour cette adresse, un e-mail de réinitialisation vient de partir.");
        return;
      }
      const cred =
        mode === "register"
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);
      if (mode === "register") {
        if (name) await updateProfile(cred.user, { displayName: name });
        // L'adresse doit être confirmée avant de donner accès aux commandes passées en invité.
        await sendEmailVerification(cred.user).catch(() => undefined);
      }

      await openSession(cred);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setPending(false);
    }
  }

  /** Échange le jeton Firebase contre le cookie de session, puis navigue. */
  async function openSession(cred: UserCredential) {
    const idToken = await cred.user.getIdToken(true);
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
    if (!res.ok) throw new Error("session");
    const { admin } = (await res.json()) as { admin: boolean };
    router.push(admin && returnTo === "/compte" ? "/admin" : returnTo);
    router.refresh();
  }

  async function withGoogle() {
    setError(null);
    setPending(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await openSession(await signInWithPopup(clientAuth(), provider));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {mode !== "reset" && (
        <>
          <button
            type="button"
            onClick={withGoogle}
            disabled={pending}
            className="flex items-center justify-center gap-2.5 rounded-pill border border-line bg-white px-6 py-3.5 text-sm font-bold disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.1 7-10.2 7-17.6z" />
              <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
              <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.6-5.9c-2.1 1.4-4.8 2.3-8 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continuer avec Google
          </button>
          <div className="flex items-center gap-3 text-xs font-semibold text-subtle">
            <span className="h-px flex-1 bg-line" />
            ou
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <div className="flex gap-1.5 rounded-pill bg-paper p-1.5 text-[0.8125rem] font-semibold">
        {(["login", "register"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-pill px-4 py-2.5 ${mode === m ? "bg-ink text-white" : ""}`}
          >
            {m === "login" ? "Se connecter" : "Créer un compte"}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-[14px] bg-danger-bg px-5 py-3.5 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-[14px] bg-tint-green px-5 py-3.5 text-sm font-semibold text-tint-green-ink">
          {notice}
        </p>
      )}

      {mode === "register" && (
        <label className="flex flex-col gap-2 text-[0.8125rem] font-bold">
          <span>Prénom et nom</span>
          <input name="name" type="text" autoComplete="name" className={field} />
        </label>
      )}
      <label className="flex flex-col gap-2 text-[0.8125rem] font-bold">
        <span>E-mail</span>
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      {mode !== "reset" && (
        <label className="flex flex-col gap-2 text-[0.8125rem] font-bold">
          <span>Mot de passe</span>
          <input name="password" type="password" required minLength={8} autoComplete={mode === "register" ? "new-password" : "current-password"} className={field} />
        </label>
      )}

      <button type="submit" disabled={pending} className="rounded-pill bg-ink px-7 py-4 text-sm font-bold text-white disabled:opacity-60">
        {pending ? "…" : mode === "login" ? "Se connecter" : mode === "register" ? "Créer mon compte" : "Envoyer le lien"}
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === "reset" ? "login" : "reset")}
        className="w-fit self-center text-[0.8125rem] font-semibold text-subtle underline"
      >
        {mode === "reset" ? "Retour à la connexion" : "Mot de passe oublié ?"}
      </button>
    </form>
  );
}

function messageFor(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "E-mail ou mot de passe incorrect.";
  if (code.includes("email-already-in-use")) return "Un compte existe déjà avec cette adresse.";
  if (code.includes("weak-password")) return "Le mot de passe doit faire au moins 8 caractères.";
  if (code.includes("too-many-requests")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return "Connexion Google annulée.";
  return "Connexion impossible pour le moment.";
}
