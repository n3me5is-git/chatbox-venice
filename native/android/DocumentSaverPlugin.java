package io.github.n3me5is.chatboxvenice;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "DocumentSaver")
public class DocumentSaverPlugin extends Plugin {
    @PluginMethod
    public void saveFile(PluginCall call) {
        String source = call.getString("sourceUri");
        if (source == null) { call.reject("Missing source file"); return; }
        try {
            Uri uri = Uri.parse(source);
            if (!"file".equals(uri.getScheme())) throw new IllegalArgumentException("Expected an app cache file");
            File file = new File(uri.getPath()).getCanonicalFile();
            String cache = getContext().getCacheDir().getCanonicalPath() + File.separator;
            File externalCache = getContext().getExternalCacheDir();
            String external = externalCache == null ? null : externalCache.getCanonicalPath() + File.separator;
            if (!file.getPath().startsWith(cache) && (external == null || !file.getPath().startsWith(external))) {
                throw new IllegalArgumentException("Source must be in the app cache");
            }
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(call.getString("mimeType", "application/octet-stream"));
            intent.putExtra(Intent.EXTRA_TITLE, call.getString("suggestedName", "export"));
            startActivityForResult(call, intent, "documentCreated");
        } catch (Exception error) { call.reject("Cannot prepare file export", error); }
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Save canceled", "SAVE_CANCELED"); return;
        }
        Uri destination = result.getData().getData();
        Uri source = Uri.parse(call.getString("sourceUri"));
        new Thread(() -> {
            try (InputStream input = getContext().getContentResolver().openInputStream(source);
                 OutputStream output = getContext().getContentResolver().openOutputStream(destination)) {
                if (input == null || output == null) throw new IllegalStateException("Cannot open file");
                byte[] buffer = new byte[65536];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                JSObject saved = new JSObject(); saved.put("uri", destination.toString());
                call.resolve(saved);
            } catch (Exception error) { call.reject("Cannot save file", error); }
        }).start();
    }
}
