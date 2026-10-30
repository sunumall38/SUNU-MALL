# Sunu Mall — application mobile

Une seule application React Native (Expo) pour tous les comptes : l'écran
affiché dépend du rôle, comme sur le site.

| Compte | Dans l'appli |
|---|---|
| Visiteur | Écran d'accueil, puis catalogue, recherche, boutiques et fiches produit sans compte ; inscription (client ou vendeur) et connexion par numéro ou email dans l'appli |
| Client | Onglets Accueil, Recherche, Panier, Commandes, Profil ; commande et paiement Wave / Orange Money (`src/app/client/`) |
| Commerçant | Ouverture de l'espace (pièces d'identité, création de la boutique), puis Accueil (tableau de bord), Commandes, Produits (ajout avec photos), Statistiques, Plus : ma boutique, abonnement payé dans l'appli, promotions, portefeuille et retraits (`src/app/merchant/`) |
| Livreur | Espace livreur (`src/app/driver/`) — provisoire, renvoie vers le site |
| Partenaire, admin | Écran « votre espace est sur le site » |
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
│   ├── welcome.tsx         # Écran d'accueil du visiteur
│   ├── register.tsx, verify-pending.tsx, forgot-password.tsx
│   ├── support/            # Aide et support (tous les comptes)
│   ├── login.tsx
│   ├── change-password.tsx
│   ├── web-only.tsx
│   ├── client/             # Espace client (ouvert aux visiteurs)
│   │   ├── (tabs)/         # Accueil, Recherche, Panier, Commandes, Profil
│   │   ├── product/[id].tsx    # Fiche produit
│   │   ├── checkout.tsx        # Livraison et paiement
│   │   ├── payment/[id].tsx    # Paiement et retour de Wave / Orange Money
│   │   ├── orders/[id].tsx     # Détail d'une commande
│   │   └── …                   # Adresses, favoris, notifications, boutiques, catégories
│   ├── merchant/           # Espace vendeur (maquette « Espace boutique »)
│   └── driver/             # Espace livreur
├── components/     # Logo, boutons, cartes produit, onglets en pastilles…
├── lib/            # Client API, téléphone +221, formats, rôles, statuts de commande
├── store/          # Session (jetons dans le trousseau chiffré), panier, favoris, commande en cours
├── theme.ts        # Couleurs de la marque
└── types.ts        # Types de l'API
```

Le design suit les maquettes « Espace client » et « Espace boutique /
vendeur » ; les couleurs sont dans `src/theme.ts`.

Côté vendeur, une commande payée se confirme (« en préparation », le client
est prévenu) puis se marque « colis prêt » (le livreur affecté est prévenu) :
`POST /orders/<id>/confirm/` et `/ready/`. L'expédition et la livraison
suivent ensuite la course du livreur.

## Paiement

En production, « Confirmer et payer » crée la commande puis ouvre la page
Wave ou Orange Money. Le paiement est lancé avec `return_to: "app"` : la
page de retour du site invite alors à revenir dans l'appli, qui demande le
statut au serveur dès qu'elle repasse au premier plan. Tant que le backend
est en mode test (`PAYMENT_SANDBOX`), l'écran propose de simuler un
paiement réussi ou un échec.

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
