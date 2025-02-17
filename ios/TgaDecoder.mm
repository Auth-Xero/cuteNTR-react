#import "TgaDecoder.h"
#include <vector>
#include <cstdint>
#include <stdexcept>
#include <algorithm>

static inline uint16_t readLE16(const unsigned char *&p, const unsigned char *end) {
    if (p + 2 > end)
        throw std::runtime_error("Unexpected end of data while reading uint16");
    uint16_t value = static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8);
    p += 2;
    return value;
}

static inline uint32_t readPixel(const unsigned char *&p, const unsigned char *end, int pixelDepth) {
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
        return false;
    }
    const unsigned char* p = data;
    const unsigned char* end = data + dataSize;

    uint8_t imageIdLength = *p++;
    uint8_t colorMapType  = *p++;
    uint8_t imageType     = *p++;

    if (colorMapType != 0 && colorMapType != 1) {
        return false;
    }
    if (imageType == 0) {
        return false;
    }
    bool isColormapped = (imageType == 1 || imageType == 9);

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
        return false;
    }

    p += imageIdLength;
    if (p > end) {
        return false;
    }

    if (colorMapType == 1) {
        int colorMapEntrySize = colorMapDepth / 8;
        size_t colorMapSize = (colorMapOrigin + colorMapLength) * colorMapEntrySize;
        p += colorMapSize;
        if (p > end) {
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
        return false;
    }

    if (!(imageDescriptor & 0x20))
        flipVertically(pixels, width, height);

    return true;
}

UIImage * DecodeTgaImage(NSData *tgaData, int *width, int *height) {
    const unsigned char *data = (const unsigned char *)[tgaData bytes];
    size_t dataSize = [tgaData length];
    std::vector<uint32_t> pixels;
    int w = 0, h = 0;
    bool success = decodeTgaImage(data, dataSize, pixels, w, h);
    if (!success) {
        return nil;
    }
    if (width) *width = w;
    if (height) *height = h;
    
    // Create a CGImage from the pixel data.
    CGDataProviderRef provider = CGDataProviderCreateWithData(NULL, pixels.data(), w * h * sizeof(uint32_t), NULL);
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGImageRef imageRef = CGImageCreate(w, h, 8, 32, w * sizeof(uint32_t), colorSpace,
                                         kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst,
                                         provider, NULL, false, kCGRenderingIntentDefault);
    UIImage *image = [UIImage imageWithCGImage:imageRef];
    CGImageRelease(imageRef);
    CGColorSpaceRelease(colorSpace);
    CGDataProviderRelease(provider);
    return image;
}
