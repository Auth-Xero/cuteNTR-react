package com.adorableNTR;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import java.io.ByteArrayOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ImageProcessorModule extends ReactContextBaseJavaModule {
    private final ExecutorService executorService = Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());

    public ImageProcessorModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "ImageProcessor";
    }

    @ReactMethod
    public void convertBGRtoRGB(String base64Image, Promise promise) {
        executorService.submit(() -> {
            try {
                byte[] bgrImage = Base64.decode(base64Image, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bgrImage, 0, bgrImage.length);

                int width = bitmap.getWidth();
                int height = bitmap.getHeight();
                Bitmap rgbBitmap = Bitmap.createBitmap(width, height, bitmap.getConfig());

                int[] pixels = new int[width * height];
                bitmap.getPixels(pixels, 0, width, 0, 0, width, height);

                int numThreads = Runtime.getRuntime().availableProcessors();
                Thread[] threads = new Thread[numThreads];

                for (int t = 0; t < numThreads; t++) {
                    final int threadId = t;
                    threads[t] = new Thread(() -> {
                        int start = threadId * pixels.length / numThreads;
                        int end = (threadId + 1) * pixels.length / numThreads;
                        for (int i = start; i < end; i++) {
                            int color = pixels[i];
                            int red = (color >> 16) & 0xFF;
                            int green = (color >> 8) & 0xFF;
                            int blue = color & 0xFF;
                            int alpha = (color >> 24) & 0xFF;

                            pixels[i] = (alpha << 24) | (blue << 16) | (green << 8) | red;
                        }
                    });
                    threads[t].start();
                }

                for (Thread thread : threads) {
                    thread.join();
                }

                rgbBitmap.setPixels(pixels, 0, width, 0, 0, width, height);

                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                rgbBitmap.compress(Bitmap.CompressFormat.JPEG, 100, outputStream);
                byte[] rgbImage = outputStream.toByteArray();
                String base64RgbImage = Base64.encodeToString(rgbImage, Base64.DEFAULT);

                promise.resolve(base64RgbImage);
            } catch (Exception e) {
                promise.reject("Error processing image", e);
            }
        });
    }
}