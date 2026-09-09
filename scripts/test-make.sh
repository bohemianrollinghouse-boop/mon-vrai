#!/usr/bin/env bash
# Test du webhook Make (→ Tiime) : envoie une commande de test et affiche la réponse.
#
# Usage :
#   scripts/test-make.sh            # branche « client existant » (celle du module PDF)
#   scripts/test-make.sh new        # branche « nouveau client »
#
# Lit MAKE_WEBHOOK_URL / MAKE_WEBHOOK_API_KEY depuis .env.local (aucun secret en dur).
# La commande part avec "test": true (marquée Test dans l'admin, hors chiffre d'affaires).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
URL=$(grep -E '^MAKE_WEBHOOK_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'\'' ' | tr -d '\r')
KEY=$(grep -E '^MAKE_WEBHOOK_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'\'' ' | tr -d '\r')
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "MAKE_WEBHOOK_URL / MAKE_WEBHOOK_API_KEY manquants dans $ENV_FILE"; exit 1; }

BRANCH="${1:-existing}"
TS=$(date +%s)
if [ "$BRANCH" = "new" ]; then CLIENT=""; else CLIENT='"tiime_client_id": 12973278,'; fi

PAYLOAD=$(cat <<EOF
{
  "order_id": "ord_test_makepdf_${TS}",
  "customer": {
    "firestore_id": "test-make-pdf",
    ${CLIENT}
    "email": "contact@monvrai.fr",
    "name": "Myenndine Cachard",
    "address": "161 chemin de la cabane",
    "zip": "05600",
    "city": "saint-crépin",
    "country": "FR",
    "phone": "0613709276"
  },
  "lines": [ { "description": "Les Animaux de la ferme", "quantity": 1, "unit_price": 10 } ],
  "total": 10,
  "test": true
}
EOF
)

RESP=$(mktemp)
STATUS=$(curl -sS -o "$RESP" -w "%{http_code}" -X POST "$URL" \
  -H "content-type: application/json" -H "x-make-apikey: $KEY" \
  --data-binary "$PAYLOAD" --max-time 120)
echo "HTTP $STATUS · $(wc -c < "$RESP") octets · branche: $BRANCH"
echo "--- réponse (500 premiers caractères) ---"
head -c 500 "$RESP"; echo
python3 - "$RESP" <<'PY' 2>/dev/null || true
import sys, json, base64
raw = open(sys.argv[1], "rb").read()
try:
    j = json.loads(raw)
    print("clés JSON:", list(j.keys()))
    for k in ("invoice_pdf", "invoicePdf", "pdf", "invoice_pdf_base64"):
        v = j.get(k)
        if v:
            b = v.split(",", 1)[1] if isinstance(v, str) and v.startswith("data:") and "," in v else v
            d = base64.b64decode(b, validate=False)
            print(f"{k}: b64_len={len(v)} head={d[:8]!r} vrai_pdf={d[:5] == b'%PDF-'}")
    for k in ("invoice_id", "invoice_number", "tiime_client_id"):
        if k in j:
            print(f"{k} = {j[k]}")
except Exception as e:
    print("réponse non-JSON:", e)
PY
rm -f "$RESP"
