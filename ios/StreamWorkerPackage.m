#import <React/RCTBridgeModule.h>
#import "StreamWorkerModule.h"

@interface StreamWorkerPackage : NSObject <RCTBridgeModule>
@end

@implementation StreamWorkerPackage

RCT_EXPORT_MODULE();

- (NSArray<id<RCTBridgeModule>> *)createNativeModules
{
  return @[[StreamWorkerModule new]];
}

@end
