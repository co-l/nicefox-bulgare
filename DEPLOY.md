# Déploiement sur Debian 13 (bulgare.nicefox.net)

## 1. Prérequis serveur

```bash
# Mise à jour système
sudo apt update && sudo apt upgrade -y

# Installer nginx, certbot et git
sudo apt install -y nginx certbot python3-certbot-nginx git curl
```

## 2. Installer Neo4j

```bash
# Ajouter le dépôt Neo4j
curl -fsSL https://debian.neo4j.com/neotechnology.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/neo4j.gpg
echo "deb [signed-by=/usr/share/keyrings/neo4j.gpg] https://debian.neo4j.com stable latest" | sudo tee /etc/apt/sources.list.d/neo4j.list

# Installer
sudo apt update
sudo apt install -y neo4j

# Démarrer et activer
sudo systemctl enable neo4j
sudo systemctl start neo4j

# Définir le mot de passe (première connexion)
# Accéder à http://IP:7474 et changer le mot de passe par défaut (neo4j/neo4j)
# Ou via CLI:
cypher-shell -u neo4j -p neo4j
# > ALTER CURRENT USER SET PASSWORD FROM 'neo4j' TO 'votre_mot_de_passe';
```

## 3. Créer l'utilisateur et installer Node.js 25 (nvm)

```bash
# Créer un utilisateur dédié
sudo useradd -m -s /bin/bash bulgare
sudo su - bulgare

# Installer nvm pour cet utilisateur
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Installer Node.js 25
nvm install 25
nvm alias default 25

# Cloner le projet
git clone https://github.com/VOTRE_REPO/become-fluent-claude.git ~/app
cd ~/app

# Installer les dépendances
npm install

# Build frontend et backend
npm run build
```

## 4. Installer Piper TTS et le modèle vocal bulgare

```bash
# Toujours en tant qu'utilisateur bulgare
cd ~/app

# Créer un environnement Python et installer Piper
python3 -m venv .venv
source .venv/bin/activate
pip install piper-tts

# Créer le dossier pour les voix
mkdir -p .piper-voices


cd .piper-voices && wget https://huggingface.co/rhasspy/piper-voices/resolve/main/bg/bg_BG/dimitar/medium/bg_BG-dimitar-medium.onnx && wget https://huggingface.co/rhasspy/piper-voices/resolve/main/bg/bg_BG/dimitar/medium/bg_BG-dimitar-medium.onnx.json


# Vérifier que les fichiers sont présents
ls -la bg_BG-dimitar-medium.*
# Doit afficher : bg_BG-dimitar-medium.onnx et bg_BG-dimitar-medium.onnx.json

pip install faster-whisper

cd ~/app
deactivate
```

## 5. Configuration environnement

### Backend (`~/app/backend/.env`)

```bash
cat > ~/app/backend/.env << 'EOF'
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=votre_mot_de_passe_neo4j

# JWT (générer des secrets aléatoires)
JWT_SECRET=votre_secret_jwt_32_caracteres_min
JWT_REFRESH_SECRET=votre_refresh_secret_32_car_min

# Mistral AI
MISTRAL_API_KEY=votre_cle_mistral

# Server
PORT=3188
FRONTEND_URL=https://bulgare.nicefox.net
EOF
```

### Frontend (`~/app/frontend/.env`)

```bash
cat > ~/app/frontend/.env << 'EOF'
VITE_API_URL=https://bulgare.nicefox.net
EOF
```

**Important** : Après avoir créé le `.env` frontend, rebuilder :

```bash
cd ~/app
npm run build
```

## 6. Lancer le backend avec pm2

```bash
# En tant qu'utilisateur bulgare
sudo su - bulgare

# Installer pm2 globalement
npm install -g pm2

# Lancer le backend
cd ~/app/backend
pm2 start dist/index.js --name bulgare-api

# Configurer le démarrage automatique au boot
pm2 startup
# Copier et exécuter la commande affichée (en tant que root)

# Sauvegarder la config pm2
pm2 save

# Commandes utiles
pm2 status          # voir le statut
pm2 logs bulgare-api # voir les logs
pm2 restart bulgare-api # redémarrer
```

## 7. Configuration Nginx

```bash
sudo tee /etc/nginx/sites-available/bulgare << 'EOF'
server {
    listen 80;
    server_name bulgare.nicefox.net;

    # Frontend (fichiers statiques)
    root /home/bulgare/app/frontend/dist;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # API proxy
    location /api {
        proxy_pass http://127.0.0.1:3188;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Activer le site
sudo ln -s /etc/nginx/sites-available/bulgare /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Tester et recharger
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Certificat SSL (Let's Encrypt)

```bash
# S'assurer que le DNS pointe vers le serveur, puis :
sudo certbot --nginx -d bulgare.nicefox.net

# Renouvellement automatique (déjà configuré par certbot)
sudo systemctl status certbot.timer
```

## 9. Permissions

```bash
# Permettre à nginx de lire les fichiers frontend
sudo chmod 755 /home/bulgare
sudo chmod -R 755 /home/bulgare/app/frontend/dist
```

## 10. Firewall (optionnel mais recommandé)

```bash
sudo apt install -y ufw
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 11. Vérifications

```bash
# Backend
curl http://localhost:3188/api/health

# Frontend (depuis l'extérieur)
# Ouvrir https://bulgare.nicefox.net dans un navigateur
```

---

## Mise à jour du projet

```bash
sudo su - bulgare
cd ~/app

# Pull les changements
git pull

# Réinstaller les dépendances si nécessaire
npm install

# Rebuild
npm run build

# Redémarrer le backend
pm2 restart bulgare-api
```

---

## Commandes utiles

```bash
# Backend (pm2) - en tant qu'utilisateur bulgare
sudo su - bulgare
pm2 status
pm2 logs bulgare-api
pm2 restart bulgare-api

# Logs nginx
sudo tail -f /var/log/nginx/error.log

# Neo4j
sudo systemctl status neo4j

# Redémarrer tout
sudo systemctl restart neo4j nginx
sudo su - bulgare -c "pm2 restart bulgare-api"
```

---

## Architecture finale

```
bulgare.nicefox.net
        │
        ▼
    [Nginx:443]
        │
        ├── /api/*  ──▶  [Node.js:3188] ──▶ [Neo4j:7687]
        │
        └── /*  ──▶  [Static files: /home/bulgare/app/frontend/dist]
```
