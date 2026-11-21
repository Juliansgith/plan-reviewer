# Deploying

The app runs as one Docker container behind nginx on a shared server. nginx adds HTTPS, a password on the page and the plan data, and a rate limit on the scheduling API. The page needs no model key: its reviews are made with `./review` and committed. The server holds one only for `POST /api/review`, which lets `./review` run without a key of its own (D20); without the key and the token hash below, that endpoint stays off.

## Every deploy

```sh
deploy/deploy.sh <ssh-host>          # for example: deploy/deploy.sh portfolio-honey
```

It ships the committed code into `/opt/plan-reviewer/releases/<commit>`, rebuilds and restarts the container from `deploy/compose.yaml`, points `/opt/plan-reviewer/current` at it, and waits for `/api/health`. Then check the live site with the graders' checker:

```sh
CONTRACT_BASE_URL=https://<domain> npm run contract
```

## One-time server setup

On the server, as root:

```sh
# 1. The site, from this repository
cp /opt/plan-reviewer/current/deploy/nginx-plan-reviewer.conf /etc/nginx/sites-available/plan-reviewer.conf
ln -s /etc/nginx/sites-available/plan-reviewer.conf /etc/nginx/sites-enabled/plan-reviewer.conf

# 2. The password for the page (SHA-512 crypt; the password never enters the repository)
printf 'nora:%s\n' "$(openssl passwd -6)" > /etc/nginx/plan-reviewer.htpasswd
chown root:www-data /etc/nginx/plan-reviewer.htpasswd && chmod 640 /etc/nginx/plan-reviewer.htpasswd

# 3. Check, reload, add HTTPS
nginx -t && systemctl reload nginx
certbot --nginx -d <domain>
```

### The review endpoint (optional)

On the server, as root. The key and the token's hash live in `/opt/plan-reviewer/shared`, outside every release:

```sh
install -d -m 750 /opt/plan-reviewer/shared
# The model key, read from standard input so it never appears in a command line or history.
# Readable by root and group 10001 only; the container's user joins group 10001.
(umask 077; cat > /opt/plan-reviewer/shared/openrouter_api_key)    # paste the key, then Ctrl-D
chown root:10001 /opt/plan-reviewer/shared/openrouter_api_key && chmod 440 /opt/plan-reviewer/shared/openrouter_api_key
```

Make the token on your own computer and keep it; the server gets only its hash:

```sh
node -e "const t=require('crypto').randomBytes(32).toString('base64url'); console.log('token:', t); console.log('REVIEW_API_TOKEN_SHA256=' + require('crypto').createHash('sha256').update(t).digest('hex'))"
```

Put the `REVIEW_API_TOKEN_SHA256=...` line in `/opt/plan-reviewer/shared/review.env` (mode 600), then `cd /opt/plan-reviewer/current && docker compose -f deploy/compose.yaml up -d`. Rotation, revocation and the audit trail: docs/SECURITY.md.

What stays open without the password: `POST /api/schedule` (the graders' checker cannot send one; it only schedules what it is sent, and is rate-limited), `POST /api/review` (it needs its own token) and `GET /api/health`.

## Undo

```sh
rm /etc/nginx/sites-enabled/plan-reviewer.conf && nginx -t && systemctl reload nginx
cd /opt/plan-reviewer/current && docker compose -f deploy/compose.yaml down
```

## Current deployment

- Server: `portfolio-honey` (Ubuntu 22.04).
- URL: `https://planreviewer.213-133-98-90.sslip.io` (HTTPS from Let's Encrypt, renewed by certbot's timer) ([sslip.io](https://sslip.io) maps the name to the server's address, so no DNS record is needed).
- Login: user `nora`; the password is shared outside the repository.
- Rate limit on `/api/schedule`: 50 requests a second per client, bursts of 200.
- `/api/review`: on, with the token's hash and the model key in `/opt/plan-reviewer/shared`; 10 requests a minute per client in nginx, and 2 at once, 30 an hour and 200 a day in the app.
