import React from 'react';
import ReactDOM from 'react-dom/client';
import * as vkBridgeModule from '@vkontakte/vk-bridge';
import { ConfigProvider, AdaptivityProvider, AppRoot } from '@vkontakte/vkui';
import '@vkontakte/vkui/dist/vkui.css';
import App from './App.tsx';

const vkBridge = vkBridgeModule.default || vkBridgeModule;

// Initialize VK Mini App Bridge
try {
  vkBridge.send('VKWebAppInit');
} catch (e) { }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <AdaptivityProvider>
        <AppRoot>
          <App />
        </AppRoot>
      </AdaptivityProvider>
    </ConfigProvider>
  </React.StrictMode>
);
