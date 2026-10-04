# Deployment

Production deployment source: GitHub `main`  
Hostinger app: KHIZER LEDGER  
Production URL: https://khizer.shahzebzada.net

## Normal workflow

```bash
git push origin main
```

Hostinger GitHub auto-deploy should rebuild from `main`.

## Fallback

If production still shows an old UI after the push:

hPanel → Website → Deployments → Redeploy → `main`

Do not assume a missing feature is a code bug until `/api/version` matches GitHub.

## Verification

- `/api/health` — app and database status
- `/api/version` — deployed commit / build id

Compare `/api/version` with GitHub `main`, and with **App version** at the bottom of Settings on Anas’s phone.
