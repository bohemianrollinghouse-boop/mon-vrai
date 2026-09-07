import { db } from "@/lib/firebase/admin";

/*
 * Bascule le mode de paiement (live | test) sans passer par l'admin. Usage :
 *   NODE_OPTIONS=--conditions=react-server tsx --env-file=.env.production.local scripts/set-payment-mode.ts test
 */
const mode = process.argv[2];
if (mode !== "live" && mode !== "test") {
  console.error("Usage : set-payment-mode.ts live|test");
  process.exit(1);
}
db()
  .collection("settings")
  .doc("site")
  .set({ payments: { mode }, updatedAt: Date.now() }, { merge: true })
  .then(() => {
    console.log(`Mode de paiement : ${mode}`);
    process.exit(0);
  });
