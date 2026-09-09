import { NextResponse } from "next/server";

/*
 * Service worker de l'admin, servi à /admin/service-worker (donc scope /admin/). Trois
 * rôles : rendre l'admin installable (PWA), offrir un repli hors-ligne léger pour les
 * navigations, et afficher les notifications push (nouvelles commandes). Servi par une
 * route plutôt que depuis public/ (fichiers statiques peu fiables sur cet App Hosting).
 */

const SW = `
const CACHE = "mv-admin-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Navigations : réseau d'abord, repli sur le cache puis sur une page hors-ligne minimale.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
          return res;
        } catch (err) {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:system-ui;background:#fbf8f3;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px'><div><h1 style='font-size:20px'>Hors ligne</h1><p style='color:#666'>Reconnectez-vous pour accéder à l'administration.</p></div></body>",
            { headers: { "content-type": "text/html; charset=utf-8" }, status: 503 },
          );
        }
      })(),
    );
  }
});

// Notification push (nouvelle commande…).
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || "Mon Vrai";
  const options = {
    body: data.body || "",
    icon: "/admin/app-icon/192",
    badge: "/admin/app-icon/192",
    tag: data.tag || undefined,
    data: { url: data.url || "/admin/commandes" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes("/admin") && "focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
`;

export function GET() {
  return new NextResponse(SW, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
      "Service-Worker-Allowed": "/admin/",
    },
  });
}
