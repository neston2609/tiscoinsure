# TISCO Insure

Admin portal for managing the MFEC Insurance Genesys Cloud integration.

## Development

```bash
npm install
npm run dev
```

The API runs on port `3000` and the Vite UI runs on port `5173`.

## Production

```bash
npm install
npm run build
npm start
```

The production server listens on `PORT` or `3000` and serves both `/api/*` and the built React application.

## Demo domain deployment

The deployed domain is `tiscodemo.bsmrpa.com`. Its DNS A record must point to the server, and inbound TCP ports 80 and 443 must be allowed in the instance security group. Keep port 3000 private.

Set `APP_SECRET` to a unique, persistent random value in a server-only `.env` file before starting the production process. Production listens on `127.0.0.1:3000` by default. Do not change `APP_SECRET` after storing Genesys credentials, or the saved client secret cannot be decrypted.

Install nginx, Certbot, and `apache2-utils`. Create `/etc/nginx/.tiscoinsure.htpasswd` with `htpasswd -cB` and restrict it to the nginx worker. Use [bootstrap.conf](deploy/nginx/bootstrap.conf) until a Let's Encrypt certificate has been issued with the webroot `/var/www/letsencrypt`, then replace it with [production.conf](deploy/nginx/production.conf). The production config redirects HTTP to HTTPS and requires HTTP Basic authentication. Install [reload-nginx.sh](deploy/letsencrypt/reload-nginx.sh) in `/etc/letsencrypt/renewal-hooks/deploy/` so nginx reloads renewed certificates. Test with `nginx -t` before every reload.
