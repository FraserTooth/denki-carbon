# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
# FROM oven/bun:latest as base
FROM oven/bun:latest as base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && BUN_CONFIG_REGISTRY="https://registry.npmjs.org" bun install --frozen-lockfile
RUN bun test

# install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
# Consider adding --production flag to the install command if you don't need devDependencies
RUN cd /temp/prod && bun install --frozen-lockfile

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# [optional] tests & build
ENV NODE_ENV=production
# RUN bun run build

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