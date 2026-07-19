import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

const SERVICE_FEE_RATE = 0.1000;
const COMMISSION_RATE = 0.1500;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAuth(req);
    const { room_id, check_in, check_out } = await req.json();

    if (!room_id || !check_in || !check_out) {
      return err("Missing required fields: room_id, check_in, check_out");
    }

    const nights = Math.round(
      (new Date(check_out).getTime() - new Date(check_in).getTime()) / 86_400_000
    );
    if (nights < 1) return err("check_out must be after check_in");

    const db = makeServiceClient();

    const [roomRes, overrideRes, seasonalRes] = await Promise.all([
      db.from("rooms").select("id, name, base_price_fcfa, max_guests")
        .eq("id", room_id).single(),
      db.from("room_availability")
        .select("date, price_override_fcfa")
        .eq("room_id", room_id).gte("date", check_in).lt("date", check_out),
      db.from("seasonal_pricing")
        .select("starts_on, ends_on, price_fcfa, min_nights, priority")
        .eq("room_id", room_id)
        .lte("starts_on", check_out).gte("ends_on", check_in)
        .order("priority", { ascending: false }),
    ]);

    if (roomRes.error || !roomRes.data) return err("Room not found", 404);
    const room = roomRes.data;

    const overrideMap = new Map<string, number>();
    for (const row of overrideRes.data ?? []) {
      if (row.price_override_fcfa !== null) overrideMap.set(row.date, row.price_override_fcfa);
    }

    const seasonalRules = (seasonalRes.data ?? []) as {
      starts_on: string; ends_on: string; price_fcfa: number; min_nights: number; priority: number;
    }[];

    const nightPricing: { date: string; priceSource: string; priceFcfa: number }[] = [];
    let accommodationAmount = 0;

    for (let i = 0; i < nights; i++) {
      const d = new Date(check_in);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);

      const override = overrideMap.get(date);
      if (override !== undefined) {
        nightPricing.push({ date, priceSource: "override", priceFcfa: override });
        accommodationAmount += override;
        continue;
      }

      const seasonal = seasonalRules.find(
        (r) => r.starts_on <= date && r.ends_on >= date && r.min_nights <= nights
      );
      if (seasonal) {
        nightPricing.push({ date, priceSource: "seasonal", priceFcfa: seasonal.price_fcfa });
        accommodationAmount += seasonal.price_fcfa;
        continue;
      }

      nightPricing.push({ date, priceSource: "base", priceFcfa: room.base_price_fcfa });
      accommodationAmount += room.base_price_fcfa;
    }

    const service_fee_amount = Math.round(accommodationAmount * SERVICE_FEE_RATE);
    const commission_amount = Math.round(accommodationAmount * COMMISSION_RATE);
    const total_amount = accommodationAmount + service_fee_amount;
    const host_payout_amount = accommodationAmount - commission_amount;

    return ok({
      room_id: room.id,
      room_name: room.name,
      base_price_fcfa: room.base_price_fcfa,
      nights,
      night_pricing: nightPricing,
      accommodation_amount: accommodationAmount,
      service_fee_rate: SERVICE_FEE_RATE,
      service_fee_amount,
      commission_rate: COMMISSION_RATE,
      commission_amount,
      total_amount,
      host_payout_amount,
      currency: "XOF",
    });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
