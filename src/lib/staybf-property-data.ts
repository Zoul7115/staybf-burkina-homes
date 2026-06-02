import { createContext, useContext } from "react";
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

const images = [prop1, prop2, prop3, prop4, prop5, prop6];

const seeds = [
  { name: "Suite Executive Laongo", city: "Ouagadougou", neighborhood: "Zone du Bois", price: 78000, rating: 4.92, reviews: 184, host: "Awa Sankara", since: "2022" },
  { name: "Résidence Meublée Koulouba", city: "Ouagadougou", neighborhood: "Koulouba", price: 52000, rating: 4.85, reviews: 96, host: "Issa Compaoré", since: "2021" },
  { name: "Auberge Bougainvillier", city: "Bobo-Dioulasso", neighborhood: "Centre", price: 28000, rating: 4.78, reviews: 142, host: "Mariam Ouédraogo", since: "2020" },
  { name: "Hôtel Palmiers & Spa", city: "Ouagadougou", neighborhood: "Ouaga 2000", price: 95000, rating: 4.96, reviews: 312, host: "Hôtel Palmiers", since: "2019" },
  { name: "Villa Sahel Élégance", city: "Ouagadougou", neighborhood: "Patte d'Oie", price: 65000, rating: 4.88, reviews: 73, host: "Boukary Traoré", since: "2023" },
  { name: "Eco Lodge Sahel", city: "Dori", neighborhood: "Réserve naturelle", price: 45000, rating: 4.81, reviews: 58, host: "Sahel Tours", since: "2022" },
  { name: "Appartement Ouaga 2000", city: "Ouagadougou", neighborhood: "Ouaga 2000", price: 58000, rating: 4.74, reviews: 64, host: "Fatim Kaboré", since: "2023" },
  { name: "Hôtel Indépendance", city: "Ouagadougou", neighborhood: "Centre", price: 88000, rating: 4.7, reviews: 220, host: "Hôtel Indépendance", since: "2018" },
  { name: "Résidence Zone du Bois", city: "Ouagadougou", neighborhood: "Zone du Bois", price: 72000, rating: 4.83, reviews: 110, host: "Aïcha Bonkoungou", since: "2022" },
  { name: "Villa Karité", city: "Bobo-Dioulasso", neighborhood: "Sarfalao", price: 42000, rating: 4.79, reviews: 87, host: "Karim Sawadogo", since: "2021" },
  { name: "Maison d'hôtes Naba", city: "Koudougou", neighborhood: "Centre", price: 24000, rating: 4.65, reviews: 39, host: "Naba Tinga", since: "2023" },
  { name: "Hôtel Silmandé", city: "Ouagadougou", neighborhood: "Silmandé", price: 110000, rating: 4.9, reviews: 410, host: "Hôtel Silmandé", since: "2017" },
  { name: "Appartement Patte d'Oie", city: "Ouagadougou", neighborhood: "Patte d'Oie", price: 48000, rating: 4.72, reviews: 55, host: "Salimata Diallo", since: "2024" },
  { name: "Résidence Tampouy", city: "Ouagadougou", neighborhood: "Tampouy", price: 36000, rating: 4.6, reviews: 41, host: "Souleymane Yaméogo", since: "2023" },
  { name: "Villa Baobab", city: "Ouahigouya", neighborhood: "Centre", price: 38000, rating: 4.77, reviews: 62, host: "Baobab Lodge", since: "2022" },
  { name: "Auberge du Sahel", city: "Dori", neighborhood: "Centre", price: 22000, rating: 4.55, reviews: 33, host: "Auberge Sahel", since: "2021" },
  { name: "Hôtel Splendid", city: "Ouagadougou", neighborhood: "Centre", price: 92000, rating: 4.86, reviews: 256, host: "Hôtel Splendid", since: "2016" },
  { name: "Résidence Pissy", city: "Ouagadougou", neighborhood: "Pissy", price: 32000, rating: 4.58, reviews: 47, host: "Rasmata Sankara", since: "2023" },
];

const baseAmenities = [
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
];

const baseReviews = [
  { name: "Issa Compaoré", avatar: "IC", date: "Mars 2026", rating: 5, comment: "Séjour parfait. Le personnel est aux petits soins, l'hébergement est impeccable et la connexion internet permet de télétravailler sans problème. Je recommande vivement." },
  { name: "Claire Dubois", avatar: "CD", date: "Février 2026", rating: 5, comment: "Excellente adresse pour une mission ONG. Sécurité au top, petit-déjeuner copieux et chauffeur disponible à tout moment." },
  { name: "Boukary Traoré", avatar: "BT", date: "Janvier 2026", rating: 4, comment: "Très belle adresse. Petit bémol sur le bruit de la rue le matin, mais la qualité globale est au rendez-vous." },
  { name: "Sarah Mensah", avatar: "SM", date: "Décembre 2025", rating: 5, comment: "Réservation instantanée avec Orange Money, accueil chaleureux, chambre spacieuse. Tout était parfait." },
  { name: "Moussa Diallo", avatar: "MD", date: "Novembre 2025", rating: 5, comment: "Le groupe électrogène est un vrai plus. Aucune coupure pendant tout le séjour." },
  { name: "Léa Martin", avatar: "LM", date: "Octobre 2025", rating: 4, comment: "Très bon rapport qualité-prix. L'équipement est bien entretenu." },
];

function makeProperty(idx: number): PropertyDetail {
  const s = seeds[idx % seeds.length];
  const id = String(idx + 1);
  const imgs = Array.from({ length: 8 }, (_, i) => images[(idx + i) % images.length]);
  const hostInitials = s.host.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return {
    id,
    name: s.name,
    city: s.city,
    neighborhood: s.neighborhood,
    rating: s.rating,
    reviews: s.reviews,
    price: s.price,
    images: imgs,
    host: {
      name: s.host,
      avatar: hostInitials,
      type: s.price > 70000 ? "Hôte Premium" : "Hôte vérifié",
      responseRate: 95 + (idx % 5),
      responseTime: idx % 2 === 0 ? "moins d'une heure" : "moins de 2 heures",
      superhost: s.rating >= 4.85,
      verified: true,
      since: s.since,
    },
    description: {
      overview: `${s.name} est un hébergement haut de gamme situé à ${s.neighborhood}, ${s.city}. Idéal pour les voyageurs d'affaires, consultants ONG et touristes recherchant le confort et la sécurité. Climatisation, groupe électrogène automatique, internet fibre et personnel d'accueil dédié.`,
      neighborhood: `Le quartier ${s.neighborhood} est l'un des plus appréciés de ${s.city}, à proximité des commerces, restaurants et services essentiels. Accès facile à l'aéroport et aux principaux axes routiers.`,
      rules: [
        "Arrivée à partir de 14h00",
        "Départ avant 11h00",
        "Pas de fête ou d'événement",
        "Animaux non admis",
        "Non-fumeur à l'intérieur",
      ],
    },
    amenities: baseAmenities,
    rooms: [
      { type: "Suite Executive", capacity: 2, bed: "1 lit king size", available: true, price: s.price },
      { type: "Chambre Standard", capacity: 2, bed: "1 lit queen", available: true, price: Math.round(s.price * 0.7) },
      { type: "Appartement Familial", capacity: 4, bed: "2 lits queen", available: idx % 3 !== 0, price: Math.round(s.price * 1.4) },
    ],
    unavailableDates: [isoPlus(3), isoPlus(4), isoPlus(5), isoPlus(12), isoPlus(13), isoPlus(20), isoPlus(21)],
    reviewsList: baseReviews,
    nearby: [
      { name: "Restaurant L'Eau Vive", type: "Restaurant", distance: "350 m" },
      { name: "Pharmacie du quartier", type: "Pharmacie", distance: "500 m" },
      { name: "Coris Bank ATM", type: "Distributeur", distance: "700 m" },
      { name: `Marché de ${s.neighborhood}`, type: "Marché", distance: "1.2 km" },
      { name: "Station Total", type: "Station", distance: "900 m" },
    ],
    mapX: 0.35 + ((idx * 37) % 40) / 100,
    mapY: 0.3 + ((idx * 53) % 35) / 100,
  };
}

export const properties: PropertyDetail[] = seeds.map((_, i) => makeProperty(i));

export function getPropertyById(id: string): PropertyDetail | undefined {
  return properties.find((p) => p.id === String(id));
}

// Backward-compat singleton
export const property = properties[0];

export const similarProperties = properties.slice(0, 6).map((p) => ({
  id: p.id,
  name: p.name,
  location: `${p.city}, ${p.neighborhood}`,
  price: p.price,
  rating: p.rating,
  image: p.images[0],
}));

// React context so sections can read the current property
const PropertyContext = createContext<PropertyDetail | null>(null);
export const PropertyProvider = PropertyContext.Provider;
export function useProperty(): PropertyDetail {
  const ctx = useContext(PropertyContext);
  return ctx ?? property;
}
