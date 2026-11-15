package io.github.n3me5is.chatboxvenice;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises the native 50 MiB policy without allocating a file-sized array. */
@RunWith(AndroidJUnit4.class)
public class SessionFolderDeviceTest {
 static class PatternStream extends InputStream {long remaining;int maximumRead;PatternStream(long bytes){remaining=bytes;}public int read(){if(remaining==0)return -1;remaining--;return 53;}public int read(byte[] b,int offset,int length){maximumRead=Math.max(maximumRead,length);if(remaining==0)return -1;int count=(int)Math.min(remaining,length);java.util.Arrays.fill(b,offset,offset+count,(byte)53);remaining-=count;return count;}public long skip(long length){long count=Math.min(remaining,length);remaining-=count;return count;}}
 @Test public void hashesExactlyFiftyMiBWithSixtyFourKiBBuffers()throws Exception{PatternStream source=new PatternStream(SessionFolderPlugin.KNOWLEDGE_MAX_BYTES);SessionFolderPlugin.SourceDigest result=SessionFolderPlugin.digestSource(source,SessionFolderPlugin.KNOWLEDGE_MAX_BYTES);assertEquals(50L*1024*1024,result.bytes);assertEquals(64,result.hash.length());assertTrue(source.maximumRead<=65536);}
 @Test public void rejectsOneByteOverSourceLimit()throws Exception{try{SessionFolderPlugin.digestSource(new PatternStream(50L*1024*1024+1),SessionFolderPlugin.KNOWLEDGE_MAX_BYTES);fail("Oversized source accepted");}catch(Exception error){assertTrue(error.getMessage().contains("50 MB"));}}
 @Test public void readsTheLastChunkAndRejectsUnboundedRanges()throws Exception{byte[] last=SessionFolderPlugin.sourceChunk(new PatternStream(50L*1024*1024),49*1024*1024,1024*1024);assertEquals(1024*1024,last.length);assertEquals(53,last[0]);assertEquals(53,last[last.length-1]);for(int[] range:new int[][]{{-1,1},{0,0},{0,1024*1024+1},{50*1024*1024,1}}){try{SessionFolderPlugin.sourceChunk(new PatternStream(50L*1024*1024),range[0],range[1]);fail("Invalid range accepted");}catch(Exception error){assertTrue(error.getMessage().contains("range"));}}}
}
