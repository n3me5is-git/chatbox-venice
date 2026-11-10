package io.github.n3me5is.chatboxvenice;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** User-granted removable storage only. Receives authenticated ciphertext, never keys or plaintext. */
@CapacitorPlugin(name="ArchiveStorage")
public class ArchiveStoragePlugin extends Plugin {
    private android.content.SharedPreferences prefs(){return getContext().getSharedPreferences("archive-roots",0);}
    private String identity(String id)throws Exception{if(id==null||!id.matches("[a-f0-9-]{36}"))throw new Exception("Invalid archive identity");return id;}
    private Uri uri(JSONObject root,String id)throws Exception{return DocumentsContract.buildDocumentUriUsingTree(Uri.parse(root.getString("tree")),id);}
    private String child(JSONObject root,String parent,String name,boolean create,boolean folder)throws Exception{
        Uri query=DocumentsContract.buildChildDocumentsUriUsingTree(Uri.parse(root.getString("tree")),parent);
        try(Cursor c=getContext().getContentResolver().query(query,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){while(c!=null&&c.moveToNext())if(name.equals(c.getString(1)))return c.getString(0);}
        if(!create)return null;Uri made=DocumentsContract.createDocument(getContext().getContentResolver(),uri(root,parent),folder?DocumentsContract.Document.MIME_TYPE_DIR:"application/octet-stream",name);if(made==null)throw new Exception("Cannot create archive file");return DocumentsContract.getDocumentId(made);
    }
    private String read(JSONObject root,String id)throws Exception{try(InputStream input=getContext().getContentResolver().openInputStream(uri(root,id));ByteArrayOutputStream output=new ByteArrayOutputStream()){if(input==null)throw new Exception("Archive storage is unavailable");byte[] buffer=new byte[16384];int count;while((count=input.read(buffer))!=-1){if(output.size()+count>1024*1024)throw new Exception("Archive block exceeds size limit");output.write(buffer,0,count);}return new String(output.toByteArray(),StandardCharsets.UTF_8);}}
    private void write(JSONObject root,String id,String value)throws Exception{try(OutputStream output=getContext().getContentResolver().openOutputStream(uri(root,id),"wt")){if(output==null)throw new Exception("Archive storage is unavailable");output.write(value.getBytes(StandardCharsets.UTF_8));output.flush();}}
    private JSONObject root(String id)throws Exception{String value=prefs().getString(identity(id),null);if(value==null)throw new Exception("Archive storage is unavailable");JSONObject root=new JSONObject(value);String marker=child(root,root.getString("document"),"archive-id",false,false);if(marker==null||!id.equals(read(root,marker)))throw new Exception("Archive folder identity changed");return root;}
    @PluginMethod public void status(PluginCall call){new Thread(()->{JSObject out=new JSObject();try{JSONObject root=root(call.getString("id"));out.put("available",true);out.put("name",root.optString("name","SD card"));}catch(Exception error){out.put("available",false);out.put("name","SD card");}call.resolve(out);}).start();}
    @PluginMethod public void operation(PluginCall call){new Thread(()->{try{JSONObject root=root(call.getString("id"));String name=call.getString("name"),action=call.getString("action");if(name==null||!name.matches("a1-[a-f0-9-]{36}-[0-9]{1,9}\\.bin"))throw new Exception("Invalid archive filename");String existing=child(root,root.getString("document"),name,false,false);JSObject out=new JSObject();
        if("read".equals(action)){out.put("value",existing==null?JSONObject.NULL:read(root,existing));}
        else if("remove".equals(action)){if(existing!=null&&!DocumentsContract.deleteDocument(getContext().getContentResolver(),uri(root,existing)))throw new Exception("Cannot remove archive file");}
        else if("write".equals(action)){String value=call.getString("value");if(value==null||value.getBytes(StandardCharsets.UTF_8).length>1024*1024)throw new Exception("Archive block exceeds size limit");if(existing!=null)throw new Exception("Archive block already exists");String made=child(root,root.getString("document"),name,true,false);write(root,made,value);}
        else throw new Exception("Invalid archive operation");call.resolve(out);
    }catch(Exception error){call.reject(error.getMessage(),error);}}).start();}
    @PluginMethod public void pick(PluginCall call){try{if(call.getString("reconnect")!=null)identity(call.getString("reconnect"));Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);startActivityForResult(call,intent,"picked");}catch(Exception error){call.reject(error.getMessage(),error);}}
    @ActivityCallback private void picked(PluginCall call,ActivityResult result){if(call==null)return;if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){call.resolve();return;}new Thread(()->{try{Uri tree=result.getData().getData();if(tree==null||!"com.android.externalstorage.documents".equals(tree.getAuthority()))throw new Exception("Choose a folder on a removable SD card");String document=DocumentsContract.getTreeDocumentId(tree),volume=document.split(":",2)[0];boolean removable=false;StorageManager manager=(StorageManager)getContext().getSystemService(android.content.Context.STORAGE_SERVICE);for(StorageVolume item:manager.getStorageVolumes())if(item.isRemovable()&&item.getUuid()!=null&&item.getUuid().equalsIgnoreCase(volume))removable=true;if(!removable)throw new Exception("Choose a folder on a removable SD card");int flags=result.getData().getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);if((flags&Intent.FLAG_GRANT_WRITE_URI_PERMISSION)==0)throw new Exception("The folder is read-only");getContext().getContentResolver().takePersistableUriPermission(tree,flags);
        String reconnect=call.getString("reconnect"),id=reconnect==null?UUID.randomUUID().toString():identity(reconnect);if(reconnect!=null&&prefs().getString(id,null)==null)throw new Exception("Unknown archive location");JSONObject root=new JSONObject();root.put("tree",tree.toString());String folder=child(root,document,"Chatbox-Archive-"+id,reconnect==null,true);if(folder==null)throw new Exception("Choose the original archive folder’s parent");root.put("document",folder);root.put("name",volume+" / Chatbox-Archive-"+id);String marker=child(root,folder,"archive-id",reconnect==null,false);if(reconnect==null)write(root,marker,id);else if(marker==null||!id.equals(read(root,marker)))throw new Exception("Archive folder identity changed");prefs().edit().putString(id,root.toString()).commit();JSObject out=new JSObject();out.put("id",id);out.put("name",root.getString("name"));call.resolve(out);
    }catch(Exception error){call.reject(error.getMessage(),error);}}).start();}
}
