// Types used by the search domain.
// AccommodationType and Amenity are the canonical lists used by SearchFilters.

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

export type SearchResult = {
  id: string;
  name: string;
  city: string;
  address: string | null;
  type: string;
  price: number;
  rating: number;
  reviews: number;
  image: string;
  amenities: string[];
  verified: boolean;
  mapX: number;
  mapY: number;
};
