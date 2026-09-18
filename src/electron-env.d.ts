interface HardwareInfo {
  ramTotal: number;
  ramFree: number;
  vramTotal: number;
}

interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  supportsTools?: boolean;
}

interface Window {
  electronAPI: {
    getHardwareInfo: () => Promise<any>;
    selectGgufFile: () => Promise<string | null>;
    selectWorkspace: () => Promise<string | null>;
    readWorkspace: (path: string) => Promise<any>;
    getOllamaTags: () => Promise<any>;
    deleteOllamaModel: (name: string) => Promise<boolean>;
    createOllamaModel: (name: string, modelfile: string) => Promise<boolean>;
    pullOllamaModel: (name: string) => Promise<boolean>;
    chatOllamaModel: (paneId: string, model: string, messages: any[], workspacePath: string | null, supportsTools: boolean) => Promise<any>;
    executeTool: (name: string, args: any, workspacePath: string | null) => Promise<string>;
    resolveOllamaChatApproval: (requestId: string, approved: boolean, feedback: string) => Promise<void>;
    gitStatus: (cwd: string) => Promise<string | null>;
    readFileContent: (path: string) => Promise<string>;
    writeFileContent: (path: string, content: string) => Promise<boolean>;
    createFile: (folderPath: string, name: string) => Promise<boolean>;
    createFolder: (folderPath: string, name: string) => Promise<boolean>;
    deletePath: (path: string) => Promise<boolean>;
    renamePath: (oldPath: string, newName: string) => Promise<boolean>;
    executeCommandStream: (command: string, cwd: string) => Promise<boolean>;
    onTerminalOutput: (callback: (data: string) => void) => void;
    onWorkspaceChanged: (callback: (path: string) => void) => void;
    onOllamaCreateProgress: (callback: (data: any) => void) => void;
    onOllamaPullProgress: (callback: (data: any) => void) => void;
    onOllamaChatStream: (paneId: string, callback: (data: any) => void) => void;
    onOllamaChatRequireApproval: (paneId: string, callback: (data: any) => void) => void;
    onOllamaChatRequireApprovalGlobal: (callback: (data: any) => void) => void;
    onOllamaChatFileRead: (callback: (data: { path: string; content: string }) => void) => void;
    onOllamaChatToolQueue: (paneId: string, callback: (data: any) => void) => void;
    onOllamaChatToolStep: (paneId: string, callback: (data: any) => void) => void;
    onOllamaChatToolQueueDone: (paneId: string, callback: (data: any) => void) => void;
    removeAllListeners: (channel: string) => void;
  };
}
