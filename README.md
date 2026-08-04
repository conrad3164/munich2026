# Munich 2026

Carnet de voyage familial, protégé par un compte unique.

Ce dépôt ne contient **que le code d'affichage**. Le programme, les notes et les
billets vivent dans Firestore et ne sont lisibles qu'une fois connecté. Aucun
identifiant ici : ni clé API, ni adresse e-mail.

<https://conrad3164.github.io/munich2026/>

| Fichier | Rôle |
|---|---|
| `index.html` | Écran de connexion + application |
| `assets/app.js` | Connexion, lecture Firestore, rendu |
| `assets/render.js` | Construction de l'affichage du programme |
| `assets/styles.css` | Mise en forme, pensée pour le mobile |
| `sw.js` | Service worker : cache maîtrisé et hors ligne |
| `diag.html` | Page de diagnostic, conservée volontairement |

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
