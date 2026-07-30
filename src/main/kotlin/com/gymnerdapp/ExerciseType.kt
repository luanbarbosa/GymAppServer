package com.gymnerdapp

import kotlinx.serialization.Serializable

@Serializable
enum class ExerciseType {
    CHEST,
    BACK,
    LEGS,
    SHOULDERS,
    ARMS,
    CORE,
    CARDIO,
    MOBILITY,
    STRETCHING,
    FULL_BODY,
    OTHER,
}
