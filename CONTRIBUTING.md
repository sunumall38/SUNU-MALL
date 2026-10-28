# Comment contribuer

## Branches

On suit Gitflow, simplifié :

- `main` — toujours stable, c'est ce qui est en production.
- `develop` — intégration : tout ce qui est prêt mais pas encore livré.
- `feature/<nom-court>` / `fix/<nom-court>` — une branche par fonctionnalité ou correction, créée **depuis `develop`**, jamais depuis `main`.
- `release/X.Y.Z` — préparation d'une version (depuis `develop`, fusionnée dans `main`).
- `hotfix/X.Y.Z` — correctif urgent de production (depuis `main`).

```bash
git checkout develop
git pull origin develop
git checkout -b feature/panier-livraison
```

## Commits

Format recommandé (Conventional Commits) :

```
type(zone): description courte au présent

feat(backend): ajoute l'endpoint de recommandations IA
fix(frontend): corrige le crash à l'ouverture du panier
chore(infra): met à jour l'image Postgres
```

Types courants : `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
Zones courantes : `backend`, `frontend`, `ia`, `infra`.

## Pull Requests

1. Pousse ta branche, ouvre une PR vers `develop` (pas vers `main` directement).
2. Remplis le template de PR (quoi, pourquoi, comment tester).
3. La CI doit passer (build + lint + tests) avant de demander une review.
4. Le CODEOWNERS de la zone touchée doit approuver (voir `.github/CODEOWNERS`).
5. Une fois approuvé : merge dans `develop`.

`main` ne reçoit que des merges depuis `develop`, au moment d'une release.

## Versions et tags

On suit [SemVer](https://semver.org/lang/fr/) (`MAJEUR.MINEUR.CORRECTIF`, ex. `1.2.3`) :

- **MAJEUR** : changement incompatible (ex. refonte du paiement, API cassée pour l'app mobile) ;
- **MINEUR** : nouvelle fonctionnalité compatible (ex. un nouveau moyen de paiement) ;
- **CORRECTIF** : correction de bug sans nouveauté (ex. prix mal affiché).

La version vit dans **un seul fichier**, `VERSION` à la racine. Elle est
reprise par l'API (`GET /api/version/`, documentation OpenAPI), par le
frontend (pied de page) et par l'historique des déploiements de
l'administration. Un test vérifie que `VERSION` et `frontend/package.json`
concordent.

Chaque tag `vX.Y.Z` correspond exactement à ce qui part en production.

### Publier une version

1. Au fil de l'eau, chaque PR complète la section `## [Non publié]` de
   `CHANGELOG.md` (Ajouté / Modifié / Corrigé / Sécurité).
2. Depuis `develop` à jour, créer `release/X.Y.Z`, vérifier (CI verte,
   recette), puis :

   ```bash
   scripts/release.sh minor        # ou patch, major, ou 1.4.0
   git push origin release/X.Y.Z && git push origin vX.Y.Z
   ```

   Le script met à jour `VERSION`, `frontend/package.json` et le CHANGELOG,
   crée le commit `chore(release): vX.Y.Z` et le tag annoté.
3. Ouvrir la PR `release/X.Y.Z` → `main`, la fusionner (pas de squash : le
   tag doit rester sur l'historique de `main`), puis fusionner `main` dans
   `develop`.
4. Pousser le tag déclenche `.github/workflows/release.yml`, qui crée la
   release GitHub avec les notes du CHANGELOG. La fusion sur `main` déclenche
   le déploiement Render et Cloudflare Pages.

### Correctif urgent

`hotfix/X.Y.Z` depuis `main`, correction, `scripts/release.sh patch`, PR vers
`main` puis report dans `develop`.

### Revenir à une version

Render : *Manual Deploy → Deploy a specific commit* et choisir le commit du
tag. Cloudflare Pages : *Deployments → … → Rollback* sur le déploiement de ce
commit. La page « Déploiements » de l'administration montre la version active.

## Dockerfile

Chaque service garde son `Dockerfile` à jour. Règle simple : si tu ajoutes une dépendance à un service, vérifie que le `Dockerfile`/`requirements`/`package.json` correspondant la liste bien — l'objectif est qu'aucun service n'installe une dépendance dont il n'a pas besoin (ex: le frontend ne doit jamais tirer les libs IA du backend).

## Conflits

En cas de conflit Git : ne jamais merger à l'aveugle. Lire les marqueurs `<<<<<<<` / `=======` / `>>>>>>>`, choisir/fusionner la bonne version, supprimer les marqueurs, puis `git add` + `git commit`.

Pour limiter les conflits : `git pull origin develop` régulièrement sur ta branche feature.
