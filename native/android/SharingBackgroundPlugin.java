package io.github.n3me5is.chatboxvenice;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.ref.WeakReference;

@CapacitorPlugin(name="SharingBackground", permissions={@Permission(alias="notifications", strings={Manifest.permission.POST_NOTIFICATIONS})})
public class SharingBackgroundPlugin extends Plugin {
    static volatile boolean active = false;
    private static WeakReference<SharingBackgroundPlugin> instance = new WeakReference<>(null);
    @Override public void load() { instance = new WeakReference<>(this); }
    @PluginMethod public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) { requestPermissionForAlias("notifications", call, "notificationPermission"); return; }
        startService(call);
    }
    @PermissionCallback private void notificationPermission(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) { call.reject("Allow notifications to keep chat sharing active in the background"); return; }
        startService(call);
    }
    private void startService(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), SharingBackgroundService.class);
            intent.putExtra("title", call.getString("title")); intent.putExtra("text", call.getString("text"));
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(intent); else getContext().startService(intent);
            active = true;
            JSObject result = new JSObject(); result.put("active", true); call.resolve(result);
        } catch (Exception error) { active = false; call.reject("Unable to keep chat sharing active in the background"); }
    }
    @PluginMethod public void stop(PluginCall call) { getContext().stopService(new Intent(getContext(), SharingBackgroundService.class)); active = false; call.resolve(); }
    @PluginMethod public void status(PluginCall call) { JSObject result = new JSObject(); result.put("active", active); call.resolve(result); }
    @Override protected void handleOnPause() {
        if (active && getBridge() != null) getActivity().runOnUiThread(() -> { if (active) { getBridge().getWebView().onResume(); getBridge().getWebView().resumeTimers(); } });
    }
    static void ended() {
        SharingBackgroundPlugin plugin = instance.get();
        if (plugin != null && plugin.getBridge() != null) plugin.getActivity().runOnUiThread(() -> plugin.getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('chatbox:sharing-background-ended'))", null));
    }
}
