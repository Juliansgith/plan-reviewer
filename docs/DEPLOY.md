# Deploying

The app runs as one Docker container behind nginx on a shared server. nginx adds HTTPS, a password on the page and the plan data, and a rate limit on the scheduling API. The OpenRouter key is not needed on the server: reviews are made offline with `./review` and committed.

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

What stays open without the password: `POST /api/schedule` (the graders' checker cannot send one; it only schedules what it is sent, and is rate-limited) and `GET /api/health`.

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
