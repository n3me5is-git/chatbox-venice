package io.github.n3me5is.chatboxvenice;

import android.app.KeyguardManager;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import org.junit.Before;
import static org.junit.Assert.*;

/** Disposable CI devices only. Never remove the PIN or relax production key protection. */
public abstract class EmulatorDeviceFixture {
    private void shell(String command) throws Exception {
        try (InputStream output=new ParcelFileDescriptor.AutoCloseInputStream(
                InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command))) {
            byte[] buffer=new byte[1024];
            while(output.read(buffer)!=-1) { /* Wait for command completion. */ }
        }
    }

    @Before public final void awaitUnlockedEmulator() throws Exception {
        assertTrue("This fixture must only run on a disposable emulator",
            Build.HARDWARE.contains("ranchu")||Build.HARDWARE.contains("goldfish")||Build.FINGERPRINT.contains("generic"));
        KeyguardManager keyguard=InstrumentationRegistry.getInstrumentation().getTargetContext().getSystemService(KeyguardManager.class);
        assertTrue("CI must configure its synthetic device PIN before instrumentation",keyguard.isDeviceSecure());
        shell("input keyevent 224");
        for(int attempt=0;attempt<3;attempt++) {
            if(!keyguard.isDeviceLocked()&&!keyguard.isKeyguardLocked()) return;
            shell("wm dismiss-keyguard");
            shell("input swipe 500 1600 500 300 400");
            SystemClock.sleep(750);
            if(keyguard.isDeviceLocked()) {
                // This public, synthetic PIN belongs only to the newly created CI emulator.
                shell("input text 123456");
                shell("input keyevent 66");
            }
            for(int poll=0;poll<40;poll++) {
                if(!keyguard.isDeviceLocked()&&!keyguard.isKeyguardLocked()) return;
                SystemClock.sleep(250);
            }
        }
        fail("CI emulator remained locked after entering its synthetic PIN; product probes were not started");
    }
}
