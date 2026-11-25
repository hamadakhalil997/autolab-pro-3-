export {};

declare global {
  interface Window {
    autoLabDesktop?: {
      getRuntimeInfo: () => Promise<{
        platform: string;
        arch: string;
        appVersion: string;
        runtime: string;
        nativeWindowsHost: boolean;
        vciSdkReady: boolean;
      }>;
      getVciCapabilities: () => Promise<{
        available: boolean;
        transport: string;
        reason: string;
      }>;
    };
  }
}
