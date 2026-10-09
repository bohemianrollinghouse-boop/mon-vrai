"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

/*
 * SDK navigateur, réduit au strict nécessaire : l'authentification, et le dépôt des
 * contenus de partenaires. Les données ne sont jamais LUES depuis le navigateur — tout
 * passe par le serveur, qui applique les règles métier et évite d'exposer la structure
 * de la base.
 *
 * Avec l'émulateur, la clé d'API n'est pas vérifiée : une valeur factice suffit.
 */

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";

function app(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  // `||` et non `??` : une variable d'environnement absente arrive en chaîne vide,
  // pas en undefined. Avec `??`, la clé restait vide et getAuth() levait
  // « auth/invalid-api-key » avant même de joindre l'émulateur.
  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || undefined,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mon-vrai-dev",
  });
}

let auth: Auth | undefined;

export function clientAuth(): Auth {
  if (!auth) {
    auth = getAuth(app());
    if (useEmulators) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    }
  }
  return auth;
}

let bucket: FirebaseStorage | undefined;

/*
 * Le coffre, côté navigateur. Seule exception à « le navigateur n'écrit jamais » — et
 * elle est délibérée : une vidéo de partenaire dépasse ce qu'une action serveur accepte
 * (45 Mo) et ce que l'instance peut tenir en mémoire. Elle part donc directement au
 * coffre, où storage.rules n'ouvre `ugc/` qu'à un administrateur connecté, et où rien
 * n'est inscrit en base avant que le serveur ait relu l'objet arrivé.
 *
 * `clientAuth()` d'abord, et pas par hasard : c'est lui qui installe l'authentification
 * sur l'application Firebase, d'où le SDK du coffre tire le jeton que les règles
 * attendent.
 */
export function clientStorage(name: string): FirebaseStorage {
  if (!bucket) {
    clientAuth();
    bucket = getStorage(app(), `gs://${name}`);
    if (useEmulators) connectStorageEmulator(bucket, "127.0.0.1", 9199);
  }
  return bucket;
}
