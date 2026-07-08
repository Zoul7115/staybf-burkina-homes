import type { SearchFilters } from "@/lib/search/types";

/**
 * Centralised query-key registry.
 * Every key is a typed tuple — never a bare string.
 * Hierarchy:  [domain, entity, ...params]
 */
export const queryKeys = {
  // ── Host ──────────────────────────────────────────────────────
  hostDashboard: ()                                  => ["host", "dashboard"]                   as const,
  hostProperties: ()                                 => ["host", "properties"]                  as const,
  hostPropertyDetail: (id: string)                   => ["host", "property", id]                as const,
  hostProfile: ()                                    => ["host", "profile"]                     as const,
  hostNotifications: ()                              => ["host", "notifications"]                as const,
  hostBookings: ()                                   => ["host", "bookings"]                    as const,
  hostThreads: ()                                    => ["host", "threads"]                     as const,
  hostMessages: (threadId: string)                   => ["host", "messages", threadId]          as const,
  hostRevenue: ()                                    => ["host", "revenue"]                     as const,
  hostReviews: ()                                    => ["host", "reviews"]                     as const,
  hostCalendar: (roomId: string, year: number, month: number) =>
                                                        ["host", "calendar", roomId, year, month] as const,
  hostRooms: ()                                      => ["host", "rooms"]                       as const,
  hostPropertyIds: (hostId: string)                  => ["host", "propertyIds", hostId]         as const,

  // ── Traveler ──────────────────────────────────────────────────
  travelerProfile: ()                                => ["traveler", "profile"]                 as const,
  travelerThreads: ()                                => ["traveler", "threads"]                 as const,
  travelerMessages: (threadId: string)               => ["traveler", "messages", threadId]      as const,
  travelerDashboardBookings: ()                      => ["traveler", "dashboard", "bookings"]   as const,
  travelerNotifications: ()                          => ["traveler", "notifications"]            as const,
  travelerStats: ()                                  => ["traveler", "stats"]                   as const,
  travelerBookings: ()                               => ["traveler", "bookings"]                as const,
  travelerFavorites: ()                              => ["traveler", "favorites"]               as const,

  // ── Search ────────────────────────────────────────────────────
  search: (filters: SearchFilters)                   => ["search", filters]                     as const,

  // ── Property ─────────────────────────────────────────────────
  propertyDetail: (id: string)                       => ["property", id]                        as const,

  // ── Booking ───────────────────────────────────────────────────
  bookingPrice: (roomId: string, checkIn: string, checkOut: string) =>
                                                        ["booking", "price", roomId, checkIn, checkOut] as const,

  // ── Wallet ────────────────────────────────────────────────────
  hostWallet: (hostId: string)                         => ["wallet", "host", hostId]               as const,
  hostFinancialDashboard: (hostId: string)             => ["wallet", "host", hostId, "dashboard"]  as const,
  hostPaymentTransactions: (hostId: string)            => ["wallet", "payments", hostId]           as const,
  hostRefundTransactions: (hostId: string)             => ["wallet", "refunds", hostId]            as const,
  hostWithdrawals: (hostId: string)                    => ["wallet", "withdrawals", hostId]        as const,
  adminWallet: ()                                      => ["wallet", "platform"]                   as const,
  adminFinancialDashboard: ()                          => ["wallet", "admin", "dashboard"]         as const,

  // ── Admin ─────────────────────────────────────────────────────
  adminDashboard: ()                                 => ["admin", "dashboard"]                  as const,
  adminHosts: ()                                     => ["admin", "hosts"]                      as const,
  adminTravelers: ()                                 => ["admin", "travelers"]                  as const,
  adminProperties: ()                                => ["admin", "properties"]                 as const,
  adminReservations: ()                              => ["admin", "reservations"]               as const,
  adminPayments: ()                                  => ["admin", "payments"]                   as const,
  adminReviews: ()                                   => ["admin", "reviews"]                    as const,
  adminSupport: ()                                   => ["admin", "support"]                    as const,
  adminRevenue: ()                                   => ["admin", "revenue"]                    as const,
  adminSubscriptions: ()                             => ["admin", "subscriptions"]              as const,
  adminCities: ()                                    => ["admin", "cities"]                     as const,
  adminRoles: ()                                     => ["admin", "roles"]                      as const,
  adminNotifications: ()                             => ["admin", "notifications"]               as const,
  adminProfile: ()                                   => ["admin", "profile"]                    as const,
  adminSettings: ()                                  => ["admin", "settings"]                   as const,
} as const;
