FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
COPY data ./data
ENV NODE_ENV=production
EXPOSE 4310
CMD ["node", "server/index.mjs"]
