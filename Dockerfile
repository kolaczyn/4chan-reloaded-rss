FROM node:20

WORKDIR /app
RUN mkdir -p /app/.store

COPY package.json yarn.lock ./

RUN yarn install

COPY . .

EXPOSE 8080

CMD ["node", "server.js"]