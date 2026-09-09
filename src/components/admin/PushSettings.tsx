"use client";

import { useEffect, useState } from "react";

/*
 * Réglage des notifications push, dans l'admin. Un abonnement est propre à CHAQUE
 * navigateur/appareil (installé en PWA ou non) : le bouton active/désactive les notifs sur
 * l'appareil courant, la liste dit de quoi être notifié (pour l'instant : nouvelles
 * commandes). Un bouton envoie une notification test. Web Push standard (VAPID).
 */

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushSettings() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const ok = typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(VAPID);
    // Détection de capacité au montage (impossible au rendu SSR) : lecture ponctuelle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(Boolean(sub)))
      .catch(() => undefined);
  }, []);

  const enable = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg({ ok: false, text: perm === "denied" ? "Notifications bloquées : autorisez-les dans les réglages du site de votre navigateur." : "Autorisation refusée." });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) as BufferSource }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), events: { newOrder: true } }) });
      if (!res.ok) throw new Error("Enregistrement impossible.");
      setEnabled(true);
      setMsg({ ok: true, text: "Notifications activées sur cet appareil." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "Impossible d'activer les notifications." });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setEnabled(false);
      setMsg({ ok: true, text: "Notifications désactivées sur cet appareil." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "Erreur." });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setMsg({ ok: false, text: "Activez d'abord les notifications." });
        return;
      }
      const res = await fetch("/api/push/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(res.ok ? { ok: true, text: "Notification test envoyée." } : { ok: false, text: data.error || "Échec du test." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "Erreur." });
    } finally {
      setBusy(false);
    }
  };

  if (supported === false) {
    return <p className="text-[0.8125rem] leading-relaxed text-subtle">Les notifications push ne sont pas disponibles sur ce navigateur. Sur iPhone, installez d'abord l'admin sur l'écran d'accueil (menu Partager → « Sur l'écran d'accueil »), puis rouvrez cette page depuis l'icône.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-[14px] bg-paper px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[0.8125rem] font-bold">Notifications sur cet appareil</span>
          <span className="text-[0.6875rem] text-subtle">{enabled ? "Activées" : "Désactivées"} · propre à ce navigateur / appareil</span>
        </div>
        <button
          type="button"
          onClick={enabled ? disable : enable}
          disabled={busy || supported === null}
          className={`rounded-pill px-5 py-2.5 text-[0.8125rem] font-bold disabled:opacity-60 ${enabled ? "border border-line-warm bg-surface" : "bg-ink text-on-ink"}`}
        >
          {busy ? "…" : enabled ? "Désactiver" : "Activer"}
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-[14px] bg-paper px-4 py-3">
        <span className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-faint">Me notifier de</span>
        <label className="flex items-center gap-2 text-[0.8125rem] font-semibold">
          <input type="checkbox" checked readOnly className="h-4 w-4 accent-ink" />
          Nouvelles commandes
        </label>
        <span className="text-[0.625rem] text-faint">D'autres types de notifications pourront être ajoutés plus tard.</span>
      </div>

      {enabled && (
        <button type="button" onClick={test} disabled={busy} className="self-start rounded-pill border border-line-warm bg-surface px-4 py-2 text-[0.75rem] font-bold disabled:opacity-60">
          Envoyer une notification test
        </button>
      )}
      {msg && <p className={`rounded-[12px] px-4 py-2.5 text-[0.8125rem] font-semibold ${msg.ok ? "bg-tint-green text-tint-green-ink" : "bg-danger-bg text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
