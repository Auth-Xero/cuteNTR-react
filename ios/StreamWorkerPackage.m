// StreamWorkerPackage.m
#import "StreamWorkerPackage.h"
#import "StreamWorkerModule.h"

@implementation StreamWorkerPackage

RCT_EXPORT_MODULE();

- (NSArray<id<RCTBridgeModule>> *)createNativeModules {
  return @[ [[StreamWorkerModule alloc] init] ];
}

@end

