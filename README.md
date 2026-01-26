# Torrentify-Web-API

Generateur automatique de fichiers .torrent avec interface web et configuration via explorateur de fichiers.

> **Fork de** : [thimble9057/torrentify](https://github.com/thimble9057/torrentify)
>
> Ce projet est base sur le travail original de thimble9057. Merci pour le code source initial.

## Fonctionnalites

- Interface web moderne et reactive
- **Authentification optionnelle** (login/password) pour securiser l'acces
- **Configuration des repertoires via explorateur de fichiers integre**
- Scan automatique des bibliotheques de medias
- Recuperation des metadonnees depuis TMDb (The Movie Database)
- Generation de fichiers .torrent avec vos trackers
- Support des films, series, animes et jeux
- Affichage hierarchique pour les jeux (ROMs, emulateurs)
- Creation de hardlinks pour le seeding
- Configuration complete via interface web
- Demarrage possible sans configuration prealable

## Captures d'ecran

### Interface principale
L'interface affiche vos fichiers medias avec leur statut de traitement.

### Page de connexion (optionnelle)
Si l'authentification est activee, une page de connexion securisee protege l'acces.

### Configuration
Configurez vos chemins, trackers et options directement depuis l'interface web.

## Installation rapide

### 1. Cloner le projet

```bash
git clone https://github.com/loteran/Torrentify-Web-API.git
cd Torrentify-Web-API
```

### 2. Configurer (optionnel)

Copiez le fichier d'exemple et modifiez selon vos besoins :

```bash
cp .env.example .env
```

Ou configurez tout via l'interface web apres le demarrage.

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
- (Optionnel) L'authentification pour securiser l'acces

## Configuration

### Variables d'environnement

Toutes les variables peuvent etre definies dans `.env` ou via l'interface web.

#### API et Trackers

| Variable | Description | Defaut |
|----------|-------------|--------|
| `TMDB_API_KEY` | Cle API TMDb | (via interface) |
| `TRACKERS` | URLs des trackers (virgules) | (via interface) |

#### Categories de medias

| Variable | Description | Defaut |
|----------|-------------|--------|
| `ENABLE_FILMS` | Activer les films | `true` |
| `ENABLE_SERIES` | Activer les series | `true` |
| `ENABLE_ANIMES_FILMS` | Activer les animes films | `true` |
| `ENABLE_ANIMES_SERIES` | Activer les animes series | `true` |
| `ENABLE_JEUX` | Activer les jeux | `true` |

#### Authentification (optionnel)

| Variable | Description | Defaut |
|----------|-------------|--------|
| `AUTH_ENABLED` | Activer l'authentification | `false` |
| `AUTH_USERNAME` | Identifiant de connexion | `admin` |
| `AUTH_PASSWORD` | Mot de passe | `changeme` |
| `AUTH_SECRET` | Cle secrete JWT (auto-generee si vide) | (auto) |

#### Systeme

| Variable | Description | Defaut |
|----------|-------------|--------|
| `PARALLEL_JOBS` | Traitements paralleles | `1` |
| `WEB_PORT` | Port de l'interface | `3000` |
| `BASE_PATH` | Chemin de base (reverse proxy) | (vide) |

## Authentification

L'authentification est **desactivee par defaut**. Pour l'activer :

### Via l'interface web (recommande)

1. Ouvrez les **Parametres** (icone engrenage)
2. Dans la section **Authentification**, cochez "Activer l'authentification"
3. Definissez votre identifiant et mot de passe
4. Sauvegardez

### Via les variables d'environnement

```bash
AUTH_ENABLED=true
AUTH_USERNAME=votre_identifiant
AUTH_PASSWORD=votre_mot_de_passe
```

> **Note** : Les mots de passe sont stockes de maniere securisee (hash SHA256).

## Docker Hub

```bash
docker pull loteran/torrentify-web-api:latest
```

### Architectures supportees

- `linux/amd64`
- `linux/arm64`

## Volumes Docker

| Chemin conteneur | Description |
|------------------|-------------|
| `/data/config` | Configuration persistante |
| `/mnt` | Point d'acces aux montages hote |
| `/media` | Point d'acces aux medias hote |
| `/data/torrent` | Sortie des fichiers .torrent |
| `/data/hardlinks` | Hardlinks pour seeding |

> **Note** : Les chemins des medias sont maintenant configures via l'interface web. Plus besoin de monter `/data/films`, `/data/series`, etc.

## Utilisation

1. Ouvrez l'interface web
2. (Si auth activee) Connectez-vous avec vos identifiants
3. Cliquez sur l'icone **Parametres** pour configurer vos repertoires
4. Utilisez le bouton **Parcourir** pour selectionner vos dossiers
5. Selectionnez les fichiers/dossiers a traiter
6. Cliquez sur "Traiter la selection"
7. Recuperez vos fichiers .torrent dans le dossier de sortie

## Reverse Proxy (HTTPS)

### Generateur integre (recommande)

Torrentify inclut un generateur de configuration nginx accessible depuis les **Parametres** :

1. Ouvrez les **Parametres** (icone engrenage)
2. Faites defiler jusqu'a la section **Reverse Proxy (Nginx)**
3. Entrez votre nom de domaine
4. (Optionnel) Entrez un sous-chemin si vous voulez utiliser `/torrentify`
5. Cliquez sur **Generer la configuration**
6. Copiez ou telechargez la configuration generee

### Configuration manuelle

Pour utiliser derriere un reverse proxy nginx avec SSL :

```nginx
server {
    listen 443 ssl http2;
    server_name torrentify.votre-domaine.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://torrentify-web-api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Pour un sous-chemin :

```bash
BASE_PATH=/torrentify
```

## Obtenir une cle API TMDb

1. Creez un compte sur [themoviedb.org](https://www.themoviedb.org/)
2. Allez dans Parametres > API
3. Demandez une cle API (gratuit)
4. Copiez la cle API (v3 auth)

## Build depuis les sources

```bash
docker compose build
docker compose up -d
```

## Changelog

### v2.2.0
- Generateur de configuration Nginx integre
- Generation automatique de config reverse proxy HTTPS
- Support des sous-chemins (BASE_PATH)
- Export et copie de la configuration

### v2.1.0
- Authentification optionnelle (login/password)
- Configuration dynamique des chemins medias via interface
- Demarrage sans configuration obligatoire
- Tokens JWT securises
- Corrections de bugs

### v2.0.0
- Interface web complete
- Explorateur de fichiers integre
- Configuration via interface

## Credits

- Code original : [thimble9057/torrentify](https://github.com/thimble9057/torrentify)
- Metadonnees : [The Movie Database (TMDb)](https://www.themoviedb.org/)

## Licence

MIT
