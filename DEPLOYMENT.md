# Déploiement Vercel et synchronisation Apple Calendar

Ce projet utilise Vercel Functions et Neon Postgres. Les données synchronisées sont les cours, devoirs, événements personnels et le réglage des rappels de révision. Aucun mot de passe Apple ni identifiant iCloud n’est envoyé ou stocké.

## Ce qui est prêt dans le projet

- `npm run build` génère le site statique dans `dist/`.
- `vercel.json` indique à Vercel d’installer les dépendances avec `npm ci`, puis d’exécuter ce build.
- Les fonctions `api/calendar.js` et `api/calendar.ics.js` sont déployées automatiquement par Vercel.
- `.env*`, `.vercel` et les secrets restent exclus de Git.

## Mise en ligne gratuite

1. Créez un dépôt GitHub privé ou public, puis envoyez ce projet avec `git add .`, `git commit` et `git push`.
2. Créez un projet gratuit sur [Neon](https://neon.com), puis copiez sa chaîne de connexion `DATABASE_URL`.
3. Sur [Vercel](https://vercel.com), importez le dépôt GitHub et laissez les valeurs détectées : **Build Command** `npm run build` et **Output Directory** `dist`.
4. Dans **Vercel → Settings → Environment Variables**, ajoutez `DATABASE_URL` pour Production, Preview et Development. Ne l’ajoutez jamais dans le code, GitHub ou le navigateur.
5. Déployez. Votre URL `*.vercel.app` est alors utilisable depuis tous vos appareils, même lorsque le Mac est éteint.
6. Dans l’application déployée, ouvrez **Calendrier**, activez « Synchronisation automatique », puis copiez l’URL du flux.
7. Dans Apple Calendar, abonnez-vous à cette URL : sur Mac, **Fichier → Nouvel abonnement à un calendrier** ; sur iPhone/iPad, **Calendriers → Ajouter un calendrier → Ajouter un calendrier avec abonnement**.

L’URL contient un identifiant aléatoire non devinable : traitez-la comme un lien privé. Apple choisit sa fréquence de rafraîchissement ; ce flux est donc automatiquement mis à jour après une modification dans Mon Planning, puis visible dans Apple Calendar lors de sa prochaine actualisation.
