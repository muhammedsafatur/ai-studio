import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareInfo: () => ipcRenderer.invoke('get-hardware-info'),
  selectGgufFile: () => ipcRenderer.invoke('select-gguf-file'),
  selectWorkspace: () => ipcRenderer.invoke('select-workspace'),
  readWorkspace: (path: string) => ipcRenderer.invoke('read-workspace', path),
  getOllamaTags: () => ipcRenderer.invoke('ollama-tags'),
  deleteOllamaModel: (name: string) => ipcRenderer.invoke('ollama-delete', name),
  createOllamaModel: (name: string, modelfile: string) => ipcRenderer.invoke('ollama-create', { name, modelfile }),
  pullOllamaModel: (name: string) => ipcRenderer.invoke('ollama-pull', name),
  chatOllamaModel: (paneId: string, model: string, messages: any[], workspacePath: string | null, supportsTools: boolean) => ipcRenderer.invoke('ollama-chat', { paneId, model, messages, workspacePath, supportsTools }),
  executeTool: (name: string, args: any, workspacePath: string | null) => ipcRenderer.invoke('execute-tool', { name, args, workspacePath }),
  resolveOllamaChatApproval: (requestId: string, approved: boolean, feedback: string) => ipcRenderer.invoke('ollama-chat-resolve-approval', { requestId, approved, feedback }),
  gitStatus: (cwd: string) => ipcRenderer.invoke('git-status', cwd),
  readFileContent: (path: string) => ipcRenderer.invoke('read-file-content', path),
  writeFileContent: (path: string, content: string) => ipcRenderer.invoke('write-file-content', { path, content }),
  createFile: (folderPath: string, name: string) => ipcRenderer.invoke('create-file', { folderPath, name }),
  createFolder: (folderPath: string, name: string) => ipcRenderer.invoke('create-folder', { folderPath, name }),
  deletePath: (path: string) => ipcRenderer.invoke('delete-path', path),
  renamePath: (oldPath: string, newName: string) => ipcRenderer.invoke('rename-path', { oldPath, newName }),
  executeCommandStream: (command: string, cwd: string) => ipcRenderer.invoke('execute-command-stream', { command, cwd }),
  onTerminalOutput: (callback: (data: string) => void) => {
    ipcRenderer.on('terminal-output', (_event, data) => callback(data));
  },
  onWorkspaceChanged: (callback: (path: string) => void) => {
    ipcRenderer.on('workspace-changed', (_event, data) => callback(data));
  },
  onOllamaCreateProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('ollama-create-progress', (_event, data) => callback(data));
  },
  onOllamaPullProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('ollama-pull-progress', (_event, data) => callback(data));
  },
  onOllamaChatRequireApprovalGlobal: (callback: (data: any) => void) => {
    ipcRenderer.on('ollama-chat-require-approval-global', (_event, data) => callback(data));
  },
  onOllamaChatFileRead: (callback: (data: { path: string; content: string }) => void) => {
    ipcRenderer.on('ollama-chat-file-read', (_event, data) => callback(data));
  },
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
});
