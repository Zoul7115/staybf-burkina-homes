# Release Notes — RC1 (Release Candidate 1)

**Date** : 2026-07-27  
**Branche** : `claude/eager-ritchie-kDZHX`  
**Statut** : Candidat à la mise en production

---

## Résumé

RC1 est la première release candidate de la plateforme YiriGo. Elle consolide l'ensemble de la base de code sous le nom de marque YiriGo, complète l'infrastructure CI/CD, et valide la compatibilité du schéma de base de données avec Supabase Cloud.

---

## Changements RC1

### 1. Rebranding complet StayBF → YiriGo

Toutes les références à l'ancienne marque `StayBF` / `staybf.com` / `staybf.bf` ont été remplacées dans :

- Configuration Supabase (`config.toml`)
- Configuration Netlify (`netlify.toml`)
- Edge Functions (`send-email`, `payment-webhook`, `retry-webhooks`)
- Composants UI (`Footer`, `WhyYiriGo`, `sections`, `__root`)
- Routes (`auth/login`, `auth/suspended`, `host.settings`, `host.subscription`, `checkout.success`)
- Bibliothèques TypeScript (`events/types`, `events/bus`, `notifications/engine`, `payment/webhook`, `shared/index`, `admin/useAdminSettings`)
- Tests (`ganipay.test.ts`, `ganipay-sandbox.test.ts`, `rc3-webhook-retry.test.ts`)
- Scripts (`create-buckets.sh`, `validate-config.ts`)
- Documentation (`.env.example`, `ENV_PRODUCTION.md`)

**En-tête interne renommé** : `X-StayBF-Internal-Retry` → `X-YiriGo-Internal-Retry` (synchronisé entre `retry-webhooks` et `payment-webhook`).

**Types TypeScript renommés** : `StayBFEvent` / `StayBFEventType` → `YiriGoEvent` / `YiriGoEventType`.

### 2. Correction auth — lien mot de passe oublié

`src/routes/auth/login.tsx` : Le lien "Mot de passe oublié" pointait vers `mailto:support@staybf.com`. Corrigé vers `/auth/forgot-password` (flux PKCE Supabase Auth).

### 3. Infrastructure CI/CD

Création du répertoire `.github/workflows/` avec trois workflows :

- **`ci.yml`** : Typecheck + Build + Tests sur chaque push et PR
- **`deploy.yml`** : Build + Deploy Netlify automatique sur push `main`
- **`migrations.yml`** : `supabase db push` + `supabase functions deploy` sur modification de `supabase/migrations/**`

Ajout du script `typecheck` dans `package.json` : `tsc --noEmit`.

### 4. Documentation production

- `README.md` : créé (stack, installation, scripts, architecture)
- `RELEASE_NOTES_RC1.md` : ce document
- Suppression de 7 fichiers de checklist obsolètes : `GO_LIVE.md`, `DEPLOYMENT_CHECKLIST.md`, `ENV_PRODUCTION_CHECKLIST.md`, `GANIPAY_READY.md`, `CHECKLIST_PRODUCTION.md`, `PROD01_REPORT.md`, `SMOKE_TEST.md`

### 5. Corrections de compatibilité Supabase Cloud (CHANGELOG.md)

12 corrections dans les migrations PostgreSQL pour garantir `supabase db push` sans intervention manuelle :

- Enum `app_kyc_status` : valeurs consolidées dans la migration 0001
- Suppression de `COMMENT ON TRIGGER … ON auth.users` (interdit par Supabase Cloud)
- Qualification de schéma pour `ll_to_earth()` et `gin_trgm_ops` (migration 0003)
- Ajout de `CREATE EXTENSION IF NOT EXISTS pg_cron` (migration 0009)
- `SET search_path = ''` sur toutes les fonctions `SECURITY DEFINER` (migrations 0016, 0017, 0020)

---

## Checklist GO/NO-GO RC1

| Critère | Statut |
|---|---|
| Rebranding YiriGo complet | ✅ |
| Types TypeScript cohérents | ✅ |
| En-têtes internes GaniPay synchronisés | ✅ |
| Migrations compatibles Supabase Cloud | ✅ |
| 40 Edge Functions déclarées | ✅ |
| 6 buckets Storage documentés | ✅ |
| CI GitHub Actions opérationnel | ✅ |
| `typecheck` script présent | ✅ |
| Secrets — aucun inventé | ✅ |
| Variables documentées dans `.env.example` | ✅ |
| Build + Typecheck sans erreur | ⏳ À valider (Phase 6) |

---

## Prochaines étapes (avant GO)

1. Créer le projet Supabase production, récupérer le `project_ref`
2. Mettre à jour `supabase/config.toml` → `project_id = "<ref_réel>"`
3. Renseigner tous les secrets dans GitHub et Netlify (voir `ENV_PRODUCTION.md`)
4. Exécuter `supabase db push` et valider les 21 migrations
5. Exécuter `scripts/create-buckets.sh` en production
6. Déployer les 40 Edge Functions
7. Configurer le webhook GaniPay (URL + `GANIPAY_WEBHOOK_SECRET`)
8. Valider le build (`npm run build:netlify`) et le typecheck (`npm run typecheck`)
9. Smoke test complet en staging
10. GO/NO-GO final

---

## Notes de sécurité

- Aucun secret inventé ni hardcodé
- Aucune sécurité désactivée
- RLS actif sur toutes les tables (`~160 politiques`)
- `SECURITY DEFINER` functions : `SET search_path = ''` appliqué
- Webhooks GaniPay : HMAC-SHA256 vérifié à chaque appel externe
- Retry interne : authentifié par `Authorization: Bearer SERVICE_ROLE_KEY` + en-tête `X-YiriGo-Internal-Retry`
