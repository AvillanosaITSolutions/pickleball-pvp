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
# VITE_GAME: unset/"all" = combined build, "rage" or "sabong" = CrazyGames
# standalone bundle (no Auth0, single game). Output dir varies by game; the
# build step copies the right one to /app/out so the runtime stage is uniform.
ARG VITE_GAME=all
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_COLYSEUS_URL=$VITE_COLYSEUS_URL \
    VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN \
    VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID \
    VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE \
    VITE_GAME=$VITE_GAME
RUN npm ci && \
    if [ "$VITE_GAME" = "rage" ]; then npm run build:rage && cp -r dist-rage /app/out; \
    elif [ "$VITE_GAME" = "sabong" ]; then npm run build:sabong && cp -r dist-sabong /app/out; \
    else npm run build && cp -r dist /app/out; fi

# Production stage - serve with nginx
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy built app from builder (uniform /app/out path regardless of VITE_GAME)
COPY --from=builder /app/out /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/index.html || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
