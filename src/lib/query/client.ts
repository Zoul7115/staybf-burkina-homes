import { QueryClient } from "@tanstack/react-query";

/**
 * Factory — called once per request (SSR) or once on the client.
 * Centralises all default options so every query in the app inherits them.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,          // 1 minute: data is fresh, won't refetch
        gcTime: 5 * 60_000,         // 5 minutes: keep in cache after unmount
        retry: 1,                   // one automatic retry on error
        refetchOnWindowFocus: false, // no surprise refetch on tab switch
        refetchOnReconnect: true,
      },
    },
  });
}
