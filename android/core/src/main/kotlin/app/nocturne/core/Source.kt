package app.nocturne.core

/** Откуда играть трек — правило из shared/spec/offline.md, проверяется shared/cases/source.json. */

enum class SourceKind { local, download, stream, unavailable }

data class Availability(
    val local: Set<String> = emptySet(),
    val downloaded: Set<String> = emptySet(),
    val online: Boolean = true,
)

const val LOCAL_ID_PREFIX = "local:"

fun isLocalId(id: String) = id.startsWith(LOCAL_ID_PREFIX)

fun chooseSource(id: String, availability: Availability): SourceKind = when {
    isLocalId(id) -> if (id in availability.local) SourceKind.local else SourceKind.unavailable
    id in availability.downloaded -> SourceKind.download
    availability.online -> SourceKind.stream
    else -> SourceKind.unavailable
}
