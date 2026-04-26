# Multi-stage build for the Cyber Amber MCP server.
# Stage 1: install all deps and compile TypeScript.
# Stage 2: copy compiled JS + production-only deps for a small runtime image.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Stdio transport — no port to expose. Run with `docker run --rm -i`.
CMD ["node", "dist/index.js"]
