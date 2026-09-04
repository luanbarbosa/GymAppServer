package com.gymnerdapp

import kotlinx.serialization.Serializable

@Serializable
data class ExerciseResponse(
    val id: String,
    val imageUrl: String,
    // Legacy old-app numeric id, kept on the wire as a one-time migration join key for
    // GymNerdApp's old-app import (see GymNerdApp specs/docs/data-migration.md). Unrelated to
    // imageFileId, which is the current image storage's file reference.
    val imageId: Int?,
    val name: String,
    val namePT: String,
    val searchAlias: List<String>,
    val searchAliasPT: List<String>,
    val type: ExerciseType,
    val trackedMetrics: List<TrackedMetric>,
)

fun Exercise.toResponse(imageUrl: String): ExerciseResponse = ExerciseResponse(
    id = id,
    imageUrl = imageUrl,
    imageId = legacyImageId,
    name = name,
    namePT = namePT,
    searchAlias = searchAlias,
    searchAliasPT = searchAliasPT,
    type = type,
    trackedMetrics = trackedMetrics,
)
