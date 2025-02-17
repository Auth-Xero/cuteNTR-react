package com.adorableNTR;

public class TgaDecodeResult {
    public int[] pixels;
    public int width;
    public int height;

    public TgaDecodeResult(int[] pixels, int width, int height) {
        this.pixels = pixels;
        this.width = width;
        this.height = height;
    }
}
