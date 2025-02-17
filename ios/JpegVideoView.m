#import "JpegVideoView.h"

@interface JpegVideoView ()
@property (nonatomic, strong) UIImageView *imageView;
@end

@implementation JpegVideoView

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    _imageView = [[UIImageView alloc] initWithFrame:self.bounds];
    _imageView.contentMode = UIViewContentModeScaleAspectFit;
    _imageView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self addSubview:_imageView];
  }
  return self;
}

- (void)setFrame:(NSString *)frame {
  _frame = [frame copy];
  if (_frame && _frame.length > 0) {
    // Strip the "data:image/jpeg;base64," prefix if present.
    NSString *prefix = @"data:image/jpeg;base64,";
    NSString *base64String = _frame;
    if ([base64String hasPrefix:prefix]) {
      base64String = [base64String substringFromIndex:prefix.length];
    }
    NSData *imageData = [[NSData alloc] initWithBase64EncodedString:base64String options:0];
    UIImage *image = [UIImage imageWithData:imageData];
    dispatch_async(dispatch_get_main_queue(), ^{
      self.imageView.image = image;
    });
  }
}

@end
