"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const si = __importStar(require("systeminformation"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
let mainWindow = null;
async function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// Hardware info handler
electron_1.ipcMain.handle('get-hardware-info', async () => {
    try {
        const mem = await si.mem();
        let vramTotal = 0;
        let vramUsed = 0;
        try {
            const { stdout } = await execAsync('nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits');
            const parts = stdout.trim().split(',').map(s => parseInt(s.trim(), 10));
            if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                vramUsed = parts[0];
                vramTotal = parts[1];
            }
        }
        catch {
            // nvidia-smi unavailable — fall back to static total from systeminformation
            const graphics = await si.graphics();
            if (graphics.controllers?.length > 0) {
                graphics.controllers.forEach(c => { if (c.vram)
                    vramTotal += c.vram; });
            }
        }
        return {
            ramTotal: mem.total,
            ramUsed: mem.used,
            vramTotal,
            vramUsed,
        };
    }
    catch (error) {
        console.error('Error fetching hardware info:', error);
        return { ramTotal: 0, ramUsed: 0, vramTotal: 0, vramUsed: 0 };
    }
});
// Select GGUF File
electron_1.ipcMain.handle('select-gguf-file', async () => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: 'Select GGUF Model',
        filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
        properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});
// Select Workspace Directory
electron_1.ipcMain.handle('select-workspace', async () => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: 'Select Workspace Directory',
        properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});
// Read Directory recursively (simple tree)
electron_1.ipcMain.handle('read-workspace', async (event, dirPath) => {
    try {
        const buildTree = (currentPath) => {
            const stats = fs.statSync(currentPath);
            const name = path.basename(currentPath);
            if (stats.isDirectory()) {
                const children = fs.readdirSync(currentPath)
                    .filter(child => !child.startsWith('.') && child !== 'node_modules')
                    .map(child => buildTree(path.join(currentPath, child)));
                return { name, path: currentPath, type: 'directory', children };
            }
            return { name, path: currentPath, type: 'file' };
        };
        return buildTree(dirPath);
    }
    catch (error) {
        console.error('Error reading workspace:', error.message);
        return null;
    }
});
electron_1.ipcMain.handle('read-file-content', async (event, filePath) => {
    try {
        return fs.readFileSync(filePath, 'utf8');
    }
    catch (error) {
        throw new Error(`Failed to read file: ${error.message}`);
    }
});
electron_1.ipcMain.handle('write-file-content', async (event, { path: filePath, content }) => {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    }
    catch (error) {
        throw new Error(`Failed to write file: ${error.message}`);
    }
});
electron_1.ipcMain.handle('create-file', async (event, { folderPath, name }) => {
    try {
        const fullPath = path.join(folderPath, name);
        fs.writeFileSync(fullPath, '', 'utf8');
        return true;
    }
    catch (error) {
        throw new Error(`Failed to create file: ${error.message}`);
    }
});
electron_1.ipcMain.handle('create-folder', async (event, { folderPath, name }) => {
    try {
        const fullPath = path.join(folderPath, name);
        fs.mkdirSync(fullPath, { recursive: true });
        return true;
    }
    catch (error) {
        throw new Error(`Failed to create folder: ${error.message}`);
    }
});
electron_1.ipcMain.handle('delete-path', async (event, targetPath) => {
    try {
        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }
        else {
            fs.unlinkSync(targetPath);
        }
        return true;
    }
    catch (error) {
        throw new Error(`Failed to delete: ${error.message}`);
    }
});
electron_1.ipcMain.handle('git-status', async (event, cwd) => {
    try {
        const { stdout } = await execAsync('git status --short', { cwd });
        return stdout;
    }
    catch (error) {
        // If not a git repo, return null or empty
        return null;
    }
});
electron_1.ipcMain.handle('rename-path', async (event, { oldPath, newName }) => {
    try {
        const newPath = path.join(path.dirname(oldPath), newName);
        fs.renameSync(oldPath, newPath);
        return true;
    }
    catch (error) {
        throw new Error(`Failed to rename: ${error.message}`);
    }
});
electron_1.ipcMain.handle('execute-command-stream', async (event, { command, cwd }) => {
    return new Promise((resolve) => {
        try {
            const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
            const args = process.platform === 'win32' ? ['-Command', command] : ['-c', command];
            const child = (0, child_process_1.spawn)(shell, args, { cwd, shell: true });
            child.stdout.on('data', (data) => {
                mainWindow?.webContents.send('terminal-output', data.toString());
            });
            child.stderr.on('data', (data) => {
                mainWindow?.webContents.send('terminal-output', `\x1b[31m${data.toString()}\x1b[0m`);
            });
            child.on('close', (code) => {
                mainWindow?.webContents.send('terminal-output', `\n[Process exited with code ${code}]\n`);
                resolve(code === 0);
            });
        }
        catch (error) {
            mainWindow?.webContents.send('terminal-output', `\x1b[31mError: ${error.message}\x1b[0m\n`);
            resolve(false);
        }
    });
});
// Ollama API Integration Handlers
const OLLAMA_API_URL = 'http://localhost:11434/api';
electron_1.ipcMain.handle('ollama-tags', async () => {
    const fetchWithTimeout = async (url, opts = {}, ms = 4000) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        try {
            return await fetch(url, { ...opts, signal: ctrl.signal });
        }
        finally {
            clearTimeout(t);
        }
    };
    try {
        const response = await fetchWithTimeout(`${OLLAMA_API_URL}/tags`, {}, 5000);
        if (!response.ok)
            throw new Error(`Failed to fetch tags: ${response.status}`);
        const data = await response.json();
        const rawModels = Array.isArray(data?.models) ? data.models : [];
        const modelsWithCaps = await Promise.all(rawModels.map(async (m) => {
            let supportsTools = false;
            try {
                const showRes = await fetchWithTimeout(`${OLLAMA_API_URL}/show`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: m.name })
                }, 3000);
                if (showRes.ok) {
                    const showData = await showRes.json();
                    const tmpl = showData.template || '';
                    if (tmpl.includes('.Tools') || tmpl.includes('Tools')) {
                        supportsTools = true;
                    }
                }
            }
            catch {
                // /api/show timed out or failed — model still listed, capabilities unknown
            }
            return { ...m, supportsTools };
        }));
        return { models: modelsWithCaps };
    }
    catch (error) {
        console.error('Ollama tags error:', error?.message || error);
        throw error;
    }
});
electron_1.ipcMain.handle('ollama-delete', async (_, name) => {
    try {
        const response = await fetch(`${OLLAMA_API_URL}/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        return response.ok;
    }
    catch (error) {
        console.error('Ollama delete error:', error.message);
        return false;
    }
});
// We can stream create/pull directly from React or Main. 
// However, passing streams over IPC requires specific events.
// The user asked to "yaz" the request in ipcMain. So we'll use a standard IPC event listener to send progress updates to the renderer window.
electron_1.ipcMain.handle('ollama-create', async (event, { name, modelfile }) => {
    try {
        const response = await fetch(`${OLLAMA_API_URL}/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, modelfile })
        });
        if (!response.ok || !response.body)
            throw new Error('Failed to create model');
        // Read stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    mainWindow?.webContents.send('ollama-create-progress', data);
                }
                catch (e) { }
            }
        }
        return true;
    }
    catch (error) {
        console.error('Ollama create error:', error.message);
        throw error;
    }
});
electron_1.ipcMain.handle('ollama-pull', async (event, name) => {
    try {
        const response = await fetch(`${OLLAMA_API_URL}/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!response.ok || !response.body)
            throw new Error('Failed to pull model');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    mainWindow?.webContents.send('ollama-pull-progress', data);
                }
                catch (e) { }
            }
        }
        return true;
    }
    catch (error) {
        console.error('Ollama pull error:', error.message);
        throw error;
    }
});
const tools = [
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Reads the content of a file. Use this IMMEDIATELY when the user asks to check, read, or inspect a specific file or code.",
            parameters: {
                type: "object",
                properties: {
                    file_path: {
                        type: "string",
                        description: "The absolute path to the file. IMPORTANT: Convert all Windows backslashes (\\) to forward slashes (/) before using."
                    }
                },
                required: ["file_path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_dir",
            description: "List the contents of a directory. Use this when the user asks to see what files are in a folder.",
            parameters: {
                type: "object",
                properties: {
                    dir_path: {
                        type: "string",
                        description: "The absolute path to the directory."
                    }
                },
                required: ["dir_path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Write content to a file, overwriting existing content",
            parameters: {
                type: "object",
                properties: {
                    file_path: {
                        type: "string",
                        description: "The absolute path to the file. IMPORTANT: Convert all Windows backslashes (\\) to forward slashes (/) before using."
                    },
                    content: { type: "string", description: "Content to write" }
                },
                required: ["file_path", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "execute_command",
            description: "Execute a terminal command and return the output",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "Terminal command to execute (e.g., npm run build)" }
                },
                required: ["command"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_project",
            description: "Search for files or specific text within the project files",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The string to search for (filename or content)" },
                    dir_path: { type: "string", description: "Optional starting directory path. Defaults to workspace root." },
                    content_search: { type: "boolean", description: "If true, searches within file contents. If false, only searches filenames." }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "open_project",
            description: "Opens a new project directory in the IDE. Use this after creating a new project folder to switch context.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "The absolute path to the project directory to open." }
                },
                required: ["path"]
            }
        }
    }
];
const pendingApprovals = new Map();
electron_1.ipcMain.handle('ollama-chat-resolve-approval', (event, { requestId, approved, feedback }) => {
    const resolve = pendingApprovals.get(requestId);
    if (resolve) {
        resolve({ approved, feedback });
        pendingApprovals.delete(requestId);
    }
});
electron_1.ipcMain.handle('execute-tool', async (event, { name, args, workspacePath }) => {
    const resolveSafePath = (targetPath) => {
        if (!workspacePath)
            return targetPath;
        // Remove leading slash if it exists so path.resolve doesn't treat it as root C:/
        let cleanPath = targetPath;
        if (cleanPath.startsWith('/') || cleanPath.startsWith('\\')) {
            // Sadece tek slash ile basliyorsa temizle (Windows C:/ gibi degilse)
            if (!cleanPath.includes(':')) {
                cleanPath = cleanPath.substring(1);
            }
        }
        // Is it an absolute path already pointing to the workspace?
        if (path.isAbsolute(cleanPath) && cleanPath.toLowerCase().startsWith(workspacePath.toLowerCase())) {
            return path.resolve(cleanPath);
        }
        // Otherwise, treat it as relative to workspace
        const resolvedPath = path.resolve(workspacePath, cleanPath);
        // Final security check
        if (!resolvedPath.toLowerCase().startsWith(path.resolve(workspacePath).toLowerCase())) {
            throw new Error(`Security Error: Path ${targetPath} resolved outside workspace.`);
        }
        return resolvedPath;
    };
    try {
        let result = '';
        if (name === 'read_file') {
            const rawPath = args.file_path || args.path;
            const targetPath = resolveSafePath(rawPath);
            result = fs.readFileSync(targetPath, 'utf8');
            mainWindow?.webContents.send('ollama-chat-file-read', { path: targetPath, content: result });
        }
        else if (name === 'list_dir') {
            const rawPath = args.dir_path || args.path || workspacePath;
            const targetPath = resolveSafePath(rawPath);
            const files = fs.readdirSync(targetPath);
            result = files.join('\n');
        }
        else if (name === 'write_file') {
            const rawPath = args.file_path || args.path;
            const targetPath = resolveSafePath(rawPath);
            const oldContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
            const requestId = Math.random().toString(36).substring(7);
            mainWindow?.webContents.send(`ollama-chat-require-approval-global`, {
                requestId, funcName: name, path: targetPath, oldContent, newContent: args.content
            });
            const approvalResult = await Promise.race([
                new Promise((resolve) => { pendingApprovals.set(requestId, resolve); }),
                new Promise((resolve) => setTimeout(() => resolve({ approved: false, feedback: 'Timeout: User did not respond within 5 minutes.' }), 300000))
            ]);
            if (approvalResult.approved) {
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                fs.writeFileSync(targetPath, args.content, 'utf8');
                result = `File written successfully to ${targetPath}`;
            }
            else {
                result = `User rejected the file write operation. Feedback: ${approvalResult.feedback || 'None'}`;
            }
        }
        else if (name === 'execute_command') {
            const command = args.command;
            const dangerousRegex = /rm\s+-rf|mkfs|dd\s+if|>\s*\/dev\/sd|shutdown|reboot/i;
            if (dangerousRegex.test(command)) {
                throw new Error("Security Error: Dangerous command blocked.");
            }
            const requestId = Math.random().toString(36).substring(7);
            mainWindow?.webContents.send(`ollama-chat-require-approval-global`, {
                requestId, funcName: name, command, path: workspacePath || process.cwd()
            });
            const approvalResult = await Promise.race([
                new Promise((resolve) => { pendingApprovals.set(requestId, resolve); }),
                new Promise((resolve) => setTimeout(() => resolve({ approved: false, feedback: 'Timeout: User did not respond within 5 minutes.' }), 300000))
            ]);
            if (approvalResult.approved) {
                try {
                    const { stdout, stderr } = await execAsync(command, { cwd: workspacePath || process.cwd() });
                    result = `Command Output:\n${stdout}\n${stderr ? 'Errors/Warnings:\n' + stderr : ''}`;
                }
                catch (execError) {
                    result = `Command failed with error:\n${execError.message}`;
                }
            }
            else {
                result = `User rejected the command execution. Feedback: ${approvalResult.feedback || 'None'}`;
            }
        }
        else if (name === 'search_project') {
            const query = args.query;
            const rawPath = args.dir_path || workspacePath || process.cwd();
            const targetPath = resolveSafePath(rawPath);
            const searchResults = [];
            const walk = (dir) => {
                const list = fs.readdirSync(dir);
                for (const file of list) {
                    const fullPath = path.join(dir, file);
                    if (fs.statSync(fullPath).isDirectory()) {
                        if (!file.includes('node_modules') && !file.includes('.git'))
                            walk(fullPath);
                    }
                    else {
                        const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.exe', '.dll', '.so', '.dylib', '.zip', '.tar', '.gz', '.lock', '.map'];
                        const isBinary = binaryExtensions.some(ext => file.endsWith(ext));
                        if (!isBinary) {
                            if (file.includes(query) || (args.content_search && fs.readFileSync(fullPath, 'utf8').includes(query))) {
                                searchResults.push(fullPath);
                            }
                        }
                    }
                }
            };
            walk(targetPath);
            result = `Search results for "${query}":\n` + (searchResults.length > 0 ? searchResults.join('\n') : 'No matches found.');
        }
        else if (name === 'open_project') {
            const targetPath = args.path;
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                mainWindow?.webContents.send('workspace-changed', targetPath);
                result = `Successfully switched workspace to: ${targetPath}`;
            }
            else {
                result = `Error: Path ${targetPath} does not exist or is not a directory.`;
            }
        }
        return result;
    }
    catch (err) {
        return `HATA: ${name} aracı başarısız oldu. Sebep: [${err.message}].`;
    }
});
const activeSessions = new Map();
electron_1.ipcMain.handle('ollama-chat', async (event, { paneId, model, messages, workspacePath, supportsTools }) => {
    // SESSION CONTROL
    if (activeSessions.has(paneId)) {
        activeSessions.get(paneId)?.abort();
        activeSessions.delete(paneId);
    }
    const abortController = new AbortController();
    activeSessions.set(paneId, abortController);
    try {
        const payload = {
            model,
            messages,
            stream: false
        };
        if (supportsTools) {
            payload.tools = tools;
        }
        const response = await fetch(`${OLLAMA_API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: abortController.signal
        });
        if (!response.ok) {
            const errorText = await response.text();
            if (errorText.includes("does not support chat"))
                throw new Error("MODEL_NOT_CHAT");
            throw new Error(`Failed to chat with Ollama: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        // Fallback parser: if the model outputs raw JSON for a tool call inside content, convert it to native tool_calls
        if (data.message && typeof data.message.content === 'string' && (!data.message.tool_calls || data.message.tool_calls.length === 0)) {
            const content = data.message.content;
            let jsonStr = null;
            const markdownMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
            if (markdownMatch) {
                jsonStr = markdownMatch[1];
            }
            else {
                const rawMatch = content.match(/(\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*\}\s*\})/);
                if (rawMatch)
                    jsonStr = rawMatch[1];
            }
            if (jsonStr) {
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.name && parsed.arguments) {
                        data.message.tool_calls = [{
                                id: `call_${Date.now()}`,
                                function: {
                                    name: parsed.name,
                                    arguments: parsed.arguments
                                }
                            }];
                        // Remove the matched json from the text to keep chat clean
                        data.message.content = content.replace(markdownMatch ? markdownMatch[0] : jsonStr, '').trim();
                    }
                }
                catch (e) {
                    // Ignore parsing errors
                }
            }
        }
        return data.message;
    }
    catch (error) {
        if (error.name === 'AbortError')
            return null;
        console.error('Ollama chat error:', error.message);
        throw error;
    }
    finally {
        if (activeSessions.get(paneId) === abortController) {
            activeSessions.delete(paneId);
        }
    }
});
