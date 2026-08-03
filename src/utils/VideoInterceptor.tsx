import React, { useRef, useEffect } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export const VideoInterceptor = ({ targetUrl, fileName, onComplete, onLog, onError, onSuccess }: { targetUrl: string, fileName: string, onComplete: () => void, onLog?: (msg: string) => void, onError?: (msg: string) => void, onSuccess?: (url: string) => void }) => {
  const webViewRef = useRef(null);

  useEffect(() => {
    onLog?.(`[VideoInterceptor] Initialized for: ${targetUrl}`);
    
    const timeout = setTimeout(() => {
      onLog?.(`[VideoInterceptor] 15s Timeout reached. Failed to intercept video URL.`);
      onError?.(`Timeout: Could not find a valid video stream. The site might be using blob URLs or iframe players.`);
      onComplete(); // clean up
    }, 15000);

    return () => clearTimeout(timeout);
  }, [targetUrl]);

  const INJECTED_JAVASCRIPT = `
    (function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: 'Injected script started. Hooking network requests...' }));
      
      var origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === 'string' && (url.includes('.m3u8') || url.includes('.mp4'))) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: 'Intercepted XHR: ' + url }));
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', url: url }));
        }
        return origOpen.apply(this, arguments);
      };

      var origFetch = window.fetch;
      window.fetch = async function() {
        var url = arguments[0];
        if (typeof url === 'string' && (url.includes('.m3u8') || url.includes('.mp4'))) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: 'Intercepted Fetch: ' + url }));
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', url: url }));
        }
        return origFetch.apply(this, arguments);
      };

      var attempts = 0;
      var checkVideo = setInterval(function() {
        attempts++;
        var video = document.querySelector('video');
        if (video && video.src && !video.src.startsWith('blob:')) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: 'Found direct video URL! (' + video.src + ')' }));
          clearInterval(checkVideo);
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', url: video.src }));
        } else if (attempts % 5 === 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: 'Searching for video stream... (Attempt ' + attempts + ')' }));
        }
      }, 1000);
      
      setTimeout(function() { clearInterval(checkVideo); }, 14500);
    })();
    true;
  `;

  return (
    <View style={{ height: 0, width: 0, opacity: 0 }}>
      <WebView
        ref={webViewRef}
        source={{ uri: targetUrl }}
        injectedJavaScript={INJECTED_JAVASCRIPT}
        onLoadStart={() => onLog?.(`[WebView] Load Started`)}
        onLoadEnd={() => onLog?.(`[WebView] Load Ended`)}
        onError={(e) => {
          onLog?.(`[WebView Error] ${e.nativeEvent.description}`);
          onError?.(`WebView failed to load: ${e.nativeEvent.description}`);
          onComplete();
        }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'log') {
               onLog?.(`[Injected] ${data.message}`);
            } else if (data.type === 'success') {
               const videoUrl = data.url;
               onLog?.(`[Interceptor] Intercepted successfully: ${videoUrl}`);
               onSuccess?.(videoUrl);
               onComplete(); // Clean up target state
            }
          } catch (e) {
            // legacy fallback
            const videoUrl = event.nativeEvent.data;
            if (videoUrl.startsWith('http')) {
               onLog?.(`[Interceptor] Intercepted successfully (legacy): ${videoUrl}`);
               onSuccess?.(videoUrl);
               onComplete();
            }
          }
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />
    </View>
  );
};