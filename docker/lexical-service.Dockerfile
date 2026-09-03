FROM oven/bun:1
WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile

WORKDIR /app/services/lexical-service
RUN mkdir -p node_modules/@conation \
  && ln -sfn /app/packages/lexical-core node_modules/@conation/lexical-core

EXPOSE 8096

CMD ["bun", "run", "src/server.ts"]
