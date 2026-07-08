// Admin domain — shared types

export type ChartPoint = { label: string; value: number };

export type AdminDashboardStats = {
  totalRevenueFcfa: number;
  totalHosts: number;
  totalTravelers: number;
  totalProperties: number;
  totalBookings: number;
  activeSubscriptions: number;
  pendingVerifications: number;
  systemAlerts: number;
};

export type AdminDashboardData = {
  stats: AdminDashboardStats;
  revenueChart: ChartPoint[];
  bookingsChart: ChartPoint[];
  growthChart: ChartPoint[];
  recentBookings: AdminBookingRow[];
  pendingHosts: AdminHostRow[];
};

export type AdminHostRow = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  city: string | null;
  companyName: string | null;
  status: string;
  verifiedAt: string | null;
  superhost: boolean;
  propertiesCount: number;
  accountStatus: string;
  hostSince: string | null;
  createdAt: string;
};

export type AdminTravelerRow = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  accountStatus: string;
  createdAt: string;
  bookingsCount: number;
  totalSpentFcfa: number;
  reviewsCount: number;
};

export type AdminPropertyRow = {
  id: string;
  name: string;
  status: string;
  propertyType: string | null;
  cityName: string | null;
  hostName: string | null;
  roomsCount: number;
  createdAt: string;
};

export type AdminBookingRow = {
  id: string;
  reference: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  currency: string;
  paymentStatus: string | null;
  capturedPaymentId: string | null;
  travelerName: string | null;
  hostName: string | null;
  propertyName: string | null;
  roomName: string | null;
  createdAt: string;
};

export type AdminPaymentRow = {
  id: string;
  bookingReference: string | null;
  payerName: string | null;
  method: string | null;
  amountFcfa: number;
  currency: string;
  status: string;
  createdAt: string;
  capturedAt: string | null;
};

export type AdminReviewRow = {
  id: string;
  status: string;
  overallRating: number;
  body: string | null;
  reviewerName: string | null;
  propertyName: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type AdminTicketRow = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  updatedAt: string;
  createdAt: string;
};

export type AdminSubscriptionRow = {
  id: string;
  hostName: string | null;
  planName: string | null;
  planPriceFcfa: number;
  status: string;
  startedAt: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
};

export type AdminAuditLogRow = {
  id: string;
  actorName: string | null;
  actorEmail: string | null;
  actionType: string;
  targetTable: string | null;
  targetId: string | null;
  notes: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export type AdminRoleCount = {
  role: string;
  usersCount: number;
};

export type AdminCityRow = {
  id: string;
  name: string;
  isActive: boolean;
  propertiesCount: number;
  bookingsCount: number;
  totalRevenueFcfa: number;
};
