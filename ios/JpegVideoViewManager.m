#import "JpegVideoViewManager.h"
#import "JpegVideoView.h"

@implementation JpegVideoViewManager

RCT_EXPORT_MODULE(JpegVideoView);

- (UIView *)view {
  return [[JpegVideoView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(frame, NSString);

@end
