FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY apps/web/.next/standalone ./
COPY apps/web/.next/static ./apps/web/.next/static
COPY apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
