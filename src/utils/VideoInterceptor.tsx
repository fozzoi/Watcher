import React, { useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { startDownload } from './downloadManager'; 

export const VideoInterceptor = ({ targetUrl, fileName, onComplete }: { targetUrl: string, fileName: string, onComplete: () => void }) => {
  const webViewRef = useRef(null);

  const INJECTED_JAVASCRIPT = `
    (function() {
      var checkVideo = setInterval(function() {
        var video = document.querySelector('video');
        if (video && video.src && !video.src.startsWith('blob:')) {
          clearInterval(checkVideo);
          window.ReactNativeWebView.postMessage(video.src);
        }
      }, 1000);
      
      // Stop trying after 15 seconds to prevent infinite loops
      setTimeout(function() { clearInterval(checkVideo); }, 15000);
    })();
    true;
  `;

  return (
    <View style={{ height: 0, width: 0, opacity: 0 }}>
      <WebView
        ref={webViewRef}
        source={{ uri: targetUrl }}
        injectedJavaScript={INJECTED_JAVASCRIPT}
        onMessage={(event) => {
          const videoUrl = event.nativeEvent.data;
          console.log('Intercepted URL:', videoUrl);
          startDownload(videoUrl, fileName);
          onComplete(); // Clean up target state
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />
    </View>
  );
};