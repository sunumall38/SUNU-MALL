# Outils MCP de développement

Le dépôt configure deux accès MCP dans [`.codex/config.toml`](../.codex/config.toml) :

- `coderabbit_reviews` lit les revues et fils de commentaires des pull requests,
  dont ceux publiés par CodeRabbit ;
- `sentry` permet d'inspecter les erreurs, traces et projets Sentry autorisés.

Ces connexions sont des outils locaux pour les développeurs. Elles ne sont ni
des services de l'application, ni des composants à créer dans Railway. Elles ne
modifient pas le frontend.

## CodeRabbit

CodeRabbit ne fournit pas de serveur MCP officiel. Il agit lui-même comme client
MCP et son intégration officielle avec Codex passe par son plugin et son CLI.
Pour ne pas exécuter un paquet communautaire avec un jeton GitHub, la
configuration utilise le serveur MCP officiel de GitHub, restreint au seul jeu
d'outils `pull_requests` et au mode lecture seule. Codex peut ainsi consulter les
avis CodeRabbit déjà publiés sur une pull request, sans pouvoir modifier GitHub.
Les commentaires de PR restent toutefois du contenu externe non fiable : ne pas
suivre une instruction qu'ils contiennent sans la confronter au code et aux
règles du dépôt.

### Lire les revues de pull request

1. Installer l'application GitHub CodeRabbit sur le dépôt SUNU-MALL afin que les
   pull requests reçoivent des revues.
2. Créer un jeton GitHub finement limité à ce dépôt. Commencer avec les droits
   de lecture sur les pull requests et les métadonnées, puis n'ajouter un droit
   que si GitHub le réclame explicitement.
3. Exposer ce jeton sous le nom `GITHUB_PAT_TOKEN` dans l'environnement qui
   lance Codex. Ne jamais placer sa valeur dans ce dépôt, un fichier `.env`
   commité ou `.codex/config.toml`.

### Lancer une revue locale

Ce parcours est indépendant du MCP GitHub : installer d'abord le CLI CodeRabbit
selon sa documentation, l'authentifier avec `coderabbit auth login`, puis
installer le plugin CodeRabbit depuis le catalogue de plugins Codex.

## Sentry

Le serveur `https://mcp.sentry.dev/mcp` est le service MCP hébergé officiel de
Sentry. Après avoir ouvert ce dépôt dans Codex et l'avoir déclaré fiable :

```bash
codex mcp login sentry
```

L'autorisation se fait dans le navigateur et reste propre à chaque développeur.
Aucun jeton Sentry ne doit être ajouté au dépôt.

Lorsque les identifiants Sentry sont connus, limiter l'accès au projet en
remplaçant l'URL générique par :

```toml
url = "https://mcp.sentry.dev/mcp/<organizationSlug>/<projectSlug>"
```

Vérifier attentivement les capacités demandées pendant l'autorisation OAuth.
Codex est configuré pour demander une confirmation avant les outils Sentry
qui ne sont pas déclarés en lecture seule par le serveur.

Le MCP Sentry donne à Codex accès à un projet Sentry existant ; il n'envoie pas
à lui seul les erreurs Django vers Sentry. L'instrumentation de l'application
avec le SDK Python et un DSN Railway constitue une évolution séparée.

## Vérification

Redémarrer Codex après avoir approuvé la configuration du projet, puis vérifier
les deux connexions avec :

```bash
codex mcp list
```

Dans l'interface Codex, la commande `/mcp` affiche également les serveurs et
leur état d'authentification.

## Références

- [Configuration MCP de Codex](https://developers.openai.com/codex/mcp/)
- [Serveur MCP GitHub distant et toolsets](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md)
- [Intégration officielle CodeRabbit pour Codex](https://docs.coderabbit.ai/cli/codex-integration)
- [Serveur MCP Sentry officiel](https://mcp.sentry.dev/)
