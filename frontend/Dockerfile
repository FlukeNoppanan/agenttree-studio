FROM node:24-bookworm-slim

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/index.html frontend/vite.config.ts frontend/tsconfig*.json ./
COPY frontend/src ./src
COPY frontend/public ./public

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
