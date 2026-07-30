package com.gymnerdapp

import kotlinx.serialization.Serializable

@Serializable
data class Exercise(
    val id: String,
    val imageId: Int,
    val name: String,
    val namePT: String,
    val type: ExerciseType,
)
