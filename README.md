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

## Quickstart

- Bun is used for the runtime, so please install it here: https://bun.sh/

#### Database and Seeding the data

You need to set up a Postgres Database and create a user (https://www.postgresql.org/download/)

```bash
cd denki-carbon
bun install
bun migrate
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

New models will appear in the `/temp` folder

#### Docker

First ensure you have docker and docker-compose installed, then:

```bash
cd denki-carbon
bun install
bun up
```

## How to Contribute

- Create an Issue to Explain your Problem, Feature or pick up an existing one, do leave a comment and feel free to ask questions 😁
- Fork the Project
- Clone Locally and Install Dependancies
- Ensure you can run the API/Frontend etc. locally
- Make and commit your changes
- Open a PR to the master branch of this repo with a detailed explanation of your work (inc. screenshots)
- Guidelines in [CONTRIBUTING.md](CONTRIBUTING.md)
