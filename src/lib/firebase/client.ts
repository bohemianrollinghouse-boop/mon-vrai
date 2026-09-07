"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

/*
 * SDK navigateur, réduit au strict nécessaire : l'authentification. Les données
 * ne sont jamais lues depuis le navigateur — tout passe par le serveur, qui
 * applique les règles métier et évite d'exposer la structure de la base.
 *
 * Avec l'émulateur, la clé d'API n'est pas vérifiée : une valeur factice suffit.
 */

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";

function app(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-api-key",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "mon-vrai-dev",
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
