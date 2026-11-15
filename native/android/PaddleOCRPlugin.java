package io.github.n3me5is.chatboxvenice;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.*;

/** Local, explicitly installed model; pixels never leave this process. */
@CapacitorPlugin(name="PaddleOCR")
public class PaddleOCRPlugin extends Plugin {
 static boolean nativeAvailable;
 static {try {System.loadLibrary("paddle_ocr");nativeAvailable=true;}catch(UnsatisfiedLinkError error){nativeAvailable=false;}}
 static native long nativeCreate(String root,boolean gpu,int threads);
 static native String nativeRun(long handle,Bitmap bitmap);
 static native void nativeCancel(long handle);
 static native void nativeRelease(long handle);
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private final Handler timer=new Handler(Looper.getMainLooper());
 private final Map<String,AtomicBoolean> jobs=new ConcurrentHashMap<>();
 private final Object guard=new Object();
 private volatile long engine=0,queuedBytes=0,progressBytes=0;
 private volatile int pending=0;
 private volatile boolean busy=false,starting=false;
 private volatile String activeId="",error="",device="";
 private volatile AtomicBoolean transfer=new AtomicBoolean(false);
 private JSONObject artifact,config;
 private File root,bundle;
 private Runnable idle;
 @Override public void load(){
  root=new File(getContext().getFilesDir(),"paddle-ocr");root.mkdirs();
  try(InputStream input=getContext().getAssets().open("paddle-ocr-artifacts.json")){JSONObject manifest=new JSONObject(new String(read(input,65536),"UTF-8"));artifact=manifest.optJSONObject("models");if(artifact!=null)bundle=new File(root,"bundle-"+artifact.getString("sha256").substring(0,16));}catch(Exception ignored){}
  try{File settings=new File(root,"settings.json");config=settings.exists()?new JSONObject(new String(read(new FileInputStream(settings),4096),"UTF-8")):new JSONObject();validate(config);}catch(Exception ignored){config=new JSONObject();try{config.put("backend","cpu").put("threads",Math.min(4,Math.max(1,Runtime.getRuntime().availableProcessors()-1))).put("idleSeconds",120);}catch(Exception impossible){}}
 }
 private static void validate(JSONObject value)throws Exception{if(value==null||!Arrays.asList("cpu","vulkan").contains(value.optString("backend"))||value.optDouble("threads",0)!=value.optInt("threads",0)||value.optDouble("idleSeconds",-1)!=value.optInt("idleSeconds",-1)||value.optInt("threads",0)<1||value.optInt("threads",0)>32||value.optInt("idleSeconds",-1)<0||value.optInt("idleSeconds",1801)>1800)throw new IOException("Invalid local OCR settings");}
 private static byte[] read(InputStream source,int maximum)throws IOException{try(InputStream input=source;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] chunk=new byte[65536];int n;while((n=input.read(chunk))!=-1){if(out.size()+n>maximum)throw new IOException("Local OCR response is too large");out.write(chunk,0,n);}return out.toByteArray();}}
 private static String digest(File file)throws Exception{MessageDigest md=MessageDigest.getInstance("SHA-256");try(InputStream input=new FileInputStream(file)){byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))!=-1)md.update(buffer,0,n);}StringBuilder hex=new StringBuilder();for(byte b:md.digest())hex.append(String.format(Locale.ROOT,"%02x",b&255));return hex.toString();}
 private boolean verified(boolean full){try{if(bundle==null||artifact==null)return false;File metadata=new File(bundle,"runtime-manifest.json");if(!digest(metadata).equals(artifact.getString("manifestSha256")))return false;JSONObject manifest=new JSONObject(new String(read(new FileInputStream(metadata),65536),"UTF-8"));if(!manifest.getString("model").equals("ppocr-v5-latin-f32-v1"))return false;JSONObject files=manifest.getJSONObject("files");for(String name:new String[]{"det.ncnn.param","det.ncnn.bin","rec.ncnn.param","rec.ncnn.bin","dictionary.json"})if(!files.has(name))return false;Iterator<String> keys=files.keys();int count=0;while(keys.hasNext()){String name=keys.next();if(++count>30||!name.matches("[A-Za-z0-9_.-]+"))return false;JSONObject info=files.getJSONObject(name);File file=new File(bundle,name);if(!file.isFile()||file.length()!=info.getLong("bytes")||full&&!digest(file).equals(info.getString("sha256")))return false;}return true;}catch(Exception ignored){return false;}}
 private JSObject status(){JSObject value=new JSObject();try{value.put("config",new JSONObject(config.toString()));value.put("ready",verified(false));value.put("loaded",engine!=0&&!starting);value.put("starting",starting);value.put("pending",pending);value.put("busy",busy);value.put("platformSupported",nativeAvailable&&artifact!=null);value.put("root",root.getAbsolutePath());value.put("device",device);if(!error.isEmpty())value.put("error",error);if(busy&&artifact!=null)value.put("progress",new JSONObject().put("name",artifact.getString("name")).put("bytes",progressBytes).put("total",artifact.getLong("bytes")));}catch(Exception ignored){}return value;}
 private void cancelAll(){for(AtomicBoolean job:jobs.values())job.set(true);long handle=engine;if(handle!=0)nativeCancel(handle);if(idle!=null)timer.removeCallbacks(idle);}
 private void release(){long handle=engine;engine=0;starting=false;device="";if(handle!=0)nativeRelease(handle);}
 private void idle(){if(pending!=0||engine==0)return;if(idle!=null)timer.removeCallbacks(idle);idle=()->{if(pending==0)worker.execute(()->{if(pending==0)release();});};timer.postDelayed(idle,config.optInt("idleSeconds",120)*1000L);}
 @PluginMethod public void control(PluginCall call){
  String command=call.getString("command","");Object value=call.getData().opt("value");
  if(command.equals("status")){call.resolve(status());return;}
  if(command.equals("cancel")){String id=String.valueOf(value);AtomicBoolean job=jobs.get(id);if(job!=null)job.set(true);if(id.equals(activeId)&&engine!=0)nativeCancel(engine);call.resolve();return;}
  if(command.equals("cancel-download")){transfer.set(true);call.resolve();return;}
  if(command.equals("unload")){cancelAll();transfer.set(true);worker.execute(()->{release();call.resolve(status());});return;}
  if(command.equals("ocr")){enqueue(call,value);return;}
  if(!Arrays.asList("configure","download","remove").contains(command)){call.reject("Unknown local OCR command");return;}
  synchronized(guard){if(busy||pending!=0){call.reject("Wait for local OCR operations to finish");return;}busy=true;}
  worker.execute(()->{try{release();if(command.equals("configure")){JSONObject next=(JSONObject)value;validate(next);try(FileOutputStream out=new FileOutputStream(new File(root,"settings.json"))){out.write(next.toString().getBytes("UTF-8"));}config=new JSONObject(next.toString());}else if(command.equals("download")){if(!nativeAvailable||artifact==null)throw new IOException("Local PaddleOCR is unavailable on this device");transfer=new AtomicBoolean(false);download();}else{if(bundle!=null)remove(bundle);}error="";call.resolve(status());}catch(Exception problem){error=problem.getMessage()==null?"Local OCR request failed":problem.getMessage();call.reject(error);}finally{busy=false;progressBytes=0;}});
 }
 private void enqueue(PluginCall call,Object input){
  if(!(input instanceof JSONObject)){call.reject("Invalid local OCR request");return;}JSONObject value=(JSONObject)input;String id=value.optString("id"),image=value.optString("image");if(!id.matches("[-a-f0-9]{36}")||!value.optString("modelId").equals("ppocr-v5-latin-f32-v1")||image.length()>24*1024*1024||!image.matches("^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$")){call.reject("Use a supported local OCR image");return;}
  final AtomicBoolean cancelled=new AtomicBoolean(false);final int size=image.length();synchronized(guard){if(busy||pending>=4||queuedBytes+size>48*1024*1024||jobs.putIfAbsent(id,cancelled)!=null){call.reject("The local OCR queue is full");return;}pending++;queuedBytes+=size;}
  if(idle!=null)timer.removeCallbacks(idle);
  worker.execute(()->{Bitmap bitmap=null;try{if(cancelled.get())throw new IOException("Local OCR operation cancelled");if(!nativeAvailable||!verified(engine==0))throw new IOException("Install and verify local PaddleOCR first");activeId=id;if(engine==0){starting=true;engine=nativeCreate(bundle.getAbsolutePath(),config.optString("backend").equals("vulkan"),config.optInt("threads",4));starting=false;}if(cancelled.get())throw new IOException("Local OCR operation cancelled");byte[] bytes=Base64.decode(image.substring(image.indexOf(',')+1),Base64.DEFAULT);try{BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);if(bounds.outWidth<1||bounds.outHeight<1||(long)bounds.outWidth*bounds.outHeight>16777216)throw new IOException("Use an image up to 16 megapixels");BitmapFactory.Options options=new BitmapFactory.Options();options.inPreferredConfig=Bitmap.Config.ARGB_8888;bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);}finally{Arrays.fill(bytes,(byte)0);}if(bitmap==null)throw new IOException("Use a supported local OCR image");JSONObject result=new JSONObject(nativeRun(engine,bitmap));if(cancelled.get())throw new IOException("Local OCR operation cancelled");String text=result.getString("text");if(text.length()>512000)throw new IOException("Local OCR response is too large");device=result.optString("device");error="";call.resolve(new JSObject().put("text",text));}catch(Exception problem){release();error=problem.getMessage()==null?"Local OCR request failed":problem.getMessage();call.reject(error);}finally{starting=false;activeId="";if(bitmap!=null)bitmap.recycle();jobs.remove(id);synchronized(guard){pending--;queuedBytes-=size;}idle();}});
 }
 private void download()throws Exception{
  File archive=new File(root,"package.part");try{URL url=new URL(artifact.getString("url"));HttpURLConnection connection=null;for(int redirects=0;redirects<8;redirects++){String host=url.getHost();if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||!(host.equals("github.com")||host.endsWith(".githubusercontent.com")))throw new IOException("Untrusted local OCR download URL");connection=(HttpURLConnection)url.openConnection();connection.setConnectTimeout(20000);connection.setReadTimeout(30000);connection.setInstanceFollowRedirects(false);int code=connection.getResponseCode();if(code>=300&&code<400){String next=connection.getHeaderField("Location");connection.disconnect();url=new URL(url,next);continue;}if(code!=200)throw new IOException("Local OCR download failed");break;}if(connection==null||connection.getResponseCode()!=200)throw new IOException("Local OCR download failed");try(InputStream input=connection.getInputStream();OutputStream out=new FileOutputStream(archive)){byte[] bytes=new byte[65536];int n;while((n=input.read(bytes))!=-1){if(transfer.get())throw new IOException("Local OCR operation cancelled");progressBytes+=n;if(progressBytes>artifact.getLong("bytes"))throw new IOException("Local OCR download size mismatch");out.write(bytes,0,n);}}finally{connection.disconnect();}if(archive.length()!=artifact.getLong("bytes")||!digest(archive).equals(artifact.getString("sha256")))throw new IOException("Local OCR download checksum mismatch");bundle.mkdirs();long total=0;int files=0;try(ZipInputStream zip=new ZipInputStream(new FileInputStream(archive))){ZipEntry entry;while((entry=zip.getNextEntry())!=null){if(transfer.get())throw new IOException("Local OCR operation cancelled");String name=entry.getName();if(++files>30||!name.matches("[A-Za-z0-9_.-]+")||entry.isDirectory())throw new IOException("Invalid PaddleOCR package");try(OutputStream out=new FileOutputStream(new File(bundle,name))){byte[] bytes=new byte[65536];int n;while((n=zip.read(bytes))!=-1){total+=n;if(total>64*1024*1024)throw new IOException("Invalid PaddleOCR package");out.write(bytes,0,n);}}}}if(!verified(true))throw new IOException("PaddleOCR package integrity check failed");}finally{archive.delete();}
 }
 private static void remove(File file)throws IOException{if(!file.getCanonicalPath().equals(file.getAbsolutePath()))throw new IOException("Invalid PaddleOCR storage");if(file.isDirectory()){File[] children=file.listFiles();if(children==null)throw new IOException("Unable to remove PaddleOCR files");for(File child:children)remove(child);}if(file.exists()&&!file.delete())throw new IOException("Unable to remove PaddleOCR files");}
 @Override protected void handleOnStop(){cancelAll();worker.execute(this::release);}
 @Override protected void handleOnDestroy(){cancelAll();worker.execute(()->{release();worker.shutdown();});}
}
