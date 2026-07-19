import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/traveler")({
  beforeLoad: ({ context }) => {
    if (!context.auth) throw redirect({ to: "/auth/login" });
  },
  component: () => <Outlet />,
});
