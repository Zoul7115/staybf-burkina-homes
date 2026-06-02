import prop1 from "@/assets/prop-1.jpg";
import prop2 from "@/assets/prop-2.jpg";
import prop3 from "@/assets/prop-3.jpg";
import prop4 from "@/assets/prop-4.jpg";
import prop5 from "@/assets/prop-5.jpg";
import prop6 from "@/assets/prop-6.jpg";

export type AccommodationType =
  | "Hôtel"
  | "Résidence"
  | "Maison d'hôtes"
  | "Villa"
  | "Appartement";

export type Amenity =
  | "Wifi"
  | "Climatisation"
  | "Parking"
  | "Restaurant"
  | "Piscine"
  | "Groupe électrogène"
  | "Eau chaude";

export type Listing = {
  id: number;
  name: string;
  city: string;
  neighborhood: string;
  type: AccommodationType;
  price: number;
  rating: number;
  reviews: number;
  image: string;
  amenities: Amenity[];
  verified: boolean;
  instantBook: boolean;
  availableToday: boolean;
  availableWeekend: boolean;
  // normalized 0-1 coordinates for the stylized map
  mapX: number;
  mapY: number;
};

const images = [prop1, prop2, prop3, prop4, prop5, prop6];

const names = [
  "Suite Executive Laongo",
  "Résidence Koulouba",
  "Auberge Bougainvillier",
  "Hôtel Palmiers & Spa",
  "Villa Sahel Élégance",
  "Eco Lodge Sahel",
  "Appartement Ouaga 2000",
  "Hôtel Indépendance",
  "Résidence Zone du Bois",
  "Villa Karité",
  "Maison d'hôtes Naba",
  "Hôtel Silmandé",
  "Appartement Patte d'Oie",
  "Résidence Tampouy",
  "Villa Baobab",
  "Auberge du Sahel",
  "Hôtel Splendid",
  "Résidence Pissy",
];

const neighborhoods = [
  "Zone du Bois",
  "Ouaga 2000",
  "Koulouba",
  "Patte d'Oie",
  "Centre",
  "Tampouy",
  "Pissy",
  "Gounghin",
];

const allAmenities: Amenity[] = [
  "Wifi",
  "Climatisation",
  "Parking",
  "Restaurant",
  "Piscine",
  "Groupe électrogène",
  "Eau chaude",
];

const types: AccommodationType[] = [
  "Hôtel",
  "Résidence",
  "Maison d'hôtes",
  "Villa",
  "Appartement",
];

function seeded(i: number, salt = 1) {
  const x = Math.sin(i * 9973 + salt * 31) * 10000;
  return x - Math.floor(x);
}

export function generateListings(city: string, count = 18): Listing[] {
  return Array.from({ length: count }, (_, i) => {
    const r = seeded(i, 1);
    const amenityCount = 3 + Math.floor(seeded(i, 2) * 4);
    const amenities = [...allAmenities]
      .sort(() => seeded(i, 7) - 0.5)
      .slice(0, amenityCount);
    return {
      id: i + 1,
      name: names[i % names.length],
      city,
      neighborhood: neighborhoods[i % neighborhoods.length],
      type: types[i % types.length],
      price: 18000 + Math.floor(seeded(i, 3) * 90000),
      rating: +(3.8 + seeded(i, 4) * 1.2).toFixed(2),
      reviews: 12 + Math.floor(seeded(i, 5) * 320),
      image: images[i % images.length],
      amenities,
      verified: seeded(i, 6) > 0.15,
      instantBook: seeded(i, 8) > 0.45,
      availableToday: seeded(i, 9) > 0.35,
      availableWeekend: seeded(i, 10) > 0.25,
      mapX: 0.1 + seeded(i, 11) * 0.8,
      mapY: 0.12 + seeded(i, 12) * 0.76,
    };
  });
}
