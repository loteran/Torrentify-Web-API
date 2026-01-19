# Torrentify-Web-API

Generateur automatique de fichiers .torrent avec interface web et configuration via explorateur de fichiers.

> **Fork de** : [thimble9057/torrentify](https://github.com/thimble9057/torrentify)
>
> Ce projet est base sur le travail original de thimble9057. Merci pour le code source initial.

## Fonctionnalites

- Interface web moderne et reactive
- **Configuration des repertoires via explorateur de fichiers integre**
- Scan automatique des bibliotheques de medias
- Recuperation des metadonnees depuis TMDb (The Movie Database)
- Generation de fichiers .torrent avec vos trackers
- Support des films, series, animes et jeux
- Affichage hierarchique pour les jeux (ROMs, emulateurs)
- Creation de hardlinks pour le seeding
- Configuration complete via interface web

## Installation rapide

### 1. Cloner le projet

```bash
git clone https://github.com/loteran/Torrentify-Web-API.git
cd Torrentify-Web-API
```

### 2. Configurer les volumes (optionnel)

Editez `docker-compose.yml` si vous voulez pre-configurer les volumes.
Sinon, vous pouvez tout configurer via l'interface web.

```yaml
volumes:
  # Configuration (obligatoire)
  - ./config:/data/config

  # Montez la racine de votre systeme pour l'explorateur
  - /:/host:ro
```

### 3. Demarrer

```bash
docker compose up -d
```

### 4. Configurer via l'interface

Ouvrez `http://localhost:3001` dans votre navigateur.

Lors de la premiere utilisation, configurez :
- Votre cle API TMDb (gratuite sur themoviedb.org)
- Vos URLs de trackers avec passkey
- **Vos repertoires de medias via l'explorateur de fichiers integre**

## Configuration

### Variables d'environnement

Toutes les variables peuvent etre definies dans `.env` ou via l'interface web.

| Variable | Description | Defaut |
|----------|-------------|--------|
| `TMDB_API_KEY` | Cle API TMDb | (via interface) |
| `TRACKERS` | URLs des trackers (virgules) | (via interface) |
| `ENABLE_FILMS` | Activer les films | `true` |
| `ENABLE_SERIES` | Activer les series | `true` |
| `ENABLE_ANIMES_FILMS` | Activer les animes films | `true` |
| `ENABLE_ANIMES_SERIES` | Activer les animes series | `true` |
| `ENABLE_JEUX` | Activer les jeux | `true` |
| `PARALLEL_JOBS` | Traitements paralleles | `1` |
| `WEB_PORT` | Port de l'interface | `3000` |

### Obtenir une cle API TMDb

1. Creez un compte sur [themoviedb.org](https://www.themoviedb.org/)
2. Allez dans Parametres > API
3. Demandez une cle API (gratuit)
4. Copiez la cle API (v3 auth)

## Docker Hub

```bash
docker pull loteran/torrentify-web-api:latest
```

## Volumes Docker

| Chemin conteneur | Description |
|------------------|-------------|
| `/data/config` | Configuration persistante |
| `/data/films` | Bibliotheque de films |
| `/data/series` | Bibliotheque de series |
| `/data/Animes_films` | Films d'anime |
| `/data/Animes_series` | Series d'anime |
| `/data/jeux` | Jeux / ROMs |
| `/data/torrent` | Sortie des fichiers .torrent |
| `/data/hardlinks` | Hardlinks pour seeding |
| `/host` | Acces au systeme hote (lecture seule) |

## Utilisation

1. Ouvrez l'interface web
2. Cliquez sur l'icone **Parametres** pour configurer vos repertoires
3. Utilisez le bouton **Parcourir** pour selectionner vos dossiers
4. Selectionnez les fichiers/dossiers a traiter
5. Cliquez sur "Traiter la selection"
6. Recuperez vos fichiers .torrent dans le dossier de sortie

## Reverse Proxy

Pour utiliser derriere un reverse proxy avec un sous-chemin :

```
BASE_PATH=/torrentify
```

## Build depuis les sources

```bash
docker compose build
docker compose up -d
```

## Credits

- Code original : [thimble9057/torrentify](https://github.com/thimble9057/torrentify)
- Metadonnees : [The Movie Database (TMDb)](https://www.themoviedb.org/)

## Licence

MIT
