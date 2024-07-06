#import "ImageProcessor.h"
#import <UIKit/UIKit.h>

@implementation ImageProcessor

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(convertBGRtoRGB:(NSString *)base64Image resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    @try {
      NSData *bgrData = [[NSData alloc] initWithBase64EncodedString:base64Image options:0];
      UIImage *image = [UIImage imageWithData:bgrData];

      if (!image) {
        reject(@"error", @"Failed to decode base64 image", nil);
        return;
      }

      CGImageRef cgImage = image.CGImage;
      NSUInteger width = CGImageGetWidth(cgImage);
      NSUInteger height = CGImageGetHeight(cgImage);
      NSUInteger bytesPerRow = CGImageGetBytesPerRow(cgImage);
      CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();

      unsigned char *rawData = (unsigned char *) calloc(height * width * 4, sizeof(unsigned char));
      NSUInteger bitsPerComponent = 8;
      CGContextRef context = CGBitmapContextCreate(rawData, width, height, bitsPerComponent, bytesPerRow, colorSpace, kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);

      CGContextDrawImage(context, CGRectMake(0, 0, width, height), cgImage);
      CGContextRelease(context);
      CGColorSpaceRelease(colorSpace);

      for (NSUInteger i = 0; i < height * width * 4; i += 4) {
        unsigned char temp = rawData[i]; // Blue
        rawData[i] = rawData[i+2]; // Red
        rawData[i+2] = temp; // Blue
      }

      context = CGBitmapContextCreate(rawData, width, height, bitsPerComponent, bytesPerRow, CGColorSpaceCreateDeviceRGB(), kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
      CGImageRef newCgImage = CGBitmapContextCreateImage(context);
      UIImage *rgbImage = [UIImage imageWithCGImage:newCgImage];

      NSData *rgbData = UIImageJPEGRepresentation(rgbImage, 1.0);
      NSString *base64RgbImage = [rgbData base64EncodedStringWithOptions:0];

      free(rawData);
      CGContextRelease(context);
      CGImageRelease(newCgImage);

      dispatch_async(dispatch_get_main_queue(), ^{
        resolve(base64RgbImage);
      });
    }
    @catch (NSException *exception) {
      reject(@"error", @"Error processing image", nil);
    }
  });
}

@end
