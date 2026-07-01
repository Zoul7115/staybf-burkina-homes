// =============================================================================
// src/lib/property/property.context.tsx
// React context providing a single SupabasePropertyDetail to all section
// components on the property detail page.
// =============================================================================

import { createContext, useContext } from "react";
import type { SupabasePropertyDetail } from "./types";

const PropertyContext = createContext<SupabasePropertyDetail | null>(null);

export const PropertyProvider = PropertyContext.Provider;

export function useProperty(): SupabasePropertyDetail {
  const ctx = useContext(PropertyContext);
  if (!ctx) throw new Error("useProperty must be used inside <PropertyProvider>");
  return ctx;
}
