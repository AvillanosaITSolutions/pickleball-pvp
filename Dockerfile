# Frontend build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY eslint.config.js ./
COPY index.html ./

# Copy source
COPY src ./src
COPY public ./public

# Install dependencies and build
ARG VITE_API_BASE_URL
ARG VITE_COLYSEUS_URL
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_COLYSEUS_URL=$VITE_COLYSEUS_URL \
    VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN \
    VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID \
    VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE
RUN npm ci && npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy built app from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/index.html || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
