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

/** Runtime probes in the actual Capacitor WebView, independent of cloud signaling availability. */
@RunWith(AndroidJUnit4.class)
public class CollaborationDeviceTest {
    private JSONObject probe(ActivityScenario<MainActivity> scenario,String script) throws Exception {
        AtomicReference<String> ready=new AtomicReference<>();
        for(int attempt=0;attempt<100;attempt++) {
            scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript("document.readyState==='complete' && window.isSecureContext",ready::set));
            if("true".equals(ready.get()))break;
            Thread.sleep(100);
        }
        assertEquals("Capture and WebRTC need a secure local context","true",ready.get());
        scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript("window.__collaborationProbe='pending';("+script+")().then(value=>window.__collaborationProbe=JSON.stringify(value),error=>window.__collaborationProbe=JSON.stringify({error:error.name+': '+error.message}));",null));
        AtomicReference<String> result=new AtomicReference<>();
        for(int attempt=0;attempt<400;attempt++) {
            scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript("window.__collaborationProbe",result::set));
            if(result.get()!=null&&!result.get().equals("null")&&!result.get().equals("\"pending\""))break;
            Thread.sleep(100);
        }
        assertNotNull("WebView probe timed out",result.get());
        String decoded=new org.json.JSONArray("["+result.get()+"]").getString(0);
        assertNotEquals("WebView probe timed out","pending",decoded);
        JSONObject output=new JSONObject(decoded);assertFalse(output.toString(),output.has("error"));return output;
    }
    @Test public void qrCameraCanCaptureAndReleaseWithoutMicrophone() throws Exception {
        var instrumentation=InstrumentationRegistry.getInstrumentation();var context=instrumentation.getTargetContext();
        instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(),Manifest.permission.CAMERA);
        assertEquals(PackageManager.PERMISSION_GRANTED,context.checkSelfPermission(Manifest.permission.CAMERA));
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            JSONObject result=probe(scenario,"async()=>{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});const video=document.createElement('video');video.muted=true;video.playsInline=true;document.body.append(video);video.srcObject=stream;try{await video.play();await new Promise(resolve=>setTimeout(resolve,600));return {width:video.videoWidth,height:video.videoHeight,audio:stream.getAudioTracks().length}}finally{stream.getTracks().forEach(track=>track.stop());video.remove()}} ");
            assertTrue(result.toString(),result.getInt("width")>0);assertTrue(result.getInt("height")>0);assertEquals(0,result.getInt("audio"));
        }
    }
    @Test public void androidOwnerCanExchangeDataOverWebRtc() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            JSONObject result=probe(scenario,"async()=>{const owner=new RTCPeerConnection({iceServers:[]}),guest=new RTCPeerConnection({iceServers:[]});const channel=owner.createDataChannel('owner-test');try{const gather=peer=>new Promise(resolve=>{if(peer.iceGatheringState==='complete')resolve();else peer.onicegatheringstatechange=()=>{if(peer.iceGatheringState==='complete')resolve()}});const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Data channel timed out')),20000);guest.ondatachannel=event=>{event.channel.onmessage=message=>{clearTimeout(timer);resolve(message.data)}};channel.onopen=()=>channel.send('android-owner')});await owner.setLocalDescription(await owner.createOffer());await gather(owner);await guest.setRemoteDescription(owner.localDescription);await guest.setLocalDescription(await guest.createAnswer());await gather(guest);await owner.setRemoteDescription(guest.localDescription);return {message:await received}}finally{owner.close();guest.close()}} ");
            assertEquals("android-owner",result.getString("message"));
        }
    }
}
