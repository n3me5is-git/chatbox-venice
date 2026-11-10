package io.github.n3me5is.chatboxvenice;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.*;

/** User-granted removable storage only. Receives authenticated ciphertext, never keys or plaintext. */
@CapacitorPlugin(name="ArchiveStorage")
public class ArchiveStoragePlugin extends Plugin {
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private android.content.SharedPreferences prefs(){return getContext().getSharedPreferences("archive-roots",0);}
    private String identity(String id)throws Exception{if(id==null||!id.matches("[a-f0-9-]{36}"))throw new Exception("Invalid archive identity");return id;}
    private Uri uri(JSONObject root,String id)throws Exception{return DocumentsContract.buildDocumentUriUsingTree(Uri.parse(root.getString("tree")),id);}
    private String child(JSONObject root,String parent,String name,boolean create,boolean folder)throws Exception{
        Uri query=DocumentsContract.buildChildDocumentsUriUsingTree(Uri.parse(root.getString("tree")),parent);
        try(Cursor c=getContext().getContentResolver().query(query,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){while(c!=null&&c.moveToNext())if(name.equals(c.getString(1)))return c.getString(0);}
        if(!create)return null;Uri made=DocumentsContract.createDocument(getContext().getContentResolver(),uri(root,parent),folder?DocumentsContract.Document.MIME_TYPE_DIR:"application/octet-stream",name);if(made==null)throw new Exception("Cannot create archive file");return DocumentsContract.getDocumentId(made);
    }
    private String read(JSONObject root,String id)throws Exception{try(InputStream input=getContext().getContentResolver().openInputStream(uri(root,id));ByteArrayOutputStream output=new ByteArrayOutputStream()){if(input==null)throw new Exception("Archive storage is unavailable");byte[] buffer=new byte[16384];int count;while((count=input.read(buffer))!=-1){if(output.size()+count>1024*1024)throw new Exception("Archive block exceeds size limit");output.write(buffer,0,count);}return new String(output.toByteArray(),StandardCharsets.UTF_8);}}
    private void write(JSONObject root,String id,String value)throws Exception{
        ParcelFileDescriptor file=getContext().getContentResolver().openFileDescriptor(uri(root,id),"rwt");
        if(file==null)throw new Exception("Archive storage is unavailable");
        try(ParcelFileDescriptor.AutoCloseOutputStream output=new ParcelFileDescriptor.AutoCloseOutputStream(file)){
            output.write(value.getBytes(StandardCharsets.UTF_8));output.getFD().sync();
        }
    }
    private JSONObject root(String id)throws Exception{String value=prefs().getString(identity(id),null);if(value==null)throw new Exception("Archive storage is unavailable");JSONObject root=new JSONObject(value);String marker=child(root,root.getString("document"),"archive-id",false,false);if(marker==null||!id.equals(read(root,marker)))throw new Exception("Archive folder identity changed");return root;}
    @PluginMethod public void status(PluginCall call){IO.execute(()->{JSObject out=new JSObject();try{JSONObject root=root(call.getString("id"));out.put("available",true);out.put("name",root.optString("name","SD card"));}catch(Exception error){out.put("available",false);out.put("name","SD card");}call.resolve(out);});}
    @PluginMethod public void operation(PluginCall call){IO.execute(()->{try{JSONObject root=root(call.getString("id"));String name=call.getString("name"),action=call.getString("action");if(name==null||!name.matches("a1-[a-f0-9-]{36}-[0-9]{1,9}\\.bin"))throw new Exception("Invalid archive filename");
        // Bound DocumentsProvider directory scans for large archives.
        boolean create="write".equals(action);String blocks=child(root,root.getString("document"),"blocks",create,true);
        String shard=blocks==null?null:child(root,blocks,name.substring(3,5),create,true);
        String existing=shard==null?null:child(root,shard,name,false,false);JSObject out=new JSObject();
        if("read".equals(action)){out.put("value",existing==null?JSONObject.NULL:read(root,existing));}
        else if("remove".equals(action)){if(existing!=null&&!DocumentsContract.deleteDocument(getContext().getContentResolver(),uri(root,existing)))throw new Exception("Cannot remove archive file");}
        else if("write".equals(action)){String value=call.getString("value");if(value==null||value.getBytes(StandardCharsets.UTF_8).length>1024*1024)throw new Exception("Archive block exceeds size limit");if(existing!=null)throw new Exception("Archive block already exists");String made=child(root,shard,name,true,false);write(root,made,value);}
        else throw new Exception("Invalid archive operation");call.resolve(out);
    }catch(Exception error){call.reject(error.getMessage(),error);}});}
    private List<StorageVolume> writableVolumes(){
        List<StorageVolume> volumes=new ArrayList<>();if(Build.VERSION.SDK_INT<24)return volumes;
        StorageManager manager=(StorageManager)getContext().getSystemService(android.content.Context.STORAGE_SERVICE);
        if(manager!=null)for(StorageVolume item:manager.getStorageVolumes())if(item.isRemovable()&&item.getUuid()!=null&&Environment.MEDIA_MOUNTED.equals(item.getState()))volumes.add(item);
        return volumes;
    }
    @PluginMethod public void pick(PluginCall call){try{String reconnect=call.getString("reconnect");String prior=reconnect==null?null:prefs().getString(identity(reconnect),null);if(reconnect!=null&&prior==null)throw new Exception("Unknown archive location");
        List<StorageVolume> volumes=writableVolumes();if(volumes.isEmpty())throw new Exception("Insert a writable SD card to choose a location");
        Intent intent=Build.VERSION.SDK_INT>=29?volumes.get(0).createOpenDocumentTreeIntent():new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        if(prior!=null&&Build.VERSION.SDK_INT>=26)intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI,Uri.parse(new JSONObject(prior).getString("tree")));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);startActivityForResult(call,intent,"picked");}catch(Exception error){call.reject(error.getMessage(),error);}}
    @ActivityCallback private void picked(PluginCall call,ActivityResult result){if(call==null)return;if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){call.resolve();return;}IO.execute(()->{try{Uri tree=result.getData().getData();if(tree==null||!"com.android.externalstorage.documents".equals(tree.getAuthority()))throw new Exception("Choose a folder on a removable SD card");String document=DocumentsContract.getTreeDocumentId(tree),volume=document.split(":",2)[0];boolean removable=false;for(StorageVolume item:writableVolumes())if(item.getUuid().equalsIgnoreCase(volume))removable=true;if(!removable)throw new Exception("Choose a folder on a removable SD card");int flags=result.getData().getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);if(flags!=(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION))throw new Exception("The folder is read-only");getContext().getContentResolver().takePersistableUriPermission(tree,flags);
        String reconnect=call.getString("reconnect"),id=reconnect==null?UUID.randomUUID().toString():identity(reconnect);if(reconnect!=null&&prefs().getString(id,null)==null)throw new Exception("Unknown archive location");JSONObject root=new JSONObject();root.put("tree",tree.toString());String folder=child(root,document,"Chatbox-Archive-"+id,reconnect==null,true);if(folder==null)throw new Exception("Choose the original archive folder’s parent");root.put("document",folder);root.put("name",volume+" / Chatbox-Archive-"+id);String marker=child(root,folder,"archive-id",reconnect==null,false);if(reconnect==null)write(root,marker,id);else if(marker==null||!id.equals(read(root,marker)))throw new Exception("Archive folder identity changed");prefs().edit().putString(id,root.toString()).commit();JSObject out=new JSObject();out.put("id",id);out.put("name",root.getString("name"));call.resolve(out);
    }catch(Exception error){call.reject(error.getMessage(),error);}});}
}
