package com.gymnerdapp

import kotlinx.serialization.Serializable

@Serializable
data class Exercise(
    val id: String,
    val imageFileId: String,
    val legacyImageId: Int?,
    val name: String,
    val namePT: String,
    val searchAlias: List<String>,
    val searchAliasPT: List<String>,
    val type: ExerciseType,
    val trackedMetrics: List<TrackedMetric>,
)
