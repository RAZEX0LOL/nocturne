package app.nocturne.music

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import app.nocturne.core.Credentials
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.json.*

class CredentialVault(context: Context) {
    private val file = AtomicFile(File(context.noBackupFilesDir, "navidrome.bin"))
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("nocturne.navidrome", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("nocturne.navidrome", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun save(credentials: Credentials) {
        val data = buildJsonObject {
            put("server", credentials.server.toString()); put("username", credentials.username); put("password", credentials.password)
        }.toString().toByteArray(Charsets.UTF_8)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.iv + cipher.doFinal(data)
        val output = file.startWrite()
        try { output.write(encrypted); file.finishWrite(output) }
        catch (error: Exception) { file.failWrite(output); throw error }
    }
    fun load(): Credentials? {
        if (!file.baseFile.exists()) return null
        val data = file.readFully()
        require(data.size in 29..65536)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data.copyOfRange(0, 12)))
        }
        val json = Json.parseToJsonElement(cipher.doFinal(data.copyOfRange(12, data.size)).toString(Charsets.UTF_8)).jsonObject
        return Credentials(json.getValue("server").jsonPrimitive.content, json.getValue("username").jsonPrimitive.content, json.getValue("password").jsonPrimitive.content)
    }
    fun clear() = file.delete()
}
