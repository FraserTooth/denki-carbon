# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
# FROM oven/bun:latest as base
FROM node:latest as base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr bash
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production
RUN npm rebuild @tensorflow/tfjs-node --build-addon-from-source

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# tests
ENV NODE_ENV=production
RUN bun test

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/src ./src
COPY --from=prerelease /usr/src/app/drizzle ./drizzle
COPY --from=prerelease /usr/src/app/package.json .

# run the app
USER bun
EXPOSE 3000
ENTRYPOINT [ "bun", "run", "start" ]