"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * La marche vers le livre qui rembourse le tirage.
 *
 * Une barre, un halo qui la parcourt tant que l'objectif n'est pas atteint, et un feu
 * d'artifice le jour où il l'est. Le halo n'est pas qu'un ornement : il dit que le
 * compteur est vivant, que des ventes continuent d'arriver.
 *
 * La fête ne se déclenche qu'une fois — mémorisée dans le navigateur —, sinon chaque
 * passage sur le tableau de bord rejouerait la même explosion et on finirait par la
 * fermer avant de l'avoir vue. Un bouton la rejoue à la demande.
 *
 * `prefers-reduced-motion` coupe tout : le halo, les particules. Le chiffre et les
 * félicitations, eux, restent — c'est l'information, pas la décoration.
 */

const KEY = "mv_breakeven_celebrated";

/*
 * Le souvenir de la fête vit dans le navigateur, que le serveur ne connaît pas. On le lit
 * par `useSyncExternalStore` plutôt qu'en posant un état depuis un effet : le rendu
 * serveur répond « déjà fêté », le client relit la vérité, et React raccorde les deux
 * sans discordance d'hydratation.
 */
const staticStore = () => () => {};
const readCelebrated = () => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    /* Navigation privée, stockage refusé : on fête, quitte à refêter. */
    return false;
  }
};

export function BreakEvenBar({
  books,
  gifted,
  amortisedLabel,
  productionLabel,
  pct,
  perBookLabel,
  remaining,
  reached,
}: {
  /** Exemplaires partis dans des ventes, cadeaux compris. */
  books: number;
  gifted: number;
  amortisedLabel: string;
  productionLabel: string;
  pct: number;
  /** Ce qu'un exemplaire a remboursé en moyenne, remises et cadeaux compris. */
  perBookLabel: string;
  /** Exemplaires restants à ce rythme ; null quand on ne peut pas encore l'estimer. */
  remaining: number | null;
  reached: boolean;
}) {
  const rounded = Math.round(pct);

  const celebrated = useSyncExternalStore(staticStore, readCelebrated, () => true);
  const [dismissed, setDismissed] = useState(false);
  const [replay, setReplay] = useState(false);
  const party = reached && !dismissed && (!celebrated || replay);

  /* On note que la fête a eu lieu. Écrire n'est pas poser un état : rien ne se re-rend. */
  useEffect(() => {
    if (!reached) return;
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* Tant pis : elle se rejouera au prochain passage. */
    }
  }, [reached]);

  return (
    <div className={`relative flex flex-col gap-4 overflow-hidden rounded-card p-7 ${reached ? "bg-tint-green" : "bg-surface"}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <span className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-subtle">
            {reached ? "Production remboursée" : "Vers le remboursement du tirage"}
          </span>
          <span className="text-[1.75rem] font-extrabold leading-none tracking-[-0.02em]">
            {amortisedLabel}
            <span className="text-subtle"> / {productionLabel}</span>
          </span>
          <span className="text-[0.8125rem] font-semibold text-subtle">
            {`${books.toLocaleString("fr-FR")} livre${books > 1 ? "s" : ""} parti${books > 1 ? "s" : ""}`}
            {gifted > 0 && `, dont ${gifted.toLocaleString("fr-FR")} offert${gifted > 1 ? "s" : ""}`}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1 text-right">
          <span className="text-[1.75rem] font-extrabold leading-none tracking-[-0.02em]">{rounded} %</span>
          <span className="text-[0.6875rem] font-semibold text-subtle">
            {reached
              ? "objectif franchi"
              : remaining === null
                ? "en attente d'une première vente"
                : `encore ~${remaining.toLocaleString("fr-FR")} livre${remaining > 1 ? "s" : ""} à ce rythme`}
          </span>
        </span>
      </div>

      {/* La barre. Le halo balaie la partie remplie, jamais le vide restant. */}
      <div className="h-4 overflow-hidden rounded-pill bg-line-soft">
        <div
          className={`relative h-full overflow-hidden rounded-pill transition-[width] duration-700 ease-out ${reached ? "bg-tint-green-ink" : "bg-ink"}`}
          style={{ width: `${Math.max(rounded, books > 0 ? 2 : 0)}%` }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/55 to-transparent motion-safe:animate-[breakeven-halo_2.4s_ease-in-out_infinite] motion-reduce:hidden"
          />
        </div>
      </div>

      <p className="text-[0.8125rem] leading-relaxed text-subtle">
        {reached ? (
          <>
            Le tirage est remboursé. Chaque exemplaire vendu à partir d&apos;ici est du bénéfice :{" "}
            <strong className="text-ink">{perBookLabel} par livre</strong> en moyenne jusqu&apos;ici.
          </>
        ) : (
          <>
            Chaque exemplaire parti a remboursé <strong className="text-ink">{perBookLabel}</strong> en moyenne — remises
            et livres offerts compris, une fois retirés les cotisations, la commission de paiement et la fabrication. Le
            détail est dans Revenus.
          </>
        )}
      </p>

      {reached && !party && (
        <button
          type="button"
          onClick={() => {
            setDismissed(false);
            setReplay(true);
          }}
          className="w-fit rounded-pill bg-tint-green-ink px-5 py-2.5 text-xs font-bold text-tint-green hover:opacity-80"
        >
          Rejouer le feu d&apos;artifice
        </button>
      )}

      {party && (
        <Fireworks
          onDone={() => {
            setReplay(false);
            setDismissed(true);
          }}
        />
      )}
    </div>
  );
}

/*
 * Feu d'artifice : quelques gerbes de particules sur un canevas au-dessus de la page,
 * puis plus rien. Rien n'est chargé de l'extérieur — une centaine de points qui tombent
 * suffisent, et une bibliothèque pour cela serait payée au prix fort.
 */
type Particle = { x: number; y: number; vx: number; vy: number; life: number; hue: number };

function Fireworks({ onDone }: { onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const quiet = window.setTimeout(onDone, 4000);
      return () => window.clearTimeout(quiet);
    }

    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => {
      el.width = window.innerWidth * dpr;
      el.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener("resize", size);

    const particles: Particle[] = [];
    const burst = () => {
      const x = window.innerWidth * (0.15 + Math.random() * 0.7);
      const y = window.innerHeight * (0.15 + Math.random() * 0.35);
      const hue = Math.floor(Math.random() * 360);
      const n = 42 + Math.floor(Math.random() * 26);
      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        const speed = 1.6 + Math.random() * 3.6;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, hue: hue + Math.random() * 40 });
      }
    };

    burst();
    const bursts = window.setInterval(burst, 520);
    const stop = window.setTimeout(() => window.clearInterval(bursts), 3200);

    let raf = 0;
    const frame = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.045; // gravité
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.life -= 0.0115;
        if (p.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = `hsl(${p.hue} 90% 62%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);

    /* La fête a une fin : sans quoi le canevas resterait posé sur la page pour toujours. */
    const done = window.setTimeout(onDone, 6500);
    return () => {
      window.removeEventListener("resize", size);
      window.clearInterval(bursts);
      window.clearTimeout(stop);
      window.clearTimeout(done);
      window.cancelAnimationFrame(raf);
    };
  }, [onDone]);

  return (
    <>
      <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 z-50" />
      <div role="status" className="pointer-events-none fixed inset-x-0 top-[22vh] z-50 flex flex-col items-center gap-3 px-6 text-center">
        <span className="text-[clamp(2rem,6vw,3.5rem)] font-extrabold leading-tight tracking-[-0.02em] text-ink drop-shadow-[0_2px_18px_rgba(255,255,255,0.9)]">
          Le tirage est remboursé 🎉
        </span>
        <span className="max-w-[34rem] rounded-pill bg-ink/90 px-6 py-3 text-sm font-bold text-on-ink">
          Bravo. À partir d&apos;ici, chaque imagier vendu est du bénéfice.
        </span>
      </div>
    </>
  );
}
