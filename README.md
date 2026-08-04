# Munich 2026

Carnet de voyage familial, protégé par un compte unique.

Le dépôt ne contient **que le code d'affichage**. Le programme, les notes et les
billets sont stockés dans Firestore et ne sont lisibles qu'une fois connecté :
c'est Firebase (côté serveur) qui vérifie le mot de passe et applique les règles
de `../private/firestore.rules`. Rien de personnel n'est publié sur GitHub —
pas même une adresse e-mail.

## Mise en place (une seule fois)

### 1. Projet Firebase

1. <https://console.firebase.google.com> → **Créer un projet** (nom : `munich2026`).
   Google Analytics n'est pas nécessaire.
2. Dans le projet, icône **`</>`** (Application Web) → nom `munich2026` →
   **Enregistrer l'application**. Firebase affiche un bloc `firebaseConfig` :
   recopier ces valeurs dans `firebase-config.js`.
3. **Authentication** → *Commencer* → activer le fournisseur **E-mail/Mot de passe**.
4. **Authentication → Users → Ajouter un utilisateur** : créer le compte unique
   (e-mail + mot de passe). C'est avec ce couple que toute la famille se connectera.
5. **Authentication → Settings → Authorized domains** : ajouter
   `<votre-compte>.github.io`.
6. **Firestore Database** → *Créer une base de données* → mode **production**,
   emplacement `eur3` ou `europe-west3`.
7. **Firestore Database → Données** : créer la collection `allowlist`, puis un
   document par compte autorisé. **L'identifiant du document est l'e-mail**, et
   le compte qui lance `seed.mjs` porte en plus le champ booléen `admin = true`.
   Cette collection est fermée en lecture pour tout le monde : seul le moteur de
   règles la consulte.
8. **Firestore Database → Règles** : coller le contenu de
   `../private/firestore.rules`. **Publier**. Faire l'étape 7 *avant*, sinon
   plus personne ne peut lire.
9. **Authentication → Settings → User actions** : décocher
   **Enable create (sign-up)**. Sans cela, la clé API étant publique, n'importe
   qui peut se créer un compte sur le projet (il ne lira rien, mais autant
   fermer la porte).
10. **Google Cloud Console → APIs & Services → Credentials** → clé
    *Browser key (auto created by Firebase)* → **Application restrictions →
    HTTP referrers** → ajouter `conrad3164.github.io/*`. La clé devient
    inutilisable depuis un autre site.

> La lecture est volontairement réservée aux comptes présents dans `allowlist`,
> pas à « tout compte authentifié » : la clé API étant publique, la simple
> authentification ne prouve rien. Pour ajouter quelqu'un plus tard : créer son
> utilisateur dans Authentication **et** son document dans `allowlist`. Aucune
> republication des règles n'est nécessaire — et aucun e-mail n'apparaît donc
> plus jamais dans le dépôt.

### 2. Import des données

Depuis le NAS, dans `/volume1/siteweb/munich2026/private` :

```bash
cp .env.example .env
# remplir .env (clé API, id projet, e-mail, mot de passe)
chmod 600 .env
node seed.mjs
```

Le script pousse `trip.json` dans `trip/plan` et les PDF de `../billets/` dans
la collection `tickets`. Il est ré-exécutable : `node seed.mjs --plan` ne
réimporte que le programme.

### 3. Publication sur GitHub Pages

```bash
cd /volume1/siteweb/munich2026/site
git init -b main
git add .
git commit -m "Carnet de voyage Munich 2026"
git remote add origin https://github.com/<compte>/munich2026.git
git push -u origin main
```

Puis sur GitHub : **Settings → Pages → Source : Deploy from a branch →
`main` / `/ (root)`**. Le site sera servi sur
`https://<compte>.github.io/munich2026/` au bout d'une minute.

## Publier une modification du site

`git` n'existe pas sur DSM : il est dans le conteneur `claude-code`, qui monte
`/volume1/siteweb` au même chemin.

```bash
sudo docker exec -it claude-code sh
cd /volume1/siteweb/munich2026/private && python3 publish.py "message de commit"
```

Le script incrémente le numéro de version des URLs (`app.js?v=N`), commit et
pousse. **Ne pas pousser à la main** : sans changement de version, iOS continue
de servir l'ancien code pendant des jours, même après avoir quitté et relancé la
web app depuis l'écran d'accueil.

Les identifiants sont enregistrés dans `../private/.git-credentials` (jeton
« fine-grained » limité à ce dépôt, permission *Contents: read and write*), donc
plus rien n'est demandé. Pour le remplacer à son expiration, réécrire ce fichier
au format `https://<compte>:<jeton>@github.com` et le laisser en `chmod 600`.

Compter environ une minute entre le push et la mise en ligne.

## Mettre le programme à jour

Modifier `private/trip.json`, puis `node seed.mjs --plan`. Aucun redéploiement
GitHub n'est nécessaire : le site relit Firestore à chaque connexion.

## Organisation

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page (écran de connexion + application) |
| `assets/app.js` | Connexion Firebase, lecture Firestore, rendu du programme |
| `assets/styles.css` | Mise en forme, pensée pour le mobile |
| `firebase-config.js` | Identifiants publics du projet Firebase |
| `../private/firestore.rules` | Règles de sécurité à publier dans la console (jamais publiées sur GitHub) |
| `../private/trip.json` | Source du programme (jamais publiée) |
| `../private/seed.mjs` | Import vers Firestore |

## En cas de problème pendant le voyage

Deux outils sont volontairement conservés en ligne. Ils n'exposent aucune donnée
— la lecture reste soumise aux règles Firestore — et restent invisibles en usage
normal.

- **`diag.html`** teste chaque brique séparément (support des modules,
  chargement des trois SDK, configuration, initialisation, connexion, lecture
  Firestore) et affiche le résultat à l'écran, sans console ni ordinateur.
- **`?debug=1`** ajouté à l'adresse du site affiche un journal horodaté des
  étapes de connexion et de chargement, en bas de l'écran.

C'est ce second outil qui a permis de trouver la panne d'affichage initiale.

## Notes

- La clé API Firebase visible dans `firebase-config.js` n'est pas un secret :
  elle identifie le projet, elle n'autorise rien. **Elle ne peut pas être
  cachée** — le navigateur la télécharge depuis ce dépôt, donc la masquer
  casserait le site sans rien protéger. Ce qui protège réellement, dans l'ordre :
  les règles Firestore (`allowlist`), la fermeture des inscriptions, et la
  restriction de la clé aux referrers `conrad3164.github.io`.
- Ce dépôt ne contient **aucune adresse e-mail** : ni dans le code, ni dans les
  règles (elles vivent dans `private/`), ni dans l'historique git.
- Le programme est mis en cache dans le navigateur après la première ouverture,
  ce qui permet de le consulter même sans réseau. Le cache est effacé à la
  déconnexion.
- Coût : le plan gratuit Spark de Firebase couvre très largement cet usage.
