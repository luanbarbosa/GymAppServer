package com.gymnerdapp

import kotlinx.serialization.Serializable

@Serializable
data class Exercise(
    val id: String,
    val imageId: String,
    val name: String,
    val namePT: String,
    val type: ExerciseType,
)
