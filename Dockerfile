FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --chown=node:node . .
RUN chown -R node:node /app
USER node
ENV PORT=4173
EXPOSE 4173
CMD ["npm", "start"]
