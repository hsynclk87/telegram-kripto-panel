FROM node:22-alpine
WORKDIR /app
COPY package.json ./package.json
COPY src/server.js ./src/server.js
COPY public/index.html ./public/index.html
RUN node --check src/server.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
