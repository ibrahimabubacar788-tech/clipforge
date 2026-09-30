FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=4173
EXPOSE 4173
CMD ["npm", "start"]
