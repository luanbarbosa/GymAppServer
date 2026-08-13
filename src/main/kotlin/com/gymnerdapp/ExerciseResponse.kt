package com.gymnerdapp

import kotlinx.serialization.Serializable

@Serializable
data class ExerciseResponse(
    val id: String,
    val imageUrl: String,
    val name: String,
    val namePT: String,
    val type: ExerciseType,
)

fun Exercise.toResponse(): ExerciseResponse = ExerciseResponse(
    id = id,
    imageUrl = "/images/$imageId",
    name = name,
    namePT = namePT,
    type = type,
)
