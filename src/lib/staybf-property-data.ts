import prop1 from "@/assets/prop-1.jpg";
import prop2 from "@/assets/prop-2.jpg";
import prop3 from "@/assets/prop-3.jpg";
import prop4 from "@/assets/prop-4.jpg";
import prop5 from "@/assets/prop-5.jpg";
import prop6 from "@/assets/prop-6.jpg";

export type PropertyDetail = {
  id: string;
  name: string;
  city: string;
  neighborhood: string;
  rating: number;
  reviews: number;
  price: number;
  images: string[];
  host: {
    name: string;
    avatar: string;
    type: string;
    responseRate: number;
    responseTime: string;
    superhost: boolean;
    verified: boolean;
    since: string;
  };
  description: {
    overview: string;
    neighborhood: string;
    rules: string[];
  };
  amenities: { key: string; label: string }[];
  rooms: {
    type: string;
    capacity: number;
    bed: string;
    available: boolean;
    price: number;
  }[];
  unavailableDates: string[];
  reviewsList: {
    name: string;
    avatar: string;
    date: string;
    rating: number;
    comment: string;
  }[];
  nearby: { name: string; type: string; distance: string }[];
  mapX: number;
  mapY: number;
};

const today = new Date();
const isoPlus = (d: number) => {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
};

export const property: PropertyDetail = {
  id: "faso-prestige",
  name: "Résidence Faso Prestige",
  city: "Ouagadougou",
  neighborhood: "Zone du Bois",
  rating: 4.92,
  reviews: 124,
  price: 68000,
  images: [prop1, prop2, prop3, prop4, prop5, prop6, prop1, prop2],
  host: {
    name: "Awa Sankara",
    avatar: "AS",
    type: "Hôte Premium",
    responseRate: 98,
    responseTime: "moins d'une heure",
    superhost: true,
    verified: true,
    since: "2022",
  },
  description: {
    overview:
      "Résidence haut de gamme située au cœur de la Zone du Bois, à 10 minutes du centre-ville de Ouagadougou. Idéale pour les voyageurs d'affaires, consultants ONG et touristes recherchant le confort d'un appartement avec les services d'un hôtel. Climatisation puissante, groupe électrogène automatique, internet fibre haut débit, et personnel d'accueil 24h/24.",
    neighborhood:
      "La Zone du Bois est l'un des quartiers les plus sécurisés de Ouagadougou, à proximité immédiate des ambassades, restaurants gastronomiques et boutiques. L'aéroport international est à 15 minutes en voiture. Le quartier est calme, arboré et bien desservi par les taxis et VTC.",
    rules: [
      "Arrivée à partir de 14h00",
      "Départ avant 11h00",
      "Pas de fête ou d'événement",
      "Animaux non admis",
      "Non-fumeur à l'intérieur",
    ],
  },
  amenities: [
    { key: "wifi", label: "Wifi fibre" },
    { key: "ac", label: "Climatisation" },
    { key: "parking", label: "Parking sécurisé" },
    { key: "restaurant", label: "Restaurant" },
    { key: "security", label: "Sécurité 24/7" },
    { key: "hotwater", label: "Eau chaude" },
    { key: "generator", label: "Groupe électrogène" },
    { key: "tv", label: "TV Canal+" },
    { key: "kitchen", label: "Cuisine équipée" },
    { key: "workspace", label: "Espace de travail" },
    { key: "pool", label: "Piscine" },
    { key: "laundry", label: "Blanchisserie" },
  ],
  rooms: [
    { type: "Suite Executive", capacity: 2, bed: "1 lit king size", available: true, price: 68000 },
    { type: "Chambre Standard", capacity: 2, bed: "1 lit queen", available: true, price: 48000 },
    { type: "Appartement Familial", capacity: 4, bed: "2 lits queen", available: false, price: 95000 },
  ],
  unavailableDates: [
    isoPlus(3), isoPlus(4), isoPlus(5),
    isoPlus(12), isoPlus(13),
    isoPlus(20), isoPlus(21), isoPlus(22),
  ],
  reviewsList: [
    { name: "Issa Compaoré", avatar: "IC", date: "Mars 2026", rating: 5, comment: "Séjour parfait. Le personnel est aux petits soins, la résidence est impeccable et la connexion internet permet de télétravailler sans problème. Je recommande vivement." },
    { name: "Claire Dubois", avatar: "CD", date: "Février 2026", rating: 5, comment: "Excellente adresse pour une mission ONG à Ouaga. Sécurité au top, petit-déjeuner copieux et chauffeur disponible à tout moment." },
    { name: "Boukary Traoré", avatar: "BT", date: "Janvier 2026", rating: 4, comment: "Très belle résidence. Petit bémol sur le bruit de la rue le matin, mais la qualité globale est au rendez-vous." },
    { name: "Sarah Mensah", avatar: "SM", date: "Décembre 2025", rating: 5, comment: "Réservation instantanée avec Orange Money, accueil chaleureux, chambre spacieuse. Tout était parfait, je reviendrai." },
    { name: "Moussa Diallo", avatar: "MD", date: "Novembre 2025", rating: 5, comment: "Le groupe électrogène est un vrai plus à Ouaga. Aucune coupure pendant tout le séjour, ambiance professionnelle et chaleureuse." },
    { name: "Léa Martin", avatar: "LM", date: "Octobre 2025", rating: 4, comment: "Très bon rapport qualité-prix. La piscine est petite mais propre et bien entretenue." },
  ],
  nearby: [
    { name: "Restaurant L'Eau Vive", type: "Restaurant", distance: "350 m" },
    { name: "Pharmacie du Bois", type: "Pharmacie", distance: "500 m" },
    { name: "Coris Bank ATM", type: "Distributeur", distance: "700 m" },
    { name: "Marché de Gounghin", type: "Marché", distance: "1.2 km" },
    { name: "Ambassade de France", type: "Ambassade", distance: "900 m" },
  ],
  mapX: 0.55,
  mapY: 0.45,
};

export const similarProperties = [
  { id: 1, name: "Hôtel Palmiers & Spa", location: "Ouaga 2000", price: 95000, rating: 4.96, image: prop4 },
  { id: 2, name: "Villa Sahel Élégance", location: "Patte d'Oie", price: 65000, rating: 4.88, image: prop5 },
  { id: 3, name: "Résidence Koulouba", location: "Koulouba", price: 52000, rating: 4.85, image: prop2 },
  { id: 4, name: "Suite Executive Laongo", location: "Zone du Bois", price: 78000, rating: 4.92, image: prop1 },
  { id: 5, name: "Eco Lodge Sahel", location: "Dori", price: 45000, rating: 4.81, image: prop6 },
  { id: 6, name: "Auberge Bougainvillier", location: "Bobo-Dioulasso", price: 28000, rating: 4.78, image: prop3 },
];
