import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  redirect,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../lib/auth/auth.context";
import { getRouterAuth } from "../lib/auth/auth.functions";
import type { RouterContext } from "../router";
import type { RouterAuthContext } from "../lib/auth/types";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "StayBF" },
      { name: "description", content: "StayBF is a premium accommodation booking platform for Burkina Faso." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "StayBF" },
      { property: "og:description", content: "StayBF is a premium accommodation booking platform for Burkina Faso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@StayBF" },
      { name: "twitter:title", content: "StayBF" },
      { name: "twitter:description", content: "StayBF is a premium accommodation booking platform for Burkina Faso." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a87d9a50-f2a8-40c0-9a05-72ea2235b685/id-preview-77271eb5--033aa3ee-3a5a-4127-a584-a0bbf008ca53.lovable.app-1780389377427.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a87d9a50-f2a8-40c0-9a05-72ea2235b685/id-preview-77271eb5--033aa3ee-3a5a-4127-a584-a0bbf008ca53.lovable.app-1780389377427.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap",
      },
    ],
  }),
  loader: async (): Promise<{ auth: RouterAuthContext }> => {
    // getRouterAuth is a createServerFn — it always runs server-side, even during
    // client-side navigation, so the loader always receives the current session.
    try {
      const auth = await getRouterAuth({ data: {} });
      console.log("[ROOT loader] auth =", auth ? { userId: auth.user?.id, roles: auth.roles } : null);
      return { auth };
    } catch (e) {
      console.error("[ROOT loader] erreur getRouterAuth:", e);
      return { auth: null };
    }
  },
  beforeLoad: async ({ context, location }) => {
    console.log("[ROOT beforeLoad] location =", location.pathname, "| context.auth =", context.auth ? { userId: context.auth.user?.id, roles: context.auth.roles } : null);
    const auth = context.auth;
    if (auth?.accountStatus === "suspended") {
      if (!location.pathname.startsWith("/auth/suspended")) {
        console.log("[ROOT beforeLoad] → redirect /auth/suspended (suspended)");
        throw redirect({ to: "/auth/suspended" });
      }
    }
    if (auth?.accountStatus === "deleted" || auth?.accountStatus === "deactivated") {
      if (!location.pathname.startsWith("/auth")) {
        console.log("[ROOT beforeLoad] → redirect /auth/login (deleted/deactivated)");
        throw redirect({ to: "/auth/login" });
      }
    }
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { auth } = Route.useLoaderData();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialAuth={auth}>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
