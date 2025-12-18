# syntax=docker/dockerfile:1
FROM node:20.17.0-alpine AS base

ENV NODE_ENV=production
WORKDIR /app

#Copy package and install deps
COPY package*.json ./
RUN npm install

EXPOSE 3000
CMD ["node", "src/server.js"]
