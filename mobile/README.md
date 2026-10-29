# Sunu Mall — application mobile

Une seule application React Native (Expo) pour tous les comptes : l'écran
affiché dépend du rôle, comme sur le site.

| Compte | Dans l'appli |
|---|---|
| Client | Produits, fiche produit, panier (`src/app/client/`) — la commande se finalise encore sur le site |
| Livreur | Espace livreur (`src/app/driver/`) — provisoire, renvoie vers le site |
| Commerçant, partenaire, admin | Écran « votre espace est sur le site » |
| Mot de passe provisoire | Changement obligatoire avant tout (`src/app/change-password.tsx`) |

Le code est rangé par rôle pour pouvoir sortir plus tard une appli séparée
(par exemple pour les livreurs) sans tout réécrire.

## Lancer l'appli sur son téléphone

1. Installer **Expo Go** depuis le Play Store (ou l'App Store).
2. Dans ce dossier :

   ```bash
   npm install
   npm start
   ```

3. Scanner le QR code affiché avec Expo Go (Android) ou l'appareil photo (iPhone).
   Le téléphone et le PC doivent être sur le même Wi-Fi ; sinon : `npx expo start --tunnel`.

Par défaut, l'appli parle à **l'API de production**
(`https://sunu-mall-api.onrender.com/api`) : les comptes et les produits sont
les vrais. Pour viser un autre backend, copier `.env.example` en `.env.local`
et modifier `EXPO_PUBLIC_API_URL`.

## Vérifications

```bash
npm run typecheck                                   # types
npx expo-doctor                                     # configuration et versions Expo
npx expo export --platform android --output-dir /tmp/mobile-export   # compile le bundle Android
```

La CI (`.github/workflows/ci.yml`, job `mobile`) lance les types et la
compilation Android à chaque push.

## Organisation

```
src/
├── app/            # Écrans (Expo Router : un fichier = une route)
│   ├── _layout.tsx         # Racine : charge la session enregistrée
│   ├── index.tsx           # Aiguillage : connexion ou espace du compte
│   ├── login.tsx
│   ├── change-password.tsx
│   ├── web-only.tsx
│   ├── client/             # Espace client
│   │   ├── (tabs)/         # Onglets Accueil et Panier
│   │   └── product/[id].tsx    # Fiche produit
│   └── driver/             # Espace livreur
├── components/     # Bouton, champ, quantité, garde d'accès par rôle
├── lib/            # Client API, téléphone +221, formats, rôles
├── store/          # Session (jetons dans le trousseau chiffré) et panier
├── theme.ts        # Couleurs de la marque
└── types.ts        # Types de l'API
```

`src/types.ts` et `src/lib/phone.ts` sont copiés du site (`frontend/src`).
Ils iront dans un paquet partagé avec le site pour n'être écrits qu'une fois.

## À décider avant la publication sur le Play Store

- **Identifiant Android** (`android.package` dans `app.json`, ex.
  `sn.sunumall.app`) : définitif une fois l'appli publiée.
- **Icône** : celle de `assets/` est générée à partir de
  `frontend/public/logo-icon.png` (540 × 520 px). Il faut une version
  1024 × 1024 px du logo pour une icône nette sur le store.
- **Adresse du site** (`EXPO_PUBLIC_SITE_URL`) : `https://sunu-mall.pages.dev`
  par défaut, à remplacer par le domaine définitif.
