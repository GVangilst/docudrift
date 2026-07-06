# Demo App

## Docker

Example production Dockerfile:

```dockerfile
FROM node:20
COPY . .
RUN npm ci && npm run build
CMD ["node", "dist/index.js"]
```

## Local development

Then start the production build locally:

```bash
npm run start:prod
```
