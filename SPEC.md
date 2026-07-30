# GymNerdAppServer — Backend Spec

## Overview

Backend server for **GymNerdApp** (Android/KMP mobile companion). Runs locally on
`localhost` for now — no remote deployment target yet. Kotlin used as much as
possible across the stack (server code, build config).

## Tech stack

- **Language:** Kotlin
- **Framework:** [Ktor](https://ktor.io) (server-core, server-netty, content-negotiation, kotlinx.serialization for JSON)
- **Build tool:** Gradle (Kotlin DSL — `build.gradle.kts`)
- **JDK target:** 21 (LTS), via Gradle toolchain (auto-provisioned through the
  `foojay-resolver-convention` plugin if not present locally)

## Running locally

```bash
./gradlew run
```

Server starts at `http://localhost:8080`.

## Current endpoints

| Method | Path              | Response |
|--------|-------------------|----------|
| GET    | `/`                | Plain text: `GymNerdAppServer running` |
| GET    | `/catalogExercise` | JSON array of exercises, read from `data/exercises.json` (`id`, `imageId`, `name`, `namePT`, `type`) |

## Persistence

None yet. To be decided when the app needs to store data. Candidates considered:

- **SQLite** — simple embedded file DB, fits a local-only backend, no separate DB server to run.
- **Postgres** — full DB server, more setup, but scales toward a real deployment later.

## Status / next steps

- [ ] Decide persistence layer
- [ ] Add first real domain endpoints (exercises, workouts, etc. — see `data/` for existing seed data)
- [ ] Decide on request/response DTOs and serialization conventions
- [ ] Decide on auth (if/when needed)
- [ ] Decide on deployment target beyond localhost (if/when needed)
