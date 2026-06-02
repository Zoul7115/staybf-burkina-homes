import ouaga from "@/assets/city-ouagadougou.jpg";
import bobo from "@/assets/city-bobo.jpg";
import koudougou from "@/assets/city-koudougou.jpg";
import ouahigouya from "@/assets/city-ouahigouya.jpg";
import dori from "@/assets/city-dori.jpg";
import tenkodogo from "@/assets/city-tenkodogo.jpg";
import prop1 from "@/assets/prop-1.jpg";
import prop2 from "@/assets/prop-2.jpg";
import prop3 from "@/assets/prop-3.jpg";
import prop4 from "@/assets/prop-4.jpg";
import prop5 from "@/assets/prop-5.jpg";
import prop6 from "@/assets/prop-6.jpg";

export const cities = [
  { name: "Ouagadougou", count: 248, image: ouaga },
  { name: "Bobo-Dioulasso", count: 132, image: bobo },
  { name: "Koudougou", count: 64, image: koudougou },
  { name: "Ouahigouya", count: 41, image: ouahigouya },
  { name: "Dori", count: 28, image: dori },
  { name: "Tenkodogo", count: 22, image: tenkodogo },
];

export const properties = [
  { id: 1, name: "Suite Executive Laongo", location: "Ouagadougou, Zone du Bois", price: 78000, rating: 4.92, reviews: 184, image: prop1, badge: "Coup de cœur" },
  { id: 2, name: "Résidence Meublée Koulouba", location: "Ouagadougou, Koulouba", price: 52000, rating: 4.85, reviews: 96, image: prop2 },
  { id: 3, name: "Auberge Bougainvillier", location: "Bobo-Dioulasso, Centre", price: 28000, rating: 4.78, reviews: 142, image: prop3 },
  { id: 4, name: "Hôtel Palmiers & Spa", location: "Ouagadougou, Ouaga 2000", price: 95000, rating: 4.96, reviews: 312, image: prop4, badge: "Premium" },
  { id: 5, name: "Villa Sahel Élégance", location: "Ouagadougou, Patte d'Oie", price: 65000, rating: 4.88, reviews: 73, image: prop5 },
  { id: 6, name: "Eco Lodge Sahel", location: "Dori, Réserve naturelle", price: 45000, rating: 4.81, reviews: 58, image: prop6, badge: "Nouveau" },
];

export const testimonials = [
  {
    name: "Aminata Ouédraogo",
    role: "Consultante ONG, Ouagadougou",
    avatar: "AO",
    quote:
      "StayBF m'a simplifié la vie. En mission à Bobo, j'ai réservé une résidence vérifiée en 3 minutes avec Orange Money. Service au top.",
  },
  {
    name: "Marc Lefèvre",
    role: "Business traveler, France",
    avatar: "ML",
    quote:
      "Enfin une plateforme fiable pour le Burkina. Les hébergements correspondent exactement aux photos et le support local répond immédiatement.",
  },
  {
    name: "Fatou Diallo",
    role: "Voyageuse, Dakar",
    avatar: "FD",
    quote:
      "J'ai découvert Tenkodogo grâce à StayBF. Le rapport qualité-prix est imbattable et le paiement Mobile Money m'évite tout souci de carte.",
  },
];
