# AuthFlow Frontend

Next.js frontend for the AuthFlow employee and student management portal.

## Local Development

```bash
npm install
npm run dev
```

Set `API_BASE_URL` to the running Express backend URL. The Next.js rewrite
proxies `/api/*` requests to that backend.

## Production Build

```bash
npm run lint
npm run build
npm start
```

## Render

Deploy this directory as a Render Web Service:

```text
Root Directory: frontend
Build Command: npm install && npm run build
Start Command: npm start
```

Set `API_BASE_URL` to the backend Render service URL. See the root
`DEPLOYMENT.md` for the complete Render-only setup.
