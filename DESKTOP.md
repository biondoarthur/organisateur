# Mon Planning sur macOS

L’application macOS est générée avec Electron à partir du build Vite. Elle fonctionne sans App Store et conserve les données dans le stockage local de l’application.

## Générer l’application

```bash
npm install
npm run desktop:package
```

Le fichier créé se trouve dans :

`release/Mon Planning-1.0.0-arm64.dmg`

Il est prévu pour les Mac Apple Silicon (M1, M2, M3, M4…).

## Installer

1. Ouvrir le fichier `.dmg`.
2. Glisser **Mon Planning** dans le dossier **Applications**.
3. Au premier lancement, faire un clic droit sur l’application puis **Ouvrir** si macOS affiche un avertissement de sécurité.

Le paquet n’est pas signé avec un certificat Apple Developer. Une signature et une notarisation seront nécessaires pour supprimer cet avertissement sur d’autres Mac.

La synchronisation Apple Calendar utilise l’API Production Vercel configurée dans `src/lib/api.js`. Les données créées dans le navigateur et celles créées dans l’application macOS sont stockées dans deux espaces locaux distincts.
