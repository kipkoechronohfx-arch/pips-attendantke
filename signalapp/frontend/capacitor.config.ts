import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.forexsignalpro.app',
  appName: 'Forex Signal Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
