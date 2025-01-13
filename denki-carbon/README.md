# Elysia with Bun runtime

## Getting Started

- Install bun at https://bun.sh/
- Set up a postgres database locally
- Then run the following:

```bash
bun install

bun migrate
```

Note: you might have to append `BUN_CONFIG_REGISTRY="https://registry.npmjs.org"` before your install commands.

## Development

To seed the database, train models and make your first Carbon Intensity prediction for all TSOs, run:

```bash
bun setup
```

To start the API development server locally run:

```bash
bun dev
```

Open http://localhost:3000/docs with your browser to see the docs

To run it in a docker container use

```bash
bun up
# or
bun up:debug
```
