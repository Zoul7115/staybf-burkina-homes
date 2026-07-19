// ============================================================
// Host domain — canonical TypeScript types
// All shapes mirror the real Supabase schema (migrations 0001–0007).
// ============================================================

// ── Enums (from migrations) ──────────────────────────────────

export type HostStatus =
  | "draft"
  | "pending_review"
  | "verified"
  | "rejected"
  | "suspended";

export type PropertyStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "published"
  | "rejected"
  | "suspended"
  | "archived";

export type RoomStatus = "draft" | "active" | "paused" | "archived";

export type BookingStatus =
  | "pending_payment"
  | "payment_processing"
  | "awaiting_host"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled_by_traveler"
  | "cancelled_by_host"
  | "cancelled_by_system"
  | "no_show"
  | "disputed";

export type PayoutStatus =
  | "pending"
  | "approved"
  | "scheduled"
  | "on_hold"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled"
  | "reversed";

export type PayoutMethod = "orange_money" | "moov_money" | "bank";

export type PaymentMethod =
  | "orange_money"
  | "moov_money"
  | "visa"
  | "mastercard"
  | "wallet_credit";

export type PaymentStatus =
  | "initiated"
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refund_pending"
  | "refunded"
  | "partially_refunded"
  | "chargeback";

export type NotificationType =
  | "booking_requested"
  | "booking_confirmed"
  | "booking_cancelled_by_traveler"
  | "booking_cancelled_by_host"
  | "booking_cancelled_by_system"
  | "booking_checked_in"
  | "booking_completed"
  | "payment_succeeded"
  | "payment_failed"
  | "payout_initiated"
  | "payout_completed"
  | "payout_failed"
  | "review_submitted"
  | "review_published"
  | "review_flagged"
  | "message_received"
  | "kyc_approved"
  | "kyc_rejected"
  | "subscription_expiring"
  | "subscription_expired"
  | "support_ticket_updated"
  | "host_penalty_applied"
  | "account_suspended"
  | "account_reinstated";

// ── Entity types ─────────────────────────────────────────────

export type HostProfile = {
  id: string;
  company_name: string | null;
  legal_form: string | null;
  bio: string | null;
  superhost: boolean;
  response_rate: number | null;
  response_time_minutes: number | null;
  host_since: string | null;
  payout_method: PayoutMethod | null;
  status: HostStatus;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HostProfileWithUser = HostProfile & {
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  locale: string;
  country: string;
};

export type HostProperty = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  description_md: string | null;
  status: PropertyStatus;
  instant_book: boolean;
  rating_avg: number | null;
  rating_count: number;
  min_price_fcfa: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  city_name: string | null;
  cover_image_url: string | null;
  amenity_labels: string[];
};

export type HostRoom = {
  id: string;
  property_id: string;
  name: string;
  type: string;
  max_guests: number;
  base_price_fcfa: number;
  status: RoomStatus;
  instant_book: boolean;
  created_at: string;
  updated_at: string;
};

export type HostBooking = {
  id: string;
  reference: string;
  traveler_id: string;
  property_id: string;
  room_id: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests_adults: number;
  guests_children: number;
  guests_infants: number;
  status: BookingStatus;
  accommodation_amount: number;
  total_amount: number;
  host_payout_amount: number;
  payout_status: PayoutStatus;
  confirmed_at: string | null;
  checked_in_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  traveler_name: string | null;
  traveler_avatar_url: string | null;
  room_name: string | null;
  property_name: string | null;
};

export type HostNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string | null;
  body: string | null;
  is_read: boolean;
  read_at: string | null;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
};

export type HostPayment = {
  id: string;
  booking_id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount_fcfa: number;
  captured_at: string | null;
  created_at: string;
  // Joined
  booking_reference: string | null;
  traveler_name: string | null;
};

export type HostPayout = {
  id: string;
  host_id: string;
  status: PayoutStatus;
  amount_fcfa: number;
  method: PayoutMethod;
  period_start: string;
  period_end: string;
  scheduled_for: string | null;
  paid_at: string | null;
  created_at: string;
};

export type HostRevenueData = {
  totalPaidFcfa: number;
  monthlyRevenueFcfa: number;
  yearlyProjectedFcfa: number;
  nextPayoutAmountFcfa: number | null;
  nextPayoutDate: string | null;
  revenueChart: { label: string; value: number }[];
  transactions: HostPayment[];
  payouts: HostPayout[];
};

export type PropertyImage = {
  id: string;
  storage_path: string;
  alt: string | null;
  position: number;
  is_cover: boolean;
};

export type PropertyAmenity = {
  id: string;
  key: string;
  label_fr: string;
};

export type CancellationPolicy = "flexible" | "moderate" | "strict" | "non_refundable";

export type RoomType = "single" | "double" | "twin" | "suite" | "family" | "studio" | "apartment";

export type BedEntry = { type: string; count: number };

export type RoomImage = {
  id: string;
  storage_path: string;
  alt: string | null;
  position: number;
  is_cover: boolean;
};

export type HostRoomDetail = {
  id: string;
  property_id: string;
  name: string;
  type: RoomType;
  max_guests: number;
  beds: BedEntry[];
  base_price_fcfa: number;
  status: RoomStatus;
  instant_book: boolean;
  created_at: string;
  updated_at: string;
  images: RoomImage[];
  booking_count: number;
  open_nights_next_30: number;
};

export type HostPropertyDetail = {
  id: string;
  slug: string | null;
  name: string;
  type: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  description_md: string | null;
  status: PropertyStatus;
  instant_book: boolean;
  cancellation_policy: CancellationPolicy | null;
  check_in_from: string | null;
  check_out_until: string | null;
  house_rules: Record<string, unknown> | null;
  rating_avg: number | null;
  rating_count: number;
  min_price_fcfa: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  city_name: string | null;
  images: PropertyImage[];
  amenities: PropertyAmenity[];
  room_count: number;
  booking_count: number;
};

// ── Calendar ─────────────────────────────────────────────────

export type AvailabilityStatus = "open" | "booked" | "blocked";

export type CalendarDay = {
  date: string;
  status: AvailabilityStatus;
  bookingId: string | null;
  bookingReference: string | null;
  bookingCheckIn: string | null;
  bookingCheckOut: string | null;
  priceOverride: number | null;
};

export type RoomAvailabilityData = {
  days: Record<string, CalendarDay>;
  bookedCount: number;
  blockedCount: number;
  openCount: number;
};

// ── Messages ─────────────────────────────────────────────────

export type HostThread = {
  id: string;
  travelerId: string;
  roomId: string;
  bookingId: string | null;
  subject: string | null;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  lastMessageSenderId: string | null;
  hostUnreadCount: number;
  isFrozen: boolean;
  travelerName: string | null;
  travelerAvatarUrl: string | null;
  roomName: string | null;
  propertyName: string | null;
};

export type HostMessage = {
  id: string;
  threadId: string;
  senderId: string | null;
  body: string | null;
  isRead: boolean;
  isSystemMessage: boolean;
  createdAt: string;
};

// ── Reviews ──────────────────────────────────────────────────

export type HostReviewReply = {
  id: string;
  body: string;
  createdAt: string;
};

export type HostReview = {
  id: string;
  bookingId: string;
  reviewerName: string | null;
  reviewerAvatarUrl: string | null;
  overallRating: number;
  cleanlinessRating: number | null;
  accuracyRating: number | null;
  locationRating: number | null;
  valueRating: number | null;
  communicationRating: number | null;
  body: string;
  publishedAt: string | null;
  createdAt: string;
  roomName: string | null;
  propertyName: string | null;
  reply: HostReviewReply | null;
};

export type HostReviewsData = {
  reviews: HostReview[];
  avgRating: number | null;
  totalCount: number;
  fiveStarPct: number | null;
  distribution: { stars: number; count: number; pct: number }[];
};

// ── Bookings list ─────────────────────────────────────────────

export type HostBookingItem = {
  id: string;
  reference: string;
  status: BookingStatus;
  check_in: string;
  check_out: string;
  nights: number;
  guests_adults: number;
  guests_children: number;
  guests_infants: number;
  total_amount: number;
  currency: string;
  instant_book: boolean;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  traveler_name: string | null;
  traveler_avatar_url: string | null;
  room_name: string | null;
  property_name: string | null;
  payment_method: PaymentMethod | null;
};

// ── Dashboard aggregates ──────────────────────────────────────

export type DashboardStats = {
  monthlyRevenueFcfa: number;
  totalBookingsThisMonth: number;
  pendingBookings: number;
  avgRating: number | null;
  totalReviews: number;
};

export type RevenueChartPoint = {
  label: string;
  value: number;
};

export type DashboardCheckIn = {
  bookingId: string;
  reference: string;
  travelerName: string | null;
  roomName: string | null;
  checkIn: string;
  guestsAdults: number;
  status: BookingStatus;
};

export type DashboardReview = {
  id: string;
  reviewerName: string | null;
  reviewerAvatarUrl: string | null;
  overallRating: number;
  body: string;
  createdAt: string;
};

export type DashboardMessage = {
  threadId: string;
  travelerName: string | null;
  travelerAvatarUrl: string | null;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  hostUnreadCount: number;
};

export type HostDashboardData = {
  stats: DashboardStats;
  upcomingCheckIns: DashboardCheckIn[];
  upcomingCheckOuts: DashboardCheckIn[];
  recentReviews: DashboardReview[];
  recentMessages: DashboardMessage[];
};
