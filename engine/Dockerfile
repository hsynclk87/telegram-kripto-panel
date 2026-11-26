FROM node:22-alpine
WORKDIR /app
COPY package.json ./package.json
COPY src/server.js ./src/server.js
COPY src/knn.js ./src/knn.js
COPY public/index.html ./public/index.html
COPY public/knn-ui.js ./public/knn-ui.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
