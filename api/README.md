# ContractShield License API

API de gestion des licences pour ContractShield avec intégration Stripe.

## Architecture

- **Framework**: Express.js
- **Base de données**: SQLite (better-sqlite3)
- **Paiements**: Stripe Webhooks
- **Process Manager**: pm2
- **Reverse Proxy**: Nginx

## Prérequis

- Node.js >= 18.0.0
- npm ou pnpm
- pm2 (global): `npm install -g pm2`
- Nginx installé et configuré
- Compte Stripe avec webhooks configurés

## Installation

### 1. Cloner et installer les dépendances

```bash
cd /var/www
git clone <repo> contractshield-api
cd contractshield-api/api
npm install
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
nano .env
```

Remplir les variables:

```bash
# Server
PORT=3002
NODE_ENV=production
DATABASE_URL=./data/licenses.db

# Stripe (depuis le dashboard Stripe)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# CORS
CORS_ORIGINS=https://contractshield.dev,https://www.contractshield.dev

# Email (optionnel)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
FROM_EMAIL=licenses@contractshield.dev
```

### 3. Initialiser la base de données

```bash
npm run db:init
```

### 4. Configurer Nginx

```bash
# Copier la configuration
sudo cp nginx/api.contractshield.dev.conf /etc/nginx/sites-available/

# Créer le symlink
sudo ln -s /etc/nginx/sites-available/api.contractshield.dev.conf /etc/nginx/sites-enabled/

# Vérifier la configuration
sudo nginx -t

# Recharger nginx
sudo systemctl reload nginx
```

### 5. Configurer les certificats SSL

**Option A: Cloudflare (recommandé)**

1. Dans Cloudflare, créer un Origin Certificate
2. Télécharger le certificat et la clé
3. Les placer dans:
   - `/etc/ssl/certs/api.contractshield.dev.pem`
   - `/etc/ssl/private/api.contractshield.dev.key`

**Option B: Let's Encrypt**

```bash
sudo certbot certonly --nginx -d api.contractshield.dev

# Mettre à jour les chemins dans nginx config:
# ssl_certificate /etc/letsencrypt/live/api.contractshield.dev/fullchain.pem;
# ssl_certificate_key /etc/letsencrypt/live/api.contractshield.dev/privkey.pem;
```

### 6. Créer les répertoires de logs

```bash
sudo mkdir -p /var/log/contractshield-api
sudo chown $USER:$USER /var/log/contractshield-api
```

### 7. Démarrer avec pm2

```bash
# Démarrer l'application
pm2 start ecosystem.config.cjs

# Sauvegarder la configuration pm2
pm2 save

# Configurer le démarrage automatique
pm2 startup
```

### 8. Configurer le webhook Stripe

1. Aller dans [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. Cliquer "Add endpoint"
3. URL: `https://api.contractshield.dev/webhooks/stripe`
4. Sélectionner les événements:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copier le "Signing secret" (whsec_xxx) dans `.env`

### 9. Configurer les produits Stripe

Créer deux produits avec les metadata suivantes:

**Pro ($49/mois)**
- Metadata: `plan: pro`

**Enterprise ($199/mois)**
- Metadata: `plan: enterprise`

## Commandes pm2 utiles

```bash
# Voir le statut
pm2 status

# Voir les logs
pm2 logs contractshield-api

# Redémarrer
pm2 restart contractshield-api

# Recharger sans downtime
pm2 reload contractshield-api

# Arrêter
pm2 stop contractshield-api
```

## Tests de l'API

### Health Check

```bash
curl https://api.contractshield.dev/health
```

Réponse attendue:
```json
{"status":"ok","timestamp":"2024-01-15T10:00:00.000Z","version":"1.0.0"}
```

### Créer une licence de test (dev uniquement)

Pour les tests, créer manuellement une licence dans la base:

```bash
sqlite3 data/licenses.db

INSERT INTO licenses (id, license_key, email, plan, seats, status, valid_until)
VALUES (
  'test-uuid-1234',
  'CSHIELD-TEST-ABCD-EFGH-IJKL',
  'test@example.com',
  'pro',
  5,
  'active',
  datetime('now', '+30 days')
);
```

### Valider une licence

```bash
curl -X POST https://api.contractshield.dev/v1/license/validate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "CSHIELD-TEST-ABCD-EFGH-IJKL",
    "fingerprint": "machine-abc123"
  }'
```

Réponse (licence non activée):
```json
{
  "valid": false,
  "error": "not_activated",
  "message": "License not activated on this machine",
  "plan": "pro"
}
```

### Activer une licence

```bash
curl -X POST https://api.contractshield.dev/v1/license/activate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "CSHIELD-TEST-ABCD-EFGH-IJKL",
    "fingerprint": "machine-abc123",
    "metadata": {
      "hostname": "dev-server",
      "os": "linux",
      "arch": "x64"
    }
  }'
```

Réponse:
```json
{
  "activated": true,
  "alreadyActive": false,
  "remainingSeats": 4
}
```

### Re-valider après activation

```bash
curl -X POST https://api.contractshield.dev/v1/license/validate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "CSHIELD-TEST-ABCD-EFGH-IJKL",
    "fingerprint": "machine-abc123"
  }'
```

Réponse:
```json
{
  "valid": true,
  "plan": "pro",
  "features": ["sink-rasp", "learning-mode", "priority-support"],
  "seats": 5,
  "expiresAt": "2024-02-15T00:00:00.000Z",
  "status": "active",
  "gracePeriodEnds": null
}
```

### Obtenir les infos d'une licence

```bash
curl https://api.contractshield.dev/v1/license/info/CSHIELD-TEST-ABCD-EFGH-IJKL
```

Réponse:
```json
{
  "plan": "pro",
  "planName": "Pro",
  "seats": 5,
  "usedSeats": 1,
  "availableSeats": 4,
  "status": "active",
  "validUntil": "2024-02-15T00:00:00.000Z",
  "gracePeriodEnds": null,
  "features": ["sink-rasp", "learning-mode", "priority-support"],
  "createdAt": "2024-01-15T00:00:00.000Z"
}
```

### Désactiver une licence

```bash
curl -X POST https://api.contractshield.dev/v1/license/deactivate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "CSHIELD-TEST-ABCD-EFGH-IJKL",
    "fingerprint": "machine-abc123"
  }'
```

Réponse:
```json
{"deactivated": true}
```

### Tester le webhook Stripe (dev)

Utiliser Stripe CLI pour tester les webhooks en local:

```bash
# Installer Stripe CLI
# https://stripe.com/docs/stripe-cli

# Se connecter
stripe login

# Forwarder les webhooks vers local
stripe listen --forward-to localhost:3002/webhooks/stripe

# Dans un autre terminal, déclencher un événement de test
stripe trigger checkout.session.completed
```

## Monitoring

### Logs en temps réel

```bash
pm2 logs contractshield-api --lines 100
```

### Métriques pm2

```bash
pm2 monit
```

### Vérifier la base de données

```bash
sqlite3 data/licenses.db

# Compter les licences
SELECT COUNT(*) FROM licenses;

# Voir les licences actives
SELECT license_key, email, plan, status, valid_until FROM licenses WHERE status = 'active';

# Voir les activations récentes
SELECT * FROM activations ORDER BY activated_at DESC LIMIT 10;
```

## Sauvegardes

### Backup de la base de données

```bash
# Créer un backup
cp data/licenses.db data/licenses.db.backup.$(date +%Y%m%d)

# Avec sqlite3 (plus sûr si la DB est en cours d'utilisation)
sqlite3 data/licenses.db ".backup data/licenses.db.backup.$(date +%Y%m%d)"
```

### Script de backup automatique (cron)

```bash
# Ajouter à crontab
crontab -e

# Backup quotidien à 2h du matin
0 2 * * * /usr/bin/sqlite3 /var/www/contractshield-api/api/data/licenses.db ".backup /var/backups/contractshield/licenses.db.$(date +\%Y\%m\%d)"
```

## Dépannage

### L'API ne démarre pas

```bash
# Vérifier les logs
pm2 logs contractshield-api --err --lines 50

# Vérifier que le port n'est pas utilisé
sudo lsof -i :3002

# Vérifier les permissions de la DB
ls -la data/
```

### Erreur de signature webhook

- Vérifier que `STRIPE_WEBHOOK_SECRET` correspond au secret dans Stripe Dashboard
- S'assurer que le raw body est correctement parsé (déjà configuré dans index.js)

### Erreur CORS

- Vérifier que le domaine est dans `CORS_ORIGINS`
- En production, les requêtes server-to-server (sans Origin) sont autorisées

### Rate limiting

- Les limites sont: 100 req/min global, 300 req/min pour validation
- Ajuster dans `config.js` si nécessaire

## Structure des fichiers

```
api/
├── src/
│   ├── index.js          # Point d'entrée, Express config
│   ├── config.js         # Configuration centralisée
│   ├── routes/
│   │   ├── webhooks.js   # Endpoint webhook Stripe
│   │   └── licenses.js   # Endpoints API licences
│   ├── services/
│   │   ├── stripe.js     # Logique Stripe
│   │   ├── license.js    # Logique licences
│   │   └── email.js      # Envoi d'emails
│   ├── db/
│   │   ├── index.js      # Connexion SQLite
│   │   ├── schema.sql    # Schéma initial
│   │   ├── init.js       # Script d'initialisation
│   │   └── migrate.js    # Script de migration
│   └── utils/
│       ├── logger.js     # Logging structuré
│       └── crypto.js     # Génération clés licence
├── data/                 # Répertoire base de données
├── nginx/                # Configuration Nginx
├── .env.example
├── ecosystem.config.cjs  # Configuration pm2
├── package.json
└── README.md
```

## Intégration SDK

Le SDK ContractShield utilise cette API pour valider les licences. Exemple d'utilisation:

```javascript
import { contractshield } from '@cshield/pro';

contractshield({
  licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY,
  // L'API est appelée automatiquement pour valider la licence
});
```

Le SDK implémente un cache local de 24h pour permettre un fonctionnement offline temporaire si l'API est indisponible.
