interface RequestArguments {
  method: string;
  params?: unknown[] | object;
}

interface EthereumProvider {
  request(args: RequestArguments): Promise<unknown>;
  on(eventName: string, listener: (...args: any[]) => void): void;
  removeListener(eventName: string, listener: (...args: any[]) => void): void;
  isConnected(): boolean;
  selectedAddress?: string;
  chainId?: string;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export {};
