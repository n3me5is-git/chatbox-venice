package io.github.n3me5is.chatboxvenice;

import android.app.KeyguardManager;
import android.content.Context;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.fingerprint.FingerprintManager;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

@CapacitorPlugin(name="VaultKey")
public class VaultKeyPlugin extends Plugin {
    private static final String DEVICE="chatbox_venice_device_vault_v1";
    private boolean biometricAvailable() {
        if (Build.VERSION.SDK_INT >= 30) {
            BiometricManager manager=getContext().getSystemService(BiometricManager.class);
            return manager!=null && manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)==BiometricManager.BIOMETRIC_SUCCESS;
        }
        if (Build.VERSION.SDK_INT >= 28) {
            FingerprintManager manager=getContext().getSystemService(FingerprintManager.class);
            return manager!=null && manager.isHardwareDetected() && manager.hasEnrolledFingerprints();
        }
        return false;
    }
    @PluginMethod public void capabilities(PluginCall call) {
        KeyguardManager manager=(KeyguardManager)getContext().getSystemService(Context.KEYGUARD_SERVICE);
        JSObject result=new JSObject();result.put("encryption",Build.VERSION.SDK_INT>=23 && manager!=null && manager.isDeviceSecure());result.put("biometric",biometricAvailable());result.put("name","Device biometrics");call.resolve(result);
    }
    private synchronized SecretKey key(String alias,boolean create,boolean biometric) throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if (store.containsAlias(alias)) return (SecretKey)store.getKey(alias,null);
        if (!create) throw new Exception("The device key is unavailable. Restore an encrypted backup.");
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        KeyGenParameterSpec.Builder spec=new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE);
        // Android 12–14 do not reliably re-authorize these keys after a biometric unlock.
        // Keep existing aliases intact; only newly generated keys use the corrected policy.
        if (Build.VERSION.SDK_INT>=35) spec.setUnlockedDeviceRequired(true);
        if (biometric) {
            spec.setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true);
            if (Build.VERSION.SDK_INT>=30) spec.setUserAuthenticationParameters(0,KeyProperties.AUTH_BIOMETRIC_STRONG);
            else spec.setUserAuthenticationValidityDurationSeconds(-1);
        }
        generator.init(spec.build());return generator.generateKey();
    }
    private void authenticate(PluginCall call,Cipher cipher,java.util.function.Consumer<Cipher> complete) {
        if (Build.VERSION.SDK_INT<28 || !biometricAvailable()) {call.reject("Device biometrics are unavailable or not enrolled");return;}
        getActivity().runOnUiThread(()->{
            BiometricPrompt prompt=new BiometricPrompt.Builder(getActivity()).setTitle(call.getString("title","Unlock Chatbox Venice")).setSubtitle(call.getString("subtitle","Access protected content")).setNegativeButton(call.getString("cancel","Cancel"),getActivity().getMainExecutor(),(dialog,which)->call.reject("Device authentication canceled", "AUTH_CANCELED")).build();
            prompt.authenticate(new BiometricPrompt.CryptoObject(cipher),new CancellationSignal(),getActivity().getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()==null){call.reject("Missing authenticated cipher");return;}complete.accept(result.getCryptoObject().getCipher()); }
                @Override public void onAuthenticationError(int code,CharSequence message) {call.reject(message.toString(), "AUTH_"+code);}
            });
        });
    }
    @PluginMethod public void protect(PluginCall call) {
        KeyguardManager manager=(KeyguardManager)getContext().getSystemService(Context.KEYGUARD_SERVICE);
        if(Build.VERSION.SDK_INT<23||manager==null||!manager.isDeviceSecure()){call.reject("Configure a device screen lock before enabling encryption");return;}
        String value=call.getString("value");boolean biometric=Boolean.TRUE.equals(call.getBoolean("biometric",false));
        if(value==null||value.length()<1||value.length()>16384){call.reject("Invalid protected-key request");return;}
        String alias=biometric?"chatbox_venice_bio_"+UUID.randomUUID().toString():DEVICE;
        try {
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key(alias,true,biometric));
            java.util.function.Consumer<Cipher> complete=(authenticated)->{try{authenticated.updateAAD(("chatbox-vault-v1:"+alias).getBytes(StandardCharsets.UTF_8));JSONObject envelope=new JSONObject();envelope.put("version",1);envelope.put("alias",alias);envelope.put("iv",Base64.encodeToString(authenticated.getIV(),Base64.NO_WRAP));envelope.put("data",Base64.encodeToString(authenticated.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));JSObject result=new JSObject();result.put("value",envelope.toString());call.resolve(result);}catch(Exception error){call.reject("Could not protect the device key ("+error.getClass().getSimpleName()+")", "KEY_PROTECT_FAILED");}};
            if(biometric)authenticate(call,cipher,complete);else complete.accept(cipher);
        }catch(Exception error){call.reject("Device encryption is unavailable ("+error.getClass().getSimpleName()+")", "KEY_INIT_FAILED");}
    }
    @PluginMethod public void unprotect(PluginCall call) {
        String value=call.getString("value");if(value==null||value.length()>32768){call.reject("Invalid protected key");return;}
        try {
            JSONObject envelope=new JSONObject(value);String alias=envelope.getString("alias");
            boolean biometric=alias.matches("chatbox_venice_bio_[a-f0-9-]{36}");
            if(envelope.getInt("version")!=1||(!DEVICE.equals(alias)&&!biometric))throw new Exception("Invalid key alias");
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(alias,false,biometric),new GCMParameterSpec(128,Base64.decode(envelope.getString("iv"),Base64.NO_WRAP)));
            byte[] data=Base64.decode(envelope.getString("data"),Base64.NO_WRAP);
            java.util.function.Consumer<Cipher> complete=(authenticated)->{try{authenticated.updateAAD(("chatbox-vault-v1:"+alias).getBytes(StandardCharsets.UTF_8));JSObject result=new JSObject();result.put("value",new String(authenticated.doFinal(data),StandardCharsets.UTF_8));call.resolve(result);}catch(Exception error){call.reject("The device could not unlock this key. Restore an encrypted backup.", "KEY_UNLOCK_FAILED");}};
            if(biometric)authenticate(call,cipher,complete);else complete.accept(cipher);
        }catch(Exception error){call.reject("The device key is unavailable. Restore an encrypted backup.");}
    }
}
