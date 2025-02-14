package com.adorableNTR;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Collections;
import java.util.List;
import java.util.ArrayList;

public class VideoStreamPackage implements ReactPackage {
    // Create a single instance of your view manager.
    private static final JpegVideoViewManager sJpegVideoViewManager = new JpegVideoViewManager();

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        // No native modules for this package.
        return Collections.emptyList();
    }
    
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        // Return a singleton list containing your view manager.
        return Collections.singletonList(sJpegVideoViewManager);
    }
}
