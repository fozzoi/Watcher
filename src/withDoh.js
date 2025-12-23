const { withAppBuildGradle, withMainApplication, withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withDoh = (config) => {
  return withPlugins(config, [
    // 1. Add Gradle Dependency
    (config) => {
      return withAppBuildGradle(config, (config) => {
        if (!config.modResults.contents.includes('okhttp-dnsoverhttps')) {
          config.modResults.contents += `\ndependencies { implementation("com.squareup.okhttp3:okhttp-dnsoverhttps:4.9.3") }\n`;
        }
        return config;
      });
    },
    // 2. Create the Java Factory File
    (config) => {
      return withDangerousMod(config, [
        'android',
        async (config) => {
          const packageName = config.android.package;
          const packagePath = packageName.replace(/\./g, '/');
          const folder = path.join(config.modRequest.platformProjectRoot, `app/src/main/java/${packagePath}`);
          
          const javaCode = `
package ${packageName};
import androidx.annotation.Nullable;
import android.content.Context;
import com.facebook.react.modules.network.OkHttpClientFactory;
import okhttp3.OkHttpClient;
import okhttp3.dnsoverhttps.DnsOverHttps;
import okhttp3.HttpUrl;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.List;

public class CustomClientFactory implements OkHttpClientFactory {
    @Override
    public OkHttpClient createNewNetworkModuleClient() {
        OkHttpClient.Builder builder = new OkHttpClient.Builder();
        DnsOverHttps dns = new DnsOverHttps.Builder().client(builder.build())
                .url(HttpUrl.get("https://1.1.1.1/dns-query"))
                .bootstrapDnsHosts(getByIp("1.1.1.1"), getByIp("1.0.0.1"))
                .build();
        builder.dns(dns);
        return builder.build();
    }
    private List<InetAddress> getByIp(String ip) {
        try { return Arrays.asList(InetAddress.getAllByName(ip)); } 
        catch (UnknownHostException e) { return null; }
    }
}`;
          fs.writeFileSync(path.join(folder, 'CustomClientFactory.java'), javaCode);
          return config;
        },
      ]);
    },
    // 3. Inject into MainApplication.java (using regex)
    (config) => {
      return withMainApplication(config, (config) => {
        const src = config.modResults.contents;
        // Add Import
        const importStatement = 'import com.facebook.react.modules.network.OkHttpClientProvider;';
        if (!src.includes(importStatement)) {
             config.modResults.contents = src.replace('package ', `${importStatement}\npackage `);
        }
        
        // Add Hook inside onCreate
        const hook = 'OkHttpClientProvider.setOkHttpClientFactory(new CustomClientFactory());';
        if (!src.includes(hook)) {
            // Find onCreate and inject at the start of it
            config.modResults.contents = config.modResults.contents.replace(
                'super.onCreate();',
                `super.onCreate();\n    ${hook}`
            );
        }
        return config;
      });
    }
  ]);
};

module.exports = withDoh;