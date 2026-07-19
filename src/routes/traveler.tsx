import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/traveler")({
  beforeLoad: ({ context }) => {
    console.log("[TRAVELER beforeLoad] context.auth =", context.auth ? { userId: context.auth.user?.id, roles: context.auth.roles } : null);
    if (!context.auth) {
      console.log("[TRAVELER beforeLoad] → redirect /auth/login (auth null)");
      throw redirect({ to: "/auth/login" });
    }
    console.log("[TRAVELER beforeLoad] → accès autorisé");
  },
  component: () => <Outlet />,
});
