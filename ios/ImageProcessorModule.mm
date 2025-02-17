#import "ImageProcessorModule.h"
#import <React/RCTLog.h>
#import <UIKit/UIKit.h>
#import "TgaDecoder.h"

@implementation ImageProcessorModule

RCT_EXPORT_MODULE(ImageProcessor);

RCT_EXPORT_METHOD(decodeTgaFromMemory:(NSString *)base64Tga
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    @autoreleasepool {
      NSData *tgaData = [[NSData alloc] initWithBase64EncodedString:base64Tga options:0];
      if (!tgaData) {
        reject(@"DECODE_ERROR", @"Invalid base64 TGA data", nil);
        return;
      }
      int width = 0, height = 0;
      UIImage *image = DecodeTgaImage(tgaData, &width, &height);
      if (!image) {
        reject(@"DECODE_ERROR", @"Failed to decode TGA image", nil);
        return;
      }
      NSData *jpegData = UIImageJPEGRepresentation(image, 0.6);
      if (!jpegData) {
        reject(@"JPEG_ERROR", @"Failed to convert image to JPEG", nil);
        return;
      }
      NSString *base64Jpeg = [jpegData base64EncodedStringWithOptions:0];
      resolve(base64Jpeg);
    }
  });
}

RCT_EXPORT_METHOD(convertBGRtoRGB:(NSString *)base64Image
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    @autoreleasepool {
      NSData *jpegData = [[NSData alloc] initWithBase64EncodedString:base64Image options:0];
      UIImage *image = [UIImage imageWithData:jpegData];
      if (!image) {
        reject(@"DECODE_ERROR", @"Failed to decode JPEG image", nil);
        return;
      }
      CGImageRef cgImage = image.CGImage;
      size_t width = CGImageGetWidth(cgImage);
      size_t height = CGImageGetHeight(cgImage);
      size_t bytesPerRow = width * 4;
      uint32_t *pixels = (uint32_t *)calloc(width * height, sizeof(uint32_t));
      if (!pixels) {
        reject(@"MEMORY_ERROR", @"Failed to allocate memory", nil);
        return;
      }
      CGContextRef context = CGBitmapContextCreate(pixels, width, height, 8, bytesPerRow,
                                                   CGImageGetColorSpace(cgImage),
                                                   kCGImageAlphaPremultipliedLast);
      if (!context) {
        free(pixels);
        reject(@"CONTEXT_ERROR", @"Failed to create bitmap context", nil);
        return;
      }
      CGContextDrawImage(context, CGRectMake(0, 0, width, height), cgImage);
      
      // Swap R and B channels.
      for (int i = 0; i < width * height; i++) {
        uint32_t pixel = pixels[i];
        uint8_t r = (pixel >> 16) & 0xFF;
        uint8_t b = pixel & 0xFF;
        // Reassemble pixel with swapped red and blue.
        uint32_t newPixel = (pixel & 0xFF00FF00) | (r) | (b << 16);
        pixels[i] = newPixel;
      }
      
      CGImageRef newCgImage = CGBitmapContextCreateImage(context);
      UIImage *newImage = [UIImage imageWithCGImage:newCgImage scale:image.scale orientation:image.imageOrientation];
      NSData *newJpegData = UIImageJPEGRepresentation(newImage, 0.8);
      NSString *resultBase64 = [newJpegData base64EncodedStringWithOptions:0];
      CGImageRelease(newCgImage);
      CGContextRelease(context);
      free(pixels);
      resolve(resultBase64);
    }
  });
}

@end
