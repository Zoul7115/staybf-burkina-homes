# StayBF — Business Logic Blueprint
**Version:** 1.0 · **Author:** Senior Product Architect · **Scope:** All workflows that must exist before any database migration or backend code is written.

> Convention used in every workflow card:
> **Trigger · Preconditions · Main Flow · Alternative Flow · Failure Flow · Database Impact · Notifications · Permissions · Final Status · Audit Events · Edge Cases**
>
> Roles: `guest` (anonymous), `traveler`, `host`, `admin`, `support`, `finance`, `system`.
> Currency: **FCFA (XOF)**. Time zone: **Africa/Ouagadougou (UTC+0)**.
> Default booking model: **Request-to-Book** with optional **Instant Book** (host opt-in).
> Service fee: **10%** charged to the traveler. Host commission: **12%** retained by StayBF on the nightly subtotal. Mobile-money processor fee (CinetPay) passed through at cost.

---

## 0. Global Conventions

### 0.1 Status Vocabulary
- **User account:** `pending_email_verification` → `active` → `suspended` → `deactivated` → `deleted`
- **Host profile:** `draft` → `pending_review` → `verified` → `rejected` → `suspended`
- **Property:** `draft` → `pending_review` → `published` → `paused` → `rejected` → `archived`
- **Room/Unit:** `draft` → `active` → `inactive` → `archived`
- **Booking:** `pending_payment` → `awaiting_host` → `confirmed` → `checked_in` → `completed` → `cancelled_by_traveler` → `cancelled_by_host` → `cancelled_by_system` → `no_show` → `disputed`
- **Payment:** `initiated` → `processing` → `succeeded` → `failed` → `refunded_partial` → `refunded_full` → `chargeback`
- **Payout:** `pending` → `scheduled` → `processing` → `paid` → `failed` → `on_hold`
- **Subscription:** `trialing` → `active` → `past_due` → `cancelled` → `expired`
- **Review:** `draft` → `published` → `hidden` → `removed`
- **Ticket:** `open` → `in_progress` → `waiting_user` → `resolved` → `closed`

### 0.2 Universal Validation Rules
- All emails RFC 5322; phone numbers E.164 with `+226` default.
- All monetary values are non-negative integers in **FCFA cents-of-franc not used** — store as integer FCFA.
- All dates compared at **noon Africa/Ouagadougou** to avoid DST/timezone drift (none in BF, but normalised for future expansion).
- Idempotency key required on every write triggered by webhook or retry.

### 0.3 Audit Event Envelope
Every audit entry records: `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `before`, `after`, `ip`, `user_agent`, `request_id`, `created_at`.

### 0.4 Notification Channels
`in_app`, `email`, `sms`, `push`, `webhook_host_pms`. Each template has language variants `fr`, `en`, `moo` (Mooré), `dyu` (Dioula). All transactional messages must include the booking reference where applicable.

---

## 1. User Registration (Traveler)

**Trigger:** Visitor submits the sign-up form or completes social/OTP flow.

**Preconditions:**
- No existing `active` account with same email **or** phone.
- User accepted Terms of Service and Privacy Policy (timestamped consent).
- reCAPTCHA / device fingerprint passes anti-bot threshold.

**Main Flow:**
1. Validate inputs (email, phone, password ≥10 chars, age ≥18).
2. Create `users` row with status `pending_email_verification`.
3. Assign role `traveler` in `user_roles`.
4. Send verification email (link valid 24 h) **and** SMS OTP (valid 10 min, 5 attempts).
5. On verification, status → `active`; create empty `traveler_profile`, default notification prefs, default language from `Accept-Language`.

**Alternative Flow:**
- Sign-up via Google/Apple: skip password; mark email as verified; still require phone OTP before first booking.
- Sign-up initiated during checkout: account is created in `pending_email_verification` and booking is held for 30 min while user verifies.

**Failure Flow:**
- Duplicate email → return generic "If this email exists, we sent instructions" (avoid enumeration).
- OTP expired/exhausted → lock OTP for 15 min, allow email fallback.
- Anti-bot fails → silently shadow-block, log event, return success.

**Database Impact:** `users`, `user_roles`, `traveler_profiles`, `consents`, `auth_otp_attempts`, `notification_preferences`.

**Notifications:** Verification email, SMS OTP, welcome email after activation.

**Permissions Required:** Public.

**Final Status:** `active` (traveler).

**Audit Events:** `user.registered`, `user.email_verified`, `user.phone_verified`.

**Edge Cases:** Phone reused across accounts → block second use; user changes email before verifying → invalidate prior token.

---

## 2. Host Registration

**Trigger:** Traveler clicks "Devenir hôte" or new visitor signs up via host funnel.

**Preconditions:**
- Active user account.
- Phone number verified.
- Country of operation = Burkina Faso (or supported expansion country).

**Main Flow:**
1. Collect business info: legal name, RCCM number (optional for individuals), IFU tax ID (optional), city, address.
2. Collect payout method: Orange Money, Moov Money, or bank IBAN.
3. Create `host_profiles` row, status `draft`; add `host` role to `user_roles` (multi-role allowed).
4. User can save and resume; once submitted, status → `pending_review`.

**Alternative Flow:** Existing host adding a second business entity → creates additional `host_profiles` row linked to same `user_id`.

**Failure Flow:** Missing payout method → cannot submit. Duplicate RCCM → flag for manual review, do not auto-reject.

**Database Impact:** `host_profiles`, `payout_methods`, `user_roles`.

**Notifications:** "Application reçue" email + in-app; admin queue alert.

**Permissions Required:** Authenticated `active` user.

**Final Status:** `pending_review`.

**Audit Events:** `host.application_submitted`.

**Edge Cases:** User downgrades from host back to traveler → host_profile archived but historical bookings retained.

---

## 3. Host Verification (KYC)

**Trigger:** Host submits KYC documents OR admin opens pending application.

**Preconditions:** Host profile in `pending_review`.

**Main Flow:**
1. Host uploads: government ID (front+back), selfie, proof of property ownership or mandate, business registration (if company).
2. Files stored in private `kyc-documents` bucket, encrypted at rest, signed-URL access only.
3. Automated checks: file type, max 10 MB, OCR readability score, face-match selfie↔ID.
4. Admin reviews in moderation queue; decisions: `approve`, `request_more_info`, `reject`.
5. On approve: host_profile → `verified`, verified badge granted, ability to publish properties unlocked.

**Alternative Flow:** Third-party KYC provider (Smile ID) returns automated decision; admin only handles ambiguous cases (confidence < 0.85).

**Failure Flow:**
- Reject reason recorded; host may resubmit after 24 h cooldown.
- `request_more_info` sends templated checklist; status remains `pending_review` with sub-state `awaiting_documents`.

**Database Impact:** `kyc_submissions`, `kyc_documents`, `host_profiles.status`, `verification_decisions`.

**Notifications:** Host informed of decision in all channels; admin Slack/webhook on new submission.

**Permissions Required:** `host` to upload; `admin` or `support` (KYC scope) to review.

**Final Status:** `verified` or `rejected`.

**Audit Events:** `host.kyc_submitted`, `host.kyc_approved`, `host.kyc_rejected`, `host.kyc_more_info_requested`.

**Edge Cases:** Expired ID → block approval, mark for re-KYC every 24 months; sanctions list hit → freeze account, escalate to compliance.

---

## 4. Property Creation

**Trigger:** Verified host clicks "Ajouter un hébergement".

**Preconditions:** Host status `verified`; active subscription OR within free-tier listing quota (Découverte plan = max 1 property).

**Main Flow:**
1. Step wizard: type (hotel, residence, villa, apartment, guesthouse, lodge), location (geocoded), capacity, amenities, rules, photos (min 5, max 30), description (≥120 chars FR), base price/night, cancellation policy preset.
2. Auto-derive `min_price_fcfa` and `rating_avg=null`.
3. Save as `draft`; host can preview as traveler.
4. Submit → status `pending_review`.

**Alternative Flow:** Bulk import via CSV (Pro/Entreprise plans) → each row validated, errors returned per line.

**Failure Flow:** Geocoding fails → host must drop a pin manually. Photos fail moderation (NSFW or watermark) → blocked at upload.

**Database Impact:** `properties`, `property_photos`, `property_amenities`, `property_rules`, `cancellation_policies`.

**Notifications:** Host: "Annonce soumise pour examen". Admin queue updated.

**Permissions Required:** `host` (verified) on own `host_profile_id`.

**Final Status:** `pending_review`.

**Audit Events:** `property.created`, `property.submitted`.

**Edge Cases:** Subscription quota exceeded → block submission, prompt upgrade; duplicate address detected → require admin override.

---

## 5. Property Approval

**Trigger:** Admin opens property in moderation queue.

**Preconditions:** Property in `pending_review`.

**Main Flow:**
1. Admin reviews photos, description, pricing sanity (vs city median), policy completeness.
2. Decision: `publish`, `request_changes`, `reject`.
3. On `publish`: status → `published`, indexed in search, appears in homepage if quality-score ≥ threshold.

**Alternative Flow:** Auto-publish enabled for hosts with ≥5 prior approved properties AND verified ≥6 months.

**Failure Flow:** Reject with reason codes (low_quality_photos, misleading_info, prohibited_content, duplicate, pricing_outlier). Host can edit and resubmit.

**Database Impact:** `properties.status`, `moderation_decisions`, `search_index` row upsert.

**Notifications:** Host (all channels), traveler followers if any.

**Permissions Required:** `admin` with `property:moderate`.

**Final Status:** `published` or `rejected`.

**Audit Events:** `property.approved`, `property.rejected`, `property.changes_requested`.

**Edge Cases:** Host edits a `published` property significantly (price ±50%, location change, capacity change) → auto-flip to `pending_review` minor edits stay live.

---

## 6. Room / Unit Creation

**Trigger:** Host opens "Chambres" tab for a hotel/residence property.

**Preconditions:** Property `published` or `draft`; property type supports multiple rooms (hotel, residence, guesthouse). Villas/apartments may have exactly one implicit room.

**Main Flow:**
1. Host defines room type (single, double, suite, family), max guests, bed config, base price, included amenities, quantity available.
2. Save → status `active`.
3. Each room generates its own availability calendar and price grid.

**Alternative Flow:** Clone from existing room.

**Failure Flow:** Sum of room capacities cannot exceed property capacity by >20% (overbooking guard).

**Database Impact:** `rooms`, `room_amenities`, `room_pricing_rules`.

**Notifications:** None (silent).

**Permissions Required:** `host` owner.

**Final Status:** `active`.

**Audit Events:** `room.created`, `room.updated`, `room.archived`.

**Edge Cases:** Reducing quantity below currently booked → require admin override; archived room must have zero future bookings.

---

## 7. Room Availability & Pricing

**Trigger:** Host edits calendar; system runs nightly availability sweep; booking confirmed/cancelled.

**Preconditions:** Room `active`.

**Main Flow:**
1. Calendar stored as date-range table (`room_availability`) with closed-open intervals.
2. Host sets blocked dates, seasonal price overrides, minimum-stay, check-in/out day restrictions.
3. On booking confirm: dates locked; on cancel: dates released.
4. Nightly job recomputes `min_price_fcfa` and next-available date.

**Alternative Flow:** iCal sync (Pro plan) imports external blocks every 15 min.

**Failure Flow:** Double-booking detected by exclusion constraint → second booking auto-cancelled with refund + apology credit.

**Database Impact:** `room_availability`, `pricing_rules`, `seasonal_overrides`.

**Notifications:** On conflict resolution, affected traveler + host notified immediately.

**Permissions Required:** `host` owner; `system` for sync jobs.

**Final Status:** Availability matrix updated.

**Audit Events:** `availability.blocked`, `availability.released`, `pricing.updated`, `availability.conflict_resolved`.

**Edge Cases:** Past dates cannot be blocked; overlapping seasonal rules resolved by highest priority then most recent.

---

## 8. Booking Creation (Request)

**Trigger:** Traveler clicks "Réserver maintenant".

**Preconditions:**
- Traveler account `active`, email verified, phone verified.
- Property `published`, room `active`, dates available, guests ≤ capacity.
- Check-in ≥ now+2 h (allows host prep), check-out > check-in, stay ≤ 90 nights.

**Main Flow:**
1. Server recomputes price (never trust client): `nights × nightly + cleaning + extras`.
2. Apply service fee 10% (traveler), taxes, promo code if any.
3. Create `bookings` row, status `pending_payment`, hold availability for 15 min.
4. Redirect to checkout / payment intent.

**Alternative Flow:**
- **Instant Book:** after payment success, status jumps directly to `confirmed`.
- **Request-to-Book:** after payment authorisation (not capture), status → `awaiting_host` for 24 h.

**Failure Flow:** Availability lost between view and submit → 409, suggest nearest available dates.

**Database Impact:** `bookings`, `booking_items`, `availability_holds`, `price_breakdowns`.

**Notifications:** Traveler: hold confirmation. Host: new request alert (in_app + push + SMS).

**Permissions Required:** Authenticated traveler.

**Final Status:** `pending_payment` → (after payment) `awaiting_host` or `confirmed`.

**Audit Events:** `booking.created`, `booking.hold_placed`.

**Edge Cases:** Same traveler holds 3+ unpaid bookings simultaneously → block new holds; promo code single-use enforcement.

---

## 9. Booking Confirmation

**Trigger:** Host accepts request, OR Instant-Book payment succeeds, OR 24 h timer hits with auto-accept on.

**Preconditions:** Booking in `awaiting_host` or `pending_payment` (Instant Book) with successful payment.

**Main Flow:**
1. Status → `confirmed`.
2. Capture payment (if previously authorised).
3. Lock availability permanently.
4. Generate booking reference `STBF-XXXXXX` (Crockford base32, collision-checked).
5. Issue traveler e-receipt PDF, host confirmation summary.
6. Schedule reminders: T-3 days, T-24 h, T-2 h.

**Alternative Flow:** Host declines → status `cancelled_by_host`; full refund; cooldown counter increments. Three declines in 30 days → host receives warning; five → mandatory review by admin.

**Failure Flow:** Payment capture fails on confirmation → booking auto-cancelled, traveler notified, host notified.

**Database Impact:** `bookings.status`, `payments.status`, `availability` (final lock), `booking_references`, `notifications_queue`.

**Notifications:** Confirmation email + SMS + push to both parties; in-app thread auto-created.

**Permissions Required:** Host owner OR system.

**Final Status:** `confirmed`.

**Audit Events:** `booking.confirmed`, `booking.declined`, `booking.auto_confirmed`.

**Edge Cases:** Time zone of property used for check-in deadlines; host on vacation mode auto-declines silently.

---

## 10. Booking Cancellation

**Trigger:** Traveler or host requests cancellation; system enforces no-show.

**Preconditions:** Booking in `confirmed` or earlier and check-out date not passed.

**Main Flow (Traveler):**
1. Apply cancellation policy (flexible / moderate / strict / non-refundable):
   - **Flexible:** full refund if cancelled ≥24 h before check-in.
   - **Moderate:** full refund ≥5 days before; 50% otherwise.
   - **Strict:** 50% refund ≥7 days before; none otherwise.
   - **Non-refundable:** service fee refundable only.
2. Compute refundable amount, create refund request, status → `cancelled_by_traveler`.
3. Release availability.

**Main Flow (Host):** Always full refund + host penalty: 10% of booking value deducted from next payout (max 50 000 FCFA), search-ranking penalty 30 days.

**Alternative Flow:** Force-majeure cancellation (admin override) → 100% refund, no penalty either side. Evidence required.

**Failure Flow:** Payment provider refund fails → ticket auto-opened with `finance` team, traveler kept informed every 24 h.

**Database Impact:** `bookings.status`, `refunds`, `host_penalties`, `availability` release.

**Notifications:** Both parties notified with itemised refund breakdown.

**Permissions Required:** Booking party OR `admin`.

**Final Status:** `cancelled_by_traveler` / `cancelled_by_host` / `cancelled_by_system`.

**Audit Events:** `booking.cancelled`, `refund.initiated`, `host.penalty_applied`.

**Edge Cases:** Cancellation during check-in window — pro-rate first night non-refundable; partial-stay early checkout handled as Booking Completion with shortened stay.

---

## 11. Booking Completion

**Trigger:** Checkout date passes by 24 h with no dispute.

**Preconditions:** Booking `confirmed` or `checked_in`.

**Main Flow:**
1. Status → `completed`.
2. Trigger payout to host (see §13).
3. Send review-request to traveler (T+24 h, reminder T+5 d, final T+10 d).
4. Update host stats: completed_count++, response_rate, recompute rating_avg.

**Alternative Flow:** Traveler reports no-show within 24 h of check-in → status `no_show`, host receives 50% of nightly rate for one night, traveler refunded remainder.

**Failure Flow:** Active dispute open → freeze payout, status → `disputed`, support takes over.

**Database Impact:** `bookings.status`, `payouts`, `host_stats`, `review_invitations`.

**Notifications:** Traveler review prompt, host payout notice.

**Permissions Required:** `system`.

**Final Status:** `completed`.

**Audit Events:** `booking.completed`, `payout.scheduled`, `review.invited`.

**Edge Cases:** Stay extended in place → new booking auto-created with discounted nightly; original booking still completes on original checkout.

---

## 12. Payment Flow

**Trigger:** Traveler proceeds to pay.

**Preconditions:** Booking in `pending_payment`; amount ≥ 1 000 FCFA; payment method allowed (Orange Money, Moov Money, Visa/MC via CinetPay, in-app wallet credit).

**Main Flow:**
1. Create `payments` row status `initiated`, idempotency key = booking_id + attempt_no.
2. Call CinetPay create-transaction; receive `cpm_trans_id` and checkout URL.
3. Redirect/embed checkout; user authenticates with OTP at telco.
4. Await webhook (see §13) and synchronous return URL.
5. On success: payment status `succeeded`, booking advances.

**Alternative Flow:** **Split payments** allowed (max 2 payers) on bookings ≥150 000 FCFA. Each share is its own payment row; booking advances only when sum_succeeded = total.

**Failure Flow:** Decline → status `failed`, allow up to 3 retries within 30 min hold window. After 3 failures or expired hold, booking auto-cancelled.

**Database Impact:** `payments`, `payment_attempts`, `wallet_ledger`, `bookings.status`.

**Notifications:** Receipt on success; gentle retry prompt on failure.

**Permissions Required:** Authenticated traveler tied to booking.

**Final Status:** `succeeded` / `failed`.

**Audit Events:** `payment.initiated`, `payment.succeeded`, `payment.failed`, `payment.retried`.

**Edge Cases:** Currency must be XOF; refunds always to original method except wallet credit; PCI data never stored, only tokens; double-submit prevented via idempotency key.

---

## 13. CinetPay Webhook Flow

**Trigger:** CinetPay POSTs to `/api/public/webhooks/cinetpay`.

**Preconditions:** Endpoint public, HMAC secret configured, idempotency table available.

**Main Flow:**
1. Verify HMAC signature (timing-safe). Reject 401 if invalid.
2. Look up `cpm_trans_id`; if event already processed (idempotency), return 200 immediately.
3. Map CinetPay status → internal: `ACCEPTED`→`succeeded`, `REFUSED`→`failed`, `WAITING`→ignore.
4. Update `payments` and propagate to booking state machine.
5. Persist raw payload in `webhook_events` (90-day retention).
6. Return 200 within 5 s; if internal work exceeds 5 s, enqueue and return immediately.

**Alternative Flow:** Refund webhook → update `refunds.status`, adjust wallet ledger if traveler chose wallet credit.

**Failure Flow:**
- Signature invalid → 401, log.
- Internal failure → return 500; CinetPay retries up to 5 times with backoff; alert on 3rd failure.

**Database Impact:** `payments`, `refunds`, `webhook_events`, `bookings`.

**Notifications:** None directly; cascading flows fire their own.

**Permissions Required:** Public route guarded by signature.

**Final Status:** Webhook acknowledged.

**Audit Events:** `webhook.received`, `webhook.processed`, `webhook.rejected`.

**Edge Cases:** Out-of-order events handled by event timestamp + monotonic version field; replay attack mitigated by 5-min freshness window.

---

## 14. Revenue Distribution

**Trigger:** Booking transitions to `completed`.

**Preconditions:** Payment captured, no dispute, host KYC `verified`, payout method valid.

**Main Flow:**
1. Compute split per booking:
   - Traveler total = subtotal + service_fee(10%) + taxes
   - StayBF commission = 12% of subtotal
   - Processor fee = pass-through
   - Host net = subtotal − commission − processor_fee_share
2. Create `payouts` row status `pending`, scheduled T+24 h (Instant) or T+5 d (Standard).
3. Bundle multiple bookings per host into a single payout batch (daily cutoff 18:00).
4. Send to CinetPay payout API → status `processing` → `paid` on confirmation.

**Alternative Flow:** Host on `Pro`/`Entreprise` plan eligible for next-day payouts. Travelers with wallet credit refunds bypass processor.

**Failure Flow:** Payout fails (wrong number, KYC mismatch) → status `failed`, retry up to 3 times over 7 days, then `on_hold` and support ticket auto-created.

**Database Impact:** `payouts`, `payout_items`, `ledger_entries`, `host_balances`.

**Notifications:** Host payout-sent SMS + email with reference.

**Permissions Required:** `system`, `finance` for overrides.

**Final Status:** `paid`.

**Audit Events:** `payout.created`, `payout.sent`, `payout.failed`, `payout.held`.

**Edge Cases:** Mid-stay refund triggers clawback against next payout; negative host balance triggers manual recovery flow.

---

## 15. Host Subscription Flow

**Trigger:** Host chooses or upgrades a plan: **Découverte (Free)**, **Croissance (15 000/mo)**, **Pro (45 000/mo)**, **Entreprise (annual, custom)**.

**Preconditions:** Host `verified`; valid payment method.

**Main Flow:**
1. Create `subscriptions` row, 14-day `trialing` for paid plans (first time only).
2. Activate plan features (extra listings, analytics, iCal sync, priority support).
3. Schedule recurring charge (monthly or annual anniversary).
4. On successful charge, status `active`, period extended.

**Alternative Flow:**
- Downgrade scheduled at end of current period (no proration loss).
- Upgrade pro-rates remaining days, charges difference immediately.

**Failure Flow:** Charge declined → status `past_due`, 3 retry attempts over 7 days, dunning emails day 1/3/7.

**Database Impact:** `subscriptions`, `subscription_events`, `invoices`, `feature_flags_per_host`.

**Notifications:** Trial-ending T-3 d, charge success, charge failure, plan changes.

**Permissions Required:** Host owner; `admin` for comped plans.

**Final Status:** `active`, `past_due`, `cancelled`, `expired`.

**Audit Events:** `subscription.created`, `subscription.charged`, `subscription.upgraded`, `subscription.downgraded`, `subscription.cancelled`.

**Edge Cases:** Free-plan host exceeds listing quota → most-recent inactive listings auto-paused, never deleted.

---

## 16. Subscription Expiration

**Trigger:** Subscription end date reached without successful renewal.

**Preconditions:** Subscription in `past_due` after 7-day dunning.

**Main Flow:**
1. Status → `expired`.
2. Premium features disabled at next request (read-only access retained 30 days).
3. Listings beyond free quota auto-paused (status `paused`), never deleted.
4. Future bookings already `confirmed` are honoured.

**Alternative Flow:** Host pays outstanding invoice within grace 30 days → reinstated with same plan, no data loss.

**Failure Flow:** Host disputes charge → freeze account features pending finance review.

**Database Impact:** `subscriptions.status`, `feature_flags_per_host`, `properties.status`.

**Notifications:** "Abonnement expiré" + reactivation CTA; weekly reminder during grace.

**Permissions Required:** `system`.

**Final Status:** `expired`.

**Audit Events:** `subscription.expired`, `listings.auto_paused`, `subscription.reinstated`.

**Edge Cases:** Annual plan grace period extended to 45 days.

---

## 17. Messaging

**Trigger:** Traveler or host opens a conversation thread.

**Preconditions:** Both parties have an account; thread tied to a property or a booking; no party blocked the other.

**Main Flow:**
1. Pre-booking thread allowed up to 10 messages without a booking; further messages require booking creation (anti-spam).
2. Messages stored in `messages` table; attachments via signed URLs in `message-attachments` bucket (max 5 MB image/PDF).
3. Real-time delivery via Supabase Realtime channel scoped to `thread_id`.
4. PII scrubber masks phone/email/URLs in pre-booking phase; admin-reviewable.

**Alternative Flow:** Automated messages (booking confirmation, reminders) posted by `system` user.

**Failure Flow:** Recipient deleted account → thread frozen with banner. Attachment fails virus scan → blocked.

**Database Impact:** `threads`, `messages`, `message_reads`, `attachments`.

**Notifications:** Push + email digest if unread > 30 min.

**Permissions Required:** Thread participants only.

**Final Status:** Message stored `delivered`/`read`.

**Audit Events:** `message.sent`, `message.flagged`, `thread.created`.

**Edge Cases:** Messages older than 24 months archived to cold storage; legal hold disables deletion.

---

## 18. Reviews

**Trigger:** Booking `completed` ≥ 24 h ago and ≤ 14 days ago.

**Preconditions:** Reviewer was the booking party; no prior review for that booking.

**Main Flow:**
1. Traveler rates 1–5 on overall + criteria (cleanliness, accuracy, communication, location, value).
2. Host writes private feedback about traveler (visible only to other hosts in aggregate).
3. **Double-blind reveal:** both reviews held until both submitted, OR 14-day window closes (then revealed individually).
4. Aggregated rating recomputed; property `rating_avg` and `review_count` updated.

**Alternative Flow:** Either party may decline to review.

**Failure Flow:** Review fails content moderation (profanity, PII, retaliation, prohibited content) → held for human moderation up to 72 h.

**Database Impact:** `reviews`, `review_criteria_scores`, `property_stats`, `host_stats`.

**Notifications:** Reveal email to both parties; moderation outcome.

**Permissions Required:** Booking party; `admin` to hide.

**Final Status:** `published` (default), `hidden`, `removed`.

**Audit Events:** `review.submitted`, `review.published`, `review.hidden`, `review.appealed`.

**Edge Cases:** Edits allowed within 48 h of publish; reviews on cancelled bookings disallowed (except `cancelled_by_host` → traveler may leave a one-line note).

---

## 19. Favorites

**Trigger:** Traveler taps heart icon on property card.

**Preconditions:** Authenticated traveler (guests are prompted to sign in; favorite is queued in local storage and persisted post-sign-in).

**Main Flow:**
1. Insert into `favorites(user_id, property_id)` with unique constraint.
2. Update UI optimistically; rollback on error.
3. Optional: organise into named lists (max 20 lists, 200 items each).

**Alternative Flow:** Unfavorite → soft delete with `removed_at` to support undo within 10 s.

**Failure Flow:** Property archived → favorite preserved but card shows "Not available"; traveler can remove.

**Database Impact:** `favorites`, `favorite_lists`, `favorite_list_items`.

**Notifications:** Optional weekly digest "Prices dropped on your favorites".

**Permissions Required:** Owner only.

**Final Status:** Stored.

**Audit Events:** `favorite.added`, `favorite.removed`.

**Edge Cases:** Favoriting own property is allowed but excluded from digests.

---

## 20. Notifications

**Trigger:** Any domain event with subscribers; user opens notification center.

**Preconditions:** Recipient has consented to channel; quiet hours respected per user (default 22:00–07:00 local).

**Main Flow:**
1. Producer publishes event to `notifications_outbox`.
2. Dispatcher fans out by channel based on recipient prefs, dedupes by `(user_id, event_key, dedupe_window)`.
3. Provider sends; delivery receipt stored; retries with exponential backoff (max 5).
4. In-app counters updated via realtime channel.

**Alternative Flow:** Critical events (payment failure, booking cancellation) bypass quiet hours and channel-off preferences for transactional necessity.

**Failure Flow:** Hard bounce on email → mark address invalid, switch to SMS/push fallback, prompt user to update.

**Database Impact:** `notifications_outbox`, `notifications_delivery`, `notification_preferences`.

**Notifications:** N/A (this *is* notifications).

**Permissions Required:** Recipient.

**Final Status:** `delivered` / `failed`.

**Audit Events:** `notification.queued`, `notification.delivered`, `notification.bounced`.

**Edge Cases:** Marketing campaigns require explicit opt-in (CNIL-style consent) separate from transactional.

---

## 21. Admin Moderation (Cross-Cutting)

**Trigger:** Item enters any moderation queue (property, review, message report, KYC, refund).

**Preconditions:** Admin authenticated, role + scope permission.

**Main Flow:**
1. Item routed to appropriate queue based on type + risk score.
2. SLA timers start: KYC 24 h, property 48 h, review report 24 h, refund 72 h.
3. Admin decides; decision recorded with reason code + free-text note.
4. Affected entities updated; notifications sent.

**Alternative Flow:** Bulk actions allowed for low-risk items (e.g., approve all photos of same host).

**Failure Flow:** SLA breach → auto-escalate to senior admin; metrics reported in admin analytics.

**Database Impact:** `moderation_queue`, `moderation_decisions`, `sla_events`.

**Notifications:** Affected user notified with decision + appeal option.

**Permissions Required:** `admin` with relevant scope (`property:moderate`, `kyc:review`, `refund:approve`, …).

**Final Status:** Item routed to outcome state.

**Audit Events:** `moderation.opened`, `moderation.decided`, `moderation.escalated`, `moderation.appealed`.

**Edge Cases:** Self-moderation forbidden (admin who is also a host cannot moderate own listings); four-eyes principle for refunds ≥500 000 FCFA.

---

## 22. Refund Requests

**Trigger:** Traveler requests refund (in-app), host initiates goodwill refund, admin issues refund.

**Preconditions:** Payment `succeeded`; refundable amount > 0; within 90-day window from check-out.

**Main Flow:**
1. Request captured with reason + evidence (photos, messages).
2. Cancellation-policy-driven refunds: auto-approve, fire CinetPay refund call.
3. Goodwill / disputed refunds: route to `support` then `finance` if > 100 000 FCFA.
4. On provider success: `refunds.status` `succeeded`; booking status updated if relevant; ledger adjusted; clawback host payout if necessary.

**Alternative Flow:** Wallet credit refund (instant) if traveler opts in; saves processor fee.

**Failure Flow:** Provider refund fails 3× → escalate to manual treasury process; traveler kept informed every 48 h; SLA 7 days.

**Database Impact:** `refunds`, `refund_evidence`, `ledger_entries`, `host_balances`.

**Notifications:** Status updates at each transition; PDF credit note on success.

**Permissions Required:** Traveler (own bookings), Host (own bookings), `admin` (any), `finance` (large).

**Final Status:** `refunded_partial` / `refunded_full` / `denied`.

**Audit Events:** `refund.requested`, `refund.approved`, `refund.denied`, `refund.succeeded`, `refund.failed`, `clawback.applied`.

**Edge Cases:** Chargeback received from card network → status `chargeback`, immediate host clawback, evidence packet auto-assembled.

---

## 23. Account Suspension

**Trigger:** Policy violation (manual admin action), system rule (e.g., 3 chargebacks in 90 days, fraud signals), regulatory hold.

**Preconditions:** Reason documented; severity classified (warning, temporary, indefinite).

**Main Flow:**
1. User status → `suspended` with `suspension_reason`, `suspension_until` (nullable for indefinite).
2. Active sessions revoked; new logins blocked at auth layer with informative message + appeal link.
3. Outstanding bookings:
   - If host suspended: future bookings auto-cancelled with full refund + force-majeure flag (no traveler penalty); travellers notified with rebooking credit.
   - If traveler suspended: future bookings cancelled per cancellation policy; refunds processed minus penalty.
4. Listings of suspended host moved to `paused` (not deleted) to preserve history.

**Alternative Flow:** Temporary suspension auto-lifts at `suspension_until`; user receives email 24 h prior.

**Failure Flow:** User attempts circumvention (new account same KYC) → block at signup via device + ID fingerprint.

**Database Impact:** `users.status`, `suspensions`, `sessions` (revoked), cascading status flips.

**Notifications:** Suspension email with reason, duration, appeal link.

**Permissions Required:** `admin` with `account:suspend`; system rules require admin review within 24 h.

**Final Status:** `suspended`.

**Audit Events:** `account.suspended`, `bookings.cascade_cancelled`, `sessions.revoked`.

**Edge Cases:** Pending payouts to suspended host held until investigation closes; legal hold supersedes routine suspension lifts.

---

## 24. Reactivation Process

**Trigger:** Suspension period ends, user submits appeal, or admin reverses decision.

**Preconditions:** Account in `suspended` or `deactivated` (self-deactivation reversible within 30 days).

**Main Flow:**
1. Appeal form submitted with explanation + evidence.
2. Routed to `admin` (or original suspending admin's manager — four-eyes).
3. Decision: `reinstate`, `keep_suspended`, `escalate`.
4. On reinstate: status → `active`, paused listings stay paused (host must republish), historical bookings/reviews preserved.

**Alternative Flow:** Self-reactivation of voluntarily deactivated account → instant via email confirmation if within 30 days; after 30 days, account anonymised per retention policy and cannot be reactivated.

**Failure Flow:** Appeal denied → user may re-appeal after 60 days unless permanent ban.

**Database Impact:** `users.status`, `suspensions.lifted_at`, `appeals`.

**Notifications:** Decision email; welcome-back in-app banner on reinstate.

**Permissions Required:** `admin`; second admin required for sensitive cases.

**Final Status:** `active` or remains `suspended`.

**Audit Events:** `account.appeal_submitted`, `account.reinstated`, `account.appeal_denied`.

**Edge Cases:** KYC re-verification required if suspension related to identity fraud; new payout method must be re-verified.

---

## Appendix A — Permissions Matrix (Summary)

| Action | Guest | Traveler | Host | Support | Admin | Finance |
|---|---|---|---|---|---|---|
| Browse listings | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create booking | – | ✓ | ✓ (as traveler) | – | – | – |
| Manage own listings | – | – | ✓ | – | – | – |
| Approve property | – | – | – | – | ✓ | – |
| Review KYC | – | – | – | ✓ (scope) | ✓ | – |
| Issue refund ≤ 100k | – | – | – | ✓ | ✓ | ✓ |
| Issue refund > 100k | – | – | – | – | – | ✓ |
| Suspend account | – | – | – | – | ✓ | – |
| Adjust ledger | – | – | – | – | – | ✓ |
| Send broadcast | – | – | – | – | ✓ | – |

## Appendix B — Cross-Workflow Edge Cases

1. **Property deleted mid-stay** → impossible; property goes to `paused`. Active stay completes normally.
2. **Traveler dies / legal incapacity** → next of kin support workflow; bookings cancelled with full refund regardless of policy on presentation of death certificate.
3. **Multi-role user** (host + traveler) — role context must be active and explicit in every authorisation check; never infer.
4. **Time-of-check vs time-of-use** — all booking pricing, availability, and policy decisions recomputed at the moment of state transition, never trusting stale client data.
5. **GDPR / data export** — every entity referencing a user must support anonymisation rather than hard-delete to preserve financial records (legally required retention 10 years).
6. **Public events surface (sitemap, share)** — only `published` properties and `completed` reviews exposed; never PII.

---

**End of Blueprint v1.0** — ready for ERD finalisation and migration authoring.
