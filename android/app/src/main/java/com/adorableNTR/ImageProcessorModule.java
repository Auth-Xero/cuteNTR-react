package com.adorableNTR;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ImageProcessorModule extends ReactContextBaseJavaModule {
    static {
        System.loadLibrary("native-lib");
    }

    private Bitmap reusableBitmap = null;
    private final ByteArrayOutputStream jpegOutputStream = new ByteArrayOutputStream(64 * 1024);
    private static final String TAG = "ImageProcessorModule";

    private static final ExecutorService executor =
            Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());

    public ImageProcessorModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "ImageProcessor";
    }

    public native TgaDecodeResult decodeTgaNative(byte[] tgaData);

    @ReactMethod
    public void decodeTgaFromMemory(final String base64Tga, final Promise promise) {

        executor.submit(new Runnable() {
            @Override
            public void run() {
                try {
                    byte[] tgaData = Base64.decode(base64Tga, Base64.DEFAULT);
                    TgaDecodeResult result = decodeTgaNative(tgaData);
                    if (result == null) {
                        promise.reject("DECODE_ERROR", "Failed to decode TGA image");
                        return;
                    }

                    if (reusableBitmap == null ||
                        reusableBitmap.getWidth() != result.width ||
                        reusableBitmap.getHeight() != result.height) {
                        if (reusableBitmap != null) {
                            reusableBitmap.recycle();
                        }
                        reusableBitmap = Bitmap.createBitmap(result.width, result.height, Bitmap.Config.ARGB_8888);
                    }

                    reusableBitmap.setPixels(result.pixels, 0, result.width, 0, 0, result.width, result.height);
                    jpegOutputStream.reset();
                    reusableBitmap.compress(Bitmap.CompressFormat.JPEG, 60, jpegOutputStream);
                    String base64Jpeg = Base64.encodeToString(jpegOutputStream.toByteArray(), Base64.NO_WRAP);
                    promise.resolve(base64Jpeg);
                } catch (Exception e) {
                    Log.e(TAG, "Error processing TGA", e);
                    promise.reject("TGA_DECODE_ERROR", e);
                }
            }
        });
    }

    @ReactMethod
    public void convertBGRtoRGB(final String base64Image, final Promise promise) {

        executor.submit(new Runnable() {
            @Override
            public void run() {
                try {
                    byte[] jpegData = Base64.decode(base64Image, Base64.DEFAULT);
                    Bitmap bitmap = BitmapFactory.decodeByteArray(jpegData, 0, jpegData.length);
                    if (bitmap == null) {
                        promise.reject("DECODE_ERROR", "Failed to decode JPEG image");
                        return;
                    }
                    int width = bitmap.getWidth();
                    int height = bitmap.getHeight();
                    Bitmap swappedBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                    int[] pixels = new int[width * height];
                    bitmap.getPixels(pixels, 0, width, 0, 0, width, height);

                    int cores = Runtime.getRuntime().availableProcessors();
                    int chunkSize = pixels.length / cores;
                    Thread[] threads = new Thread[cores];
                    for (int i = 0; i < cores; i++) {
                        final int start = i * chunkSize;
                        final int end = (i == cores - 1) ? pixels.length : start + chunkSize;
                        threads[i] = new Thread(new Runnable() {
                            @Override
                            public void run() {
                                for (int j = start; j < end; j++) {
                                    int color = pixels[j];

                                    pixels[j] = (color & 0xFF00FF00)
                                                | ((color & 0x00FF0000) >> 16)
                                                | ((color & 0x000000FF) << 16);
                                }
                            }
                        });
                        threads[i].start();
                    }
                    for (Thread t : threads) {
                        t.join();
                    }

                    swappedBitmap.setPixels(pixels, 0, width, 0, 0, width, height);
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    swappedBitmap.compress(Bitmap.CompressFormat.JPEG, 80, out);
                    String base64Result = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
                    promise.resolve(base64Result);
                } catch (Exception e) {
                    promise.reject("BGR_TO_RGB_ERROR", e);
                }
            }
        });
    }
}