export interface ElectronConfig {
  isConfigured: boolean;
  rpcPreview:   string;
}

export interface ElectronFullConfig {
  rpcUrl:      string;
  blockEngine: string;
}

export interface ElectronAPI {
  isElectron:   true;
  getConfig:    () => Promise<ElectronConfig>;
  getFullConfig:() => Promise<ElectronFullConfig>;
  saveConfig:   (cfg: {
    signerKey:   string;
    funderKey:   string;
    rpcUrl:      string;
    blockEngine: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  updateConfig: (cfg: {
    rpcUrl:      string;
    blockEngine: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
