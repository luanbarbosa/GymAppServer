package com.gymnerdapp

import kotlinx.serialization.Serializable

@Serializable
data class TrackedMetric(
    val type: SetMetricType,
    val default: Boolean,
)
