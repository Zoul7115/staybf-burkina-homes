export const adminUser = {
  name: "Ibrahim Ouédraogo",
  email: "admin@staybf.com",
  avatar: "IO",
  role: "Super Admin",
};

const iso = (offset: number) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const adminStats = {
  totalRevenue: 184_750_000,
  totalHosts: 312,
  totalTravelers: 8_412,
  totalProperties: 487,
  totalBookings: 12_840,
  activeSubscriptions: 218,
  pendingVerifications: 24,
  systemAlerts: 3,
  commissionRevenue: 14_780_000,
  serviceFeeRevenue: 8_240_000,
  subscriptionRevenue: 5_450_000,
};

const d = (label: string, value: number) => ({ label, value });

export const adminRevenueChart = [
  d("Jan", 12_400), d("Fév", 14_200), d("Mar", 16_800), d("Avr", 19_500),
  d("Mai", 22_100), d("Juin", 25_840), d("Juil", 28_470),
];

export const adminBookingsChart = [
  d("Jan", 820), d("Fév", 940), d("Mar", 1180), d("Avr", 1420),
  d("Mai", 1680), d("Juin", 1920), d("Juil", 2140),
];

export const adminGrowthChart = [
  d("Jan", 38), d("Fév", 52), d("Mar", 68), d("Avr", 84),
  d("Mai", 96), d("Juin", 112), d("Juil", 134),
];

export type AdminHost = {
  id: string; name: string; avatar: string; email: string; city: string;
  properties: number; revenue: number; rating: number;
  status: "active" | "pending" | "suspended" | "approved" | "rejected";
  joined: string; verified: boolean;
};

const firstNames = ["Awa", "Issa", "Mariam", "Karim", "Aïcha", "Boubacar", "Salif", "Fatim", "Yann", "Adama", "Rasmata", "Moussa"];
const lastNames = ["Sankara", "Traoré", "Ouédraogo", "Compaoré", "Diallo", "Sawadogo", "Zongo", "Kaboré", "Sanou", "Diabaté", "Tapsoba", "Bationo"];
const cities = ["Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Banfora", "Ouahigouya", "Tenkodogo"];
const initials = (n: string) => n.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

export const adminHosts: AdminHost[] = Array.from({ length: 18 }).map((_, i) => {
  const name = `${firstNames[i % firstNames.length]} ${lastNames[(i * 3) % lastNames.length]}`;
  const statuses: AdminHost["status"][] = ["active", "active", "active", "pending", "suspended", "approved", "rejected"];
  return {
    id: `h${i + 1}`, name, avatar: initials(name),
    email: `${name.toLowerCase().replace(/ /g, ".").replace(/[^\w.]/g, "")}@staybf.bf`,
    city: cities[i % cities.length],
    properties: 1 + (i % 5),
    revenue: 800_000 + i * 412_000,
    rating: 4.2 + ((i * 7) % 8) / 10,
    status: statuses[i % statuses.length],
    joined: `${["Jan", "Fév", "Mar", "Avr", "Mai", "Juin"][i % 6]} 202${4 + (i % 2)}`,
    verified: i % 3 !== 0,
  };
});

export type AdminProperty = {
  id: string; name: string; host: string; city: string; type: string;
  rooms: number; rating: number; bookings: number;
  status: "approved" | "pending" | "rejected" | "suspended";
};

const propTypes = ["Hôtel", "Résidence", "Villa", "Appartement", "Maison d'hôte", "Lodge"];
export const adminProperties: AdminProperty[] = Array.from({ length: 22 }).map((_, i) => {
  const statuses: AdminProperty["status"][] = ["approved", "approved", "approved", "approved", "pending", "rejected", "suspended"];
  return {
    id: `p${i + 1}`,
    name: `${propTypes[i % propTypes.length]} ${["Laongo", "Royal", "Palmiers", "Karité", "Baobab", "Sahel", "Yennenga", "Ouaga", "Bobo", "Sindou"][i % 10]}`,
    host: `${firstNames[i % firstNames.length]} ${lastNames[(i * 5) % lastNames.length]}`,
    city: cities[i % cities.length],
    type: propTypes[i % propTypes.length],
    rooms: 3 + (i % 12),
    rating: 4.1 + ((i * 11) % 9) / 10,
    bookings: 12 + i * 7,
    status: statuses[i % statuses.length],
  };
});

export type AdminBooking = {
  id: string; ref: string; guest: string; property: string; host: string;
  amount: number; date: string; nights: number;
  status: "confirmed" | "pending" | "completed" | "cancelled";
  payment: "paid" | "pending" | "failed" | "refunded";
};

export const adminBookings: AdminBooking[] = Array.from({ length: 24 }).map((_, i) => {
  const bs: AdminBooking["status"][] = ["confirmed", "completed", "pending", "cancelled"];
  const ps: AdminBooking["payment"][] = ["paid", "paid", "pending", "failed", "refunded"];
  return {
    id: `b${i + 1}`,
    ref: `STBF-${46000 + i * 17}`,
    guest: `${firstNames[(i * 2) % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    property: `${propTypes[i % propTypes.length]} ${["Laongo", "Royal", "Karité", "Baobab"][i % 4]}`,
    host: `${firstNames[i % firstNames.length]} ${lastNames[(i * 3) % lastNames.length]}`,
    amount: 85_000 + i * 28_500,
    date: iso(-i * 2),
    nights: 1 + (i % 7),
    status: bs[i % bs.length],
    payment: ps[i % ps.length],
  };
});

export type AdminTraveler = {
  id: string; name: string; avatar: string; email: string;
  bookings: number; spent: number; reviews: number;
  status: "active" | "suspended"; joined: string;
};

export const adminTravelers: AdminTraveler[] = Array.from({ length: 20 }).map((_, i) => {
  const name = `${firstNames[(i * 4) % firstNames.length]} ${lastNames[(i * 2) % lastNames.length]}`;
  return {
    id: `t${i + 1}`, name, avatar: initials(name),
    email: `${name.toLowerCase().replace(/ /g, ".").replace(/[^\w.]/g, "")}@email.bf`,
    bookings: 1 + (i % 14),
    spent: 78_000 + i * 124_000,
    reviews: i % 8,
    status: i % 13 === 0 ? "suspended" : "active",
    joined: `${["Jan", "Mar", "Mai", "Août", "Oct"][i % 5]} 202${3 + (i % 3)}`,
  };
});

export type AdminSubscription = {
  id: string; host: string; plan: string; price: number;
  start: string; renew: string; status: "active" | "pending" | "cancelled";
};

export const adminSubscriptions: AdminSubscription[] = Array.from({ length: 14 }).map((_, i) => {
  const plans = ["Croissance", "Pro", "Entreprise", "Découverte"];
  const prices = [25_000, 240_000, 0, 0];
  return {
    id: `s${i + 1}`,
    host: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    plan: plans[i % plans.length],
    price: prices[i % plans.length],
    start: iso(-180 + i * 10),
    renew: iso(30 + i * 7),
    status: (i % 11 === 0 ? "cancelled" : i % 5 === 0 ? "pending" : "active") as AdminSubscription["status"],
  };
});

export const adminPayments = Array.from({ length: 16 }).map((_, i) => {
  const methods = ["Orange Money", "Moov Money", "Visa", "Mastercard"] as const;
  const statuses = ["paid", "paid", "paid", "pending", "failed", "refunded"] as const;
  return {
    id: `pm${i + 1}`,
    ref: `PAY-${78000 + i * 23}`,
    user: `${firstNames[(i * 3) % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    amount: 45_000 + i * 22_000,
    method: methods[i % methods.length],
    status: statuses[i % statuses.length],
    date: iso(-i),
  };
});

export const adminReviews = Array.from({ length: 12 }).map((_, i) => ({
  id: `rv${i + 1}`,
  author: `${firstNames[(i * 2) % firstNames.length]} ${lastNames[i % lastNames.length]}`,
  property: `${propTypes[i % propTypes.length]} ${["Laongo", "Royal", "Baobab"][i % 3]}`,
  rating: 1 + (i % 5),
  text: [
    "Très belle expérience, je recommande vivement.",
    "Service moyen, le ménage laissait à désirer.",
    "Hôte exceptionnel, accueil chaleureux comme à la maison.",
    "Bruit important la nuit, déçu de mon séjour.",
    "Hébergement annoncé différemment de la réalité.",
  ][i % 5],
  status: (i % 4 === 0 ? "reported" : i % 7 === 0 ? "removed" : "approved") as "approved" | "reported" | "removed",
  date: iso(-i * 3),
}));

export const adminCities = [
  { name: "Ouagadougou", properties: 218, bookings: 5_812, revenue: 84_200_000, active: true },
  { name: "Bobo-Dioulasso", properties: 124, bookings: 3_240, revenue: 48_100_000, active: true },
  { name: "Banfora", properties: 52, bookings: 1_420, revenue: 18_900_000, active: true },
  { name: "Koudougou", properties: 38, bookings: 980, revenue: 12_400_000, active: true },
  { name: "Ouahigouya", properties: 28, bookings: 720, revenue: 9_800_000, active: true },
  { name: "Tenkodogo", properties: 14, bookings: 420, revenue: 5_200_000, active: false },
  { name: "Fada N'Gourma", properties: 8, bookings: 180, revenue: 2_100_000, active: false },
  { name: "Dori", properties: 5, bookings: 68, revenue: 1_050_000, active: false },
];

export const adminTickets = Array.from({ length: 10 }).map((_, i) => {
  const priorities = ["low", "medium", "high", "urgent"] as const;
  const statuses = ["open", "in_progress", "resolved", "closed"] as const;
  return {
    id: `tk${i + 1}`,
    subject: [
      "Paiement non reçu", "Propriété refusée à tort", "Demande de remboursement",
      "Compte suspendu par erreur", "Bug calendrier", "Problème vérification KYC",
      "Question commission", "Demande retrait fonds", "Mise à jour photos refusée", "Litige avec voyageur",
    ][i],
    from: `${firstNames[(i * 3) % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    priority: priorities[i % priorities.length],
    status: statuses[i % statuses.length],
    updated: `il y a ${1 + i}j`,
  };
});

export const adminAuditLogs = Array.from({ length: 12 }).map((_, i) => ({
  id: `al${i + 1}`,
  actor: ["Ibrahim Ouédraogo", "Awa Sankara (host)", "Système", "Karim Zongo (admin)"][i % 4],
  action: [
    "Approbation propriété", "Suspension hôte", "Modification commission",
    "Création rôle", "Suppression utilisateur", "Validation paiement",
    "Mise à jour permissions", "Configuration plateforme", "Connexion admin",
    "Export rapport", "Remboursement traité", "Désactivation ville",
  ][i],
  target: ["Résidence Laongo", "Awa Sankara", "Global", "Modérateur", "user#412", "PAY-78421", "Manager role", "Service fees", "—", "Reports", "PAY-77621", "Tenkodogo"][i],
  ip: `41.83.${10 + i}.${42 + i * 3}`,
  date: `il y a ${i + 1}h`,
}));

export const adminRoles = [
  { id: "r1", name: "Super Admin", users: 2, permissions: 42, color: "primary" as const },
  { id: "r2", name: "Manager Opérations", users: 5, permissions: 28, color: "secondary" as const },
  { id: "r3", name: "Support Client", users: 12, permissions: 14, color: "muted" as const },
  { id: "r4", name: "Modérateur Contenu", users: 6, permissions: 9, color: "muted" as const },
  { id: "r5", name: "Analyste Finance", users: 3, permissions: 11, color: "muted" as const },
];

export const adminPermissions = [
  { group: "Hôtes", items: ["Voir", "Approuver", "Suspendre", "Supprimer"] },
  { group: "Propriétés", items: ["Voir", "Modérer", "Approuver", "Supprimer"] },
  { group: "Paiements", items: ["Voir", "Rembourser", "Initier payout", "Exporter"] },
  { group: "Plateforme", items: ["Configuration", "Rôles", "Sécurité", "API"] },
];

export const adminNotifications = [
  { id: "an1", title: "Nouvelle demande KYC", text: "Boubacar Sanou a soumis ses documents", time: "il y a 12min", unread: true },
  { id: "an2", title: "Litige ouvert", text: "Réclamation paiement PAY-78421", time: "il y a 1h", unread: true },
  { id: "an3", title: "Alerte système", text: "Pic de latence sur le service de paiement", time: "il y a 3h", unread: true },
  { id: "an4", title: "Rapport mensuel disponible", text: "Performance Juin 2026 prêt à exporter", time: "Hier", unread: false },
];

export const fmtFCFA = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
export const fmtK = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${(n / 1000).toFixed(0)}K`;
