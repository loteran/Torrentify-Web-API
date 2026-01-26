import { useState } from 'react';

function NginxGenerator() {
  const [domain, setDomain] = useState('');
  const [basePath, setBasePath] = useState('');
  const [sslPath, setSslPath] = useState('/etc/letsencrypt/live');
  const [showConfig, setShowConfig] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateConfig = () => {
    const serverName = domain || 'torrentify.example.com';
    const certPath = `${sslPath}/${serverName}`;
    const useBasePath = basePath && basePath.trim() !== '';
    const locationPath = useBasePath ? basePath : '/';

    // Configuration pour sous-chemin ou racine
    if (useBasePath) {
      return `# Configuration Nginx pour Torrentify
# Sous-chemin: ${basePath}

server {
    listen 443 ssl http2;
    server_name ${serverName};

    ssl_certificate ${certPath}/fullchain.pem;
    ssl_certificate_key ${certPath}/privkey.pem;

    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    location ${locationPath} {
        proxy_pass http://torrentify-web-api:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Redirection HTTP vers HTTPS
server {
    listen 80;
    server_name ${serverName};
    return 301 https://$server_name$request_uri;
}

# N'oubliez pas de definir BASE_PATH=${basePath} dans votre .env ou via l'interface`;
    }

    return `# Configuration Nginx pour Torrentify
# Domaine: ${serverName}

server {
    listen 443 ssl http2;
    server_name ${serverName};

    ssl_certificate ${certPath}/fullchain.pem;
    ssl_certificate_key ${certPath}/privkey.pem;

    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://torrentify-web-api:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Redirection HTTP vers HTTPS
server {
    listen 80;
    server_name ${serverName};
    return 301 https://$server_name$request_uri;
}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateConfig());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Erreur copie:', err);
    }
  };

  const handleDownload = () => {
    const config = generateConfig();
    const filename = domain ? `${domain.replace(/\./g, '_')}.conf` : 'torrentify.conf';
    const blob = new Blob([config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="nginx-generator">
      <div className="config-field">
        <label>Nom de domaine</label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="torrentify.example.com"
        />
      </div>

      <div className="config-field">
        <label>Sous-chemin (optionnel)</label>
        <input
          type="text"
          value={basePath}
          onChange={(e) => setBasePath(e.target.value)}
          placeholder="/torrentify"
        />
        <small>Laissez vide pour utiliser la racine du domaine</small>
      </div>

      <div className="config-field">
        <label>Chemin certificats SSL</label>
        <input
          type="text"
          value={sslPath}
          onChange={(e) => setSslPath(e.target.value)}
          placeholder="/etc/letsencrypt/live"
        />
        <small>Dossier contenant vos certificats Let's Encrypt</small>
      </div>

      <div className="nginx-actions">
        <button
          className="btn btn-secondary"
          onClick={() => setShowConfig(!showConfig)}
        >
          {showConfig ? 'Masquer' : 'Generer'} la configuration
        </button>
      </div>

      {showConfig && (
        <div className="nginx-config-output">
          <div className="nginx-config-header">
            <span>Configuration Nginx</span>
            <div className="nginx-config-actions">
              <button className="btn btn-small btn-secondary" onClick={handleCopy}>
                {copied ? 'Copie !' : 'Copier'}
              </button>
              <button className="btn btn-small btn-secondary" onClick={handleDownload}>
                Telecharger
              </button>
            </div>
          </div>
          <pre className="nginx-config-content">
            {generateConfig()}
          </pre>
        </div>
      )}
    </div>
  );
}

export default NginxGenerator;
