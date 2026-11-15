package io.github.n3me5is.chatboxvenice;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Actual JNI inference and Capacitor bridge on an Android emulator, no API key. */
@RunWith(AndroidJUnit4.class)
public class PaddleOCRDeviceTest extends EmulatorDeviceFixture {
 private JSONObject request(ActivityScenario<MainActivity> scenario,String command,Object value)throws Exception{
  JSONObject input=new JSONObject().put("command",command);if(value!=null)input.put("value",value);
  String code="window.__paddleTest='pending';window.Capacitor.nativePromise('PaddleOCR','control',"+input+").then(value=>window.__paddleTest=JSON.stringify({ok:true,value}),error=>window.__paddleTest=JSON.stringify({error:error.message||String(error)}));";
  scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript(code,null));
  AtomicReference<String> result=new AtomicReference<>();
  for(int n=0;n<600;n++){scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript("window.__paddleTest",result::set));String item=result.get();if(item!=null&&!item.equals("null")&&!item.equals("\"pending\""))break;Thread.sleep(100);}
  assertNotNull("Capacitor OCR response timed out",result.get());String decoded=new JSONArray("["+result.get()+"]").getString(0);assertNotEquals("pending",decoded);JSONObject reply=new JSONObject(decoded);assertFalse(reply.toString(),reply.has("error"));return reply.optJSONObject("value");
 }
 @Test public void localInferenceAndCapacitorLifecycle()throws Exception{
  var instrumentation=InstrumentationRegistry.getInstrumentation();var context=instrumentation.getTargetContext();var assets=instrumentation.getContext().getAssets();
  assertTrue("The APK must contain the pinned native OCR library",PaddleOCRPlugin.nativeAvailable);
  JSONObject metadata;try(InputStream input=context.getAssets().open("paddle-ocr-artifacts.json")){metadata=new JSONObject(new String(input.readAllBytes(),"UTF-8"));}
  File directory=new File(context.getFilesDir(),"paddle-ocr/bundle-"+metadata.getJSONObject("models").getString("sha256").substring(0,16));assertTrue(directory.mkdirs()||directory.isDirectory());
  for(String name:assets.list("paddle-test-models")){try(InputStream input=assets.open("paddle-test-models/"+name);OutputStream output=new FileOutputStream(new File(directory,name))){input.transferTo(output);}}
  byte[] image;try(InputStream input=assets.open("paddle-test.png")){image=input.readAllBytes();}
  Bitmap bitmap=BitmapFactory.decodeByteArray(image,0,image.length);assertNotNull(bitmap);
  long handle=PaddleOCRPlugin.nativeCreate(directory.getAbsolutePath(),false,2);
  try{JSONObject first=new JSONObject(PaddleOCRPlugin.nativeRun(handle,bitmap));assertEquals("cpu",first.getString("backend"));assertTrue(first.getString("text").replaceAll("\\s+","").contains("CLIENTEACME"));byte[] photo;try(InputStream input=assets.open("paddle-test-exif6.jpg")){photo=input.readAllBytes();}Bitmap upright=PaddleOCRPlugin.decodeImage(photo);try{assertEquals(1132,upright.getWidth());assertEquals(1600,upright.getHeight());JSONObject second=new JSONObject(PaddleOCRPlugin.nativeRun(handle,upright));assertTrue(second.getString("text").contains("FAT-2026-00418"));assertTrue(second.getString("text").contains("Forlì"));}finally{upright.recycle();}}finally{PaddleOCRPlugin.nativeRelease(handle);bitmap.recycle();}
  try{PaddleOCRPlugin.nativeRun(handle,Bitmap.createBitmap(4,4,Bitmap.Config.ARGB_8888));fail("Released JNI handles must be rejected");}catch(RuntimeException expected){}
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   AtomicReference<String> ready=new AtomicReference<>();for(int n=0;n<100;n++){scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript("document.readyState==='complete' && typeof window.Capacitor?.nativePromise==='function'",ready::set));if("true".equals(ready.get()))break;Thread.sleep(100);}assertEquals("true",ready.get());
   JSONObject state=request(scenario,"status",null);assertTrue(state.toString(),state.getBoolean("platformSupported"));assertTrue(state.toString(),state.getBoolean("ready"));
   request(scenario,"configure",new JSONObject().put("backend","cpu").put("threads",2).put("idleSeconds",0));
   JSONObject output=request(scenario,"ocr",new JSONObject().put("id",java.util.UUID.randomUUID().toString()).put("modelId","ppocr-v5-latin-f32-v1").put("image","data:image/png;base64,"+Base64.encodeToString(image,Base64.NO_WRAP)));assertTrue(output.getString("text").replaceAll("\\s+","").contains("TOTALE120EUR"));
   for(int n=0;n<100;n++){state=request(scenario,"status",null);if(state.getInt("pending")==0&&!state.getBoolean("loaded"))break;Thread.sleep(100);}assertEquals(0,state.getInt("pending"));assertFalse("Zero idle timeout releases native memory",state.getBoolean("loaded"));request(scenario,"unload",null);
  }
 }
}
