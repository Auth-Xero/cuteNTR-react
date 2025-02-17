package com.adorableNTR;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;
import android.util.Base64;
import android.util.Log;

public class JpegVideoViewManager extends SimpleViewManager<JpegVideoView> {
    private static final String TAG = "JpegVideoViewManager";
    public static final String REACT_CLASS = "JpegVideoView";

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    protected JpegVideoView createViewInstance(ThemedReactContext reactContext) {
        Log.d(TAG, "Creating new JpegVideoView instance");
        return new JpegVideoView(reactContext);
    }

    @ReactProp(name = "frame")
    public void setFrame(JpegVideoView view, String base64Frame) {
        Log.d(TAG, "setFrame called with string length: " + (base64Frame != null ? base64Frame.length() : "null"));
        if (base64Frame != null && !base64Frame.isEmpty()) {
            try {
                String dataString = base64Frame;
                String prefix = "data:image/jpeg;base64,";
                if (dataString.startsWith(prefix)) {
                    dataString = dataString.substring(prefix.length());
                    Log.d(TAG, "Stripped prefix, new string length: " + dataString.length());
                }
                byte[] data = Base64.decode(dataString, Base64.DEFAULT);
                view.updateFrame(data);
                Log.d(TAG, "updateFrame called successfully, decoded data length: " + data.length);
            } catch (Exception e) {
                Log.e(TAG, "Error decoding base64 frame", e);
            }
        } else {
            Log.d(TAG, "setFrame called with empty or null string");
        }
    }
}