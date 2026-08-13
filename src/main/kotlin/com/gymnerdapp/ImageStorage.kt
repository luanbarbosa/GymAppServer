package com.gymnerdapp

import io.ktor.http.ContentType
import io.ktor.http.defaultForFile
import java.io.File

data class StoredImage(val bytes: ByteArray, val contentType: ContentType)

interface ImageStorage {
    fun resolve(imageId: String): StoredImage?
}

class LocalImageStorage(baseDir: File) : ImageStorage {
    private val filesByImageId: Map<String, File> =
        baseDir.listFiles { file -> file.isFile }
            ?.associateBy { it.nameWithoutExtension }
            ?: emptyMap()

    override fun resolve(imageId: String): StoredImage? {
        val file = filesByImageId[imageId] ?: return null
        return StoredImage(file.readBytes(), ContentType.defaultForFile(file))
    }
}
