// StreamWorkerModule.m
#import "StreamWorkerModule.h"
#import <React/RCTLog.h>
#import <React/RCTConvert.h>

@implementation StreamWorkerModule

RCT_EXPORT_MODULE();

static NSString *const EVENT_NAME = @"EventReminder";

- (NSArray<NSString *> *)supportedEvents {
  return @[EVENT_NAME];
}

RCT_EXPORT_METHOD(processPackets:(NSString *)base64Packets resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  @try {
    NSData *decodedData = [[NSData alloc] initWithBase64EncodedString:base64Packets options:0];
    if (!decodedData) {
      reject(@"Processing Error", @"Failed to decode base64 packets", nil);
      return;
    }

    NSMutableData *jpegData = [NSMutableData data];
    BOOL isTop = NO;

    // Process the decoded data similar to the Android version
    NSUInteger length = [decodedData length];
    uint8_t *bytes = (uint8_t *)[decodedData bytes];
    for (NSUInteger offset = 0; offset < length; offset += 1448) {
      NSUInteger packetLength = MIN(1448, length - offset);
      uint8_t *packetData = &bytes[offset];

      // Determine isTop from the first packet
      if (offset == 0) {
        int screenId = packetData[1] & 0x0F;
        isTop = (screenId == 1);
      }

      // Skip the first 4 bytes (header) and append the rest to jpegData
      [jpegData appendBytes:(packetData + 4) length:(packetLength - 4)];
    }

    if ([jpegData length] == 0) {
      reject(@"Processing Error", @"No valid JPEG data found", nil);
      return;
    }

    // Convert jpegData to base64
    NSString *jpegBase64 = [jpegData base64EncodedStringWithOptions:0];

    resolve(@{@"jpeg": jpegBase64, @"isTop": @(isTop)});
  } @catch (NSException *exception) {
    reject(@"Processing Error", @"Failed to process packets", [NSError errorWithDomain:@"StreamWorkerModule" code:100 userInfo:@{NSLocalizedDescriptionKey: exception.reason}]);
  }
}

@end
