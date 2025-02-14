package com.adorableNTR;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.util.AttributeSet;
import android.util.Log;
import android.view.SurfaceHolder;
import android.view.SurfaceView;

public class JpegVideoView extends SurfaceView implements SurfaceHolder.Callback {
    private static final String TAG = "JpegVideoView";
    private Bitmap currentFrame;
    private DrawThread drawThread;

    public JpegVideoView(Context context) {
        super(context);
        init();
    }

    public JpegVideoView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    public JpegVideoView(Context context, AttributeSet attrs, int defStyle) {
        super(context, attrs, defStyle);
        init();
    }

    private void init() {
        Log.d(TAG, "Initializing JpegVideoView");
        getHolder().addCallback(this);
    }

    /**
     * Updates the current frame to display.
     *
     * @param jpegData A byte array containing JPEG data.
     */
    public void updateFrame(byte[] jpegData) {
        Log.d(TAG, "updateFrame called with data length: " + (jpegData != null ? jpegData.length : "null"));
        Bitmap bmp = BitmapFactory.decodeByteArray(jpegData, 0, jpegData.length);
        if (bmp == null) {
            Log.e(TAG, "Failed to decode JPEG data");
            return;
        }
        synchronized (this) {
            if (currentFrame != null && !currentFrame.isRecycled()) {
                currentFrame.recycle();
            }
            currentFrame = bmp;
        }
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        Log.d(TAG, "Surface created");
        drawThread = new DrawThread(holder);
        drawThread.setRunning(true);
        drawThread.start();
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        Log.d(TAG, "Surface destroyed, stopping draw thread");
        if (drawThread != null) {
            drawThread.setRunning(false);
            // Try to join the thread with a timeout to avoid hanging
            boolean retry = true;
            while (retry) {
                try {
                    drawThread.join(500);
                    if (drawThread.isAlive()) {
                        Log.e(TAG, "DrawThread still alive after join timeout, forcing exit");
                    }
                    retry = false;
                } catch (InterruptedException e) {
                    Log.e(TAG, "Interrupted while stopping draw thread", e);
                    // Restore the interrupted status
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        Log.d(TAG, "Surface changed: width=" + width + ", height=" + height);
    }

    /**
     * The drawing thread continuously redraws the latest frame.
     */
    private class DrawThread extends Thread {
        private final SurfaceHolder surfaceHolder;
        private volatile boolean running = false; // volatile for proper cross-thread visibility
        // Log the number of frames drawn periodically.
        private int frameCounter = 0;

        public DrawThread(SurfaceHolder holder) {
            this.surfaceHolder = holder;
        }

        public void setRunning(boolean run) {
            running = run;
        }

        @Override
        public void run() {
            Log.d(TAG, "DrawThread started");
            try {
                while (running) {
                    Canvas canvas = null;
                    try {
                        canvas = surfaceHolder.lockCanvas();
                        if (canvas != null) {
                            synchronized (JpegVideoView.this) {
                                if (currentFrame != null) {
                                    // Save the canvas state before transforming.
                                    canvas.save();

                                    // Rotate the canvas 270 degrees.
                                    canvas.rotate(270);

                                    // After a 270° rotation, the canvas' width and height swap.
                                    // Translate the canvas to ensure the rotated bitmap appears within the view bounds.
                                    canvas.translate(-canvas.getHeight(), 0);

                                    // Define the destination rectangle.
                                    // After rotation, the destination rectangle uses canvas.getHeight() as the new width
                                    // and canvas.getWidth() as the new height.
                                    Rect destRect = new Rect(0, 0, canvas.getHeight(), canvas.getWidth());
                                    canvas.drawBitmap(currentFrame, null, destRect, null);

                                    // Restore the canvas to its original state.
                                    canvas.restore();
                                } else {
                                    canvas.drawColor(0xFF000000);
                                }
                            }
                        }
                    } catch (Throwable t) {
                        Log.e(TAG, "Error drawing frame", t);
                    } finally {
                        if (canvas != null) {
                            try {
                                surfaceHolder.unlockCanvasAndPost(canvas);
                            } catch (Exception e) {
                                Log.e(TAG, "Error unlocking canvas", e);
                            }
                        }
                    }
                    frameCounter++;
                    if (frameCounter % 60 == 0) { // Log every 60 frames (~once per second)
                        Log.d(TAG, "DrawThread: drawn " + frameCounter + " frames so far");
                    }
                    try {
                        Thread.sleep(8); // Aim for roughly 60fps.
                    } catch (InterruptedException e) {
                        Log.e(TAG, "DrawThread sleep interrupted", e);
                        Thread.currentThread().interrupt(); // Restore interrupted status
                        break;
                    }
                }
            } catch (Throwable t) {
                Log.e(TAG, "Uncaught throwable in DrawThread", t);
            } finally {
                Log.d(TAG, "DrawThread exiting");
            }
        }
    }
}
