# 🔌 Denki Carbon 🔌

Calculating the current Carbon Intensity of the Japanese Electrical Grid.
This is a fully open project aiming to make it easier to access and use the public information grid operators are already providing, we aim to mirror the simplicity and usefulness of the UK project [carbonintensity.org.uk](https://carbonintensity.org.uk/)

The project includes:

- A Scraper, to get data from the Japanese electrical operators, both live and historic.
- A Machine Learning process to create models which make predictions about the future carbon intensity.
- An API to present the data.
- A Frontend to visually display the data.

## Links

- Website [denkicarbon.jp](https://api.denkicarbon.jp/docs)
- API Documentation [api.denkicarbon.jp/docs](https://api.denkicarbon.jp/docs)

## Main Technology Used

- [Bun](https://bun.sh/) for the runtime
- [Postgres](https://www.postgresql.org/) for the Database
- [Drizzle](https://orm.drizzle.team/) for the ORM
- [Elysia](https://elysiajs.com/) for the API
- [TensorflowJS](https://www.tensorflow.org/js) for the machine learning and prediction systems
  - _Note: Getting TensorflowJS to work in the Bun runtime may require using npm to help sort out depenancy issues. Try `npm rebuild @tensorflow/tfjs-node --build-addon-from-source` if you see errors during runtime_
- [React](https://react.dev/) for the frontend website

## Quickstart

Bun is used for the runtime, so please install it here: https://bun.sh/

First off, ensure that you've created .env files in each repo and populated them with the right values.
Use the `...example` files as a template.

#### Database and Seeding the data

You need to set up a Postgres Database and create a user (https://www.postgresql.org/download/)

```bash
cd denki-carbon
bun install
bun migrate

# Scrape all data and make a prediction for all TSOs
bun seed
```

#### Running the API

```bash
cd denki-carbon
bun install
bun dev

# Or, in production
bun start
```

#### Creating new Models

_You must have already seeded data to the database for this to work..._

```bash
cd denki-carbon
bun install
bun train
```

New models will be written to the `/temp` folder.
If you want to propose a model for use in the main app, move the whole folder into the `/src/forecast/models` folder and remove the old folder for that utility.

#### Docker

First ensure you have docker and docker-compose installed, then:

```bash
cd denki-carbon
bun install
bun up
```

## Deployment

Currently I self host everything at [denkicarbon.jp](https://denkicarbon.jp/) using:

- A [Hetzner](https://www.hetzner.com/) instance for the server itself
  - I'm able to run everything in this repo and more with their most basic offering
- [Coolify](https://coolify.io/) to manage the CICD and Docker containers

Some external services I use are:

- [Cloudflare](https://www.cloudflare.com/) for DNS wrangling and some other nice features
- [Grafana Cloud](https://grafana.com/products/cloud/) I could probably self host this, but the free tier was good enough

## How to Contribute

- Create an Issue to Explain your Problem, Feature or pick up an existing one, do leave a comment and feel free to ask questions 😁
- Fork the Project
- Clone Locally and Install Dependancies
- Ensure you can run the API/Frontend etc. locally
- Make and commit your changes
- Open a PR to the master branch of this repo with a detailed explanation of your work (inc. screenshots)
- Guidelines in [CONTRIBUTING.md](CONTRIBUTING.md)
