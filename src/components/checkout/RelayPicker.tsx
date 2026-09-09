"use client";

import { useEffect, useRef, useState } from "react";
import type { BoxtalParcelPointMap, ParcelPoint, ParcelPointAndDistance } from "@boxtal/parcel-point-map";

/*
 * Carte des points relais (composant Boxtal, dans une iframe) : la recherche part de
 * l'adresse saisie ; le composant affiche la carte et la liste, le client clique un
 * point, on remonte le choix. Le jeton vient du serveur (clés « composant carte »).
 */

export type Relay = { code: string; name: string; street: string; postalCode: string; city: string; network: string };

type Props = {
  token: string | null;
  networks: string[];
  address: { country: string; postalCode: string; city: string; street?: string };
  selected: Relay | null;
  onSelect: (relay: Relay | null) => void;
};

export function RelayPicker({ token, networks, address, selected, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<BoxtalParcelPointMap | null>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchable = address.postalCode.trim().length >= 4 && address.city.trim().length > 0;
  const networksKey = networks.join(",");
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Initialisation, une fois.
  useEffect(() => {
    if (!token || !host.current || map.current) return;
    let cancelled = false;
    import("@boxtal/parcel-point-map")
      .then(({ BoxtalParcelPointMap }) => {
        if (cancelled || !host.current) return;
        const m = new BoxtalParcelPointMap({
          domToLoadMap: "#boxtal-relay-map",
          accessToken: token,
          config: {
            locale: "fr",
            parcelPointNetworks: networks.map((code) => ({ code, markerTemplate: { anchor: "bottom", color: "#111111" } })),
            options: { autoSelectNearestParcelPoint: false, primaryColor: "#111111" },
          },
          onMapLoaded: () => setReady(true),
        });
        m.onSearchParcelPointsResponse((points: ParcelPointAndDistance[]) => setCount(points.length));
        map.current = m;
        // Filet de sécurité : si l'événement de chargement ne vient pas, on lance quand même la recherche.
        setTimeout(() => setReady(true), 5000);
      })
      .catch(() => setError("La carte des points relais n'a pas pu se charger."));
    return () => {
      cancelled = true;
    };
    // networks : reconfigurés via updateConfig ci-dessous
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Changement de réseaux (autre mode relais) : reconfiguration.
  useEffect(() => {
    if (!map.current || !ready) return;
    map.current.updateConfig({
      locale: "fr",
      parcelPointNetworks: networks.map((code) => ({ code, markerTemplate: { anchor: "bottom", color: "#111111" } })),
      options: { autoSelectNearestParcelPoint: false, primaryColor: "#111111" },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networksKey, ready]);

  // Recherche dès que l'adresse est exploitable (avec un léger délai de saisie).
  useEffect(() => {
    if (!map.current || !ready || !searchable) return;
    const t = setTimeout(() => {
      map.current?.searchParcelPoints({ country: address.country, zipCode: address.postalCode.trim(), city: address.city.trim(), street: address.street?.trim() || undefined }, (p: ParcelPoint) => {
        onSelectRef.current({ code: p.code, name: p.name, street: p.location?.street ?? "", postalCode: p.location?.zipCode ?? "", city: p.location?.city ?? "", network: p.network });
      });
    }, 500);
    return () => clearTimeout(t);
  }, [ready, searchable, address.country, address.postalCode, address.city, address.street, networksKey]);

  return (
    <div className="mt-1.5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[0.8125rem] font-bold">Choisissez votre point relais</span>
        <span className="text-xs font-semibold text-subtle">
          {!searchable ? "Renseignez code postal et ville pour voir les relais" : count === null ? "Recherche…" : `${count} relais autour de ${address.postalCode} ${address.city}`}
        </span>
      </div>
      <div className="relative min-h-[360px] overflow-hidden rounded-[20px] bg-paper p-3">
        <div id="boxtal-relay-map" ref={host} className="h-[400px] w-full overflow-hidden rounded-[14px] bg-canvas [&_iframe]:h-full [&_iframe]:w-full" />
        {!token && <p className="absolute inset-3 flex items-center justify-center rounded-[14px] bg-white/80 p-6 text-center text-sm font-semibold text-muted">Carte indisponible pour le moment - écrivez-nous le relais souhaité dans la commande.</p>}
        {error && <p className="absolute inset-3 flex items-center justify-center rounded-[14px] bg-white/80 p-6 text-center text-sm font-semibold text-danger">{error}</p>}
        <span className="pointer-events-none absolute bottom-5 right-5 rounded-pill bg-white px-2.5 py-1.5 text-[0.625rem] font-bold text-subtle">Carte Boxtal</span>
      </div>
      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-tint-green px-[1.125rem] py-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-tint-green-ink">Relais sélectionné</span>
            <span className="text-sm font-bold">
              {selected.name} · {[selected.street, `${selected.postalCode} ${selected.city}`].filter(Boolean).join(", ")}
            </span>
          </div>
          <span className="whitespace-nowrap text-xs font-bold text-tint-green-ink">Colis conservé 14 jours</span>
        </div>
      ) : (
        <p className="text-xs font-semibold text-subtle">Cliquez sur un point de la carte ou de la liste pour le sélectionner.</p>
      )}
    </div>
  );
}
