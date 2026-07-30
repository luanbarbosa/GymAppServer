package com.gymnerdapp

import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.*
import io.ktor.server.netty.EngineMain
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.Json
import java.io.File

fun main(args: Array<String>) {
    EngineMain.main(args)
}

fun Application.module() {
    val exercises = Json.decodeFromString<List<Exercise>>(
        File("data/exercises.json").readText()
    )

    install(ContentNegotiation) {
        json()
    }

    routing {
        get("/") {
            call.respondText("GymNerdAppServer running")
        }
        get("/catalogExercise") {
            call.respond(exercises)
        }
    }
}
