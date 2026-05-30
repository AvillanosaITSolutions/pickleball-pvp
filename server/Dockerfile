FROM node:22-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache git
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/build ./build
EXPOSE 2567
CMD ["node", "build/index.js"]
