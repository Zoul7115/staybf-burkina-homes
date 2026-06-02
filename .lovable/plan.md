# StayBF — Premium Homepage Plan

A single-page, mobile-first landing for **StayBF**, Burkina Faso's first accommodation booking platform. Inspired by Airbnb/Booking/Agoda with a clean, luxury feel using brand green `#0E7A3D` and gold `#F4B400` on white.

> Note: project uses **TanStack Start** (file-based routing in `src/routes/`), not Next.js App Router. I'll follow the project's existing convention — same component architecture, same outcome.

## Design system (src/styles.css)

- `--primary: oklch(...)` mapped to `#0E7A3D` (deep green)
- `--secondary` / `--accent` mapped to `#F4B400` (warm gold)
- Background `#FFFFFF`, foreground near-black, muted warm gray
- Gradients: `--gradient-hero` (green → darker green), `--gradient-gold` for accents
- Shadows: `--shadow-card` (soft), `--shadow-elevated` (premium hover), `--shadow-glow` (gold)
- Radius: `1rem` for cards, `9999px` for pills/search
- Fonts: **Plus Jakarta Sans** (headings) + **Inter** (body) — modern, highly readable, loaded via Google Fonts in `__root.tsx`
- Custom animations: `fade-in-up`, `scale-in`, `slide-up`, hover-lift utility

## Sections (all in `src/routes/index.tsx`, composed from small components)

1. **Sticky Navbar** (`components/site/Navbar.tsx`)
   - Logo "StayBF" (green leaf icon + wordmark), nav links, "Devenir hôte", Login, Register (primary CTA)
   - Backdrop blur + shadow on scroll; mobile: hamburger Sheet

2. **Hero** (`components/site/Hero.tsx`)
   - Full-bleed AI-generated hero image (warm African accommodation, generated via imagegen, stored in `src/assets/`)
   - Subtle dark gradient overlay for legibility
   - H1: *"Trouvez votre hébergement partout au Burkina Faso"*
   - Sub: *"Réservez hôtels, résidences meublées et auberges en quelques minutes."*
   - **Search Card** floating over hero (rounded-2xl, white, elevated shadow): Ville (Select), Arrivée (DatePicker), Départ (DatePicker), Voyageurs (Stepper Popover), green Search button with icon. Stacks vertically on mobile.

3. **Popular Cities** (`components/site/PopularCities.tsx`)
   - Horizontal scroll on mobile / grid on desktop
   - 6 city cards with AI-generated thumbnail, name, property count
   - Hover: scale + shadow lift

4. **Featured Properties** (`components/site/FeaturedProperties.tsx`)
   - 6–8 property cards: image carousel dot, favorite heart (toggle), gold star rating, name, location, price/nuit in FCFA
   - Responsive grid: 1 / 2 / 3 / 4 cols

5. **Why StayBF** (`components/site/WhyStayBF.tsx`)
   - 4 feature cards with Lucide icons in green circles: Réservation rapide (Zap), Paiement Mobile Money (Smartphone), Hébergements vérifiés (BadgeCheck), Support local (Headset)

6. **Become a Host** (`components/site/BecomeHost.tsx`)
   - Split layout: image left, content right. Green gradient background panel
   - Gold CTA button "Commencer gratuitement"

7. **Testimonials** (`components/site/Testimonials.tsx`)
   - 3 review cards with avatar, name/role (business traveler, NGO, tourist), 5-star, quote
   - Subtle gold accent border on hover

8. **Footer** (`components/site/Footer.tsx`)
   - 4 columns (À propos, Contact, FAQ, Mentions légales) + social icons + © StayBF

## Mobile-first details
- Built at 390px first, scales up via `sm/md/lg/xl`
- Tap targets ≥ 44px, search card collapses to stacked inputs
- Sticky nav becomes compact on scroll

## Animations
- `animate-fade-in-up` on section entry (CSS, staggered via delays)
- `hover-scale`, shadow transitions on cards
- Smooth scroll behavior

## SEO (`head()` on index route)
- Title: "StayBF — Hébergements au Burkina Faso"
- Description, og:title, og:description, og:image (hero), twitter:card

## Files to create
- `src/styles.css` — extend with brand tokens, gradients, shadows, keyframes
- `src/routes/__root.tsx` — add Google Fonts links
- `src/routes/index.tsx` — replace placeholder, compose sections
- `src/components/site/{Navbar,Hero,SearchCard,PopularCities,FeaturedProperties,PropertyCard,WhyStayBF,BecomeHost,Testimonials,Footer}.tsx`
- `src/lib/staybf-data.ts` — mock cities, properties, testimonials
- `src/assets/hero-staybf.jpg` + 6 city images + a few property images (AI-generated)

## Out of scope (mock only)
- No backend, no real search/booking, no auth wiring — buttons are visual. Can wire to Lovable Cloud in a follow-up.

Ready to build when you approve.