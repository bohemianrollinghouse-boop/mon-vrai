/*
 * Le paquet @boxtal/parcel-point-map publie des types que son champ "exports" rend
 * inaccessibles. Copie fidèle de dist/types/model + wrapper (v0.0.9).
 */
declare module "@boxtal/parcel-point-map" {
  export type Anchor = "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  export interface ParcelPointNetwork {
    code: string;
    markerTemplate?: { anchor: Anchor; element?: HTMLElement | null; color?: string };
  }
  export interface MapConfig {
    locale?: "en" | "fr";
    parcelPointNetworks: ParcelPointNetwork[];
    options: { autoSelectNearestParcelPoint: boolean; primaryColor: string };
  }
  export interface MapOptions {
    debug?: boolean;
    domToLoadMap: string;
    baseUrl?: string;
    accessToken: string;
    config?: MapConfig;
    onMapLoaded?: () => void;
  }
  export interface Address {
    country: string;
    zipCode: string;
    city: string;
    street?: string;
  }
  export type Location = Address & { position: { latitude: number; longitude: number } };
  export interface OpeningDays {
    weekday: string;
    openingPeriods: { closingTime: string; openingTime: string }[];
  }
  export interface ParcelPoint {
    code: string;
    location: Location;
    name: string;
    network: string;
    openingDays: OpeningDays[];
  }
  export interface ParcelPointAndDistance {
    distanceFromSearchLocation: number;
    parcelPoint: ParcelPoint;
  }
  export class BoxtalParcelPointMap {
    constructor(opts: MapOptions);
    onSearchParcelPointsResponse(callback: (parcelPointsResponse: ParcelPointAndDistance[]) => void): void;
    searchParcelPoints(address: Address, callback: (selectedParcelPoint: ParcelPoint) => void): void;
    clearParcelPoints(): void;
    chooseParcelPoint(parcelPoint: ParcelPoint): void;
    updateConfig(config: MapConfig): void;
  }
}
