#import "StreamWorkerModule.h"
#import <React/RCTLog.h>
#import <React/RCTConvert.h>

@implementation StreamWorkerModule

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(processPackets:(NSString *)base64Packets resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    NSData *decodedData = [[NSData alloc] initWithBase64EncodedString:base64Packets options:0];
    NSUInteger packetLength = 1448; // Adjust packet size if needed
    NSMutableArray<NSData *> *packets = [NSMutableArray array];

    for (NSUInteger offset = 0; offset < decodedData.length; offset += packetLength) {
      NSUInteger length = MIN(packetLength, decodedData.length - offset);
      NSData *packet = [decodedData subdataWithRange:NSMakeRange(offset, length)];
      [packets addObject:packet];
    }

    // Process packets (this is a placeholder for your actual processing logic)
    NSDictionary *result = [self processPacketsWithNativeModule:packets];
    if (result) {
      resolve(result);
    } else {
      reject(@"Processing Error", @"Failed to process packets", nil);
    }
  } @catch (NSException *exception) {
    reject(@"Processing Error", exception.reason, nil);
  }
}

- (NSDictionary *)processPacketsWithNativeModule:(NSArray<NSData *> *)packets {
  NSMutableData *jpegData = [NSMutableData data];
  BOOL isTop = NO;

  for (NSData *packet in packets) {
    // Skip the first 4 bytes (header) and append the rest to jpegData
    if (packet.length > 4) {
      [jpegData appendData:[packet subdataWithRange:NSMakeRange(4, packet.length - 4)]];
    }
  }

  if (jpegData.length > 0) {
    NSString *jpegBase64 = [jpegData base64EncodedStringWithOptions:0];
    return @{@"jpeg": jpegBase64, @"isTop": @(isTop)};
  }
  
  return nil;
}

@end
