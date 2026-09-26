export const APP_CONFIG = {
  version: "0.1.0",
  brandName: "BridgeWork EU",
  // Примітка: Юридичні реквізити та гаманці потребують документального підтвердження перед Production
  legalEntity: "Vanguard Global Mobility S.R.O. (PENDING_VERIFICATION)",
  registrationNumber: "CZ28941562",
  legalAddress: "Rybná 716/24, Staré Město, 110 00 Praha 1, Czech Republic",
  supportEmail: "compliance@vanguard-mobility.eu",
  supportPhone: "+420 770 347 160",
  usdtWallet: "TQfUrAHJREmdXwDfsRZb2PaCDXYfP99LDR",
  usdtNetwork: "TRC-20 (TRON Network)"
} as const;

export type AppConfig = typeof APP_CONFIG;
