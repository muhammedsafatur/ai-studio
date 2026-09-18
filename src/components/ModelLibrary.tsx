import { useState } from 'react';
import { Download, Trash2, FolderOpen, UploadCloud, X, Box, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ModelLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  models: OllamaModel[];
  onModelsChange: () => void;
}

export default function ModelLibrary({ isOpen, onClose, models, onModelsChange }: ModelLibraryProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'import' | 'pull'>('list');
  const [pullName, setPullName] = useState('');
  const [pullProgress, setPullProgress] = useState<any>(null);
  
  const [importFile, setImportFile] = useState<string | null>(null);
  const [importName, setImportName] = useState('');
  const [importPrompt, setImportPrompt] = useState('');
  const [importProgress, setImportProgress] = useState<any>(null);

  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  const handleDelete = async (name: string) => {
    if (confirm(`Are you sure you want to delete model "${name}"?`)) {
      if (window.electronAPI) {
        await window.electronAPI.deleteOllamaModel(name);
        onModelsChange();
      }
    }
  };

  const handlePull = async () => {
    if (!pullName.trim() || !window.electronAPI) return;
    setIsProcessing(true);
    setPullProgress({ status: 'Starting pull...' });
    
    window.electronAPI.onOllamaPullProgress((data) => {
      setPullProgress(data);
    });

    try {
      await window.electronAPI.pullOllamaModel(pullName.trim());
      setPullProgress({ status: 'Success!' });
      onModelsChange();
      setTimeout(() => {
        setPullName('');
        setPullProgress(null);
        setActiveTab('list');
      }, 1500);
    } catch (err) {
      setPullProgress({ status: 'Error pulling model', error: String(err) });
    } finally {
      setIsProcessing(false);
      window.electronAPI.removeAllListeners('ollama-pull-progress');
    }
  };

  const handleSelectFile = async () => {
    if (window.electronAPI) {
      const path = await window.electronAPI.selectGgufFile();
      if (path) {
        setImportFile(path);
        // Suggest a name based on filename if empty
        if (!importName) {
          const nameMatch = path.match(/([^\/\\]+)(?=\.\w+$)/);
          if (nameMatch) setImportName(nameMatch[0].toLowerCase().replace(/[^a-z0-9-]/g, '-'));
        }
      }
    }
  };

  const handleImport = async () => {
    if (!importFile || !importName.trim() || !window.electronAPI) return;
    setIsProcessing(true);
    setImportProgress({ status: 'Generating Modelfile...' });

    let modelfileStr = `FROM "${importFile}"\n`;
    if (importPrompt.trim()) {
      modelfileStr += `SYSTEM """${importPrompt.trim()}"""\n`;
    }

    window.electronAPI.onOllamaCreateProgress((data) => {
      setImportProgress(data);
    });

    try {
      await window.electronAPI.createOllamaModel(importName.trim(), modelfileStr);
      setImportProgress({ status: 'Success!' });
      onModelsChange();
      setTimeout(() => {
        setImportFile(null);
        setImportName('');
        setImportPrompt('');
        setImportProgress(null);
        setActiveTab('list');
      }, 1500);
    } catch (err) {
      setImportProgress({ status: 'Error importing model', error: String(err) });
    } finally {
      setIsProcessing(false);
      window.electronAPI.removeAllListeners('ollama-create-progress');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1a1b26] w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800">
        
        {/* Modal Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-3 text-lg font-bold">
            <Box className="w-5 h-5 text-purple-500" />
            Model Library
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500 dark:text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation */}
        <div className="flex px-6 pt-4 gap-6 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={() => setActiveTab('list')}
            className={cn(
              "pb-3 text-sm font-medium transition-colors border-b-2",
              activeTab === 'list' 
                ? "border-purple-500 text-purple-600 dark:text-purple-400" 
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            Installed Models
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={cn(
              "pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2",
              activeTab === 'import' 
                ? "border-purple-500 text-purple-600 dark:text-purple-400" 
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            <UploadCloud className="w-4 h-4" />
            Import GGUF
          </button>
          <button
            onClick={() => setActiveTab('pull')}
            className={cn(
              "pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2",
              activeTab === 'pull' 
                ? "border-purple-500 text-purple-600 dark:text-purple-400" 
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            <Download className="w-4 h-4" />
            Pull from Registry
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* TAB: LIST */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              {models.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Box className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No models installed yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {models.map(model => {
                    const isEmbedding = model.name.toLowerCase().includes('embed') || model.name.toLowerCase().includes('bge-m3') || model.name.toLowerCase().includes('nomic');
                    
                    return (
                    <div key={model.digest} className="bg-gray-50 dark:bg-[#12121a] border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-1">
                          <div className="font-semibold text-lg flex items-center gap-2 flex-wrap">
                            {model.name}
                            {isEmbedding ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 whitespace-nowrap">
                                Embedding Model
                              </span>
                            ) : model.supportsTools ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                🤖 Ajan (Tools)
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 whitespace-nowrap">
                                💬 Sohbet
                              </span>
                            )}
                          </div>
                          {isEmbedding && <div className="text-[10px] text-amber-500/70">Sohbet edemez.</div>}
                        </div>
                        <button 
                          onClick={() => handleDelete(model.name)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete Model"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                        <span className="bg-white dark:bg-gray-800 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700">
                          {formatBytes(model.size)}
                        </span>
                        <span className="truncate" title={model.digest}>
                          {model.digest.substring(0, 12)}...
                        </span>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          )}

          {/* TAB: IMPORT GGUF */}
          {activeTab === 'import' && (
            <div className="max-w-xl mx-auto space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Model File (.gguf)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={importFile || ''}
                    placeholder="No file selected..."
                    className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 text-sm text-gray-500 outline-none"
                  />
                  <button 
                    onClick={handleSelectFile}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    <FolderOpen className="w-4 h-4" /> Browse
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Model Name</label>
                <input 
                  type="text" 
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="e.g. my-custom-model"
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">System Prompt (Optional)</label>
                <textarea 
                  value={importPrompt}
                  onChange={(e) => setImportPrompt(e.target.value)}
                  placeholder="You are a helpful AI assistant..."
                  className="w-full h-32 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              {importProgress && (
                <div className="p-4 bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 rounded-xl">
                  <div className="flex items-center gap-3 text-sm font-medium text-purple-700 dark:text-purple-300">
                    {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {importProgress.status}
                  </div>
                  {importProgress.error && (
                    <div className="mt-2 text-xs text-red-500">{importProgress.error}</div>
                  )}
                </div>
              )}

              <button
                disabled={!importFile || !importName || isProcessing}
                onClick={handleImport}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:dark:bg-gray-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                {isProcessing ? 'Importing Model...' : 'Build & Import Model'}
              </button>
            </div>
          )}

          {/* TAB: PULL MODEL */}
          {activeTab === 'pull' && (
            <div className="max-w-xl mx-auto space-y-6 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Model Name from Ollama Registry</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={pullName}
                    onChange={(e) => setPullName(e.target.value)}
                    placeholder="e.g. llama3, mistral, phi3"
                    className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                    onKeyDown={(e) => e.key === 'Enter' && handlePull()}
                  />
                  <button 
                    disabled={!pullName.trim() || isProcessing}
                    onClick={handlePull}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:dark:bg-gray-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Pull
                  </button>
                </div>
              </div>

              {pullProgress && (
                <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{pullProgress.status}</span>
                    {pullProgress.total && pullProgress.completed && (
                      <span className="text-gray-500">
                        {Math.round((pullProgress.completed / pullProgress.total) * 100)}%
                      </span>
                    )}
                  </div>
                  {pullProgress.total && pullProgress.completed && (
                    <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${(pullProgress.completed / pullProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                  {pullProgress.error && (
                    <div className="text-xs text-red-500">{pullProgress.error}</div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
