import { useState, useEffect, useRef } from 'react';
import { Cpu, HardDrive, Play, AlertTriangle, Box, FolderOpen, Folder, File, Check, X, ShieldAlert, CheckCircle2, Power, Square, ChevronRight, ChevronDown, Loader2, Trash2, GitBranch, GitCommit, RefreshCw, Copy, Terminal, Search, Pencil } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ModelLibrary from './components/ModelLibrary';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { Layout as FlexLayout, Model as FlexModel } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import { TEAM_SCENARIOS } from './constants/teamScenarios';
import { ROLES, buildSystemPrompt } from './constants/prompts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Interfaces
interface HardwareInfo {
  ramTotal: number;
  ramUsed: number;
  vramTotal: number; // in MB
  vramUsed: number;  // in MB
}

interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  supportsTools?: boolean;
}

type LayoutType = 'single' | 'double' | 'triple' | 'quad' | 'pentad';

interface ThinkingEntry {
  turnIndex: number;
  thinking: string;
  toolsSummary: string[];
}

interface PaneState {
  id: string;
  selectedModel: OllamaModel | null;
  selectedRole: string;
  prompt: string;
  output: string;
  isGenerating: boolean;
  messages: any[];
  isModelStarted: boolean;
  isContextActive?: boolean;
  teamPrompt?: string;
  toolQueue?: { name: string; args?: Record<string, any>; status: 'pending' | 'running' | 'completed'; result?: string; startTime?: number; durationMs?: number }[];
  thinkingLog?: ThinkingEntry[];
  currentThinking?: string;
}

const TEMPLATES = [
  { id: 'custom', name: 'Custom Setup', layout: 'single' as LayoutType },
  { id: 'qa-refactor', name: 'QA & Refactor', layout: 'double' as LayoutType },
];

const RunningTimer = ({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100);
    return () => clearInterval(id);
  }, [startTime]);
  return <span className="text-[10px] text-sky-700 ml-0.5">{(elapsed / 1000).toFixed(1)}s</span>;
};

const TOOL_VERBS: Record<string, string> = {
  read_file: 'Okunuyor',
  write_file: 'Yazılıyor',
  execute_command: 'Çalıştırılıyor',
  list_dir: 'Listeleniyor',
  search_project: 'Aranıyor',
};

function getToolDetail(name: string, args: Record<string, any> = {}): string {
  switch (name) {
    case 'read_file':   return args.file_path?.split(/[\\/]/).pop() || args.file_path || '';
    case 'write_file':  return args.file_path?.split(/[\\/]/).pop() || args.file_path || '';
    case 'list_dir':    return args.dir_path || '';
    case 'execute_command': return (args.command || '').slice(0, 48);
    case 'search_project':  return `"${(args.query || '').slice(0, 32)}"`;
    default:            return '';
  }
}

function ToolIcon({ name, className }: { name: string; className?: string }) {
  const cls = className ?? 'w-3 h-3';
  switch (name) {
    case 'read_file':       return <File className={cls} />;
    case 'write_file':      return <Pencil className={cls} />;
    case 'execute_command': return <Terminal className={cls} />;
    case 'list_dir':        return <FolderOpen className={cls} />;
    case 'search_project':  return <Search className={cls} />;
    default:                return <Square className={cls} />;
  }
}

const FileTreeNode = ({ node, depth, onSelectFile, onRefresh }: { node: any, depth: number, onSelectFile: (node: any) => void, onRefresh: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const isDir = node.type === 'directory';

  const handleCreateFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt("Enter file name:");
    if (name && window.electronAPI) {
      await window.electronAPI.createFile(node.path, name);
      onRefresh();
    }
  };

  const handleCreateFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt("Enter folder name:");
    if (name && window.electronAPI) {
      await window.electronAPI.createFolder(node.path, name);
      onRefresh();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete ${node.name}?`) && window.electronAPI) {
      await window.electronAPI.deletePath(node.path);
      onRefresh();
    }
  };

  const handleRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt("Enter new name:", node.name);
    if (newName && newName !== node.name && window.electronAPI) {
      await window.electronAPI.renamePath(node.path, newName);
      onRefresh();
    }
  };

  const copyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(node.path);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="select-none">
      <div
        onClick={() => isDir ? setIsOpen(!isOpen) : onSelectFile(node.path)}
        onContextMenu={copyPath}
        className={cn(
          "flex items-center gap-1 h-[22px] px-2 cursor-pointer transition-colors group relative",
          !isDir ? "hover:bg-[#2a2d2e] text-zinc-400 hover:text-zinc-200" : "hover:bg-[#2a2d2e] text-zinc-300"
        )}
        title={!isDir ? "Sağ tık: yolu kopyala" : ""}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <div className="w-3 flex justify-center shrink-0">
          {isDir && (isOpen ? <ChevronDown className="w-3 h-3 text-zinc-600" /> : <ChevronRight className="w-3 h-3 text-zinc-600" />)}
        </div>
        {isDir
          ? <Folder className="w-3.5 h-3.5 text-[#dcb67a] shrink-0" />
          : <File className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
        <span className="truncate flex-1 text-[13px]">{node.name}</span>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
          {isDir && (
            <>
              <button onClick={handleCreateFile} className="p-0.5 hover:bg-[#3e3e42] rounded text-zinc-600 hover:text-emerald-400" title="Yeni Dosya"><File className="w-3 h-3" /></button>
              <button onClick={handleCreateFolder} className="p-0.5 hover:bg-[#3e3e42] rounded text-zinc-600 hover:text-sky-400" title="Yeni Klasör"><Folder className="w-3 h-3" /></button>
            </>
          )}
          <button onClick={handleRename} className="p-0.5 hover:bg-[#3e3e42] rounded text-zinc-600 hover:text-amber-400" title="Yeniden Adlandır"><Play className="w-3 h-3 rotate-90" /></button>
          <button onClick={handleDelete} className="p-0.5 hover:bg-[#3e3e42] rounded text-zinc-600 hover:text-red-400" title="Sil"><X className="w-3 h-3" /></button>
        </div>

        {!isDir && isCopied && (
          <span className="text-[9px] text-emerald-500 font-medium ml-1">kopyalandı</span>
        )}
      </div>
      {isDir && isOpen && node.children && (
        <div className="border-l border-[#3e3e42]/50" style={{ marginLeft: `${depth * 12 + 16}px` }}>
          {node.children.map((child: any, i: number) => (
            <FileTreeNode key={i} node={child} depth={depth + 1} onSelectFile={onSelectFile} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  console.log('AI Studio Otonom Ajanı buradaydı!');
  
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [layout, setLayout] = useState<LayoutType>('single');
  const [panes, setPanes] = useState<PaneState[]>([
    { id: 'pane-1', selectedModel: null, selectedRole: 'general', prompt: '', output: '', isGenerating: false, messages: [], isModelStarted: false, isContextActive: true, toolQueue: [] }
  ]);
  useEffect(() => {
    const savedPanes = localStorage.getItem('ai-studio-panes');
    if (savedPanes) {
      try {
        const parsed = JSON.parse(savedPanes);
        // Ensure to reset isGenerating and toolQueue on load for safety
        setPanes(parsed.map((p: any) => ({ ...p, isGenerating: false, toolQueue: [] })));
      } catch (e) {
        console.error("Failed to load saved panes", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ai-studio-panes', JSON.stringify(panes));
    panesRef.current = panes;
  }, [panes]);

  const panesRef = useRef<PaneState[]>(panes);

  const [isWarning, setIsWarning] = useState(false);
  const [isMockModels, setIsMockModels] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scenarioApplied, setScenarioApplied] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState('custom');
  const [isSmartTeamsOpen, setIsSmartTeamsOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState<{ layout: string, scenario: any } | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string>('');
  const [gitStatus, setGitStatus] = useState<string | null>(null);

  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [workspaceTree, setWorkspaceTree] = useState<any>(null);
  const [activeFile, setActiveFile] = useState<{ path: string; content: string; language: string } | null>(null);

  // Load saved workspace on mount
  useEffect(() => {
    const savedWorkspace = localStorage.getItem('ai-studio-workspace');
    if (savedWorkspace) {
      setWorkspacePath(savedWorkspace);
      if (window.electronAPI) {
        window.electronAPI.readWorkspace(savedWorkspace).then(setWorkspaceTree).catch(console.error);
        window.electronAPI.gitStatus(savedWorkspace).then(setGitStatus).catch(console.error);
      }
    }
  }, []);

  // Save workspace on change
  useEffect(() => {
    if (workspacePath) {
      localStorage.setItem('ai-studio-workspace', workspacePath);
    }
  }, [workspacePath]);
  const [diffApproval, setDiffApproval] = useState<{
    requestId: string;
    funcName: string;
    path: string;
    oldContent?: string;
    newContent?: string;
    command?: string;
  } | null>(null);
  const [diffFeedback, setDiffFeedback] = useState('');

  const [terminalApproval, setTerminalApproval] = useState<{
    requestId: string;
    command: string;
    cwd: string;
  } | null>(null);

  const [autoAccept, setAutoAccept] = useState<boolean>(() => {
    return localStorage.getItem('ai-studio-auto-accept') === 'true';
  });
  const autoAcceptRef = useRef(autoAccept);
  useEffect(() => {
    autoAcceptRef.current = autoAccept;
    localStorage.setItem('ai-studio-auto-accept', String(autoAccept));
  }, [autoAccept]);

  const [flexModel] = useState(() => FlexModel.fromJson({
    global: { tabEnableClose: false, tabEnableRename: false, tabSetEnableMaximize: true },
    borders: [
      {
        type: "border",
        location: "left",
        size: 260,
        children: [
          { type: "tab", id: "workspace", name: "Çalışma Alanı", component: "workspace", config: { icon: "folder" } },
          { type: "tab", id: "git", name: "Kaynak Kontrol", component: "git", config: { icon: "git" } }
        ]
      }
    ],
    layout: {
      type: "column",
      weight: 100,
      children: [
        {
          type: "row",
          weight: 70,
          children: [
            {
              type: "tabset",
              weight: 40,
              children: [{ type: "tab", id: "chat", name: "Ajan Sohbet", component: "chat" }]
            },
            {
              type: "tabset",
              weight: 60,
              children: [{ type: "tab", id: "editor", name: "Kod Editörü", component: "editor" }]
            }
          ]
        },
        {
          type: "tabset",
          weight: 30,
          id: "terminal-tabset",
          children: [{ type: "tab", id: "terminal", name: "Terminal", component: "terminal" }]

        }
      ]
    }
  }));

  const getLanguageFromPath = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (['ts', 'tsx'].includes(ext!)) return 'typescript';
    if (['js', 'jsx'].includes(ext!)) return 'javascript';
    if (['css', 'scss'].includes(ext!)) return 'css';
    if (['html'].includes(ext!)) return 'html';
    if (['json'].includes(ext!)) return 'json';
    if (['md'].includes(ext!)) return 'markdown';
    return 'plaintext';
  };

  const handleSelectFile = async (filePath: string) => {
    if (!window.electronAPI) return;
    try {
      const content = await window.electronAPI.readFileContent(filePath);
      setActiveFile({ path: filePath, content, language: getLanguageFromPath(filePath) });
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditorSave = async () => {
    if (!activeFile || !window.electronAPI) return;
    try {
      await window.electronAPI.writeFileContent(activeFile.path, activeFile.content);
      console.log('File saved manually via editor');
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // Fetch hardware info from Electron IPC
    const fetchHardware = async () => {
      try {
        if (window.electronAPI) {
          const info = await window.electronAPI.getHardwareInfo();
          setHardwareInfo(info);
        } else {
          // Mock for dev in browser
          setHardwareInfo({ ramTotal: 34359738368, ramUsed: 17179869184, vramTotal: 8192, vramUsed: 2048 });
        }
      } catch (err) {
        console.error("Failed to fetch hardware info:", err);
      }
    };
    
    fetchHardware();
    const interval = setInterval(fetchHardware, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchModels = async () => {
    try {
      let fetchedModels: OllamaModel[] = [];
      if (window.electronAPI) {
        const data = await window.electronAPI.getOllamaTags();
        fetchedModels = Array.isArray(data?.models) ? data.models : [];
      } else {
        const response = await fetch('http://localhost:11434/api/tags');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        fetchedModels = Array.isArray(data?.models) ? data.models : [];
      }
      setModels(fetchedModels);
      setIsMockModels(false);
    } catch (err) {
      console.warn('Ollama not running or unreachable:', err);
      setIsMockModels(true);
      setModels([
        { name: 'llama3:8b', size: 4700000000, digest: '1' },
        { name: 'mistral:7b', size: 4100000000, digest: '2' },
        { name: 'mixtral:8x7b', size: 26000000000, digest: '3' },
        { name: 'codellama:34b', size: 19000000000, digest: '4' }
      ]);
    }
  };

  useEffect(() => {
    fetchModels();
    
    if (window.electronAPI) {
      window.electronAPI.onTerminalOutput((data: string) => {
        setTerminalOutput(prev => prev + data);
      });
      window.electronAPI.onWorkspaceChanged((path: string) => {
        setWorkspacePath(path);
        handleRefreshWorkspace(path);
      });
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('terminal-output');
        window.electronAPI.removeAllListeners('workspace-changed');
      }
    };
  }, []);

  useEffect(() => {
    // Check total memory consumption
    if (!hardwareInfo) return;
    
    const totalSelectedSize = panes.reduce((acc, pane) => {
      return acc + (pane.selectedModel ? pane.selectedModel.size : 0);
    }, 0);

    if (totalSelectedSize > hardwareInfo.ramTotal * 0.8) {
      setIsWarning(true);
    } else {
      setIsWarning(false);
    }
  }, [panes, hardwareInfo]);

  useEffect(() => {
    if (!window.electronAPI) return;
    
    window.electronAPI.onOllamaChatFileRead((data) => {
      setActiveFile({
        path: data.path,
        content: data.content,
        language: getLanguageFromPath(data.path)
      });
    });

    window.electronAPI.onOllamaChatRequireApprovalGlobal((data: any) => {
      if (autoAcceptRef.current) {
        window.electronAPI!.resolveOllamaChatApproval(data.requestId, true, '');
        return;
      }
      if (data.funcName === 'execute_command') {
        setTerminalApproval({ requestId: data.requestId, command: data.command, cwd: data.path });
      } else {
        setDiffApproval(data);
      }
    });

    return () => {
      window.electronAPI!.removeAllListeners('ollama-chat-file-read');
      window.electronAPI!.removeAllListeners('ollama-chat-require-approval-global');
    };
  }, []);

  useEffect(() => {
    if (activeFile) {
      setPanes(prev => prev.map(p => ({ ...p, isContextActive: true })));
    }
  }, [activeFile?.path]);

  const handleSelectWorkspace = async () => {
    if (!window.electronAPI) return;
    const path = await window.electronAPI.selectWorkspace();
    if (path) {
      setWorkspacePath(path);
      handleRefreshWorkspace(path);
    }
  };

  const handleRefreshWorkspace = async (targetPath = workspacePath) => {
    if (!window.electronAPI || !targetPath) return;
    setIsRefreshing(true);
    try {
      const tree = await window.electronAPI.readWorkspace(targetPath);
      setWorkspaceTree(tree);
      const status = await window.electronAPI.gitStatus(targetPath);
      setGitStatus(status);
    } finally {
      setIsRefreshing(false);
    }
  };

  const findBestModelMatch = (targetName: string) => {
    if (!targetName) return null;
    // If targetName is already in models, return it
    const exact = models.find(m => m.name === targetName || m.name.split(':')[0] === targetName);
    if (exact) return exact.name;
    
    // Fuzzy match (contains name)
    const fuzzy = models.find(m => m.name.toLowerCase().includes(targetName.toLowerCase()));
    if (fuzzy) return fuzzy.name;
    
    // Default to the first available model if any
    return models[0]?.name || null;
  };

  const applyScenario = (layoutKey: string, scenario: any) => {
    setActiveScenario({ layout: layoutKey, scenario });
    handleLayoutChange(layoutKey as any);
    
    setTimeout(() => {
      setPanes(currentPanes => {
        const newPanes = [...currentPanes];
        
        if (layoutKey === 'single') {
          // For single, recommended models are in an array. Pick the first one available.
          const targetModel = scenario.models[0];
          const matchedModelName = findBestModelMatch(targetModel);
          const matchedModel = models.find(m => m.name === matchedModelName);
          if (newPanes[0]) {
            newPanes[0].selectedModel = matchedModel || null;
            newPanes[0].isModelStarted = false;
          }
        } else {
          // For multi-pane, models is an object mapping roles to model names
          const roleKeys = Object.keys(scenario.models);
          const modelNames = Object.values(scenario.models);
          modelNames.forEach((targetModel: any, idx) => {
            if (newPanes[idx]) {
              const matchedModelName = findBestModelMatch(targetModel);
              const matchedModel = models.find(m => m.name === matchedModelName);
              newPanes[idx].selectedModel = matchedModel || null;
              newPanes[idx].isModelStarted = false;
              newPanes[idx].messages = [];
              newPanes[idx].output = '';
              // Assign team-specific role prompt
              const roleKey = roleKeys[idx];
              if (scenario.rolePrompts && scenario.rolePrompts[roleKey]) {
                newPanes[idx].teamPrompt = scenario.rolePrompts[roleKey];
              } else {
                newPanes[idx].teamPrompt = undefined;
              }
            }
          });
        }
        return newPanes;
      });
    }, 150);
  };

  const handleLayoutChange = (newLayout: LayoutType) => {
    setLayout(newLayout);
    let numPanes = 1;
    if (newLayout === 'double') numPanes = 2;
    if (newLayout === 'triple') numPanes = 3;
    if (newLayout === 'quad') numPanes = 4;
    if (newLayout === 'pentad') numPanes = 5;

    setPanes(prev => {
      const next = [...prev];
      while (next.length < numPanes) {
        next.push({ id: `pane-${Date.now()}-${Math.random()}`, selectedModel: null, selectedRole: 'general', prompt: '', output: '', isGenerating: false, messages: [], isModelStarted: false });
      }
      return next.slice(0, numPanes);
    });
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (templateId === 'qa-refactor') {
      handleLayoutChange('double');
      // Pre-select models if we have them, else just set layout
      setPanes(prev => [
        { ...prev[0], prompt: '// Code Generator...' },
        { ...prev[1], prompt: '// QA & Refactor Reviewer...' }
      ]);
    } else {
      handleLayoutChange('single');
    }
  };

  const getWorkspaceContextString = () => {
    if (!workspaceTree || !workspacePath) return '';
    const getFilesStr = (node: any, depth = 0): string => {
      if (depth > 2) return '';
      let str = node.name + (node.type === 'directory' ? '/' : '') + '\n';
      if (node.children) {
        for (const child of node.children.slice(0, 10)) {
          str += '  '.repeat(depth + 1) + getFilesStr(child, depth + 1);
        }
        if (node.children.length > 10) {
          str += '  '.repeat(depth + 1) + `... (${node.children.length - 10} more)\n`;
        }
      }
      return str;
    };
    const filesList = getFilesStr(workspaceTree);
    return `\n\n[ÇALIŞMA ALANI BİLGİSİ]\nSen otonom bir kodlama ajanısın. Kullanıcının şu anki çalışma dizini: ${workspacePath}\nBu dizindeki dosya ağacı:\n${filesList}\n\nBir dosyayı okuman, değiştirmen veya komut çalıştırman istendiğinde doğrudan sağlanan araçları (tools) kullan. Asla "Dışarıya erişimim yok" veya "Dosya sistemini göremiyorum" DEME. Sana read_file, write_file ve execute_command araçları tanımlandı. Mutlaka bu araçları çağırarak işlemleri gerçekleştir.`;
  };

  const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Araç zaman aşımı: ${label} (${ms / 1000}s)`)), ms)
      )
    ]);

  const runAgenticLoop = async (paneIndex: number, currentMessages: any[]) => {
    const pane = panes[paneIndex];
    if (!pane.selectedModel || !window.electronAPI) return;

    let localMessages = [...currentMessages];
    const paneIdStr = pane.id;
    const supportsTools = modelCanUseTools(pane.selectedModel);
    const selectedRole = ROLES.find(r => r.id === pane.selectedRole) || ROLES[0];
    const workspaceContext = supportsTools ? getWorkspaceContextString() : '';

    const scrollToBottom = () => {
      setTimeout(() => {
        const el = document.getElementById(`chat-container-${paneIdStr}`);
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    };

    try {
      let isLooping = true;
      let loopCount = 0;
      const MAX_LOOPS = 20;
      const recentToolCalls: string[] = []; // duplicate detection
      while (isLooping) {
        if (++loopCount > MAX_LOOPS) {
          setPanes(prev => {
            const next = [...prev];
            next[paneIndex] = { ...next[paneIndex], output: next[paneIndex].output + `\n⚠️ [Agent] Maksimum döngü limitine (${MAX_LOOPS}) ulaşıldı. Durduruluyor.`, isGenerating: false };
            return next;
          });
          break;
        }
        // ALWAYS get the freshest model name from the REF to avoid stale closure
        const freshPane = panesRef.current[paneIndex];
        const modelName = freshPane.selectedModel?.name;
        if (!modelName) break;

        // Trim context to prevent VRAM overflow — keep last 30 messages + always prepend system
        const MAX_CTX = 30;
        const trimmed = localMessages.length > MAX_CTX ? localMessages.slice(-MAX_CTX) : localMessages;
        const apiMessages = [...trimmed];
        const systemContent = buildSystemPrompt({
          model: freshPane.selectedModel!,
          roleSystem: selectedRole.system,
          teamPrompt: freshPane.teamPrompt,
          workspaceContext,
          projectPath: workspacePath
        });
        if (apiMessages.length > 0 && apiMessages[0].role === 'system') {
          apiMessages[0] = { ...apiMessages[0], content: systemContent };
        } else {
          apiMessages.unshift({ role: 'system', content: systemContent });
        }

        const response = await window.electronAPI.chatOllamaModel(paneIdStr, modelName, apiMessages, workspacePath, supportsTools);
        if (!response) break; // Aborted session

        localMessages.push(response);

        // Capture thinking content (deepseek-r1, qwen3-thinking etc.)
        if (response.thinking) {
          const entry: ThinkingEntry = {
            turnIndex: loopCount,
            thinking: response.thinking,
            toolsSummary: response.tool_calls?.map((t: any) => t.function.name) || []
          };
          setPanes(prev => {
            const next = [...prev];
            next[paneIndex] = { ...next[paneIndex], thinkingLog: [...(next[paneIndex].thinkingLog || []), entry], currentThinking: response.thinking };
            return next;
          });
        }

        if (response.tool_calls && response.tool_calls.length > 0) {
          // Initialize Queue
          setPanes(prev => {
            const next = [...prev];
            next[paneIndex] = {
              ...next[paneIndex],
              output: next[paneIndex].output + `\n🔧 [Agent] ${response.tool_calls.length} araç çalıştırılıyor...\n`,
              toolQueue: response.tool_calls.map((t: any) => ({
                name: t.function.name,
                args: t.function.arguments,
                status: 'pending'
              }))
            };
            return next;
          });
          scrollToBottom();

          // Execute each tool
          for (let i = 0; i < response.tool_calls.length; i++) {
            const t = response.tool_calls[i];
            const callKey = `${t.function.name}:${JSON.stringify(t.function.arguments)}`;

            // Duplicate detection — same tool+args already ran, skip to avoid infinite loop
            if (recentToolCalls.includes(callKey)) {
              const skipMsg = `[Tekrar çağrı engellendi: ${t.function.name} aynı argümanlarla zaten çalıştı. Bir sonraki adıma geç.]`;
              const toolMsg: any = { role: 'tool', content: skipMsg, name: t.function.name };
              if (t.id) toolMsg.tool_call_id = t.id;
              localMessages.push(toolMsg);
              continue;
            }
            recentToolCalls.push(callKey);
            if (recentToolCalls.length > 10) recentToolCalls.shift();

            const toolStartTime = Date.now();
            setPanes(prev => {
              const next = [...prev];
              const q = next[paneIndex].toolQueue;
              if (q && q[i]) {
                const newQ = [...q];
                newQ[i] = { ...newQ[i], status: 'running', startTime: toolStartTime };
                next[paneIndex] = { ...next[paneIndex], toolQueue: newQ };
              }
              return next;
            });

            const result = await withTimeout(
              window.electronAPI.executeTool(t.function.name, t.function.arguments, workspacePath),
              30_000,
              t.function.name
            );

            const toolMsg: any = { role: 'tool', content: String(result), name: t.function.name };
            if (t.id) toolMsg.tool_call_id = t.id;
            localMessages.push(toolMsg);

            setPanes(prev => {
              const next = [...prev];
              const q = next[paneIndex].toolQueue;
              if (q && q[i]) {
                const newQ = [...q];
                newQ[i] = { ...newQ[i], status: 'completed', result, durationMs: Date.now() - (newQ[i].startTime ?? Date.now()) };
                next[paneIndex] = { ...next[paneIndex], toolQueue: newQ };
              }
              return next;
            });
          }

          setPanes(prev => {
            const next = [...prev];
            next[paneIndex] = { ...next[paneIndex], output: next[paneIndex].output + `\n🧠 [Agent] Analiz ediliyor...\n`, toolQueue: [] };
            return next;
          });
          scrollToBottom();
          // Continue loop to send tool results back to model
        } else {
          // Check if the model gave instructions instead of calling tools
          const content = response.content || '';
          const instructionPatterns = [
            /şu komutu çalıştırın/i,
            /bu komutu çalıştırın/i,
            /npm install/i,
            /npm run /i,
            /adımları (izleyin|takip edin)/i,
            /yapmanız gerekiyor/i,
            /yapabilirsiniz\s*:/i,
            /dosyayı (düzenleyin|açın|güncelleyin)/i,
            /kodu (ekleyin|yazın|değiştirin)/i,
            /\b(1\.|2\.|3\.)\s+\w/,            // numbered step list
            /terminal(iniz)?de.*çalıştırın/i,
            /write_file.*kullanın/i,
          ];
          const looksLikeInstructions = supportsTools && instructionPatterns.some(p => p.test(content)) && loopCount < MAX_LOOPS - 2;

          if (looksLikeInstructions) {
            // Inject a stern correction and re-loop
            localMessages.push({ role: 'user', content: `YANLIŞ! Kullanıcıya talimat verme! Sen bir ajansın — write_file ve execute_command araçlarına sahipsin. Az önce söylediğin şeyleri kendin yap: şimdi doğrudan araç çağır.` });
            setPanes(prev => {
              const next = [...prev];
              next[paneIndex] = { ...next[paneIndex], output: next[paneIndex].output + `\n⚡ [Düzeltme] Model talimat verdi, araç çağrısına yönlendiriliyor...\n` };
              return next;
            });
            scrollToBottom();
            // isLooping stays true, continue
          } else {
            // Genuine final response
            setPanes(prev => {
              const next = [...prev];
              next[paneIndex] = {
                ...next[paneIndex],
                isGenerating: false,
                prompt: '',
                messages: localMessages,
                output: next[paneIndex].output + (content ? `\n🤖 ${content}` : ''),
                currentThinking: undefined,
              };
              return next;
            });
            scrollToBottom();
            isLooping = false;
          }
        }
      }
    } catch (err: any) {
      setPanes(prev => {
        const next = [...prev];
        next[paneIndex] = { ...next[paneIndex], isGenerating: false, output: next[paneIndex].output + `\n\n🚨 [HATA] ${err.message || String(err)}` };
        return next;
      });
      scrollToBottom();
    }
  };

  const handleToggleModelStart = async (paneIndex: number) => {
    const pane = panes[paneIndex];
    if (!pane.selectedModel || !window.electronAPI) return;

    if (pane.isModelStarted) {
      setPanes(prev => {
        const next = [...prev];
        next[paneIndex].isModelStarted = false;
        next[paneIndex].isGenerating = false;
        return next;
      });
    } else {
      const modelName = pane.selectedModel.name;
      const greetingPrompt = "Bana kısaca 'Merhaba' de ve ne yapabileceğini tek cümleyle söyle.";

      setPanes(prev => {
        const next = [...prev];
        next[paneIndex] = {
          ...next[paneIndex],
          isModelStarted: true,
          isGenerating: true,
          output: `[System] ${modelName} starting...\n\n` +
            (next[paneIndex].selectedRole === 'general'
              ? `[System] ℹ️ Default role active (General Assistant). Select a specific role (Architect, Frontend, Backend, Debugger, QA) for specialized behavior.\n\n`
              : '')
        };
        return next;
      });

      if (pane.messages.length > 0) {
        setPanes(prev => {
          const next = [...prev];
          next[paneIndex].isGenerating = false;
          return next;
        });
      } else {
        await runAgenticLoop(paneIndex, [{ role: 'user', content: greetingPrompt }]);
      }
    }
  };

  const handleGenerate = async (paneIndex: number) => {
    const pane = panes[paneIndex];
    if (!pane.selectedModel || !pane.prompt.trim() || !window.electronAPI) return;

    const currentPrompt = pane.prompt.trim();
    const isContextActive = pane.isContextActive !== false && activeFile;
    let finalUserPrompt = currentPrompt;
    if (isContextActive && activeFile) {
      finalUserPrompt = `[SYSTEM_CONTEXT]: Kullanıcının şu an ekranda açık olan aktif dosyası: ${activeFile.path}. Gelen soruyu DİREKT olarak bu dosya üzerinden değerlendir. Gerekirse 'read_file' aracını tetikleyerek önce bu dosyayı oku ve öyle işlem yap.\n\n${currentPrompt}`;
    }

    const newMessages = [...pane.messages, { role: 'user', content: finalUserPrompt }];

    setPanes(prev => {
      const next = [...prev];
      next[paneIndex] = {
        ...next[paneIndex],
        isGenerating: true,
        messages: newMessages,
        output: next[paneIndex].output
          ? `${next[paneIndex].output}\n\n❯ ${currentPrompt}\n`
          : `❯ ${currentPrompt}\n`
      };
      return next;
    });

    await runAgenticLoop(paneIndex, newMessages);
  };

  // Parse ### `path` + code block pairs from a no-tools model response
  const parseCodeFiles = (text: string): { path: string; content: string; lang: string }[] => {
    const results: { path: string; content: string; lang: string }[] = [];
    const regex = /###\s+`([^`]+)`\s*\n```(\w*)\n([\s\S]*?)```/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      results.push({ path: m[1].trim(), content: m[3], lang: m[2] });
    }
    return results;
  };

  const handleWriteParsedFiles = async (files: { path: string; content: string }[], paneIndex: number) => {
    if (!window.electronAPI || !workspacePath) return;
    for (const f of files) {
      await window.electronAPI.executeTool('write_file', { file_path: f.path, content: f.content }, workspacePath);
    }
    setPanes(prev => {
      const next = [...prev];
      next[paneIndex] = { ...next[paneIndex], output: next[paneIndex].output + `\n✅ ${files.length} dosya yazıldı.` };
      return next;
    });
  };

  const handleResolveApproval = (approved: boolean) => {
    if (!diffApproval || !window.electronAPI) return;
    window.electronAPI.resolveOllamaChatApproval(diffApproval.requestId, approved, diffFeedback);
    setDiffApproval(null);
    setDiffFeedback('');
  };

  const handleResolveTerminalApproval = (approved: boolean) => {
    if (!terminalApproval || !window.electronAPI) return;
    window.electronAPI.resolveOllamaChatApproval(terminalApproval.requestId, approved, '');
    setTerminalApproval(null);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S → Save active file
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleEditorSave();
      }
      // Ctrl+L → Clear active chat pane
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        if (!window.confirm('Tüm sohbet geçmişi silinecek. Emin misiniz?')) return;
        setPanes(prev => {
          const next = [...prev];
          if (next[0]) {
            next[0].messages = [];
            next[0].output = '';
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isEmbeddingModel = (name: string) => {
    const lowerName = name.toLowerCase();
    return lowerName.includes('embed') || lowerName.includes('bge-m3') || lowerName.includes('nomic');
  };

  const modelCanUseTools = (m: OllamaModel) => !!m.supportsTools;

  const chatModels = models.filter(m => !isEmbeddingModel(m.name));

  return (
    <div className="h-screen overflow-hidden bg-[#1e1e1e] text-[#cccccc] font-sans flex flex-col selection:bg-sky-500/30">
      {/* VS Code–style Title Bar */}
      <header className="h-10 border-b border-[#3e3e42] bg-[#323233] flex items-center justify-between px-3 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-sky-500/20 flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <span className="text-[13px] font-semibold text-zinc-200 tracking-tight">AI Studio</span>
          </div>

          {hardwareInfo && (
            <div className="flex items-center gap-2 ml-2 text-[10px] text-zinc-500 font-mono">
              <HardDrive className="w-3 h-3" />
              <span>{formatBytes(hardwareInfo.ramUsed)}<span className="text-zinc-700">/{formatBytes(hardwareInfo.ramTotal)}</span></span>
              <span className="text-zinc-700">|</span>
              <Cpu className="w-3 h-3" />
              <span>
                {hardwareInfo.vramUsed > 0
                  ? <>{(hardwareInfo.vramUsed / 1024).toFixed(1)}<span className="text-zinc-700">/{(hardwareInfo.vramTotal / 1024).toFixed(1)}G</span> VRAM</>
                  : <>{(hardwareInfo.vramTotal / 1024).toFixed(1)}G VRAM</>
                }
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center border border-[#3e3e42] rounded overflow-hidden mr-2">
            {(['single', 'double', 'triple', 'quad', 'pentad'] as LayoutType[]).map((l) => (
              <button
                key={l}
                onClick={() => { setSelectedTemplate('custom'); handleLayoutChange(l); }}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors border-r border-[#3e3e42] last:border-r-0",
                  layout === l
                    ? "bg-sky-600/20 text-sky-400"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-[#2a2d2e]"
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsSmartTeamsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 bg-sky-600/10 hover:bg-sky-600/20 border border-sky-500/30 rounded text-[11px] font-medium text-sky-400 hover:text-sky-300 transition-colors"
          >
            <Play className="w-3 h-3" />
            Akıllı Ekipler
          </button>

          <button
            onClick={() => setIsLibraryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#2d2d30] hover:bg-[#37373d] border border-[#3e3e42] rounded text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors ml-1"
          >
            <Box className="w-3 h-3" />
            Modeller
          </button>

          <button
            onClick={() => setAutoAccept(v => !v)}
            title={autoAccept ? "Auto-Accept AÇIK — tüm onaylar otomatik kabul ediliyor" : "Auto-Accept KAPALI — her işlem onaylanmalı"}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 border rounded text-[11px] font-medium transition-colors ml-1",
              autoAccept
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25"
                : "bg-[#2d2d30] border-[#3e3e42] text-zinc-500 hover:text-zinc-300 hover:bg-[#37373d]"
            )}
          >
            {autoAccept ? <CheckCircle2 className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
            {autoAccept ? "Auto-Accept" : "HITL"}
          </button>

          <select
            value={selectedTemplate}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="ml-1 bg-[#2d2d30] border border-[#3e3e42] text-[11px] text-zinc-400 rounded px-2 py-1 outline-none focus:border-sky-500/50 cursor-pointer"
          >
            {TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Main Content Area via FlexLayout */}
      <main className="flex-1 min-h-0 relative">
        <FlexLayout 
          model={flexModel} 
          onRenderTab={(node, renderValues) => {
            const config = node.getConfig();
            const icon = config?.icon;
            if (icon === "folder") {
              renderValues.content = (
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  <span>{node.getName()}</span>
                </div>
              );
            } else if (icon === "git") {
              renderValues.content = (
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4" />
                  <span>{node.getName()}</span>
                </div>
              );
            }
          }}
          factory={(node) => {
            const component = node.getComponent();
            // ... (factory logic continues)
            
            if (component === "workspace") {
              return (
                <div className="flex flex-col h-full bg-[#252526] min-h-0">
                  <div className="px-3 py-2 border-b border-[#3e3e42] flex items-center justify-between shrink-0">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.12em]">
                      ÇALIŞMA ALANI
                    </span>
                    <button
                      onClick={handleSelectWorkspace}
                      className="p-1 hover:bg-[#2a2d2e] rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Klasör Aç"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto text-[13px] text-zinc-400">
                    {!workspaceTree ? (
                      <div className="text-center mt-10 space-y-3 px-4">
                        <FolderOpen className="w-8 h-8 mx-auto text-zinc-700" />
                        <p className="text-xs text-zinc-600">Klasör seçilmedi</p>
                        <button
                          onClick={handleSelectWorkspace}
                          className="px-3 py-1.5 bg-sky-600/20 text-sky-400 rounded text-xs hover:bg-sky-600/30 transition-colors w-full border border-sky-500/20"
                        >
                          Klasör Aç
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="px-3 h-[22px] flex items-center gap-1.5 text-zinc-300 font-semibold cursor-default text-[12px] hover:bg-[#2a2d2e]">
                          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                          <Folder className="w-3.5 h-3.5 text-[#dcb67a] shrink-0" />
                          <span className="truncate uppercase text-[10px] tracking-wider font-bold text-zinc-400">{workspaceTree.name}</span>
                        </div>
                        {workspaceTree.children?.map((child: any, i: number) => (
                          <FileTreeNode key={i} node={child} depth={1} onSelectFile={handleSelectFile} onRefresh={handleRefreshWorkspace} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (component === "chat") {
              return (
                <div className="flex flex-col h-full p-3 overflow-hidden bg-[#1e1e1e] min-w-0">
                  {isWarning && (
                    <div className="mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded flex items-center gap-2 text-amber-400 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Seçili modeller mevcut RAM'i aşıyor olabilir.</span>
                    </div>
                  )}
                  <div className={cn(
                    "grid h-full gap-4 lg:gap-6 min-h-0",
                    layout === 'single' && "grid-cols-1",
                    layout === 'double' && "grid-cols-2",
                    layout === 'triple' && "grid-cols-3",
                    layout === 'quad' && "grid-cols-2 grid-rows-2",
                    layout === 'pentad' && "grid-cols-6 grid-rows-2",
                  )}>
                    {panes.map((pane, index) => (
                      <div
                        key={pane.id}
                        className={cn(
                          "flex flex-col bg-[#252526] rounded border border-[#3e3e42] overflow-hidden relative",
                          layout === 'pentad' && index < 3 && "col-span-2",
                          layout === 'pentad' && index >= 3 && "col-span-3",
                        )}
                      >
                        <div className="h-9 border-b border-[#3e3e42] bg-[#2d2d30] flex items-center justify-between px-2 shrink-0 border-l-2 border-l-sky-500/60">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isMockModels && (
                              <span className="text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1 py-0.5 whitespace-nowrap shrink-0">
                                ⚠ Demo
                              </span>
                            )}
                            <select
                              className="bg-transparent text-xs text-zinc-200 font-medium outline-none border-none cursor-pointer w-[200px] truncate"
                              value={pane.selectedModel?.name || ''}
                              onChange={(e) => {
                                const model = models.find(m => m.name === e.target.value);
                                const newPanes = [...panes];
                                newPanes[index].selectedModel = model || null;
                                newPanes[index].isModelStarted = false;
                                newPanes[index].messages = [];
                                newPanes[index].output = '';
                                setPanes(newPanes);
                              }}
                            >
                              <option value="" disabled className="bg-[#121214]">Select Model</option>
                              {(() => {
                                const recs: string[] = [];
                                if (activeScenario && activeScenario.layout === layout) {
                                  const sModels = activeScenario.scenario.models;
                                  if (layout === 'single') {
                                    recs.push(...sModels);
                                  } else {
                                    const vals = Object.values(sModels);
                                    if (vals[index]) recs.push(vals[index] as string);
                                  }
                                }

                                return (
                                  <>
                                    {recs.length > 0 && (
                                      <optgroup label="⭐ Recommended" className="bg-[#121214] text-purple-400">
                                        {recs.map(rm => {
                                          const recModel = models.find(m => m.name === rm);
                                          return (
                                            <option key={`rec-${rm}`} value={rm} className="bg-[#121214] text-zinc-200">
                                              {recModel && modelCanUseTools(recModel) ? '⚡ ' : ''}{rm}{recModel ? ` (${formatBytes(recModel.size)})` : ' (Recommended)'}
                                            </option>
                                          );
                                        })}
                                      </optgroup>
                                    )}
                                    <optgroup label="All Models" className="bg-[#121214] text-zinc-500">
                                      {chatModels.map(m => (
                                        <option key={m.name} value={m.name} className="bg-[#121214] text-zinc-300">
                                          {modelCanUseTools(m) ? '⚡ ' : ''}{m.name} ({formatBytes(m.size)})
                                        </option>
                                      ))}
                                    </optgroup>
                                  </>
                                );
                              })()}
                            </select>

                            {pane.selectedModel && modelCanUseTools(pane.selectedModel) && (
                              <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5 shrink-0 leading-none">
                                TOOL
                              </span>
                            )}

                            <div className="w-px h-3 bg-[#3e3e42] mx-1" />

                            <select
                              className="bg-transparent text-[11px] text-zinc-500 outline-none border-none cursor-pointer w-[100px] truncate"
                              value={pane.selectedRole}
                              onChange={(e) => {
                                const newPanes = [...panes];
                                newPanes[index].selectedRole = e.target.value;
                                setPanes(newPanes);
                              }}
                            >
                              {ROLES.map(r => (
                                <option key={r.id} value={r.id} className="bg-[#121214]">{r.name}</option>
                              ))}
                            </select>

                            {pane.selectedModel && (
                              pane.selectedModel.supportsTools ? (
                                <span className="text-[9px] px-1 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 whitespace-nowrap ml-1">
                                  tools
                                </span>
                              ) : (
                                <span className="text-[9px] px-1 py-0.5 rounded-sm bg-[#37373d] text-zinc-600 border border-[#4e4e52] whitespace-nowrap ml-1">
                                  no tools
                                </span>
                              )
                            )}
                          </div>
                          
                            <button
                              onClick={() => handleToggleModelStart(index)}
                              className={cn(
                                "w-6 h-6 rounded-sm flex items-center justify-center transition-colors",
                                pane.isModelStarted
                                  ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                  : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                              )}
                              title={pane.isModelStarted ? "Durdur" : "Başlat"}
                            >
                              {pane.isModelStarted ? <Square className="w-3 h-3 fill-current" /> : <Power className="w-3 h-3" />}
                            </button>

                            <button
                              onClick={() => {
                                if (!window.confirm('Tüm sohbet geçmişi silinecek. Emin misiniz?')) return;
                                const newPanes = [...panes];
                                newPanes[index].messages = [];
                                newPanes[index].output = '';
                                newPanes[index].thinkingLog = [];
                                setPanes(newPanes);
                              }}
                              className="w-6 h-6 rounded-sm flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                              title="Sohbeti Temizle"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>

                          <div className="flex-1 flex flex-col min-h-0">
                            <div
                              id={`chat-container-${pane.id}`}
                              className="flex-1 p-3 overflow-y-auto text-sm text-[#cccccc] leading-relaxed relative"
                            >
                              {!pane.isModelStarted ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-2">
                                  <Power className="w-7 h-7 opacity-20" />
                                  <p className="text-xs">Model başlatılmadı</p>
                                </div>
                              ) : pane.output ? (
                                <div className="space-y-3 chat-markdown">
                                  {pane.output.split(/(?=❯ )|(?=\n🤖 )|(?=🤖 )|(?=\n🔧 )|(?=\n🧠 )|(?=\n🚨 )/).map((segment, segIdx) => {
                                    const trimmed = segment.trim();
                                    if (!trimmed) return null;

                                    if (trimmed.startsWith('❯ ')) {
                                      return (
                                        <div key={segIdx} className="flex justify-end">
                                          <div className="bg-[#2a3f5f] rounded-lg rounded-br-sm px-3 py-2 max-w-[80%] text-sm text-sky-100">
                                            {trimmed.replace('❯ ', '')}
                                          </div>
                                        </div>
                                      );
                                    }

                                    if (trimmed.startsWith('🔧') || trimmed.startsWith('🧠') || trimmed.startsWith('[System]')) {
                                      return (
                                        <div key={segIdx} className="text-[11px] text-zinc-600 font-mono py-0.5 pl-3 border-l border-[#3e3e42]">
                                          {trimmed}
                                        </div>
                                      );
                                    }

                                    if (trimmed.startsWith('🚨')) {
                                      return (
                                        <div key={segIdx} className="border-l-2 border-red-500 pl-3 py-1.5 text-red-400 text-xs font-mono bg-red-950/30 rounded-r">
                                          {trimmed}
                                        </div>
                                      );
                                    }

                                    const isAiResponse = trimmed.startsWith('🤖 ') || (!trimmed.startsWith('❯ ') && !trimmed.startsWith('🔧') && !trimmed.startsWith('🧠') && !trimmed.startsWith('[System]') && !trimmed.startsWith('🚨'));
                                    const contentToRender = trimmed.startsWith('🤖 ') ? trimmed.replace('🤖 ', '') : trimmed;

                                    if (isAiResponse) {
                                      const parsedFiles = parseCodeFiles(contentToRender);
                                      return (
                                        <div key={segIdx} className="border-l-2 border-sky-500/40 pl-4 py-1">
                                          {parsedFiles.length > 0 && workspacePath && (
                                            <button
                                              onClick={() => handleWriteParsedFiles(parsedFiles, index)}
                                              className="mb-2 flex items-center gap-1.5 text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 rounded px-2.5 py-1 transition-colors"
                                            >
                                              <Check className="w-3 h-3" />
                                              {parsedFiles.length} dosyayı workspace'e yaz
                                            </button>
                                          )}
                                          <div className="max-w-none text-[#cccccc] [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-zinc-100 [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h3]:mt-2 [&_h3]:mb-0.5 [&_p]:leading-relaxed [&_p]:mb-2 [&_strong]:text-zinc-200 [&_a]:text-sky-400 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-sky-500/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-zinc-500">
                                            <ReactMarkdown
                                              remarkPlugins={[remarkGfm]}
                                              components={{
                                                code({ className, children, ...props }: any) {
                                                  const match = /language-(\w+)/.exec(className || '');
                                                  const codeString = String(children).replace(/\n$/, '');
                                                  if (match) {
                                                    return (
                                                      <div className="relative my-2">
                                                        <div className="flex items-center justify-between bg-[#1e1e1e] border border-[#3e3e42] border-b-0 rounded-t px-3 py-1">
                                                          <span className="text-[10px] font-mono text-zinc-500">{match[1]}</span>
                                                          <button
                                                            onClick={() => navigator.clipboard.writeText(codeString)}
                                                            className="text-zinc-600 hover:text-zinc-300 transition-colors"
                                                          >
                                                            <Copy className="w-3 h-3" />
                                                          </button>
                                                        </div>
                                                        <div className="overflow-x-auto bg-[#1a1a1a] border border-[#3e3e42] rounded-b p-3">
                                                          <SyntaxHighlighter
                                                            style={oneDark}
                                                            language={match[1]}
                                                            PreTag="div"
                                                            customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                                                            codeTagProps={{ style: { fontFamily: 'Consolas, "Courier New", monospace', fontSize: '12px' } }}
                                                          >
                                                            {codeString}
                                                          </SyntaxHighlighter>
                                                        </div>
                                                      </div>
                                                    );
                                                  }
                                                  return (
                                                    <code className="bg-[#2d2d30] text-sky-300 rounded-sm px-1.5 py-0.5 text-[12px] font-mono border border-[#3e3e42]" {...props}>
                                                      {children}
                                                    </code>
                                                  );
                                                },
                                                table({ children }: any) {
                                                  return <div className="overflow-x-auto my-2"><table className="min-w-full text-xs border-collapse border border-[#3e3e42]">{children}</table></div>;
                                                },
                                                th({ children }: any) {
                                                  return <th className="bg-[#2d2d30] px-3 py-1.5 text-left text-zinc-300 font-semibold border border-[#3e3e42]">{children}</th>;
                                                },
                                                td({ children }: any) {
                                                  return <td className="px-3 py-1.5 border border-[#3e3e42] text-zinc-400">{children}</td>;
                                                }
                                              }}
                                            >
                                              {contentToRender}
                                            </ReactMarkdown>
                                          </div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  })}
                                </div>
                              ) : (
                                <span className="text-zinc-600 italic text-xs">Henüz çıktı yok...</span>
                              )}
                            </div>

                            {/* Thinking Stream Accordion */}
                            {pane.thinkingLog && pane.thinkingLog.length > 0 && (
                              <div className="px-3 py-1.5 bg-[#1a1a1a] border-t border-[#3e3e42]">
                                <details className="group">
                                  <summary className="flex items-center gap-1.5 cursor-pointer list-none text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors select-none">
                                    <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform shrink-0" />
                                    <span className="font-mono">🧠 Agent is Thinking...</span>
                                    <span className="ml-auto text-[10px] text-zinc-700">{pane.thinkingLog.length} tur</span>
                                  </summary>
                                  <div className="mt-2 space-y-2 pl-4 border-l border-[#3e3e42]">
                                    {pane.thinkingLog.map((entry, ti) => (
                                      <div key={ti} className="text-[11px]">
                                        <div className="flex items-center gap-2 text-zinc-600 font-mono mb-1">
                                          <span className="text-sky-700">Tur {entry.turnIndex}</span>
                                          {entry.toolsSummary.length > 0 && (
                                            <span className="text-emerald-800">→ {entry.toolsSummary.join(', ')}</span>
                                          )}
                                        </div>
                                        <pre className="whitespace-pre-wrap break-words text-zinc-500 font-mono text-[10px] bg-[#111] rounded p-2 max-h-40 overflow-y-auto leading-relaxed">
                                          {entry.thinking}
                                        </pre>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </div>
                            )}

                            {/* Current Thinking Block */}
                            {pane.currentThinking && (
                              <div className="px-3 py-2 bg-[#0f1117] border-t border-purple-900/40">
                                <details open className="group">
                                  <summary className="flex items-center gap-1.5 cursor-pointer list-none text-[11px] text-purple-400/80 hover:text-purple-300 transition-colors select-none mb-1.5">
                                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                    <span className="font-mono">Düşünüyor...</span>
                                    <ChevronDown className="w-3 h-3 ml-auto group-open:rotate-180 transition-transform" />
                                  </summary>
                                  <pre className="whitespace-pre-wrap break-words text-[10px] font-mono text-purple-300/50 bg-[#0a0a10] rounded p-2 max-h-32 overflow-y-auto leading-relaxed border border-purple-900/20">
                                    {pane.currentThinking}
                                  </pre>
                                </details>
                              </div>
                            )}

                            {/* Tool Queue Indicator */}
                            {pane.toolQueue && pane.toolQueue.length > 0 && (() => {
                              const running = pane.toolQueue.find(t => t.status === 'running');
                              const done    = pane.toolQueue.filter(t => t.status === 'completed');
                              const pending = pane.toolQueue.filter(t => t.status === 'pending');
                              return (
                                <div className="border-t border-[#3e3e42] bg-[#141416]">
                                  {/* Active operation — prominent strip */}
                                  {running && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a2e]">
                                      <Loader2 className="w-3 h-3 text-sky-400 animate-spin shrink-0" />
                                      <ToolIcon name={running.name} className="w-3 h-3 text-sky-500 shrink-0" />
                                      <span className="text-[11px] font-mono text-sky-400">
                                        {TOOL_VERBS[running.name] ?? running.name}
                                      </span>
                                      {getToolDetail(running.name, running.args) && (
                                        <span className="text-[11px] font-mono text-sky-300/70 truncate max-w-[260px]">
                                          · {getToolDetail(running.name, running.args)}
                                        </span>
                                      )}
                                      <span className="ml-auto shrink-0">
                                        {running.startTime != null && <RunningTimer startTime={running.startTime} />}
                                      </span>
                                    </div>
                                  )}
                                  {/* Breadcrumb row — completed + pending */}
                                  {(done.length > 0 || pending.length > 0) && (
                                    <div className="flex items-center gap-1.5 px-3 py-1 overflow-x-auto">
                                      {done.map((t, i) => (
                                        <div key={i} className="flex items-center gap-1 text-[10px] font-mono text-zinc-600 shrink-0">
                                          <Check className="w-2.5 h-2.5 text-emerald-700 shrink-0" />
                                          <ToolIcon name={t.name} className="w-2.5 h-2.5" />
                                          <span className="max-w-[120px] truncate">
                                            {getToolDetail(t.name, t.args) || t.name}
                                          </span>
                                          {t.durationMs != null && (
                                            <span className="text-zinc-700">{(t.durationMs / 1000).toFixed(1)}s</span>
                                          )}
                                          {(i < done.length - 1 || pending.length > 0) && (
                                            <span className="text-zinc-800 mx-0.5">→</span>
                                          )}
                                        </div>
                                      ))}
                                      {pending.map((t, i) => (
                                        <div key={i} className="flex items-center gap-1 text-[10px] font-mono text-zinc-700 shrink-0">
                                          <div className="w-2 h-2 rounded-full border border-zinc-700 shrink-0" />
                                          <ToolIcon name={t.name} className="w-2.5 h-2.5" />
                                          <span>{TOOL_VERBS[t.name] ?? t.name}</span>
                                          {i < pending.length - 1 && <span className="text-zinc-800 mx-0.5">→</span>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Active File Context Badge */}
                            {activeFile && pane.isContextActive !== false && (
                              <div className="px-3 py-1.5 flex items-center border-t border-[#3e3e42] bg-[#1e1e1e]">
                                <div className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/20 rounded-sm px-2 py-0.5 text-[10px] text-sky-400">
                                  <File className="w-3 h-3" />
                                  <span className="max-w-[200px] truncate font-mono">{activeFile.path.split(/[\\/]/).pop()}</span>
                                  <button
                                    onClick={() => {
                                      const newPanes = [...panes];
                                      newPanes[index].isContextActive = false;
                                      setPanes(newPanes);
                                    }}
                                    className="ml-0.5 hover:text-white transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="border-t border-[#3e3e42] bg-[#1e1e1e] p-2 shrink-0">
                              <div className={cn(
                                "flex gap-2 items-end rounded border transition-colors",
                                pane.isModelStarted && !pane.isGenerating
                                  ? "border-[#3e3e42] focus-within:border-sky-500/50 bg-[#2d2d30]"
                                  : "border-[#2d2d30] bg-[#252526] opacity-60"
                              )}>
                                <textarea
                                  disabled={!pane.isModelStarted || pane.isGenerating}
                                  className="flex-1 bg-transparent border-none outline-none text-[13px] font-mono text-zinc-200 resize-none min-h-[32px] max-h-32 leading-5 placeholder:text-zinc-600 disabled:opacity-50 px-3 py-2"
                                  placeholder={pane.isModelStarted ? (ROLES.find(r => r.id === pane.selectedRole)?.placeholder || "Mesaj yaz...") : "Modeli başlat..."}
                                  rows={1}
                                  value={pane.prompt}
                                  onChange={(e) => {
                                    const newPanes = [...panes];
                                    newPanes[index].prompt = e.target.value;
                                    setPanes(newPanes);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      handleGenerate(index);
                                    }
                                  }}
                                  onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                                  }}
                                />
                                <button
                                  disabled={!pane.isModelStarted || pane.isGenerating || !pane.prompt.trim()}
                                  onClick={() => handleGenerate(index)}
                                  className="m-1.5 px-2.5 py-1.5 rounded-sm bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center disabled:opacity-30 disabled:hover:bg-sky-600 transition-colors shrink-0 self-end"
                                >
                                  <Play className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            if (component === "editor") {
              if (diffApproval) {
                return (
                  <div className="flex-1 flex flex-col h-full bg-[#1e1e1e]">
                    <div className="px-4 py-2 border-b border-[#3e3e42] flex items-center justify-between bg-[#2d2d30]">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-medium text-zinc-200">Agent Değişiklik Önerdi</span>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-500">{diffApproval.path}</span>
                    </div>
                    <div className="flex-1 min-h-0 relative">
                      <DiffEditor
                        original={diffApproval.oldContent || ''}
                        modified={diffApproval.newContent || ''}
                        language={getLanguageFromPath(diffApproval.path)}
                        theme="vs-dark"
                        options={{
                          renderSideBySide: true,
                          minimap: { enabled: false },
                          readOnly: true,
                          scrollBeyondLastLine: false,
                          fontSize: 12
                        }}
                      />
                    </div>
                    <div className="p-3 border-t border-[#3e3e42] bg-[#2d2d30] flex items-center justify-between gap-3">
                      <input
                        type="text"
                        placeholder="İsteğe bağlı geri bildirim..."
                        value={diffFeedback}
                        onChange={e => setDiffFeedback(e.target.value)}
                        className="flex-1 bg-[#1e1e1e] border border-[#3e3e42] rounded px-3 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-sky-500/50"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResolveApproval(false)}
                          className="px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded text-[11px] font-medium transition-colors"
                        >
                          Reddet
                        </button>
                        <button
                          onClick={() => {
                            handleResolveApproval(true);
                            if (activeFile && activeFile.path === diffApproval.path) {
                              setActiveFile({ ...activeFile, content: diffApproval.newContent! });
                            }
                          }}
                          className="px-3 py-1.5 bg-sky-600/20 text-sky-400 hover:bg-sky-600/30 border border-sky-500/30 rounded flex items-center gap-1.5 text-[11px] font-medium transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Uygula
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (activeFile) {
                return (
                  <div className="flex-1 flex flex-col h-full bg-[#1e1e1e]">
                    <div className="px-3 py-1.5 border-b border-[#3e3e42] bg-[#2d2d30] flex items-center justify-between">
                      <div className="flex items-center gap-2 max-w-[70%]">
                        <File className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="text-xs font-mono text-zinc-300 truncate" title={activeFile.path}>
                          {activeFile.path.split(/[\\/]/).pop()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleEditorSave}
                          className="px-2 py-0.5 bg-[#37373d] hover:bg-[#4e4e52] rounded text-[10px] text-zinc-400 hover:text-zinc-200 font-medium transition-colors border border-[#4e4e52]"
                        >
                          Kaydet
                        </button>
                        <button onClick={() => setActiveFile(null)} className="text-zinc-600 hover:text-zinc-300 p-1 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 relative">
                      <Editor
                        language={activeFile.language}
                        theme="vs-dark"
                        value={activeFile.content}
                        onChange={(val) => setActiveFile(prev => prev ? { ...prev, content: val || '' } : null)}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          wordWrap: 'on',
                          scrollBeyondLastLine: false,
                        }}
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div className="flex-1 flex flex-col items-center justify-center h-full bg-[#1e1e1e] text-zinc-600 gap-3">
                  <File className="w-10 h-10 opacity-20" />
                  <p className="text-xs">Düzenlemek için workspace'ten dosya seç.</p>
                </div>
              );
            }

            if (component === "git") {
              const files = gitStatus ? gitStatus.split('\n').filter(Boolean).map(line => {
                const status = line.substring(0, 2).trim();
                const path = line.substring(3);
                return { status, path };
              }) : [];

              return (
                <div className="flex flex-col h-full bg-[#252526] min-h-0">
                  <div className="px-3 py-2 border-b border-[#3e3e42] flex items-center justify-between shrink-0">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.12em]">KAYNAK KONTROL</span>
                    <button
                      onClick={() => handleRefreshWorkspace()}
                      className="p-1 hover:bg-[#2a2d2e] rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                      disabled={isRefreshing}
                    >
                      <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto text-[12px]">
                    {files.length > 0 ? (
                      <>
                        <div className="px-3 py-1 text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-[#3e3e42]">Değişiklikler ({files.length})</div>
                        {files.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 h-[22px] hover:bg-[#2a2d2e] cursor-default transition-colors">
                            <span className={cn(
                              "w-3 text-[10px] font-bold text-center shrink-0",
                              f.status === 'M' ? "text-amber-400" :
                              f.status === 'A' ? "text-emerald-400" :
                              f.status === 'D' ? "text-red-400" : "text-zinc-500"
                            )}>{f.status}</span>
                            <span className="text-zinc-400 truncate flex-1 font-mono">{f.path}</span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-30">
                        <GitCommit className="w-7 h-7 mb-2" />
                        <p className="text-xs">Değişiklik yok veya git deposu değil.</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (component === "terminal") {
              return (
                <div className="flex flex-col h-full bg-[#1e1e1e] overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-[#3e3e42] bg-[#2d2d30] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.12em]">TERMINAL</span>
                      {autoAccept && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded font-medium">AUTO-ACCEPT</span>
                      )}
                    </div>
                    <button
                      onClick={() => setTerminalOutput('')}
                      className="p-1 hover:bg-[#2a2d2e] rounded text-zinc-600 hover:text-zinc-300 transition-colors"
                      title="Temizle"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {terminalApproval && (
                    <div className="border-b border-[#3e3e42] bg-[#1a1a1a] shrink-0">
                      <div className="px-4 py-2 flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-[11px] font-medium text-amber-300">Agent komut çalıştırmak istiyor</span>
                        <span className="text-[10px] text-zinc-600 ml-auto font-mono">{terminalApproval.cwd}</span>
                      </div>
                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 font-mono text-[12px] text-emerald-400 bg-[#111] border border-[#3e3e42] rounded px-3 py-2">
                          <span className="text-zinc-600 mr-2">$</span>{terminalApproval.command}
                        </div>
                        <button
                          onClick={() => handleResolveTerminalApproval(false)}
                          className="px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded text-[11px] font-medium transition-colors shrink-0"
                        >
                          Reddet
                        </button>
                        <button
                          onClick={() => handleResolveTerminalApproval(true)}
                          className="px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 rounded flex items-center gap-1.5 text-[11px] font-medium transition-colors shrink-0"
                        >
                          <Play className="w-3 h-3" /> Çalıştır
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto p-3 whitespace-pre-wrap break-all text-[12px] font-mono text-[#cccccc] selection:bg-sky-500/30">
                    {terminalOutput || <span className="text-zinc-700 italic">Komut çıktısı bekleniyor...</span>}
                    <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                  </div>
                </div>
              );
            }

            return null;
          }} 
        />
      </main>



      <ModelLibrary 
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        models={models}
        onModelsChange={fetchModels}
      />

      {/* Smart Teams Modal */}
      {isSmartTeamsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70">
          <div className="bg-[#252526] border border-[#3e3e42] rounded-lg w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-5 py-3.5 border-b border-[#3e3e42] flex items-center justify-between bg-[#2d2d30]">
              <div className="flex items-center gap-3">
                <Play className="w-4 h-4 text-sky-400" />
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">Akıllı Ekip Senaryoları</h2>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Göreve göre optimize edilmiş model kombinasyonları.</p>
                </div>
              </div>
              <button
                onClick={() => setIsSmartTeamsOpen(false)}
                className="w-7 h-7 rounded hover:bg-[#3e3e42] flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {Object.entries(TEAM_SCENARIOS).map(([layoutKey, scenarios]) => (
                <div key={layoutKey} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600">{layoutKey}</span>
                    <div className="flex-1 h-px bg-[#3e3e42]" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(scenarios as any[]).map((s: any, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => {
                          applyScenario(layoutKey, s);
                          setScenarioApplied(s.team || s.category);
                          setTimeout(() => {
                            setScenarioApplied(null);
                            setIsSmartTeamsOpen(false);
                          }, 900);
                        }}
                        className="group bg-[#2d2d30] hover:bg-[#2a3f5f]/40 border border-[#3e3e42] hover:border-sky-500/40 rounded p-3.5 cursor-pointer transition-all duration-200"
                      >
                        <div className="flex flex-col h-full gap-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-sky-300 transition-colors leading-tight">
                              {s.team || s.category}
                            </h3>
                            <span className="px-1.5 py-0.5 bg-[#1e1e1e] border border-[#4e4e52] rounded-sm text-[9px] font-mono text-zinc-600 uppercase shrink-0">
                              {layoutKey}
                            </span>
                          </div>
                          {s.role && (
                            <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                              {s.role}
                            </p>
                          )}
                          <div className="mt-auto pt-2.5 border-t border-[#3e3e42] flex flex-wrap gap-1">
                            {Array.isArray(s.models)
                              ? s.models.map((m: string) => (
                                  <span key={m} className="px-1.5 py-0.5 bg-[#1e1e1e] border border-[#4e4e52] rounded-sm text-[9px] font-mono text-zinc-500">
                                    {m}
                                  </span>
                                ))
                              : Object.entries(s.models).map(([role, m]: [string, any]) => (
                                  <span key={role} className="px-1.5 py-0.5 bg-[#1e1e1e] border border-[#4e4e52] rounded-sm text-[9px] font-mono text-zinc-500">
                                    <span className="text-sky-500/70 mr-1">{role}:</span>{m}
                                  </span>
                                ))
                            }
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-[#3e3e42] bg-[#2d2d30] text-center space-y-1">
              {scenarioApplied && (
                <p className="text-[11px] text-emerald-400 font-medium">✓ "{scenarioApplied}" uygulandı</p>
              )}
              <p className="text-[10px] text-zinc-600">
                Önerilen modellerin sisteminizde kurulu olması gerekir. Bulunamazsa listedeki ilk model seçilir.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
