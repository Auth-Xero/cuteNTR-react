package com.adorableNTR;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Collections;
import java.util.List;
import java.util.ArrayList;

public class VideoStreamPackage implements ReactPackage {

    private static final JpegVideoViewManager sJpegVideoViewManager = new JpegVideoViewManager();

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {

        return Collections.emptyList();
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {

        return Collections.singletonList(sJpegVideoViewManager);
    }
}