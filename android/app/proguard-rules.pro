# Правила для релизной сборки. Всё, что R8 не может увидеть статически, перечислено здесь.

# kotlinx.serialization: сериализаторы находят по именам классов, до них R8 не дотягивается.
-keepattributes *Annotation*, InnerClasses, Signature
-dontnote kotlinx.serialization.**
-keepclassmembers class app.nocturne.** { *** Companion; }
-keepclasseswithmembers class app.nocturne.** { kotlinx.serialization.KSerializer serializer(...); }

# Media3 обращается к сервису и фабрикам через рефлексию.
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# OkHttp тянет необязательные платформенные классы, которых на Android нет.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
