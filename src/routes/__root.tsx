import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "@/store/appStore";
import { AuthProvider } from "@/lib/auth-context";

import { Toaster } from "sonner";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "מערכת ניהול שוברי דלק | רשף ביטחון" },
      {
        name: "description",
        content: "מערכת לניהול שוברי דלק של רשף ביטחון: מלאי, הקצאות, מימושים ודוחות.",
      },
      { name: "author", content: "רשף ביטחון" },
      { property: "og:title", content: "מערכת ניהול שוברי דלק | רשף ביטחון" },
      {
        property: "og:description",
        content: "ניהול שוברי דלק, הקצאות לסניפים ומעקב מימושים.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&family=Heebo:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body dir="rtl">
        {children}
        <Scripts />
      </body>
    </html>
  );
}


// Keep this root providers-only: canvas preview routes (/__mockup,
// /__component) render inside it, so any chrome leaks into every frame.
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [storeReady, setStoreReady] = useState(false);

  useEffect(() => {
    const persistence = useAppStore.persist;
    if (!persistence) {
      setStoreReady(true);
      return;
    }
    const unsubscribe = persistence.onFinishHydration(() => setStoreReady(true));
    void Promise.resolve(persistence.rehydrate()).then(() => setStoreReady(true));
    return unsubscribe;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      {storeReady ? (
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      ) : (
        <main className="grid min-h-screen place-items-center bg-background" aria-busy="true">
          <p className="text-sm font-semibold text-muted-foreground">טוען נתונים…</p>
        </main>
      )}
      <Toaster position="top-center" dir="rtl" richColors />
    </QueryClientProvider>
  );
}
