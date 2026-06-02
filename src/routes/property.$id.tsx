import { createFileRoute, Navigate, useParams } from "@tanstack/react-router";

export const Route = createFileRoute("/property/$id")({
  component: LegacyRedirect,
});

function LegacyRedirect() {
  const { id } = useParams({ from: "/property/$id" });
  return <Navigate to="/properties/$id" params={{ id }} replace />;
}
