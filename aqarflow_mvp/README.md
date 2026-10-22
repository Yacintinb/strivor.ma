# AqarFlow — MVP d'une place de marché de cession de contrats immobiliers

**Projet indépendant / clean-room.** Inspiré des fonctionnalités publiquement observables du marché de la reprise de contrats à paiement échelonné, sans source code, données privées, éléments de marque ou droits d'Aqar Exit. Les six biens de départ sont **entièrement fictifs et à usage de démonstration**.

## Inclus dans ce MVP

- **Catalogue immobilier** : annonces, recherche par mot-clé et ville, plafond d'apport, tri, détails financiers.
- **Simulateur** : prix initial, versements effectués, frais indicatifs acheteur de 1,25 %, solde, écart par rapport à une valeur de marché *déclarée* et scénario de résiliation ajustable.
- **Authentification réelle** : création de compte, connexion, cookie HttpOnly, session serveur, protection CSRF pour les routes privées.
- **Dépôt vendeur** : formulaire complet, données enregistrées en SQLite, état `pending` par défaut.
- **Compte acheteur** : favoris sauvegardés, demandes de contact, budget sauvegardé et correspondances selon trois critères.
- **Administration** : tableaux de bord, publication/refus des annonces, gestion des demandes acheteurs et journal d'audit pour les actions clés.
- **Interface originale responsive**, en français, avec 6 illustrations SVG créées pour le prototype.
- **API documentée** : Swagger à `/api/docs`.

## Démarrer sur Windows, macOS ou Linux

Python **3.10+** requis (3.11+ recommandé).

```bash
cd aqarflow_mvp
python -m venv .venv
# Windows PowerShell : .venv\Scripts\Activate.ps1
# macOS/Linux : source .venv/bin/activate
pip install -r requirements.txt
```

Configurez un administrateur **avant le premier démarrage** :

**Windows PowerShell**

```powershell
$env:ADMIN_EMAIL="admin@mon-domaine.com"
$env:ADMIN_PASSWORD="remplacer-par-un-mot-de-passe-long-et-unique"
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

**macOS / Linux**

```bash
export ADMIN_EMAIL="admin@mon-domaine.com"
export ADMIN_PASSWORD="remplacer-par-un-mot-de-passe-long-et-unique"
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Ouvrez **http://127.0.0.1:8000**. Connectez-vous avec ces identifiants, puis ouvrez *Administration*. Pour créer d'autres comptes, utilisez le bouton *Connexion → S'inscrire*.

> Le fichier `.env.example` est uniquement une référence ; ses valeurs ne sont **pas chargées automatiquement**. Le serveur utilise les variables d'environnement ci-dessus. `ADMIN_EMAIL` et `ADMIN_PASSWORD` sont nécessaires pour créer automatiquement l'administrateur lors du premier lancement. Changez le mot de passe d'exemple avant toute utilisation. Si vous modifiez ces variables après avoir créé le compte admin, le mot de passe déjà stocké ne changera pas.

## Parcours de démonstration

1. Consultez **Opportunités** : six annonces fictives sont créées au premier démarrage.
2. Testez **Calculateur** et les filtres d'apport.
3. Inscrivez-vous comme vendeur, puis remplissez **Vendre mon contrat** : le bien passe en état `pending`.
4. Connectez-vous comme administrateur, modérez et **publiez** le nouveau bien.
5. Connectez-vous avec un compte acheteur distinct et envoyez une demande depuis la fiche du bien.
6. Gérez le statut de la demande dans **Administration**.

## API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/stats`, `/api/listings`, `/api/listings/{id}` | Public |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Comptes |
| GET | `/api/auth/me` | Session |
| POST | `/api/listings` | Vendeur connecté |
| GET | `/api/me/listings`, `/api/me/inquiries`, `/api/me/favorites` | Espace privé |
| POST | `/api/listings/{id}/inquiries`, `/api/listings/{id}/favorite` | Acheteur connecté |
| GET, PUT | `/api/me/buyer-profile` | Budget acheteur |
| GET | `/api/admin/stats`, `/api/admin/listings`, `/api/admin/inquiries` | Administrateur |
| PATCH | `/api/admin/listings/{id}`, `/api/admin/inquiries/{id}` | Administrateur |

### Persistance

SQLite dans `aqarflow.sqlite3` (modification via `AQARFLOW_DB`). Pour repartir de zéro, arrêtez le serveur et supprimez ce fichier ; la base et les exemples seront recréés. **Ne le faites pas si des données réelles s'y trouvent.** Sauvegardez ce fichier régulièrement si vous utilisez le MVP dans un environnement de test.

## Tests

```bash
python -m pytest -q tests
```

Tests couvrant inscription, autorisation, CSRF, favori, demande acheteur, unicité de demande, dépôt vendeur, modération, publication, filtres, budget et suivi administratif.

## Avant une vraie mise en production

Le MVP n'est **pas encore une plateforme de transfert immobilier juridiquement ou opérationnellement complète**. Exiger au minimum :

1. Vérification juridique des règles de cession, frais, mandats et accord du promoteur pour le pays choisi.
2. KYC vendeur / vérification du titre et du contrat, stockage sécurisé de justificatifs, rôles de vérificateurs distincts et contrôle documentaire vérifiable.
3. Conformité données personnelles et CGU/politique de confidentialité rédigées pour le contexte local ; base légale de traitement.
4. HTTPS avec `COOKIE_SECURE=true`, protection anti-abus/limitation de débit, e-mail vérifié, récupération de compte, MFA administrateur, journalisation centralisée et supervision.
5. Base de données managée, sauvegardes testées, migrations, tests de charge, observabilité et stockage de documents chiffré.
6. Vrai processus d'offres, validation du promoteur, signature, commission au closing, contrôle des droits et rapprochement de paiements.
7. Images de biens licenciées et vérifiées, modération renforcée ; suppression des données fictives et adaptation des estimations.

**La formule financière indicative** du prototype : prix contractuel = montants payés + restant ; frais acheteur = 1,25 % × prix contractuel ; cash initial = payés + frais. Elle ne couvre pas toutes les charges ou risques d'une transaction réelle.