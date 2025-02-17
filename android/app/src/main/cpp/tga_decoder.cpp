#include <jni.h>
#include <vector>
#include <cstdint>
#include <stdexcept>
#include <android/log.h>
#include <algorithm> 

#define LOG_TAG "TgaDecoderNative"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static inline uint16_t readLE16(const unsigned char*& p, const unsigned char* end) {
    if (p + 2 > end)
        throw std::runtime_error("Unexpected end of data while reading uint16");
    uint16_t value = static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8);
    p += 2;
    return value;
}

static inline uint32_t readPixel(const unsigned char*& p, const unsigned char* end, int pixelDepth) {
    switch(pixelDepth) {
        case 32: {
            if (p + 4 > end) throw std::runtime_error("Not enough data for 32-bit pixel");
            uint32_t a = p[3], r = p[2], g = p[1], b = p[0];
            p += 4;
            return (a << 24) | (r << 16) | (g << 8) | b;
        }
        case 24: {
            if (p + 3 > end) throw std::runtime_error("Not enough data for 24-bit pixel");
            uint32_t r = p[2], g = p[1], b = p[0];
            p += 3;
            return (0xFF << 24) | (r << 16) | (g << 8) | b;
        }
        case 16: {
            if (p + 2 > end) throw std::runtime_error("Not enough data for 16-bit pixel");
            uint16_t value = static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8);
            p += 2;
            uint8_t b = ((value) & 0x1F) * 255 / 31;
            uint8_t g = ((value >> 5) & 0x1F) * 255 / 31;
            uint8_t r = ((value >> 10) & 0x1F) * 255 / 31;
            uint8_t a = (value & 0x8000) ? 255 : 0;
            return (a << 24) | (r << 16) | (g << 8) | b;
        }
        case 17: {
            if (p + 2 > end) throw std::runtime_error("Not enough data for 17-bit pixel");
            uint16_t value = static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8);
            p += 2;
            uint8_t b = ((value) & 0x1F) << 3;
            uint8_t g = ((value >> 5) & 0x3F) << 2;
            uint8_t r = ((value >> 11) & 0x1F) << 3;
            return (0xFF << 24) | (r << 16) | (g << 8) | b;
        }
        case 18: {
            if (p + 2 > end) throw std::runtime_error("Not enough data for 18-bit pixel");
            uint16_t value = static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8);
            p += 2;
            uint8_t b = ((value) & 0xF) << 4;
            uint8_t g = ((value >> 4) & 0xF) << 4;
            uint8_t r = ((value >> 8) & 0xF) << 4;
            uint8_t a = ((value >> 12) & 0xF) << 4;
            return (a << 24) | (r << 16) | (g << 8) | b;
        }
        default:
            throw std::runtime_error("Unsupported pixel depth");
    }
}

static inline void flipVertically(std::vector<uint32_t>& pixels, int width, int height) {
    for (int y = 0; y < height / 2; y++) {
        std::swap_ranges(pixels.begin() + y * width,
                         pixels.begin() + (y + 1) * width,
                         pixels.begin() + (height - y - 1) * width);
    }
}

bool decodeTgaImage(const unsigned char* data, size_t dataSize,
                    std::vector<uint32_t>& pixels, int& width, int& height) {
    if (dataSize < 18) {
        LOGE("TGA decode error: data is too short");
        return false;
    }
    const unsigned char* p = data;
    const unsigned char* end = data + dataSize;

    uint8_t imageIdLength = *p++;
    uint8_t colorMapType  = *p++;
    uint8_t imageType     = *p++;

    if (colorMapType != 0 && colorMapType != 1) {
        LOGE("TGA decode error: invalid color map type");
        return false;
    }
    if (imageType == 0) {
        LOGE("TGA decode error: no image data");
        return false;
    }
    bool isValidImageType = (imageType == 1 || imageType == 2 || imageType == 3 ||
                             imageType == 9 || imageType == 10 || imageType == 11);
    if (!isValidImageType) {
        LOGE("TGA decode error: unsupported image type");
        return false;
    }
    bool isColormapped = (imageType == 1 || imageType == 9);
    if (isColormapped && colorMapType == 0) {
        LOGE("TGA decode error: color-mapped image without color map");
        return false;
    }
    if (!isColormapped && colorMapType == 1) {
        LOGE("TGA decode error: non-color-mapped image with extraneous color map");
        return false;
    }

    uint16_t colorMapOrigin = readLE16(p, end);
    uint16_t colorMapLength = readLE16(p, end);
    uint8_t colorMapDepth   = *p++;

    uint16_t xOrigin = readLE16(p, end);
    uint16_t yOrigin = readLE16(p, end);
    width  = readLE16(p, end);
    height = readLE16(p, end);
    uint8_t pixelDepth      = *p++;
    uint8_t imageDescriptor = *p++;

    if (width == 0 || height == 0) {
        LOGE("TGA decode error: zero dimensions");
        return false;
    }

    p += imageIdLength;
    if (p > end) {
        LOGE("TGA decode error: invalid image ID length");
        return false;
    }

    if (colorMapType == 1) {
        int colorMapEntrySize = colorMapDepth / 8;
        size_t colorMapSize = (colorMapOrigin + colorMapLength) * colorMapEntrySize;
        p += colorMapSize;
        if (p > end) {
            LOGE("TGA decode error: invalid color map size");
            return false;
        }
    }

    int pixelCount = width * height;
    pixels.resize(pixelCount);
    int index = 0;
    bool isRle = (imageType == 9 || imageType == 10 || imageType == 11);

    try {
        if (isRle) {
            while (index < pixelCount && p < end) {
                uint8_t packetHeader = *p++;
                int count = (packetHeader & 0x7F) + 1;
                if (packetHeader & 0x80) {

                    uint32_t color = readPixel(p, end, pixelDepth);
                    std::fill_n(pixels.begin() + index, count, color);
                    index += count;
                } else {

                    for (int j = 0; j < count && index < pixelCount; j++) {
                        pixels[index++] = readPixel(p, end, pixelDepth);
                    }
                }
            }
        } else {
            for (int i = 0; i < pixelCount; i++) {
                pixels[i] = readPixel(p, end, pixelDepth);
            }
        }
    } catch (const std::runtime_error& e) {
        LOGE("TGA decode exception: %s", e.what());
        return false;
    }

    if (!(imageDescriptor & 0x20))
        flipVertically(pixels, width, height);

    return true;
}

extern "C"
JNIEXPORT jobject JNICALL
Java_com_adorableNTR_ImageProcessorModule_decodeTgaNative(JNIEnv *env, jobject , jbyteArray tgaData) {
    jsize dataSize = env->GetArrayLength(tgaData);

    const jbyte* rawData = reinterpret_cast<const jbyte*>(env->GetPrimitiveArrayCritical(tgaData, nullptr));
    std::vector<uint32_t> pixels;
    int width = 0, height = 0;
    bool success = decodeTgaImage(reinterpret_cast<const unsigned char*>(rawData),
                                  static_cast<size_t>(dataSize),
                                  pixels, width, height);
    env->ReleasePrimitiveArrayCritical(tgaData, const_cast<jbyte*>(rawData),0);

    if (!success) {
        return nullptr;
    }

    jintArray pixelArray = env->NewIntArray(width * height);
    env->SetIntArrayRegion(pixelArray, 0, width * height, reinterpret_cast<jint*>(pixels.data()));

    jclass resultClass = env->FindClass("com/adorableNTR/TgaDecodeResult");
    if (!resultClass) {
        LOGE("Failed to find TgaDecodeResult class");
        return nullptr;
    }
    jmethodID constructor = env->GetMethodID(resultClass, "<init>", "([III)V");
    if (!constructor) {
        LOGE("Failed to find TgaDecodeResult constructor");
        return nullptr;
    }
    jobject resultObject = env->NewObject(resultClass, constructor, pixelArray, width, height);
    return resultObject;
}
