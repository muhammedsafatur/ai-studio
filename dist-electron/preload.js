"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getHardwareInfo: () => electron_1.ipcRenderer.invoke('get-hardware-info'),
    selectGgufFile: () => electron_1.ipcRenderer.invoke('select-gguf-file'),
    selectWorkspace: () => electron_1.ipcRenderer.invoke('select-workspace'),
    readWorkspace: (path) => electron_1.ipcRenderer.invoke('read-workspace', path),
    getOllamaTags: () => electron_1.ipcRenderer.invoke('ollama-tags'),
    deleteOllamaModel: (name) => electron_1.ipcRenderer.invoke('ollama-delete', name),
    createOllamaModel: (name, modelfile) => electron_1.ipcRenderer.invoke('ollama-create', { name, modelfile }),
    pullOllamaModel: (name) => electron_1.ipcRenderer.invoke('ollama-pull', name),
    chatOllamaModel: (paneId, model, messages, workspacePath, supportsTools) => electron_1.ipcRenderer.invoke('ollama-chat', { paneId, model, messages, workspacePath, supportsTools }),
    executeTool: (name, args, workspacePath) => electron_1.ipcRenderer.invoke('execute-tool', { name, args, workspacePath }),
    resolveOllamaChatApproval: (requestId, approved, feedback) => electron_1.ipcRenderer.invoke('ollama-chat-resolve-approval', { requestId, approved, feedback }),
    gitStatus: (cwd) => electron_1.ipcRenderer.invoke('git-status', cwd),
    readFileContent: (path) => electron_1.ipcRenderer.invoke('read-file-content', path),
    writeFileContent: (path, content) => electron_1.ipcRenderer.invoke('write-file-content', { path, content }),
    createFile: (folderPath, name) => electron_1.ipcRenderer.invoke('create-file', { folderPath, name }),
    createFolder: (folderPath, name) => electron_1.ipcRenderer.invoke('create-folder', { folderPath, name }),
    deletePath: (path) => electron_1.ipcRenderer.invoke('delete-path', path),
    renamePath: (oldPath, newName) => electron_1.ipcRenderer.invoke('rename-path', { oldPath, newName }),
    executeCommandStream: (command, cwd) => electron_1.ipcRenderer.invoke('execute-command-stream', { command, cwd }),
    onTerminalOutput: (callback) => {
        electron_1.ipcRenderer.on('terminal-output', (_event, data) => callback(data));
    },
    onWorkspaceChanged: (callback) => {
        electron_1.ipcRenderer.on('workspace-changed', (_event, data) => callback(data));
    },
    onOllamaCreateProgress: (callback) => {
        electron_1.ipcRenderer.on('ollama-create-progress', (_event, data) => callback(data));
    },
    onOllamaPullProgress: (callback) => {
        electron_1.ipcRenderer.on('ollama-pull-progress', (_event, data) => callback(data));
    },
    onOllamaChatRequireApprovalGlobal: (callback) => {
        electron_1.ipcRenderer.on('ollama-chat-require-approval-global', (_event, data) => callback(data));
    },
    onOllamaChatFileRead: (callback) => {
        electron_1.ipcRenderer.on('ollama-chat-file-read', (_event, data) => callback(data));
    },
    removeAllListeners: (channel) => electron_1.ipcRenderer.removeAllListeners(channel)
});
