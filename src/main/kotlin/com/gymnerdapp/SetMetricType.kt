package com.gymnerdapp

import kotlinx.serialization.Serializable

@Serializable
enum class SetMetricType {
    WEIGHT,
    DURATION,
    REPS,
    DISTANCE,
}
