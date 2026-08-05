# Munich 2026

Carnet de voyage familial, protégé par un compte unique.

Ce dépôt contient **le code d'affichage** et la configuration Firebase
**chiffrée**. Le programme, les notes et les billets vivent dans Firestore et ne
sont lisibles qu'une fois connecté. Rien en clair ici : aucun identifiant
lisible, aucune adresse e-mail.

<https://conrad3164.github.io/munich2026/>

| Fichier | Rôle |
|---|---|
| `index.html` | Écran de connexion + application |
| `assets/app.js` | Connexion, lecture Firestore, rendu |
| `assets/render.js` | Construction de l'affichage du programme |
| `assets/styles.css` | Mise en forme, pensée pour le mobile |
| `config.enc.json` | Configuration Firebase chiffrée sous le mot de passe du compte |
| `photos/` | Photos des lieux visités, issues de Wikimedia Commons |
| `sw.js` | Service worker : cache maîtrisé et hors ligne |
| `diag.html` | Page de diagnostic, conservée volontairement |

## Configuration Firebase

Elle n'est pas en clair dans ce dépôt : `config.enc.json` la contient chiffrée
en AES-256-GCM, sous une clé dérivée du mot de passe du compte (PBKDF2-SHA256,
600 000 itérations). Publique, donc, mais illisible sans le mot de passe. Le
fichier ne nomme aucun compte, pas même sous forme de condensat.

Le service `munich-api`, hébergé sur un NAS, sait aussi la délivrer et sert de
recours — mais il n'est plus le chemin principal : certains réseaux d'entreprise
filtrent son nom de domaine, ce qui rendait la première connexion impossible
depuis un bureau.

## Crédits photo

Les images de `photos/` viennent de Wikimedia Commons. Chacune est affichée avec
le nom de son auteur et sa licence, et le crédit renvoie à la page d'origine du
fichier. Les licences sont majoritairement Creative Commons BY ou BY-SA.

## Publier

**Ne pas pousser à la main** : le numéro de version des URLs doit être
incrémenté, sinon iOS sert l'ancien code pendant des jours.

```bash
cd ../private && python3 publish.py "message de commit"
```

## Documentation

Installation, service `munich-api`, règles Firestore, import des données,
dépannage et pièges connus : wiki interne, **Synology DS918+ → Scripts Synology
→ *Munich 2026 — carnet de voyage***.
