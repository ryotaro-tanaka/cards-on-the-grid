export const DEFAULT_MANIFEST_PATH = '/manifest.webmanifest';
export const DEFAULT_SERVICE_WORKER_PATH = '/sw.js';

export type PwaMetadataOptions = {
  manifestPath?: string;
  themeColor?: string;
};

export type RegisterServiceWorkerOptions = {
  serviceWorkerPath?: string;
};

export function attachPwaMetadata(head: Pick<HTMLHeadElement, 'querySelector' | 'appendChild'>, options: PwaMetadataOptions = {}): void {
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const themeColor = options.themeColor ?? '#0f172a';

  let manifestLink = head.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!manifestLink) {
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    head.appendChild(manifestLink);
  }
  manifestLink.href = manifestPath;

  let themeMeta = head.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!themeMeta) {
    themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    head.appendChild(themeMeta);
  }
  themeMeta.content = themeColor;
}

export async function registerServiceWorker(options: RegisterServiceWorkerOptions = {}): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  const serviceWorkerPath = options.serviceWorkerPath ?? DEFAULT_SERVICE_WORKER_PATH;
  await navigator.serviceWorker.register(serviceWorkerPath);
  return true;
}
