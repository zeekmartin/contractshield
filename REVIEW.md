# Revue Complète – ContractShield v0.1

Date: 2026-01-17

---

## Résumé exécutif

Le projet ContractShield est une implémentation solide d'une couche de sécurité applicative basée sur le modèle PEP/PDP/PAP. L'architecture est claire, le scope v0.1 est réaliste, et les choix technologiques sont pertinents.

**Points forts:**
- Architecture propre avec séparation des responsabilités
- Fonction pure `evaluate()` → testabilité excellente
- CEL comme langage de policy : bon compromis simplicité/expressivité
- Extension points bien pensés (celEvaluator, schemaLoader, replayStore)
- Scope v0.1 réaliste : pas de feature creep
- Documentation de qualité professionnelle (manifesto, threat model, 12 principes)

**Axes d'amélioration prioritaires:**
1. Fixtures trop verbeux → maintenabilité difficile
2. Pas de tests unitaires dans le repo
3. Cache AJV manquant (perf)
4. Évaluateur CEL subset fragile
5. Écart doc/code sur features futures (oauth, uploads, rate limits) → ajouter badges `[future]`

---

## 1. Revue conceptuelle

### 1.1 Le modèle PEP/PDP/PAP est-il adapté ?

**Oui, c'est un excellent choix.**

Le pattern PEP/PDP/PAP (issu de XACML) est le standard de facto pour l'enforcement déclaratif de policies. Il offre:

| Composant | Rôle | Implémentation ContractShield |
|-----------|------|---------------------------|
| **PDP** | Décision | `packages/pdp/src/pdp.ts` → `evaluate()` |
| **PEP** | Enforcement | Adapters futurs (Express, Java servlet) |
| **PAP** | Authoring | GitOps (YAML/JSON policies) |

**Avantages pour ce cas d'usage:**
- Séparation claire décision/enforcement
- Policies testables en isolation
- Portabilité (même PDP, différents PEPs)
- GitOps-native

**Alternatives considérées:**

| Pattern | Verdict |
|---------|---------|
| Middleware inline | ❌ Couple policy et code |
| OPA/Rego standalone | ⚠️ Overkill pour v0.1, mais bonne migration path |
| RASP-style (sinks) | ❌ Différent use case (complémentaire) |

### 1.2 Patterns de sécurité plus modernes ?

Le projet combine déjà les patterns modernes recommandés:

- **Contract-first security** : schemas JSON comme source de vérité
- **Positive security model** : allow what's declared, deny the rest
- **Policy-as-code** : versionnable, testable, reviewable
- **Zero-trust identity** : tenant binding explicite

**Pattern manquant (future):** observabilité structurée (OpenTelemetry spans pour les décisions).

### 1.3 Scope v0.1 : réaliste ou trop ambitieux ?

**Scope actuel (implémenté):**
- Route matching (exact)
- Limits (body size, JSON depth, array length)
- Contract validation (JSON Schema via AJV)
- CEL invariants (subset)
- Stripe webhook (signature + replay)

**Verdict:** ✅ Scope réaliste et bien borné. Les features implémentées forment un tout cohérent.

**Risque identifié:** Le subset CEL hardcodé (`cel.ts:18-40`) est fragile. Trois expressions seulement supportées sans `celEvaluator`. C'est acceptable pour les docs/tests mais créé une dette technique.

---

## 2. Revue du code existant

### 2.1 Architecture globale

```
packages/pdp/src/
├── pdp.ts              # Entry point (65 lignes)
├── types.ts            # Types partagés (153 lignes)
├── index.ts            # Exports (4 lignes)
├── rules/
│   ├── limits.ts       # Validation limits (35 lignes)
│   ├── contract.ts     # JSON Schema (50 lignes)
│   ├── cel.ts          # CEL eval (55 lignes)
│   ├── webhookStripe.ts      # Signature (89 lignes)
│   └── webhookStripeReplay.ts # Replay (31 lignes)
├── stores/
│   └── memoryReplayStore.ts  # Dev/test store (16 lignes)
└── utils/
    ├── matchRoute.ts   # Route matching (12 lignes)
    ├── buildEnv.ts     # CEL environment (44 lignes)
    └── jsonMetrics.ts  # Depth/array metrics (27 lignes)
```

**Verdict:** ✅ Architecture claire, fichiers courts, responsabilités bien séparées.

### 2.2 Qualité du code

#### pdp.ts (entry point)
```typescript
export async function evaluate(policy: PolicySet, ctx: RequestContext, opts: PdpOptions = {}): Promise<Decision>
```

**Points positifs:**
- Fonction pure (déterministe)
- Pipeline clair : route → limits → contract → webhook → CEL → aggregate
- Gestion monitor/enforce propre

**Points d'attention:**
- `riskFromHits()` (lignes 10-15) : scoring binaire (0/60/90). Simpliste mais acceptable pour v0.1.

#### rules/contract.ts
```typescript
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
```

**Problème:** AJV est instancié une seule fois (bien), mais `ajv.compile(schema)` est appelé à chaque validation (ligne 26). Pour des policies avec beaucoup de requêtes, c'est un problème de performance.

**Fix recommandé:** Cache des schemas compilés par `requestSchemaRef`.

#### rules/cel.ts
```typescript
if (e === "identity.authenticated == true") {
  ok = env.identity?.authenticated === true;
} else if (e === "identity.tenant == request.body.tenantId") {
  // ...
```

**Problème:** Subset hardcodé très limité. Trois patterns seulement. Ajouter une nouvelle expression CEL nécessite de modifier le code.

**Fix recommandé:**
1. Court terme : documenter clairement les expressions supportées sans `celEvaluator`
2. Moyen terme : intégrer une vraie lib CEL JS (ex: `cel-js` ou compilation WASM)

#### rules/webhookStripe.ts

**Points positifs:**
- `timingSafeEqual` pour la comparaison de signatures ✅
- Tolerance timestamp configurable ✅
- Mode test via `ctx.webhook.signatureValid` ✅

**Point d'attention:** La normalisation des headers (`normalizeHeaders`) est dupliquée. Déjà faite dans `buildEnv.ts`.

### 2.3 Points de fragilité

| Fichier | Ligne | Problème | Sévérité |
|---------|-------|----------|----------|
| `cel.ts` | 18-40 | Subset CEL hardcodé | ⚠️ Moyenne |
| `contract.ts` | 26 | Schema recompilé à chaque call | ⚠️ Moyenne |
| `matchRoute.ts` | 5 | Exact match only | ℹ️ Basse (documenté) |
| `pdp.ts` | 24 | "No matching route" → ALLOW | ⚠️ Moyenne (fail-open) |

**Note sur fail-open (pdp.ts:24):** Quand aucune route ne match, la décision est ALLOW. C'est un choix de design (fail-open par défaut), mais devrait être configurable (`defaults.unmatchedRouteAction`).

### 2.4 Code mort ou sur-engineeré

| Élément | Statut |
|---------|--------|
| `RedactionDirective` dans types.ts | Non utilisé (prévu future) |
| `CHALLENGE` action | Non implémenté |
| `tools/fixtures/` vs `fixtures/` | Duplication partielle |
| `packs/stripe-webhook/` | Séparé des fixtures root (redondant) |

**Recommandation:** Supprimer ou documenter explicitement les éléments "future" avec des `@todo`.

### 2.5 Tests manquants critiques

Le repo n'a **aucun test unitaire** dans `packages/pdp/`. Les seuls tests sont les golden tests (fixtures JSON).

**Tests unitaires manquants prioritaires:**

1. `matchRoute.ts` : path templates, edge cases
2. `jsonMetrics.ts` : profondeur circulaire, objets géants
3. `webhookStripe.ts` : signature edge cases (timestamp, format)
4. `cel.ts` : expressions malformées, injection

---

## 3. Choix technologiques

### 3.1 CEL vs alternatives

| Langage | Verdict | Raison |
|---------|---------|--------|
| **CEL** | ✅ Recommandé | Déterministe, typé, standard Google, migration OPA possible |
| Rego/OPA | ⚠️ Overkill v0.1 | Plus puissant mais plus complexe, bonne option future |
| JsonLogic | ❌ | Moins expressif, syntaxe JSON verbeuse |
| JS eval | ❌ | Sécurité (sandbox escape), non-déterministe |
| JMESPath | ❌ | Conçu pour query, pas pour assertions |

**Conclusion:** CEL est le bon choix. La doc mentionne une migration path vers Rego/OPA si besoin.

### 3.2 AJV pour JSON Schema

| Alternative | Verdict | Raison |
|-------------|---------|--------|
| **AJV** | ✅ Actuel, OK | Standard de facto, performant, bien maintenu |
| Zod | ⚠️ | TS-first, mais pas JSON Schema natif |
| Typebox | ⚠️ | Génère JSON Schema depuis TS, intéressant |
| Joi | ❌ | Ancien, moins performant |

**Conclusion:** AJV est le bon choix. Ajouter un cache des schemas compilés.

### 3.3 Monorepo packages/

**État actuel:** Un seul package (`packages/pdp/`).

**Verdict:** ⚠️ Prématuré mais acceptable.

**Justification:**
- Si des adapters PEP sont prévus (`packages/pep-express/`, `packages/pep-java/`), la structure est pertinente
- Sinon, simplifier en mettant le code à la racine

**Recommandation:** Garder la structure si les adapters arrivent dans les 2-3 prochains mois, sinon simplifier.

### 3.4 Dépendances

```json
{
  "dependencies": {
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "@types/node": "^20.11.30"
  }
}
```

**Verdict:** ✅ Excellent. Dépendances minimales, bien maintenues, pas de risque sécurité connu.

**Dépendance manquante suggérée:**
- Test runner (vitest ou node:test natif)
- CEL evaluator réel (quand disponible en JS de qualité)

---

## 4. Simplification des fixtures (priorité)

### 4.1 Problèmes actuels

Les fixtures dans `fixtures/contexts/*.json` sont **trop verbeux** :

```json
// ctx-allow.json - 45 lignes pour tester un cas simple
{
  "version": "0.1",
  "id": "ctx-allow-1",
  "timestamp": "2026-01-14T16:27:09.960683Z",
  "request": { /* 15 lignes */ },
  "identity": { /* 8 lignes */ },
  "client": { /* 4 lignes */ },
  "runtime": { /* 5 lignes */ }
}
```

**Douleurs:**
1. ~50 lignes par contexte → difficile de voir ce qui est testé
2. Duplication massive (runtime, client identiques partout)
3. Pas de distinction claire nominal vs edge case
4. Maintenance pénible (changer un défaut = modifier tous les fichiers)

### 4.2 Solution proposée : YAML compact avec templates

**Format proposé:**

```yaml
# fixtures/contexts/ctx-allow.yaml
_base: default-api-request
id: ctx-allow-1
# Override only what matters for this test:
request:
  path: /api/license/activate
  body.json.sample:
    tenantId: t-1
identity:
  tenant: t-1  # Match → should allow
---
# Peut être splitté avec '---' pour plusieurs cas dans un fichier
```

**Template de base (`fixtures/templates/default-api-request.yaml`):**

```yaml
version: "0.1"
timestamp: "{{now}}"
request:
  method: POST
  headers:
    content-type: application/json
  contentType: application/json
  body:
    present: true
    sizeBytes: 180
    sha256: fixture-hash
    json:
      redacted: true
      sample: {}
identity:
  authenticated: true
  subject: u-1
  tenant: t-1
  scopes: []
client:
  ip: 203.0.113.10
  userAgent: fixture
runtime:
  language: node
  service: test
  env: test
```

### 4.3 Décisions attendues : format plus compact

```yaml
# fixtures/expected/ctx-allow.decision.yaml
action: ALLOW
# Tout le reste est inféré des défauts pour ALLOW
```

**Expansion automatique:**
```yaml
version: "0.1"
action: ALLOW
statusCode: 200
reason: Allowed
ruleHits: []
risk: { score: 0, level: none }
redactions: []
```

### 4.4 Conventions de nommage proposées

```
fixtures/
├── templates/
│   ├── api-request.yaml       # Base pour API calls
│   └── webhook-stripe.yaml    # Base pour Stripe webhooks
├── contexts/
│   ├── nominal/               # Cas passants (ALLOW)
│   │   ├── api-basic.yaml
│   │   └── webhook-valid.yaml
│   └── violations/            # Cas bloquants (BLOCK)
│       ├── tenant-mismatch.yaml
│       ├── unauthenticated.yaml
│       └── webhook-replay.yaml
└── expected/
    ├── nominal/
    │   ├── api-basic.yaml     # action: ALLOW
    │   └── webhook-valid.yaml
    └── violations/
        ├── tenant-mismatch.yaml
        ├── unauthenticated.yaml
        └── webhook-replay.yaml
```

### 4.5 Helper de génération

Créer `tools/fixtures/generate.ts` :

```typescript
// Usage:
// npx tsx tools/fixtures/generate.ts \
//   --base webhook-stripe \
//   --override '{"webhook.replayed": true}' \
//   --expect block:webhook.stripe.replay
```

### 4.6 Implémentation recommandée

Voir `fixtures-v2/` pour un prototype fonctionnel avec:
- Loader YAML avec héritage
- Merge deep des overrides
- Expansion automatique des décisions
- Script de migration des fixtures existantes

---

## 5. Quick wins (< 1h chacun)

### 5.1 Cache AJV schemas
**Fichier:** `packages/pdp/src/rules/contract.ts`
**Effort:** 15 min
```typescript
const schemaCache = new Map<string, ValidateFunction>();
// Dans validateContract:
let validate = schemaCache.get(ref);
if (!validate) {
  validate = ajv.compile(schema);
  schemaCache.set(ref, validate);
}
```

### 5.2 Configurer unmatchedRouteAction
**Fichier:** `packages/pdp/src/types.ts` + `pdp.ts`
**Effort:** 20 min
```typescript
// types.ts
defaults?: {
  unmatchedRouteAction?: "allow" | "block" | "monitor";
  // ...
}
```

### 5.3 Documenter le subset CEL
**Fichier:** `docs/policy-language.md`
**Effort:** 10 min
```markdown
## CEL subset (sans celEvaluator)
Expressions supportées sans evaluator externe:
- `identity.authenticated == true`
- `identity.tenant == request.body.tenantId`
- `<path> in ["val1", "val2"]`
```

### 5.4 Ajouter un test unitaire minimal
**Fichier:** Créer `packages/pdp/src/pdp.test.ts`
**Effort:** 30 min
```typescript
import { test } from "node:test";
import { evaluate } from "./pdp.js";
// 3-5 tests basiques
```

### 5.5 Supprimer duplication fixtures
**Action:** Fusionner `tools/fixtures/` et `fixtures/`
**Effort:** 15 min

### 5.6 Ajouter export type PolicyFile
**Fichier:** `packages/pdp/src/types.ts`
**Effort:** 5 min
```typescript
export type PolicyFile = PolicySet; // Alias pour clarté
```

---

## 6. Recommandations priorisées

| Priorité | Action | Impact | Effort |
|----------|--------|--------|--------|
| **P0** | Simplifier fixtures (YAML + templates) | Maintenabilité | 2-3h |
| **P0** | Ajouter cache AJV | Performance | 15 min |
| **P1** | Tests unitaires minimaux | Fiabilité | 1h |
| **P1** | Documenter subset CEL | Clarté | 10 min |
| **P1** | Configurer unmatchedRouteAction | Sécurité | 20 min |
| **P2** | Intégrer CEL evaluator réel | Expressivité | 2-4h |
| **P2** | Fusionner fixtures dupliquées | Clean-up | 15 min |
| **P3** | Décider monorepo vs flat | Structure | 30 min |

---

## 7. Revue de la documentation

Après lecture complète de tous les documents (`/docs/*`, `/tutorial/*`, `*.md` racine), voici les observations supplémentaires.

### 7.1 Points forts de la documentation

| Document | Qualité | Remarque |
|----------|---------|----------|
| `docs/manifesto.md` | ✅ Excellent | Les 10 principes sont clairs et cohérents |
| `docs/threat-model.md` | ✅ Excellent | Scope explicite, menaces bien cartographiées |
| `docs/comparison.md` | ✅ Excellent | Positionnement WAF/RASP/ContractShield clair |
| `docs/policy-language.md` | ✅ Très bon | Pitfalls bien documentés |
| `docs/observability.md` | ✅ Très bon | Schema de logs, OTEL, responsabilités PDP/PEP |
| `tutorial/hello-contractshield.md` | ✅ Bon | Tutoriel 10 min accessible |

**Verdict global:** Documentation de qualité professionnelle, cohérente et complète pour un projet v0.1.

### 7.2 Écarts entre documentation et code

| Document | Promesse | Réalité code |
|----------|----------|--------------|
| `docs/packs/oauth.md` | OAuth rule type | ❌ Non implémenté |
| `docs/packs/uploads.md` | Upload rule type | ❌ Non implémenté |
| `docs/security.md` | Rate limiting | ❌ Non implémenté |
| `docs/contractshield.md` | CHALLENGE action | ⚠️ Défini mais non supporté |
| `todo.md` | Node/Java PEP adapters | ⚠️ Quickstart existe, pas le middleware |

**Recommandation:** Ajouter des badges `[future]` ou `[not yet implemented]` dans les docs des features non implémentées pour éviter la confusion.

### 7.3 Documentation manquante

| Sujet | Impact |
|-------|--------|
| **CHANGELOG** | Pas de suivi des versions |
| **ADR (Architecture Decision Records)** | Décisions non tracées |
| **Diagramme de séquence PEP↔PDP** | Serait utile |
| **Exemples d'erreurs courantes** | Troubleshooting |

### 7.4 Cohérence avec todo.md

Le fichier `todo.md` est détaillé et aligné avec le code actuel. Les items cochés correspondent aux features implémentées.

**Observations:**
- v0.1 est ~70% complète selon le todo
- Les golden tests manquent pour limits et monitor/enforce
- Les PEP adapters sont listés mais non implémentés

### 7.5 Les 12 principes (docs/principles.md)

Les principes sont excellents et le code les respecte majoritairement :

| Principe | Respect |
|----------|---------|
| 1. Declare intent | ✅ |
| 2. Allowlist over denylist | ✅ |
| 3. Canonicalize before evaluating | ⚠️ Fait dans buildEnv, mais pas de normalisation URL |
| 4. Validate contracts early | ✅ |
| 5. Bind identity to data | ✅ |
| 6. Limit everything | ✅ |
| 7. Prefer deterministic rules | ✅ |
| 8. Explain every decision | ✅ ruleHits présents |
| 9. Log without leaking secrets | ⚠️ Pas de logging dans PDP (correct) |
| 10. Ship in monitor mode first | ✅ Mode configurable |
| 11. Prevent regressions with golden tests | ✅ |
| 12. Prepare for sink-aware enforcement | ⚠️ Non commencé |

---

## 8. Conclusion

ContractShield v0.1 est un projet bien conçu avec un scope réaliste. L'architecture PEP/PDP/PAP est adaptée, les choix technologiques sont pertinents, et le code est propre.

**Actions immédiates recommandées:**
1. Simplifier les fixtures avec le format YAML proposé
2. Ajouter le cache AJV (quick win, impact perf)
3. Écrire 5-10 tests unitaires pour les fonctions critiques

**Prochaines étapes naturelles:**
1. Premier adapter PEP (Express.js)
2. CEL evaluator réel
3. Observabilité (OpenTelemetry)

Le projet est sur la bonne voie. 👍
