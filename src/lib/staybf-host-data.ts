export const host = {
  name: "Awa Sankara",
  email: "awa.sankara@staybf.com",
  phone: "+226 70 88 12 45",
  avatar: "AS",
  company: "Résidence Laongo SARL",
  superhost: true,
  since: "Janvier 2023",
};

export const hostProperty = {
  id: "1",
  name: "Villa Kaboré",
  city: "Ouagadougou",
  neighborhood: "Ouaga 2000",
  rating: 4.8,
  description: {
    overview: "Magnifique villa contemporaine au cœur de Ouaga 2000. Idéale pour les voyages d'affaires et les séjours en famille, elle offre tout le confort nécessaire dans un cadre sécurisé et verdoyant.",
  },
  amenities: [
    { key: "wifi", label: "Wi-Fi haut débit" },
    { key: "ac", label: "Climatisation" },
    { key: "parking", label: "Parking sécurisé" },
    { key: "security", label: "Sécurité 24h/24" },
    { key: "generator", label: "Groupe électrogène" },
    { key: "pool", label: "Piscine" },
  ],
  images: [
    "https://placehold.co/800x500?text=StayBF",
    "https://placehold.co/800x500?text=StayBF",
    "https://placehold.co/800x500?text=StayBF",
    "https://placehold.co/800x500?text=StayBF",
  ],
};

export const hostStats = {
  monthlyRevenue: 4_287_500,
  occupancy: 78,
  bookings: 42,
  views: 3_812,
  pendingRequests: 5,
  rating: 4.91,
  reviews: 187,
};

const day = (label: string, value: number) => ({ label, value });

export const revenueChart = [
  day("Jan", 1850), day("Fév", 2100), day("Mar", 2680), day("Avr", 3120),
  day("Mai", 2890), day("Juin", 3540), day("Juil", 4287),
];

export const occupancyChart = [
  day("S1", 62), day("S2", 71), day("S3", 78), day("S4", 84),
  day("S5", 76), day("S6", 81), day("S7", 89),
];

export const upcomingCheckIns = [
  { id: "ci1", guest: "Issa Traoré", room: "Suite Executive", date: "Demain", guests: 2, ref: "STBF-45872" },
  { id: "ci2", guest: "Mariam Compaoré", room: "Chambre Deluxe", date: "12 Juin", guests: 3, ref: "STBF-45901" },
  { id: "ci3", guest: "Karim Zongo", room: "Suite Présidentielle", date: "14 Juin", guests: 2, ref: "STBF-46012" },
];

export const upcomingCheckOuts = [
  { id: "co1", guest: "Fatim Diallo", room: "Suite Junior", date: "Aujourd'hui", ref: "STBF-45720" },
  { id: "co2", guest: "Boubacar Sanou", room: "Chambre Standard", date: "Demain", ref: "STBF-45810" },
];

export const recentReviews = [
  { id: "r1", name: "Salif Ouattara", rating: 5, text: "Service exceptionnel, vue magnifique sur Ouagadougou.", date: "il y a 2j", avatar: "SO" },
  { id: "r2", name: "Aïcha Diabaté", rating: 5, text: "Une expérience cinq étoiles, le personnel est aux petits soins.", date: "il y a 4j", avatar: "AD" },
  { id: "r3", name: "Yann Kaboré", rating: 4, text: "Très bel endroit, petit déjeuner à améliorer.", date: "il y a 1sem", avatar: "YK" },
];

export const recentMessages = [
  { id: "m1", name: "Issa Traoré", avatar: "IT", preview: "Pouvez-vous prévoir un transfert aéroport ?", time: "10:42", unread: true },
  { id: "m2", name: "Mariam Compaoré", avatar: "MC", preview: "Merci pour les informations, à très vite.", time: "Hier", unread: false },
  { id: "m3", name: "Karim Zongo", avatar: "KZ", preview: "Notre arrivée sera vers 17h.", time: "Hier", unread: true },
];

export type HostRoom = {
  id: string; name: string; type: string; capacity: number; price: number;
  available: number; total: number; status: "active" | "draft" | "suspended";
};

export const hostRooms: HostRoom[] = [
  { id: "rm1", name: "Suite Executive Laongo", type: "Suite", capacity: 2, price: 85_000, available: 2, total: 3, status: "active" },
  { id: "rm2", name: "Chambre Deluxe Vue Jardin", type: "Deluxe", capacity: 3, price: 52_000, available: 4, total: 5, status: "active" },
  { id: "rm3", name: "Suite Présidentielle", type: "Premium", capacity: 4, price: 145_000, available: 1, total: 1, status: "active" },
  { id: "rm4", name: "Chambre Standard", type: "Standard", capacity: 2, price: 35_000, available: 0, total: 6, status: "active" },
  { id: "rm5", name: "Bungalow Famille", type: "Famille", capacity: 5, price: 95_000, available: 2, total: 2, status: "draft" },
];

export type HostReservation = {
  id: string; ref: string; guest: string; avatar: string;
  room: string; from: string; to: string; nights: number;
  guests: number; total: number; status: "pending" | "confirmed" | "completed" | "cancelled";
};

const iso = (offset: number) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const hostReservations: HostReservation[] = [
  { id: "h1", ref: "STBF-46210", guest: "Issa Traoré", avatar: "IT", room: "Suite Executive", from: iso(1), to: iso(5), nights: 4, guests: 2, total: 343_200, status: "pending" },
  { id: "h2", ref: "STBF-46201", guest: "Marie Kaboré", avatar: "MK", room: "Suite Junior", from: iso(3), to: iso(6), nights: 3, guests: 2, total: 198_000, status: "pending" },
  { id: "h3", ref: "STBF-45901", guest: "Mariam Compaoré", avatar: "MC", room: "Chambre Deluxe", from: iso(10), to: iso(13), nights: 3, guests: 3, total: 167_200, status: "confirmed" },
  { id: "h4", ref: "STBF-46012", guest: "Karim Zongo", avatar: "KZ", room: "Suite Présidentielle", from: iso(12), to: iso(15), nights: 3, guests: 2, total: 478_500, status: "confirmed" },
  { id: "h5", ref: "STBF-44120", guest: "Salif Ouattara", avatar: "SO", room: "Suite Executive", from: iso(-15), to: iso(-12), nights: 3, guests: 2, total: 257_400, status: "completed" },
  { id: "h6", ref: "STBF-43990", guest: "Aïcha Diabaté", avatar: "AD", room: "Suite Junior", from: iso(-25), to: iso(-22), nights: 3, guests: 1, total: 198_000, status: "completed" },
  { id: "h7", ref: "STBF-43210", guest: "Yann Kaboré", avatar: "YK", room: "Chambre Standard", from: iso(-40), to: iso(-37), nights: 3, guests: 2, total: 121_000, status: "cancelled" },
];

export type HostTransaction = {
  id: string; date: string; ref: string; guest: string; amount: number;
  method: "Orange Money" | "Moov Money" | "Visa" | "Mastercard";
  status: "paid" | "pending" | "refunded";
};

export const hostTransactions: HostTransaction[] = [
  { id: "t1", date: iso(-1), ref: "PAY-78421", guest: "Issa Traoré", amount: 343_200, method: "Orange Money", status: "paid" },
  { id: "t2", date: iso(-3), ref: "PAY-78320", guest: "Marie Kaboré", amount: 198_000, method: "Moov Money", status: "paid" },
  { id: "t3", date: iso(-5), ref: "PAY-78201", guest: "Karim Zongo", amount: 478_500, method: "Visa", status: "paid" },
  { id: "t4", date: iso(-8), ref: "PAY-77980", guest: "Salif Ouattara", amount: 257_400, method: "Orange Money", status: "paid" },
  { id: "t5", date: iso(-15), ref: "PAY-77621", guest: "Aïcha Diabaté", amount: 198_000, method: "Mastercard", status: "refunded" },
  { id: "t6", date: iso(-20), ref: "PAY-77410", guest: "Yann Kaboré", amount: 121_000, method: "Moov Money", status: "paid" },
];

export const hostPayouts = [
  { id: "po1", date: "01 Juin 2026", amount: 3_842_000, method: "Orange Money Business", status: "paid" as const },
  { id: "po2", date: "01 Mai 2026", amount: 3_120_500, method: "Orange Money Business", status: "paid" as const },
  { id: "po3", date: "01 Avr 2026", amount: 2_890_200, method: "Virement bancaire", status: "paid" as const },
  { id: "po4", date: "01 Mar 2026", amount: 2_680_750, method: "Virement bancaire", status: "paid" as const },
];

export const subscriptionPlans = [
  { id: "free", name: "Découverte", price: 0, period: "Gratuit", features: ["1 hébergement", "5 chambres max", "Support communautaire", "Commission 15%"], cta: "Plan actuel", current: false },
  { id: "monthly", name: "Croissance", price: 25_000, period: "/mois", features: ["3 hébergements", "Chambres illimitées", "Support prioritaire", "Commission 10%", "Calendrier multi-canal"], cta: "Choisir", current: true, popular: true },
  { id: "annual", name: "Pro", price: 240_000, period: "/an", features: ["10 hébergements", "Chambres illimitées", "Support 24/7", "Commission 8%", "Analytics avancés", "API d'intégration"], cta: "Économiser 20%", current: false },
  { id: "premium", name: "Entreprise", price: 0, period: "Sur devis", features: ["Hébergements illimités", "Manager dédié", "Commission 5%", "SLA garanti", "Multi-comptes équipe"], cta: "Contacter", current: false },
];

export const hostInvoices = [
  { id: "inv1", date: "01 Juin 2026", number: "INV-2026-0612", plan: "Croissance", amount: 25_000, status: "paid" as const },
  { id: "inv2", date: "01 Mai 2026", number: "INV-2026-0511", plan: "Croissance", amount: 25_000, status: "paid" as const },
  { id: "inv3", date: "01 Avr 2026", number: "INV-2026-0410", plan: "Croissance", amount: 25_000, status: "paid" as const },
];

export const hostConversations = [
  { id: "c1", guest: "Issa Traoré", avatar: "IT", lastMessage: "Pouvez-vous prévoir un transfert aéroport ?", time: "10:42", unread: 2,
    messages: [
      { from: "guest", text: "Bonjour Awa, je confirme mon arrivée demain.", time: "Hier 18:20" },
      { from: "me", text: "Bonjour Issa, tout est prêt pour vous.", time: "Hier 19:05" },
      { from: "guest", text: "Pouvez-vous prévoir un transfert aéroport ?", time: "10:42" },
    ]},
  { id: "c2", guest: "Mariam Compaoré", avatar: "MC", lastMessage: "Merci pour les informations, à très vite.", time: "Hier", unread: 0,
    messages: [
      { from: "me", text: "Voici toutes les informations pour votre séjour.", time: "Hier 14:00" },
      { from: "guest", text: "Merci pour les informations, à très vite.", time: "Hier 14:30" },
    ]},
  { id: "c3", guest: "Karim Zongo", avatar: "KZ", lastMessage: "Notre arrivée sera vers 17h.", time: "Hier", unread: 1,
    messages: [
      { from: "guest", text: "Notre arrivée sera vers 17h.", time: "Hier 09:15" },
    ]},
];

export const hostNotifications = [
  { id: "hn1", title: "Nouvelle réservation", text: "Issa Traoré · Suite Executive · 4 nuits", time: "il y a 1h", unread: true },
  { id: "hn2", title: "Paiement reçu", text: "343 200 FCFA via Orange Money", time: "il y a 1h", unread: true },
  { id: "hn3", title: "Nouvel avis 5★", text: "Salif Ouattara a laissé un avis", time: "il y a 2j", unread: false },
  { id: "hn4", title: "Versement effectué", text: "3 842 000 FCFA versés sur votre compte", time: "1 Juin", unread: false },
];

export const analyticsTopRooms = [
  { name: "Suite Présidentielle", bookings: 18, revenue: 2_610_000, rate: 92 },
  { name: "Suite Executive Laongo", bookings: 24, revenue: 2_040_000, rate: 84 },
  { name: "Chambre Deluxe", bookings: 31, revenue: 1_612_000, rate: 76 },
  { name: "Suite Junior", bookings: 22, revenue: 1_452_000, rate: 71 },
  { name: "Chambre Standard", bookings: 38, revenue: 1_330_000, rate: 68 },
];

export const ratingDistribution = [
  { stars: 5, count: 142, pct: 76 },
  { stars: 4, count: 32, pct: 17 },
  { stars: 3, count: 9, pct: 5 },
  { stars: 2, count: 3, pct: 1 },
  { stars: 1, count: 1, pct: 1 },
];

export const fmtFCFA = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
