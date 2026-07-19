import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { RouterAuthContext } from "./lib/auth/types";
import { createQueryClient } from "./lib/query/client";

export interface RouterContext {
  queryClient: QueryClient;
  auth: RouterAuthContext;
}

export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient, auth: null },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
