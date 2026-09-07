import "server-only";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage, type Storage } from "firebase-admin/storage";

/*
 * SDK Admin, côté serveur uniquement (`server-only` fait échouer tout import
 * accidentel depuis un composant client).
 *
 * Pas d'identifiants dans le code : en local, les variables *_EMULATOR_HOST
 * suffisent au SDK pour viser les émulateurs ; en production, App Hosting fournit
 * les identifiants par défaut de l'application. Le même fichier sert aux deux.
 */

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "mon-vrai-dev";
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp({ projectId, storageBucket });
}

// En développement, Next ré-évalue ce module à chaque rechargement à chaud alors que
// l'instance Firestore, elle, survit : la mémoriser sur `globalThis` évite de rappeler
// `settings()` sur un client déjà utilisé, ce que le SDK refuse.
const shared = globalThis as typeof globalThis & { __monVraiFirestore?: Firestore };

export function db(): Firestore {
  if (!shared.__monVraiFirestore) {
    const firestore = getFirestore(app());
    try {
      // `undefined` dans un objet à écrire est presque toujours un oubli : on l'ignore
      // au lieu de faire échouer l'écriture entière.
      firestore.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Déjà configuré par une évaluation précédente : rien à faire.
    }
    shared.__monVraiFirestore = firestore;
  }
  return shared.__monVraiFirestore;
}

export function adminAuth(): Auth {
  return getAuth(app());
}

export function storage(): Storage {
  return getStorage(app());
}

export const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
