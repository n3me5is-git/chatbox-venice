package io.github.n3me5is.chatboxvenice;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;

/** Persisted SAF grants for device folders. This plugin is never exposed to generated code. */
@CapacitorPlugin(name="SessionFolder")
public class SessionFolderPlugin extends Plugin {
    private android.content.SharedPreferences prefs(){return getContext().getSharedPreferences("session-folders",0);}
    private String identity(String id)throws Exception{if(id==null||!id.matches("[A-Za-z0-9_-]{1,128}"))throw new Exception("Invalid session identity");return id;}
    private String relative(String path)throws Exception{if(path==null||path.isEmpty()||path.length()>240||path.matches(".*[\\\\:%\\p{Cntrl}].*")||path.startsWith("/"))throw new Exception("Invalid workspace path");for(String part:path.split("/",-1))if(part.isEmpty()||part.equals(".")||part.equals("..")||part.equalsIgnoreCase(".chatbox")||part.endsWith(".")||part.endsWith(" "))throw new Exception("Reserved or invalid workspace path");return path;}
    private JSONObject binding(String id,int depth)throws Exception{if(depth>8)throw new Exception("Invalid workspace ancestry");String value=prefs().getString(identity(id),null);if(value==null)return null;JSONObject b=new JSONObject(value);if(b.has("parent")){JSONObject parent=binding(b.getString("parent"),depth+1);if(parent==null||!parent.getString("token").equals(b.getString("parentToken")))throw new Exception("Linked folder permission expired");}return b;}
    private Uri document(JSONObject b,String id)throws Exception{return DocumentsContract.buildDocumentUriUsingTree(Uri.parse(b.getString("tree")),id);}
    private String name(JSONObject b)throws Exception{try(Cursor c=getContext().getContentResolver().query(document(b,b.getString("document")),new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){return c!=null&&c.moveToFirst()?c.getString(0):"Folder";}}
    private JSObject status(JSONObject b)throws Exception{JSObject out=new JSObject();out.put("linked",b!=null);if(b!=null){out.put("name",name(b));out.put("bindingId",b.getString("token"));out.put("inherited",b.has("parent"));}return out;}
    private String child(JSONObject b,String parent,String name,boolean create,boolean directory)throws Exception{
        Uri query=DocumentsContract.buildChildDocumentsUriUsingTree(Uri.parse(b.getString("tree")),parent);
        try(Cursor c=getContext().getContentResolver().query(query,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE},null,null,null)){while(c!=null&&c.moveToNext())if(name.equals(c.getString(1))){if(directory&&!DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2)))throw new Exception("A file blocks this folder");return c.getString(0);}}
        if(!create)return null;Uri result=DocumentsContract.createDocument(getContext().getContentResolver(),document(b,parent),directory?DocumentsContract.Document.MIME_TYPE_DIR:"application/octet-stream",name);if(result==null)throw new Exception("Cannot create workspace file");return DocumentsContract.getDocumentId(result);
    }
    private String resolve(JSONObject b,String path,boolean create,boolean directory)throws Exception{String[] parts=relative(path).split("/");String id=b.getString("document");for(int i=0;i<parts.length;i++){id=child(b,id,parts[i],create,i<parts.length-1||directory);if(id==null)return null;}return id;}
    private byte[] read(JSONObject b,String id)throws Exception{try(InputStream stream=getContext().getContentResolver().openInputStream(document(b,id));ByteArrayOutputStream bytes=new ByteArrayOutputStream()){if(stream==null)throw new Exception("Session file not found");byte[] buffer=new byte[65536];int count;while((count=stream.read(buffer))!=-1){if(bytes.size()+count>10*1024*1024)throw new Exception("Session files must not exceed 10 MB");bytes.write(buffer,0,count);}Arrays.fill(buffer,(byte)0);return bytes.toByteArray();}}
    private String hash(byte[] data)throws Exception{byte[] digest=MessageDigest.getInstance("SHA-256").digest(data);StringBuilder s=new StringBuilder();for(byte value:digest)s.append(String.format("%02x",value&255));return s.toString();}
    private void list(JSONObject b,String parent,String prefix,int depth,JSArray files,JSArray dirs,JSArray skipped,boolean[] truncated)throws Exception{
        if(depth>16||files.length()+dirs.length()>=2000){truncated[0]=true;return;}
        Uri query=DocumentsContract.buildChildDocumentsUriUsingTree(Uri.parse(b.getString("tree")),parent);
        try(Cursor c=getContext().getContentResolver().query(query,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_LAST_MODIFIED},null,null,null)){
            while(c!=null&&c.moveToNext()){String part=c.getString(1);if(Arrays.asList(".chatbox",".git","node_modules",".venv").contains(part.toLowerCase(Locale.ROOT)))continue;String path=prefix+part;try{relative(path);}catch(Exception ignored){continue;}String id=c.getString(0);if(DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))){dirs.put(path);list(b,id,path+"/",depth+1,files,dirs,skipped,truncated);}else if(c.getLong(3)<=10*1024*1024){byte[] bytes=read(b,id);try{JSObject row=new JSObject();row.put("path",path);row.put("bytes",bytes.length);row.put("modified",c.getLong(4));row.put("version",hash(bytes));files.put(row);}finally{Arrays.fill(bytes,(byte)0);}}else skipped.put(path);if(files.length()+dirs.length()>=2000){truncated[0]=true;break;}}
        }
    }
    @PluginMethod public void operation(PluginCall call){new Thread(()->{try{String id=identity(call.getString("sessionId")),action=call.getString("action");if("unlink".equals(action)){prefs().edit().remove(id).commit();call.resolve(status(null));return;}JSONObject b=binding(id,0);
        if("status".equals(action)){call.resolve(status(b));return;}
        if("unlink".equals(action)){prefs().edit().remove(id).commit();call.resolve(status(null));return;}
        if("inherit".equals(action)){String parentId=identity(call.getString("parentId"));if(parentId.equals(id))throw new Exception("Invalid child workspace");JSONObject parent=binding(parentId,0);if(parent==null){call.resolve(status(null));return;}String folder=child(parent,parent.getString("document"),".chatbox",true,true);folder=child(parent,folder,"agents",true,true);folder=child(parent,folder,id,true,true);JSONObject next=new JSONObject();next.put("tree",parent.getString("tree"));next.put("document",folder);next.put("token",UUID.randomUUID().toString());next.put("parent",parentId);next.put("parentToken",parent.getString("token"));prefs().edit().putString(id,next.toString()).commit();call.resolve(status(next));return;}
        if(b==null){call.resolve(status(null));return;}if(call.getString("bindingId")!=null&&!call.getString("bindingId").equals(b.getString("token")))throw new Exception("Linked folder changed");JSObject out=status(b);
        if("list".equals(action)){JSArray files=new JSArray(),dirs=new JSArray(),skipped=new JSArray();boolean[] truncated={false};list(b,b.getString("document"),"",0,files,dirs,skipped,truncated);out.put("files",files);out.put("skipped",skipped);out.put("directories",dirs);out.put("truncated",truncated[0]);call.resolve(out);return;}
        String path=relative(call.getString("path"));String found=resolve(b,path,false,"mkdir".equals(action));
        if("mkdir".equals(action)){resolve(b,path,true,true);call.resolve(out);return;}
        byte[] previous=found==null?null:read(b,found);
        try{String version=previous==null?null:hash(previous);if(call.getData().has("expectedVersion")){String expected=call.getData().isNull("expectedVersion")?null:call.getString("expectedVersion");if(!Objects.equals(expected,version))throw new Exception("This file changed. Read the current version before writing again.");}
            if("read".equals(action)){if(previous==null)throw new Exception("Session file not found");out.put("base64",Base64.encodeToString(previous,Base64.NO_WRAP));out.put("version",version);call.resolve(out);return;}
            if("remove".equals(action)){if(found==null||!DocumentsContract.deleteDocument(getContext().getContentResolver(),document(b,found)))throw new Exception("Cannot remove workspace file");call.resolve(out);return;}
            if(!"write".equals(action))throw new Exception("Unknown workspace operation");String encoded=call.getString("base64","");if(encoded.length()>14*1024*1024)throw new Exception("Session files must not exceed 10 MB");byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);try{if(bytes.length>10*1024*1024)throw new Exception("Session files must not exceed 10 MB");String target=found==null?resolve(b,path,true,false):found;try(OutputStream output=getContext().getContentResolver().openOutputStream(document(b,target),"wt")){if(output==null)throw new Exception("Cannot write workspace file");output.write(bytes);}out.put("version",hash(bytes));call.resolve(out);}finally{Arrays.fill(bytes,(byte)0);}
        }finally{if(previous!=null)Arrays.fill(previous,(byte)0);}
    }catch(Exception error){call.reject(error.getMessage(),error);}}).start();}
    @PluginMethod public void pick(PluginCall call){try{identity(call.getString("sessionId"));Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);startActivityForResult(call,intent,"folderPicked");}catch(Exception error){call.reject(error.getMessage(),error);}}
    @ActivityCallback private void folderPicked(PluginCall call,ActivityResult result){if(call==null)return;try{if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){call.resolve(status(binding(identity(call.getString("sessionId")),0)));return;}Uri tree=result.getData().getData();if(tree==null||!"com.android.externalstorage.documents".equals(tree.getAuthority()))throw new Exception("Choose a folder stored on this device");int flags=result.getData().getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);if((flags&Intent.FLAG_GRANT_WRITE_URI_PERMISSION)==0)throw new Exception("The folder is read-only");getContext().getContentResolver().takePersistableUriPermission(tree,flags);JSONObject b=new JSONObject();b.put("tree",tree.toString());b.put("document",DocumentsContract.getTreeDocumentId(tree));b.put("token",UUID.randomUUID().toString());prefs().edit().putString(identity(call.getString("sessionId")),b.toString()).commit();call.resolve(status(b));}catch(Exception error){call.reject(error.getMessage(),error);}}
}
