package io.github.n3me5is.chatboxvenice;

import android.Manifest;
import android.content.pm.PackageManager;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Real Capacitor WebView capture after the user has already allowed RECORD_AUDIO. */
@RunWith(AndroidJUnit4.class)
public class MicrophoneDeviceTest extends EmulatorDeviceFixture {
    @Test public void grantedMicrophoneCanRecordThroughCapacitor() throws Exception {
        var instrumentation=InstrumentationRegistry.getInstrumentation();
        var context=instrumentation.getTargetContext();
        instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(),Manifest.permission.RECORD_AUDIO);
        assertEquals(PackageManager.PERMISSION_GRANTED,context.checkSelfPermission(Manifest.permission.RECORD_AUDIO));
        assertEquals("Capacitor also requests this manifest permission",PackageManager.PERMISSION_GRANTED,context.checkSelfPermission(Manifest.permission.MODIFY_AUDIO_SETTINGS));
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<String> ready=new AtomicReference<>();
            for(int attempt=0;attempt<100;attempt++) {
                scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript("document.readyState==='complete' && window.isSecureContext && !!navigator.mediaDevices",ready::set));
                if("true".equals(ready.get()))break;
                Thread.sleep(100);
            }
            assertEquals("The local app must have a secure capture context","true",ready.get());
            scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript(
                "window.__microphoneTest='pending';navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{try{let bytes=0;const recorder=new MediaRecorder(stream);recorder.ondataavailable=event=>bytes+=event.data.size;recorder.onerror=()=>{stream.getTracks().forEach(t=>t.stop());window.__microphoneTest=JSON.stringify({error:'recorder error'})};recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());window.__microphoneTest=JSON.stringify({bytes,ended:stream.getTracks().every(t=>t.readyState==='ended')})};recorder.start(100);setTimeout(()=>recorder.stop(),1200)}catch(error){stream.getTracks().forEach(t=>t.stop());window.__microphoneTest=JSON.stringify({error:error.name+': '+error.message})}},error=>window.__microphoneTest=JSON.stringify({error:error.name+': '+error.message}));",null));
            AtomicReference<String> result=new AtomicReference<>();
            for(int attempt=0;attempt<300;attempt++) {
                scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript("window.__microphoneTest",result::set));
                String encoded=result.get();
                if(encoded!=null&&!encoded.equals("null")&&!encoded.equals("\"pending\""))break;
                Thread.sleep(100);
            }
            assertNotNull("Microphone response timed out",result.get());
            String decoded=new org.json.JSONArray("["+result.get()+"]").getString(0);
            assertNotEquals("Microphone response timed out","pending",decoded);
            JSONObject output=new JSONObject(decoded);
            assertFalse(output.toString(),output.has("error"));
            assertTrue("The recorder must return audio bytes",output.getInt("bytes")>0);
            assertTrue("All microphone tracks must stop",output.getBoolean("ended"));
        }
    }
}
