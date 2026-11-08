package io.github.n3me5is.chatboxvenice;

import android.os.Build;
import android.security.keystore.KeyInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.lang.reflect.Method;
import java.security.KeyStore;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

/** Executes the production key-generation method against the Android Keystore service. */
@RunWith(AndroidJUnit4.class)
public class VaultKeyDeviceTest extends EmulatorDeviceFixture {
    @Test public void productionDeviceKeyRoundTripAndReload() throws Exception {
        String alias="chatbox_test_"+UUID.randomUUID();
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        try {
            VaultKeyPlugin plugin=new VaultKeyPlugin();
            Method method=VaultKeyPlugin.class.getDeclaredMethod("key",String.class,boolean.class,boolean.class);method.setAccessible(true);
            SecretKey key=(SecretKey)method.invoke(plugin,alias,true,false);
            assertNull("A device key must not be exportable",key.getEncoded());
            KeyInfo info=(KeyInfo)SecretKeyFactory.getInstance("AES","AndroidKeyStore").getKeySpec(key,KeyInfo.class);
            assertFalse(info.isUserAuthenticationRequired());
            byte[] plain="synthetic-test-key-never-a-user-secret".getBytes(StandardCharsets.UTF_8),aad=("chatbox-vault-v1:"+alias).getBytes(StandardCharsets.UTF_8);
            Cipher encrypt=Cipher.getInstance("AES/GCM/NoPadding");encrypt.init(Cipher.ENCRYPT_MODE,key);encrypt.updateAAD(aad);byte[] encrypted=encrypt.doFinal(plain);
            SecretKey reloaded=(SecretKey)method.invoke(plugin,alias,false,false);
            Cipher decrypt=Cipher.getInstance("AES/GCM/NoPadding");decrypt.init(Cipher.DECRYPT_MODE,reloaded,new GCMParameterSpec(128,encrypt.getIV()));decrypt.updateAAD(aad);
            assertArrayEquals(plain,decrypt.doFinal(encrypted));
            encrypted[0]^=1;Cipher tampered=Cipher.getInstance("AES/GCM/NoPadding");tampered.init(Cipher.DECRYPT_MODE,reloaded,new GCMParameterSpec(128,encrypt.getIV()));tampered.updateAAD(aad);
            try {tampered.doFinal(encrypted);fail("Modified ciphertext was accepted");}catch(javax.crypto.AEADBadTagException expected){}
        } finally {store.deleteEntry(alias);}
    }
}
