# syntax=docker/dockerfile:1
FROM node:20.17.0-alpine AS base

ENV NODE_ENV=production
WORKDIR /app

#Copy package and install deps
COPY package*.json ./
RUN npm install

#COPY . .

EXPOSE 3000

# Mark the container unhealthy when the process is up but its DB connection is
# severed (/readyz returns 503). Uses node so no extra tooling (curl/wget) is
# needed in the alpine image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/readyz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]
