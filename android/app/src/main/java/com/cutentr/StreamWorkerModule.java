package com.cutentr;

import com.facebook.react.bridge.*;
import android.util.Base64;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class StreamWorkerModule extends ReactContextBaseJavaModule {
    static {
        System.loadLibrary("native-lib");
    }

    private native Result processPackets(ByteBuffer[] packets);

    public static class Result {
        public final byte[] jpegData;
        public final boolean isTop;

        public Result(byte[] jpegData, boolean isTop) {
            this.jpegData = jpegData;
            this.isTop = isTop;
        }
    }

    StreamWorkerModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "StreamWorkerModule";
    }

    @ReactMethod
    public void processPackets(String base64Packets, Promise promise) {
        try {
            byte[] decodedBytes = Base64.decode(base64Packets, Base64.DEFAULT);
            List<ByteBuffer> packets = new ArrayList<>();
            
            int offset = 0;
            while (offset < decodedBytes.length) {
                int packetLength = Math.min(1448, decodedBytes.length - offset);
                ByteBuffer packetBuffer = ByteBuffer.allocateDirect(packetLength);
                packetBuffer.put(decodedBytes, offset, packetLength);
                packetBuffer.flip();
                packets.add(packetBuffer);
                offset += packetLength;
            }

            // Sort packets by packet number within each frame
            Collections.sort(packets, new Comparator<ByteBuffer>() {
                @Override
                public int compare(ByteBuffer a, ByteBuffer b) {
                    int aPacketNumber = a.get(3) & 0xFF;
                    int bPacketNumber = b.get(3) & 0xFF;
                    return Integer.compare(aPacketNumber, bPacketNumber);
                }
            });

            ByteBuffer[] packetsArray = packets.toArray(new ByteBuffer[0]);
            Result result = processPackets(packetsArray);
            if (result != null) {
                String base64Result = Base64.encodeToString(result.jpegData, Base64.NO_WRAP);
                WritableMap map = Arguments.createMap();
                map.putString("jpeg", base64Result);
                map.putBoolean("isTop", result.isTop);
                promise.resolve(map);
            } else {
                promise.reject("Processing Error", "Failed to process packets");
            }
        } catch (Exception e) {
            promise.reject("Processing Error", e);
        }
    }
}
