// =============================================================================
// src/lib/traveler/types.ts
// Centralized TypeScript types for the Traveler domain (Supabase-backed).
// =============================================================================

export type TravelerProfile = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  language: string | null;
  avatarUrl: string | null;
  initials: string;
  joinedLabel: string; // e.g. "Mars 2024"
};

export type TravelerStats = {
  active: number;
  completed: number;
  favorites: number;
  reviews: number;
};

export type DashboardBooking = {
  id: string;
  reference: string;
  propertyId: string;
  propertyName: string;
  cityName: string | null;
  coverImageUrl: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  status: string;
};

export type TravelerNotification = {
  id: string;
  type: "booking" | "stay" | "message" | "promo" | "review";
  title: string;
  text: string;
  timeLabel: string;
  unread: boolean;
};

export type MessageItem = {
  id: string;
  senderId: string;
  isFromMe: boolean;
  body: string;
  createdAt: string; // ISO
  timeLabel: string; // display-formatted
};

export type ConversationThread = {
  id: string;
  hostId: string;
  hostName: string;
  hostInitials: string;
  hostAvatarUrl: string | null;
  propertyName: string | null;
  lastMessageBody: string | null;
  lastMessageLabel: string;
  unreadCount: number;
};
