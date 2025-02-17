#ifndef TgaDecoder_h
#define TgaDecoder_h

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

// Decodes TGA image data and returns a UIImage. The width and height are output parameters.
UIImage * DecodeTgaImage(NSData *tgaData, int *width, int *height);

#endif /* TgaDecoder_h */
