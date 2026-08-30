export interface MoluRuntimeStore {
  FORMAT: number;
  usable: boolean;
  loadSync: () => { books: unknown[]; savedAt: string; format: number } | null;
  loadAsync: () => Promise<null>;
  save: (books: unknown[]) => Promise<{ ls: boolean; idb: boolean; savedAt: string; error?: string }>;
  describe: () => string;
}

export function bootMoluApp(host: HTMLElement, store: MoluRuntimeStore): () => void;
