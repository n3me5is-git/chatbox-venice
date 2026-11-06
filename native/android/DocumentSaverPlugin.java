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
    public void openDocumentation(PluginCall call) {
        String url=call.getString("url", ""); Uri uri=Uri.parse(url);
        if (!"https".equals(uri.getScheme()) || !("docs.venice.ai".equals(uri.getHost()) || "venice.ai".equals(uri.getHost()) && uri.getPath()!=null && uri.getPath().startsWith("/models"))) { call.reject("Unsupported documentation URL"); return; }
        getActivity().runOnUiThread(()->{
            android.app.Dialog dialog=new android.app.Dialog(getActivity());
            android.widget.LinearLayout layout=new android.widget.LinearLayout(getActivity());layout.setOrientation(android.widget.LinearLayout.VERTICAL);
            android.widget.LinearLayout toolbar=new android.widget.LinearLayout(getActivity());
            android.widget.Button close=new android.widget.Button(getActivity());close.setText(call.getString("close","Close"));close.setOnClickListener(v->dialog.dismiss());toolbar.addView(close);
            android.widget.Button chrome=new android.widget.Button(getActivity());chrome.setText(call.getString("browser","Open in Chrome"));toolbar.addView(chrome);
            android.webkit.WebView view=new android.webkit.WebView(getActivity());
            view.getSettings().setJavaScriptEnabled(true);view.getSettings().setDomStorageEnabled(true);view.getSettings().setAllowFileAccess(false);view.getSettings().setAllowContentAccess(false);view.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            view.setWebViewClient(new android.webkit.WebViewClient(){
                @Override public boolean shouldOverrideUrlLoading(android.webkit.WebView web,android.webkit.WebResourceRequest request){Uri target=request.getUrl();if("https".equals(target.getScheme()) && ("docs.venice.ai".equals(target.getHost()) || "venice.ai".equals(target.getHost()) && target.getPath()!=null && target.getPath().startsWith("/models")))return false;return true;}
            });
            chrome.setOnClickListener(v->{try{Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse(view.getUrl()==null?url:view.getUrl()));intent.setPackage("com.android.chrome");getActivity().startActivity(intent);}catch(Exception ignored){android.widget.Toast.makeText(getActivity(),call.getString("unavailable","Chrome is unavailable"),android.widget.Toast.LENGTH_SHORT).show();}});
            layout.addView(toolbar);layout.addView(view,new android.widget.LinearLayout.LayoutParams(-1,0,1));dialog.setContentView(layout);
            dialog.setOnKeyListener((d,key,event)->{if(key==android.view.KeyEvent.KEYCODE_BACK && event.getAction()==android.view.KeyEvent.ACTION_UP){if(view.canGoBack())view.goBack();else dialog.dismiss();return true;}return false;});
            dialog.setOnDismissListener(d->{view.stopLoading();view.destroy();call.resolve();});
            dialog.show();dialog.getWindow().setLayout(-1,-1);view.loadUrl(url);
        });
    }
    @PluginMethod
    public void openInChrome(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !"https".equals(Uri.parse(url).getScheme())) { call.reject("Only HTTPS documentation links are allowed"); return; }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.setPackage("com.android.chrome");
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) { call.reject("Chrome is not available. Use Open in browser instead.", error); }
    }
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
