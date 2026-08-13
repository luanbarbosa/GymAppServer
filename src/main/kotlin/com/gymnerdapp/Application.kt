package com.gymnerdapp

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.*
import io.ktor.server.netty.EngineMain
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.request.header
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.Json
import java.io.File
import java.security.MessageDigest

fun main(args: Array<String>) {
    EngineMain.main(args)
}

private fun sha256Hex(input: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
    return digest.joinToString("") { "%02x".format(it) }
}

fun Application.module() {
    val exercisesJson = File("data/exercises.json").readText()
    val exercises = Json.decodeFromString<List<Exercise>>(exercisesJson)
    val exerciseResponses = exercises.map { it.toResponse() }
    val catalogEtag = "\"" + sha256Hex(exercisesJson) + "\""
    val imageStorage: ImageStorage = LocalImageStorage(File("data/images"))

    install(ContentNegotiation) {
        json()
    }

    routing {
        get("/") {
            call.respondText("GymNerdAppServer running")
        }
        get("/catalogExercise") {
            call.response.header(HttpHeaders.ETag, catalogEtag)
            if (call.request.header(HttpHeaders.IfNoneMatch) == catalogEtag) {
                call.respond(HttpStatusCode.NotModified)
                return@get
            }
            call.respond(exerciseResponses)
        }
        get("/images/{imageId}") {
            val imageId = call.parameters["imageId"]
            val image = imageId?.let { imageStorage.resolve(it) }
            if (image == null) {
                call.respond(HttpStatusCode.NotFound)
                return@get
            }
            call.respondBytes(image.bytes, image.contentType)
        }
    }
}
