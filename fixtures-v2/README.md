# Fixtures v2 - Format Compact YAML

Ce dossier contient un prototype de format de fixtures simplifié utilisant YAML avec héritage de templates.

## Motivation

Les fixtures JSON originales sont verbeux (~50 lignes par cas de test) avec beaucoup de duplication. Ce format réduit la verbosité de **~70%** tout en améliorant la lisibilité.

## Structure

```
fixtures-v2/
├── templates/           # Templates de base (hérités par les fixtures)
│   ├── api-request.yaml
│   ├── webhook-stripe.yaml
│   ├── decision-allow.yaml
│   └── decision-block.yaml
├── contexts/            # Contextes de requête
│   ├── nominal/         # Cas passants (ALLOW)
│   └── violations/      # Cas bloquants (BLOCK)
├── expected/            # Décisions attendues
│   ├── nominal/
│   └── violations/
├── loader.mjs           # Script d'expansion YAML → JSON
└── README.md
```

## Format des fixtures

### Contexte (compact)

```yaml
# Test: Cross-tenant access attempt
_template: api-request
id: ctx-block-tenant-1

# Override only what differs from template:
identity:
  tenant: t-2  # Different from body.json.sample.tenantId (t-1)
```

vs. l'ancien format JSON (~45 lignes).

### Décision attendue (compact)

```yaml
_template: decision-block
ruleHits:
  - id: tenant.binding
    severity: critical
```

vs. l'ancien format JSON (~18 lignes).

## Usage

```bash
# Voir un fixture expansé
node fixtures-v2/loader.mjs contexts/nominal/api-basic.yaml

# Comparer les deux formats
node fixtures-v2/loader.mjs --compare

# Expanser tous les fixtures
node fixtures-v2/loader.mjs --all
```

## Conventions

### Nommage des fichiers

- `nominal/*.yaml` : cas qui doivent passer (ALLOW)
- `violations/*.yaml` : cas qui doivent être bloqués (BLOCK)

### Templates disponibles

| Template | Usage |
|----------|-------|
| `api-request` | Requêtes API standard avec identity |
| `webhook-stripe` | Webhooks Stripe avec signature |
| `decision-allow` | Décision ALLOW par défaut |
| `decision-block` | Décision BLOCK par défaut |

### Directive `_template`

```yaml
_template: webhook-stripe  # Hérite de templates/webhook-stripe.yaml
```

Si omis, utilise `api-request` pour les contextes.

## Migration

Pour migrer les fixtures existantes vers ce format :

1. Identifier les champs qui diffèrent du template
2. Créer un fichier YAML avec seulement les overrides
3. Valider avec `node loader.mjs <file>.yaml | diff - <original>.json`

## Avantages

1. **Moins de bruit** : on voit immédiatement ce qui est testé
2. **DRY** : les valeurs par défaut sont dans les templates
3. **Maintenable** : changer un défaut = modifier un seul fichier
4. **Documenté** : commentaires en tête de chaque fixture

## Limitations du prototype

Le `loader.mjs` utilise un parser YAML simplifié qui a des limitations :
- Arrays multi-lignes incomplets
- Multiline strings basiques

**Pour la production**, remplacer par `js-yaml` :

```bash
npm install js-yaml
```

```javascript
import yaml from 'js-yaml';
const fixture = yaml.load(fs.readFileSync(path, 'utf8'));
```
