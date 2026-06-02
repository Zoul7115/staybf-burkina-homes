import { properties } from "./staybf-property-data";

export type BookingStatus = "confirmed" | "upcoming" | "completed" | "cancelled";

export type TravelerBooking = {
  id: string;
  ref: string;
  propertyId: string;
  from: string;
  to: string;
  nights: number;
  guests: number;
  total: number;
  status: BookingStatus;
  method: string;
  reviewed?: boolean;
};

const iso = (offset: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const traveler = {
  firstName: "Abdoul",
  lastName: "Ouédraogo",
  email: "abdoul.ouedraogo@email.bf",
  phone: "+226 70 12 34 56",
  country: "Burkina Faso",
  language: "Français",
  avatar: "AO",
  joined: "Mars 2024",
};

export const upcomingBookings: TravelerBooking[] = [
  {
    id: "b1", ref: "STBF-2026-45872", propertyId: "1",
    from: iso(7), to: iso(11), nights: 4, guests: 2,
    total: 343200, status: "upcoming", method: "Orange Money",
  },
  {
    id: "b2", ref: "STBF-2026-45901", propertyId: "4",
    from: iso(22), to: iso(25), nights: 3, guests: 3,
    total: 313500, status: "confirmed", method: "Visa",
  },
];

export const pastBookings: TravelerBooking[] = [
  {
    id: "b3", ref: "STBF-2025-39120", propertyId: "3",
    from: iso(-45), to: iso(-42), nights: 3, guests: 2,
    total: 92400, status: "completed", method: "Moov Money", reviewed: true,
  },
  {
    id: "b4", ref: "STBF-2025-37882", propertyId: "5",
    from: iso(-90), to: iso(-87), nights: 3, guests: 4,
    total: 214500, status: "completed", method: "Orange Money", reviewed: false,
  },
  {
    id: "b5", ref: "STBF-2025-36210", propertyId: "12",
    from: iso(-150), to: iso(-148), nights: 2, guests: 2,
    total: 242000, status: "completed", method: "Mastercard", reviewed: true,
  },
];

export const favorites = ["2", "6", "9", "11", "15"];

export const conversations = [
  {
    id: "c1", hostId: "1", hostName: "Awa Sankara", hostInitials: "AS",
    lastMessage: "Bonjour Abdoul, votre arrivée est bien prévue à 15h ?",
    time: "10:42", unread: 2,
    messages: [
      { from: "host", text: "Bonjour Abdoul, merci pour votre réservation 🙏", time: "Hier 18:20" },
      { from: "me", text: "Bonjour Awa, merci à vous. Tout est prêt pour mon arrivée ?", time: "Hier 19:05" },
      { from: "host", text: "Oui absolument. La suite est prête, climatisation testée.", time: "10:30" },
      { from: "host", text: "Bonjour Abdoul, votre arrivée est bien prévue à 15h ?", time: "10:42" },
    ],
  },
  {
    id: "c2", hostId: "4", hostName: "Hôtel Palmiers", hostInitials: "HP",
    lastMessage: "Nous vous proposons un surclassement gratuit ✨",
    time: "Hier", unread: 1,
    messages: [
      { from: "host", text: "Bienvenue chez Hôtel Palmiers !", time: "Lun 09:00" },
      { from: "host", text: "Nous vous proposons un surclassement gratuit ✨", time: "Hier 14:00" },
    ],
  },
  {
    id: "c3", hostId: "3", hostName: "Mariam Ouédraogo", hostInitials: "MO",
    lastMessage: "Au plaisir de vous revoir à Bobo !",
    time: "12 mai", unread: 0,
    messages: [
      { from: "host", text: "Merci pour votre séjour Abdoul 🌿", time: "12 mai" },
      { from: "host", text: "Au plaisir de vous revoir à Bobo !", time: "12 mai" },
    ],
  },
];

export const notifications = [
  { id: "n1", type: "booking", title: "Réservation confirmée", text: "STBF-2026-45872 · Suite Executive Laongo", time: "il y a 2h", unread: true },
  { id: "n2", type: "stay", title: "Séjour à venir dans 7 jours", text: "Préparez votre arrivée à Ouagadougou", time: "il y a 5h", unread: true },
  { id: "n3", type: "message", title: "Nouveau message d'Awa Sankara", text: "Votre arrivée est bien prévue à 15h ?", time: "il y a 1j", unread: true },
  { id: "n4", type: "promo", title: "-15% sur Bobo-Dioulasso", text: "Offre valable jusqu'au 30 juin", time: "il y a 3j", unread: false },
];

export const stats = {
  active: upcomingBookings.length,
  completed: pastBookings.length,
  favorites: favorites.length,
  reviews: pastBookings.filter((b) => b.reviewed).length,
};

export function getBookingProperty(b: TravelerBooking) {
  return properties.find((p) => p.id === b.propertyId) ?? properties[0];
}
