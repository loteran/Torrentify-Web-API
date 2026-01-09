# 🧲 Torrentify

**Torrentify** est un conteneur Docker qui génère automatiquement des fichiers
**.torrent**, **.nfo** et des métadonnées **TMDb** à partir de films.

Il surveille un dossier de vidéos, analyse les noms de fichiers, récupère les
informations depuis TMDb et prépare des fichiers propres et prêts à l’usage pour
les **trackers privés** et serveurs **Unraid**.

---

## ✨ Fonctionnalités

- 🎬 Génération automatique de fichiers `.torrent`
- 📝 Création de fichiers `.nfo` propres (sans chemin complet)
- 📄 Fichier `.txt` avec ID TMDb ou message explicite si non trouvé
- 👀 Surveillance en temps réel d’un dossier de films
- 🔍 Scan récursif des sous-dossiers
- 🧠 Analyse intelligente des noms (GuessIt)
- 🎞️ Recherche TMDb avec cache local
- 🧲 Trackers configurables via variables d’environnement
- 🔐 Compatible Unraid (`PUID` / `PGID`)
- 🐳 Image Docker légère basée sur Alpine

---

## ⚙️ Variables d’environnement

| Variable | Description |
|--------|------------|
| `TMDB_API_KEY` | Clé API TMDb |
| `TRACKERS` | URL des trackers séparées par des virgules |
| `PUID` | UID utilisateur (Unraid) |
| `PGID` | GID utilisateur (Unraid) |

---

## 📁 Volumes

| Chemin | Description |
|------|------------|
| `/data/films` | Dossier surveillé |
| `/data/torrent` | Fichiers générés |
| `/data/cache_tmdb` | Cache TMDb |

---

## 🚀 Exemple docker-compose

```yaml
services:
  torrentify:
    image: monuser/torrentify:latest
    container_name: torrentify
    restart: unless-stopped
    environment:
      PUID: 1000
      PGID: 1000
      TMDB_API_KEY: votre_cle_tmdb
      TRACKERS: https://tracker1/announce,https://tracker2/announce
    volumes:
      - /mnt/user/data/films:/data/films
      - /mnt/user/data/torrent:/data/torrent
      - /mnt/user/data/cache_tmdb:/data/cache_tmdb
