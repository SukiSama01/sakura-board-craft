import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Upload, Image as ImageIcon, Layout, Eye, EyeOff, Save, Download, 
  Settings, MousePointer2, Type, Square, Move, Copy, Scissors, 
  ClipboardPaste, Trash2, Undo2, Redo2, ChevronRight, ChevronLeft,
  Plus, Layers, Maximize, AlertCircle, Info, X, CheckCircle2, Bot, Lock, Unlock
} from 'lucide-react';

// --- 常量与默认值 ---
const DEFAULT_KEY = {
  id: '', type: 'key', name: '按键',
  x: 0, y: 0, width: 40, height: 40,
  fillColor: 'rgba(255, 255, 255, 0.5)', borderColor: '#f472b6', borderWidth: 1,
  backgroundImage: null, backgroundSize: 'cover', backgroundPosition: 'center',
};

const DEFAULT_BG = {
  id: '', type: 'background', name: '键盘膜背景',
  x: 0, y: 0, width: 800, height: 300,
  fillColor: '#fbcfe8', borderColor: 'transparent', borderWidth: 0,
  backgroundImage: null, backgroundSize: 'cover', backgroundPosition: 'center',
};

const DEFAULT_FILM_BOX = {
  id: '__FILM_BOX__', type: 'filmBox', name: '刀图外框 (主膜)',
  padding: 20,
  fillColor: 'rgba(253, 242, 248, 0.4)', borderColor: '#f472b6', borderWidth: 2, borderRadius: 12,
  scaleSync: true, // 内部按键跟随缩放
  lockAspectRatio: true, // 锁定外框本身长宽比
  visible: true
};

// --- 大模型服务商预设池 ---
const AI_PROVIDERS = {
  qwen: { name: '阿里云通义千问 (Qwen-VL)', defaultModel: 'qwen-vl-max' },
  zhipu: { name: '智谱 AI (GLM-4V)', defaultModel: 'glm-4v' },
  google: { name: 'Google (Gemini)', defaultModel: 'gemini-2.5-flash' },
  openai: { name: 'OpenAI (GPT-4o 等)', defaultModel: 'gpt-4o' },
  claude: { name: 'Anthropic (Claude)', defaultModel: 'claude-3-5-sonnet-20241022' },
  minimax: { name: 'MiniMax', defaultModel: 'abab6.5s-chat' },
  custom: { name: '自定义兼容节点 (OpenAI格式)', defaultModel: 'gpt-4o' }
};

// --- 工具函数 ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const clone = (obj) => JSON.parse(JSON.stringify(obj));

// 指数退避重试网络请求封装
const fetchWithRetry = async (url, options, retries = 3) => {
  const delays = [1000, 2000, 4000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};

export default function App() {
  // --- 状态管理 ---
  const [elements, setElements] = useState([DEFAULT_FILM_BOX]);
  const [selectedId, setSelectedId] = useState(null);
  
  const [baseImage, setBaseImage] = useState(null);
  const [showBaseImage, setShowBaseImage] = useState(true);
  
  // 🌟 AI 接入相关状态
  const [aiProvider, setAiProvider] = useState('qwen');
  const [aiModel, setAiModel] = useState(AI_PROVIDERS['qwen'].defaultModel);
  const [userApiKey, setUserApiKey] = useState('');
  
  const [keyLibrary, setKeyLibrary] = useState([
    {
      group: 'Thinkbook16+ 专属按键组',
      items: [
        { name: "ESC 键", width: 51, height: 30 },
        { name: "F1-F12 功能键", width: 40, height: 30 },
        { name: "普通字母/数字键", width: 51, height: 51 },
        { name: "方向键 (上下半高)", width: 51, height: 25 },
        { name: "方向键 (左右全高)", width: 51, height: 51 },
        { name: "Tab 键", width: 76, height: 51 },
        { name: "Caps Lock", width: 90, height: 51 },
        { name: "左 Shift", width: 115, height: 51 },
        { name: "右 Shift", width: 135, height: 51 },
        { name: "Ctrl / Alt", width: 64, height: 51 },
        { name: "空格键", width: 260, height: 51 },
        { name: "小键盘 0 键", width: 102, height: 51 },
        { name: "小键盘竖向回车", width: 51, height: 102 }
      ]
    }
  ]);
  
  const [panelOpen, setPanelOpen] = useState(true);
  const [showKeyLibraryModal, setShowKeyLibraryModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [scaleSync, setScaleSync] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  
  const [confirmAction, setConfirmAction] = useState({ isOpen: false, message: '', action: null });
  const [toast, setToast] = useState({ isOpen: false, message: '', type: 'info' });

  const [history, setHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [clipboard, setClipboard] = useState(null);

  const canvasRef = useRef(null);
  const dragInfo = useRef({ startX: 0, startY: 0, origX: 0, origY: 0, origW: 0, origH: 0, childrenMap: {}, padding: 0 });
  const stateRef = useRef({ elements, selectedId, history, historyIndex, clipboard });

  useEffect(() => {
    stateRef.current = { elements, selectedId, history, historyIndex, clipboard };
  }, [elements, selectedId, history, historyIndex, clipboard]);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast(prev => prev.message === message ? { ...prev, isOpen: false } : prev);
    }, 4000);
  }, []);

  const pushHistory = useCallback((newElements) => {
    const newHistory = stateRef.current.history.slice(0, stateRef.current.historyIndex + 1);
    newHistory.push(clone(newElements));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setElements(newElements);
  }, []);

  const updateElement = (id, updates) => {
    const newElements = elements.map(el => el.id === id ? { ...el, ...updates } : el);
    pushHistory(newElements);
  };

  const handleProviderChange = (e) => {
    const p = e.target.value;
    setAiProvider(p);
    setAiModel(AI_PROVIDERS[p].defaultModel);
  };

  // --- 快捷键与核心交互 ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      const { elements, selectedId, history, historyIndex, clipboard } = stateRef.current;
      const selected = elements.find(el => el.id === selectedId);

      if (selected && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        
        const newElements = elements.map(el => {
          if (selected.type === 'filmBox') {
             return el.type === 'key' ? { ...el, x: el.x + dx, y: el.y + dy } : el;
          }
          return el.id === selectedId ? { ...el, x: el.x + dx, y: el.y + dy } : el;
        });
        pushHistory(newElements);
      }

      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        if (historyIndex > 0) {
          setHistoryIndex(historyIndex - 1);
          setElements(clone(history[historyIndex - 1]));
        }
      }
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        if (historyIndex < history.length - 1) {
          setHistoryIndex(historyIndex + 1);
          setElements(clone(history[historyIndex + 1]));
        }
      }
      if (e.ctrlKey && e.key === 'c' && selected && selected.type !== 'filmBox') {
        setClipboard(clone(selected));
        showToast('已复制该元素', 'info');
      }
      if (e.ctrlKey && e.key === 'x' && selected && selected.type !== 'filmBox') {
        setClipboard(clone(selected));
        pushHistory(elements.filter(el => el.id !== selectedId));
        setSelectedId(null);
        showToast('已剪切该元素', 'info');
      }
      if (e.ctrlKey && e.key === 'v' && clipboard) {
        const newEl = { ...clone(clipboard), id: generateId(), x: clipboard.x + 20, y: clipboard.y + 20 };
        pushHistory([...elements, newEl]);
        setSelectedId(newEl.id);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        if (selected.type === 'filmBox') {
          showToast("刀图外框不可直接删除，请使用右上角的清空画布功能", "warning");
        } else {
          pushHistory(elements.filter(el => el.id !== selectedId));
          setSelectedId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pushHistory, showToast]);

  // --- 拖拽与缩放逻辑 ---
  const handlePointerDown = (e, id, action = 'drag') => {
    e.stopPropagation();
    const el = elements.find(el => el.id === id);
    if (!el) return;
    
    setSelectedId(id);
    if (action === 'drag') setIsDragging(true);
    if (action === 'resize') setIsResizing(true);

    if (el.type === 'filmBox') {
      const keys = elements.filter(k => k.type === 'key');
      if (keys.length === 0) return;

      const minX = Math.min(...keys.map(k => k.x));
      const minY = Math.min(...keys.map(k => k.y));
      const maxX = Math.max(...keys.map(k => k.x + k.width));
      const maxY = Math.max(...keys.map(k => k.y + k.height));

      const p = el.padding || 0;
      const origW = (maxX - minX) + p * 2;
      const origH = (maxY - minY) + p * 2;

      const childrenMap = {};
      keys.forEach(k => {
        childrenMap[k.id] = { origX: k.x, origY: k.y, origW: k.width, origH: k.height };
      });

      dragInfo.current = {
        startX: e.clientX, startY: e.clientY,
        origX: minX - p, origY: minY - p,
        origW, origH,
        childrenMap,
        padding: p
      };
      return;
    }

    const childrenMap = {};
    if (el.type === 'background') {
      elements.forEach(k => {
        if (k.type === 'key') {
          const cx = k.x + k.width / 2;
          const cy = k.y + k.height / 2;
          if (cx >= el.x && cx <= el.x + el.width && cy >= el.y && cy <= el.y + el.height) {
            childrenMap[k.id] = { origX: k.x, origY: k.y, origW: k.width, origH: k.height };
          }
        }
      });
    }

    dragInfo.current = {
      startX: e.clientX, startY: e.clientY,
      origX: el.x, origY: el.y, origW: el.width, origH: el.height,
      childrenMap
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging && !isResizing) return;
    if (!selectedId) return;

    const dx = e.clientX - dragInfo.current.startX;
    const dy = e.clientY - dragInfo.current.startY;
    
    const selectedElement = elements.find(item => item.id === selectedId);
    if (!selectedElement) return;

    // --- 处理刀图外框的拖拽与缩放 ---
    if (selectedElement.type === 'filmBox') {
      const p = dragInfo.current.padding;
      let newW = Math.max(20, dragInfo.current.origW + dx);
      let newH = Math.max(20, dragInfo.current.origH + dy);

      // 增加比例缩放锁定逻辑
      if (isResizing && selectedElement.lockAspectRatio) {
        const scaleX = newW / dragInfo.current.origW;
        const scaleY = newH / dragInfo.current.origH;
        // 以变化最大的那一条边为缩放基准
        const scale = Math.max(scaleX, scaleY);
        newW = dragInfo.current.origW * scale;
        newH = dragInfo.current.origH * scale;
      }

      const origKeyW = dragInfo.current.origW - p * 2;
      const origKeyH = dragInfo.current.origH - p * 2;
      const newKeyW = Math.max(10, newW - p * 2);
      const newKeyH = Math.max(10, newH - p * 2);

      const rx = newKeyW / origKeyW;
      const ry = newKeyH / origKeyH;

      setElements(prev => prev.map(item => {
        if (item.type !== 'key') return item;
        const origChild = dragInfo.current.childrenMap[item.id];
        if (!origChild) return item;

        if (isDragging) {
          return { ...item, x: origChild.origX + dx, y: origChild.origY + dy };
        } else if (isResizing) {
          const keyOriginX = dragInfo.current.origX + p;
          const keyOriginY = dragInfo.current.origY + p;
          
          return {
            ...item,
            x: keyOriginX + (origChild.origX - keyOriginX) * rx,
            y: keyOriginY + (origChild.origY - keyOriginY) * ry,
            width: selectedElement.scaleSync ? Math.max(5, origChild.origW * rx) : origChild.origW,
            height: selectedElement.scaleSync ? Math.max(5, origChild.origH * ry) : origChild.origH
          };
        }
        return item;
      }));
      return;
    }

    setElements(prev => {
      const el = prev.find(item => item.id === selectedId);
      if (!el) return prev;

      let newW = Math.max(10, dragInfo.current.origW + dx);
      let newH = Math.max(10, dragInfo.current.origH + dy);

      return prev.map(item => {
        if (item.id === selectedId) {
          if (isDragging) {
            let newX = dragInfo.current.origX + dx;
            let newY = dragInfo.current.origY + dy;

            if (item.type === 'background' && snapEnabled) {
              const snapThreshold = 10;
              prev.forEach(other => {
                if (other.id !== item.id && other.type === 'background') {
                  if (Math.abs(newX - (other.x + other.width)) < snapThreshold) newX = other.x + other.width;
                  if (Math.abs(newY - (other.y + other.height)) < snapThreshold) newY = other.y + other.height;
                  if (Math.abs((newX + item.width) - other.x) < snapThreshold) newX = other.x - item.width;
                  if (Math.abs((newY + item.height) - other.y) < snapThreshold) newY = other.y - item.height;
                }
              });
            }
            return { ...item, x: newX, y: newY };
          } else if (isResizing) {
            return { ...item, width: newW, height: newH };
          }
        } else if (scaleSync && item.type === 'key' && dragInfo.current.childrenMap?.[item.id]) {
          const origChild = dragInfo.current.childrenMap[item.id];
          if (isResizing) {
            const ratioX = newW / dragInfo.current.origW;
            const ratioY = newH / dragInfo.current.origH;
            return {
              ...item,
              x: dragInfo.current.origX + (origChild.origX - dragInfo.current.origX) * ratioX,
              y: dragInfo.current.origY + (origChild.origY - dragInfo.current.origY) * ratioY,
              width: Math.max(5, origChild.origW * ratioX),
              height: Math.max(5, origChild.origH * ratioY)
            };
          } else if (isDragging) {
            return { ...item, x: origChild.origX + dx, y: origChild.origY + dy };
          }
        }
        return item;
      });
    });
  };

  const handlePointerUp = () => {
    if (isDragging || isResizing) {
      setIsDragging(false);
      setIsResizing(false);
      pushHistory(elements);
    }
  };

  const handleDoubleClick = (e, id) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (ev) => {
      const file = ev.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (readEv) => {
          updateElement(id, { backgroundImage: readEv.target.result });
          showToast("✨ 贴图快捷上传成功！", "success");
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleAddElement = (type, preset = null) => {
    const base = type === 'key' ? DEFAULT_KEY : DEFAULT_BG;
    const newEl = clone({ ...base, ...preset, id: generateId() });
    newEl.x = elements.length * 10 % 100 + 50;
    newEl.y = elements.length * 10 % 100 + 50;
    pushHistory([...elements, newEl]);
    setSelectedId(newEl.id);
  };

  const handleImageUpload = (e, callback) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => callback(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleAIParse = async () => {
    if (!baseImage) {
      showToast("请先上传键盘底图，AI 需要根据底图进行解析！", "warning");
      return;
    }
    if (!userApiKey) {
      showToast("请先在下方输入您的 API Key！", "error");
      return;
    }

    const cleanApiKey = userApiKey.trim();
    if (/[^\x20-\x7E]/.test(cleanApiKey)) {
      showToast("API Key 格式错误：包含中文、全角符号或不可见字符，请检查后重新输入。", "error");
      return;
    }

    setLoadingAI(true);
    try {
      const match = baseImage.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!match) throw new Error("无效的图片格式，无法解析。");
      const mimeType = match[1];
      const base64Data = match[2];

      const systemPrompt = `Analyze this keyboard image and detect all the physical keys. Return ONLY a strictly valid JSON array of objects. 
CRITICAL RULES:
1. EVERY property name MUST be enclosed in double quotes.
2. Output ONLY raw JSON. Do not use markdown code blocks (\`\`\`json).
3. ABSOLUTELY NO COMMENTS. Do not use // or /* */.
4. DO NOT TRUNCATE OR BE LAZY! You MUST map EVERY SINGLE KEY on the keyboard. Do NOT use placeholders like "...and so on" or "etc". I need the complete array of all keys.

Example format:
[{"name":"ESC","x":10,"y":10,"width":40,"height":40}, {"name":"F1","x":60,"y":10,"width":40,"height":40}]`;

      let url = '';
      let options = {};
      let extractedText = '';
      let rawResponse = null;

      switch (aiProvider) {
        case 'google':
          url = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${cleanApiKey}`;
          options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [
                  { text: systemPrompt },
                  { inlineData: { mimeType, data: base64Data } }
                ]
              }],
              generationConfig: { responseMimeType: "application/json" }
            })
          };
          rawResponse = await fetchWithRetry(url, options);
          extractedText = rawResponse.candidates?.[0]?.content?.parts?.[0]?.text;
          break;

        case 'claude':
          url = 'https://api.anthropic.com/v1/messages';
          options = {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-api-key': cleanApiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerously-allow-browser': 'true'
            },
            body: JSON.stringify({
              model: aiModel,
              max_tokens: 4096, 
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: systemPrompt },
                  { type: "image", source: { type: "base64", media_type: mimeType, data: base64Data } }
                ]
              }]
            })
          };
          rawResponse = await fetchWithRetry(url, options);
          extractedText = rawResponse.content?.[0]?.text;
          break;
          
        case 'openai':
        case 'qwen':
        case 'zhipu':
        case 'minimax':
        case 'custom':
        default:
          let baseUrl = 'https://api.openai.com/v1/chat/completions';
          
          if (aiProvider === 'qwen') {
            baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
          } else if (aiProvider === 'zhipu') {
            baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
          } else if (aiProvider === 'minimax') {
            baseUrl = 'https://api.minimax.chat/v1/text/chatcompletion_v2';
          }

          url = baseUrl;
          options = {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${cleanApiKey}`
            },
            body: JSON.stringify({
              model: aiModel,
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: systemPrompt },
                  { type: "image_url", image_url: { url: baseImage } }
                ]
              }],
              max_tokens: 2048
            })
          };
          rawResponse = await fetchWithRetry(url, options);
          extractedText = rawResponse.choices?.[0]?.message?.content;
          break;
      }

      if (!extractedText) {
        const errDetails = rawResponse?.error?.message || rawResponse?.message || rawResponse?.base_resp?.status_msg || JSON.stringify(rawResponse);
        throw new Error(`大模型未能返回有效文本数据。平台附加信息: ${errDetails}`);
      }

      let cleanText = extractedText
        .replace(/\`{3}json/gi, '') 
        .replace(/\`{3}/g, '')      
        .replace(/\/\/.*$/gm, '')   
        .replace(/\/\*[\s\S]*?\*\//g, '') 
        .replace(/,\s*([\]}])/g, '$1') 
        .trim();

      const startIndex = cleanText.indexOf('[');
      const endIndex = cleanText.lastIndexOf(']');
      if (startIndex !== -1 && endIndex !== -1) {
        cleanText = cleanText.substring(startIndex, endIndex + 1);
      }

      let parsedKeys;
      try {
        parsedKeys = JSON.parse(cleanText);
      } catch (parseErr) {
        console.error("AI 返回的原始数据解析失败，原始内容为:\n", cleanText);
        throw new Error("AI 仍返回了不规范数据，请打开控制台 (F12) 查看原始文本，或再次点击生成。\n底层错误: " + parseErr.message);
      }

      if (!Array.isArray(parsedKeys) || parsedKeys.length === 0) {
        throw new Error("大模型未能识别出任何按键，或者返回了空数组。");
      }
      
      const newElements = parsedKeys.map(k => ({
        ...DEFAULT_KEY,
        id: generateId(),
        name: k.name || '按键',
        x: k.x || 0,
        y: k.y || 0,
        width: k.width || 40,
        height: k.height || 40
      }));

      pushHistory([...elements, ...newElements]);
      showToast(`🤖 AI (${aiModel}) 解析成功！自动生成了 ${newElements.length} 个刀图实体！`, "success");

    } catch (err) {
      console.error("AI Parse Exception:", err);
      let errorMsg = err.message;
      if (errorMsg.includes('image_url') || errorMsg.includes('expected `text`') || errorMsg.includes('invalid_request_error')) {
        errorMsg = "当前选择的模型不支持视觉(图片)解析功能，请更换模型（如 qwen-vl-max、glm-4v 等）。\n原始错误: " + errorMsg;
      } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
        errorMsg = "API Key 鉴权失败或额度不足，请检查您的 Key 状态。";
      }

      showToast("AI 解析失败: " + errorMsg, "error");
    } finally {
      setLoadingAI(false);
    }
  };

  const validateAndSave = () => {
    const keys = elements.filter(e => e.type === 'key');
    const bgs = elements.filter(e => e.type === 'background');
    
    let allCovered = true;
    keys.forEach(key => {
      const kCx = key.x + key.width / 2;
      const kCy = key.y + key.height / 2;
      const isCovered = bgs.some(bg => 
        kCx >= bg.x && kCx <= bg.x + bg.width &&
        kCy >= bg.y && kCy <= bg.y + bg.height
      );
      if (!isCovered) allCovered = false;
    });

    if (!allCovered && bgs.length > 0) {
      showToast("⚠️ 提示：您的刀图（按键）似乎没有被背景完全覆盖，可能会导致边缘漏白，请检查！", "warning");
    } else {
      showToast("🎉 检测通过，正在下载配置文件...", "success");
    }

    const data = JSON.stringify({ elements, baseImage, keyLibrary });
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "sakura-board-craft.json";
    a.click();
  };

  const handleImportConfig = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);

          if (data.keys && Array.isArray(data.keys)) {
            const upgradedElements = data.keys.map(oldKey => ({
              id: oldKey.id || generateId(),
              type: 'key',
              name: oldKey.label || '按键',   
              x: oldKey.x || 0,
              y: oldKey.y || 0,
              width: oldKey.w || 40,         
              height: oldKey.h || 40,        
              fillColor: 'rgba(255, 255, 255, 0.5)',
              borderColor: '#f472b6',
              borderWidth: 1,
              backgroundImage: oldKey.imgUrl || null,
              backgroundSize: oldKey.imgFit === 'contain' ? 'contain' : 'cover',
              backgroundPosition: 'center',
            }));

            upgradedElements.push(DEFAULT_FILM_BOX); 
            pushHistory(upgradedElements);
            showToast("✨ 检测到旧版配置，已自动为您升级并完整导入！按键尺寸已恢复！", "success");
            return;
          }

          if (data.elements) {
            let importedElements = data.elements;
            if (!importedElements.some(e => e.type === 'filmBox')) {
               importedElements.push(DEFAULT_FILM_BOX);
            }
            pushHistory(importedElements);
            if (data.baseImage) setBaseImage(data.baseImage);
            if (data.keyLibrary) setKeyLibrary(data.keyLibrary);
            showToast("配置导入成功", "success");
          } else {
            showToast("无法识别配置文件结构", "error");
          }
        } catch(err) {
          showToast("配置文件解析失败，请检查文件格式", "error");
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const updateLibraryGroup = (gIdx, newName) => {
    setKeyLibrary(prev => {
      const newLib = [...prev];
      newLib[gIdx] = { ...newLib[gIdx], group: newName };
      return newLib;
    });
  };

  const updateLibraryItem = (gIdx, iIdx, updates) => {
    setKeyLibrary(prev => {
      const newLib = [...prev];
      newLib[gIdx] = { ...newLib[gIdx] };
      newLib[gIdx].items = [...newLib[gIdx].items];
      newLib[gIdx].items[iIdx] = { ...newLib[gIdx].items[iIdx], ...updates };
      return newLib;
    });
  };

  const addLibraryItem = (gIdx) => {
    setKeyLibrary(prev => {
      const newLib = [...prev];
      newLib[gIdx] = { ...newLib[gIdx] };
      newLib[gIdx].items = [...newLib[gIdx].items, { name: '新按键', width: 40, height: 40 }];
      return newLib;
    });
  };

  const removeLibraryItem = (gIdx, iIdx) => {
    setKeyLibrary(prev => {
      const newLib = [...prev];
      newLib[gIdx] = { ...newLib[gIdx] };
      newLib[gIdx].items = [...newLib[gIdx].items];
      newLib[gIdx].items.splice(iIdx, 1);
      return newLib;
    });
  };

  const addLibraryGroup = () => {
    setKeyLibrary(prev => [...prev, { group: '自定义分组', items: [] }]);
  };

  const removeLibraryGroup = (gIdx) => {
    setKeyLibrary(prev => {
      const newLib = [...prev];
      newLib.splice(gIdx, 1);
      return newLib;
    });
  };

  const exportKeyLibrary = () => {
    const data = JSON.stringify(keyLibrary, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "sakura-key-library.json";
    a.click();
    showToast("字库已导出", "success");
  };

  const importKeyLibrary = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const lib = JSON.parse(ev.target.result);
          if (Array.isArray(lib)) {
            setKeyLibrary(lib);
            showToast("按键字库导入成功", "success");
          } else {
            showToast("无效的按键库格式", "error");
          }
        } catch(err) {
          showToast("按键库文件解析失败", "error");
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const selectedElement = elements.find(el => el.id === selectedId);

  const keysElements = elements.filter(el => el.type === 'key');
  const filmBoxEl = elements.find(el => el.type === 'filmBox');
  let filmBounds = null;
  
  if (keysElements.length > 0 && filmBoxEl && filmBoxEl.visible) {
    const minX = Math.min(...keysElements.map(k => k.x));
    const minY = Math.min(...keysElements.map(k => k.y));
    const maxX = Math.max(...keysElements.map(k => k.x + k.width));
    const maxY = Math.max(...keysElements.map(k => k.y + k.height));
    const p = filmBoxEl.padding || 0;
    filmBounds = {
      x: minX - p, y: minY - p, 
      width: (maxX - minX) + p * 2, height: (maxY - minY) + p * 2
    };
  }

  return (
    <div className="flex flex-col h-screen bg-pink-50 font-sans text-pink-900 overflow-hidden selection:bg-pink-300 selection:text-white"
         onPointerMove={handlePointerMove}
         onPointerUp={handlePointerUp}>
      
      {toast.isOpen && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-white border border-pink-200 px-6 py-3 rounded-full shadow-lg flex items-center space-x-3 animate-in slide-in-from-top-4 fade-in duration-300">
          {toast.type === 'warning' && <AlertCircle className="text-orange-500" size={18} />}
          {toast.type === 'error' && <AlertCircle className="text-red-500" size={18} />}
          {toast.type === 'success' && <CheckCircle2 className="text-green-500" size={18} />}
          {toast.type === 'info' && <Info className="text-pink-500" size={18} />}
          <span className="text-sm font-medium text-pink-800">{toast.message}</span>
          <button onClick={() => setToast({ isOpen: false, message: '', type: 'info' })} className="ml-2 text-gray-400 hover:text-pink-500 transition">
            <X size={14} />
          </button>
        </div>
      )}

      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-pink-200 shadow-sm z-10 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-300 to-pink-500 flex items-center justify-center text-white font-bold shadow-sm">
            S
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-rose-400">
            Sakura Board Craft
          </h1>
          <div className="group relative ml-2 cursor-help text-pink-400 hover:text-pink-600">
            <Info size={18} />
            <div className="absolute left-0 top-full mt-2 w-80 p-4 bg-white rounded-xl shadow-xl border border-pink-100 text-xs text-pink-800 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
              <p className="font-bold mb-2 text-sm text-pink-600 border-b border-pink-50 pb-1">✨ 功能简介：</p>
              <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
                <li>上传底图并调用 <strong className="text-pink-500">千问、智谱等 AI 视觉大模型</strong> 解析刀图</li>
                <li><strong className="text-pink-500">双击按键</strong> 可直接快捷上传独立贴图</li>
                <li>高度可定制的按键字库，支持导入导出</li>
                <li>支持快捷键 (Ctrl+C/V/Z, Delete, 方向键微调)</li>
                <li>刀图主膜支持实物边缘模拟、拖拽及内部组件比例联动</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button onClick={() => setConfirmAction({ isOpen: true, message: '确定要清空当前画布的所有内容吗？', action: () => pushHistory([DEFAULT_FILM_BOX]) })} className="p-2 text-pink-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition" title="清空画布">
            <Trash2 size={18} />
          </button>
          <div className="w-px h-6 bg-pink-200 mx-1"></div>
          <button onClick={() => { if(historyIndex>0) { setHistoryIndex(historyIndex-1); setElements(clone(history[historyIndex-1])); } }} className={`p-2 rounded-lg transition ${historyIndex > 0 ? 'text-pink-500 hover:bg-pink-50' : 'text-pink-200'}`} title="撤销 (Ctrl+Z)">
            <Undo2 size={18} />
          </button>
          <button onClick={() => { if(historyIndex<history.length-1) { setHistoryIndex(historyIndex+1); setElements(clone(history[historyIndex+1])); } }} className={`p-2 rounded-lg transition ${historyIndex < history.length - 1 ? 'text-pink-500 hover:bg-pink-50' : 'text-pink-200'}`} title="重做 (Ctrl+Y)">
            <Redo2 size={18} />
          </button>
          <div className="w-px h-6 bg-pink-200 mx-1"></div>
          
          <label className="flex items-center px-3 py-1.5 bg-white border border-pink-300 text-pink-600 rounded-full hover:bg-pink-50 cursor-pointer text-sm font-medium transition shadow-sm">
            <Upload size={16} className="mr-1.5" /> 导入配置
            <input type="file" accept=".json" className="hidden" onChange={handleImportConfig} />
          </label>
          <button onClick={validateAndSave} className="flex items-center px-4 py-1.5 bg-gradient-to-r from-pink-400 to-pink-500 text-white rounded-full hover:from-pink-500 hover:to-pink-600 shadow-md transition text-sm font-bold">
            <Download size={16} className="mr-1.5" /> 保存并检测
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <div 
          className="flex-1 overflow-auto bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] relative custom-scrollbar"
          onClick={() => setSelectedId(null)}
        >
          <div 
            ref={canvasRef}
            className="w-[2000px] h-[2000px] relative origin-top-left shadow-inner"
            style={{ backgroundColor: 'rgba(253, 242, 248, 0.4)' }}
          >
            {baseImage && showBaseImage && (
              <img 
                src={baseImage} 
                alt="键盘底图" 
                className="absolute top-10 left-10 opacity-70 pointer-events-none rounded-xl shadow-lg border-2 border-dashed border-pink-300"
                style={{ maxWidth: '800px' }}
              />
            )}

            {filmBounds && filmBoxEl && (
              <div
                key={filmBoxEl.id}
                onClick={(e) => { e.stopPropagation(); setSelectedId(filmBoxEl.id); }}
                onPointerDown={(e) => handlePointerDown(e, filmBoxEl.id, 'drag')}
                onDoubleClick={(e) => handleDoubleClick(e, filmBoxEl.id)}
                className={`absolute group cursor-move ${selectedId === filmBoxEl.id ? 'ring-2 ring-pink-500 ring-offset-2 z-15 shadow-xl' : 'z-10 shadow-sm hover:ring-2 hover:ring-pink-300'} transition-shadow`}
                style={{
                  left: filmBounds.x, top: filmBounds.y,
                  width: filmBounds.width, height: filmBounds.height,
                  backgroundColor: filmBoxEl.fillColor,
                  backgroundImage: filmBoxEl.backgroundImage ? `url(${filmBoxEl.backgroundImage})` : 'none',
                  backgroundSize: filmBoxEl.backgroundSize,
                  backgroundPosition: filmBoxEl.backgroundPosition,
                  border: `${filmBoxEl.borderWidth}px solid ${filmBoxEl.borderColor}`,
                  borderRadius: `${filmBoxEl.borderRadius}px`,
                }}
              >
                {selectedId === filmBoxEl.id && (
                  <div 
                    onPointerDown={(e) => handlePointerDown(e, filmBoxEl.id, 'resize')}
                    className="absolute -right-3 -bottom-3 w-5 h-5 bg-white border-4 border-pink-500 rounded-full cursor-se-resize shadow-md z-30"
                  />
                )}
                <div className="absolute -top-6 left-0 text-xs text-pink-500 bg-white px-1.5 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                  {filmBoxEl.name} (双击可传图)
                </div>
              </div>
            )}

            {['background', 'key'].map(renderType => (
              elements.filter(el => el.type === renderType).map(el => (
                <div
                  key={el.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                  onPointerDown={(e) => handlePointerDown(e, el.id, 'drag')}
                  onDoubleClick={(e) => handleDoubleClick(e, el.id)}
                  className={`absolute group cursor-move ${selectedId === el.id ? 'ring-2 ring-pink-500 ring-offset-2 z-20 shadow-xl' : 'z-10 shadow-sm hover:ring-2 hover:ring-pink-300'} transition-shadow`}
                  style={{
                    left: el.x, top: el.y, width: el.width, height: el.height,
                    backgroundColor: el.fillColor.includes('gradient') ? 'transparent' : el.fillColor,
                    backgroundImage: [
                      el.backgroundImage ? `url(${el.backgroundImage})` : null,
                      el.fillColor.includes('gradient') ? el.fillColor : null
                    ].filter(Boolean).join(', ') || 'none',
                    backgroundSize: el.backgroundSize,
                    backgroundPosition: el.backgroundPosition,
                    backgroundRepeat: 'no-repeat',
                    border: `${el.borderWidth}px solid ${el.borderColor}`,
                    borderRadius: el.type === 'key' ? '6px' : '12px',
                  }}
                >
                  {selectedId === el.id && (
                    <div 
                      onPointerDown={(e) => handlePointerDown(e, el.id, 'resize')}
                      className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-pink-500 rounded-full cursor-se-resize z-30"
                    />
                  )}
                  <div className="absolute -top-6 left-0 text-xs text-pink-500 bg-white px-1.5 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                    {el.name}
                  </div>
                </div>
              ))
            ))}
          </div>
        </div>

        <div className={`w-80 bg-white border-l border-pink-200 shadow-xl flex flex-col transition-all duration-300 z-20 ${panelOpen ? 'translate-x-0' : 'translate-x-full absolute right-0 h-full'}`}>
          <button 
            onClick={() => setPanelOpen(!panelOpen)}
            className="absolute -left-8 top-1/2 -translate-y-1/2 w-8 h-16 bg-white border border-r-0 border-pink-200 rounded-l-xl flex items-center justify-center text-pink-400 hover:text-pink-600 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] focus:outline-none"
          >
            {panelOpen ? <ChevronRight /> : <ChevronLeft />}
          </button>

          <div className="p-4 border-b border-pink-100 bg-pink-50/50 flex items-center space-x-2">
            <Settings className="text-pink-500" size={20} />
            <h2 className="font-bold text-pink-800">属性与控制台</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center">
                  <Bot size={14} className="mr-1" /> AI 视觉模型接入
                </div>
                <span className="px-1.5 py-0.5 bg-pink-100 text-pink-500 text-[9px] rounded font-medium border border-pink-200">
                  仍在开发实验中
                </span>
              </h3>
              
              <div className="bg-gradient-to-br from-pink-50 to-white p-3 rounded-xl border border-pink-200 shadow-sm space-y-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-pink-500 opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                
                <div className="flex flex-col space-y-2">
                  <div>
                    <label className="text-xs font-bold text-pink-700 mb-1 block">服务商 (Provider)</label>
                    <select 
                      value={aiProvider} 
                      onChange={handleProviderChange} 
                      className="w-full text-sm p-1.5 border border-pink-200 rounded-lg outline-none focus:border-pink-400 bg-white text-pink-700 font-medium transition"
                    >
                      {Object.entries(AI_PROVIDERS).map(([key, config]) => (
                        <option key={key} value={key}>{config.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-pink-700 mb-1 block">模型名称 (Model)</label>
                    <input 
                      type="text" 
                      value={aiModel} 
                      onChange={e => setAiModel(e.target.value)} 
                      className="w-full text-sm p-1.5 border border-pink-200 rounded-lg outline-none focus:border-pink-400 transition bg-white text-pink-600"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-pink-100">
                  <label className="text-xs font-bold text-pink-700 mb-1 flex items-center justify-between">
                    API Key
                  </label>
                  <input 
                    type="password" 
                    value={userApiKey} 
                    onChange={e => setUserApiKey(e.target.value)} 
                    placeholder={`请输入您的 ${AI_PROVIDERS[aiProvider]?.name} Key`} 
                    className="w-full text-sm p-2 border border-pink-200 rounded-lg outline-none focus:border-pink-400 transition"
                  />
                  <p className="text-[10px] text-pink-400 leading-tight mt-1">注：Key 仅存在浏览器当前生命周期内，绝不上传服务器，安全可靠。</p>
                </div>
                
                <div className="pt-2 border-t border-pink-100">
                  <label className="flex items-center justify-center w-full py-2 bg-white border border-pink-300 border-dashed rounded-lg text-sm text-pink-600 cursor-pointer hover:bg-pink-100 transition shadow-sm mb-2">
                    <ImageIcon size={16} className="mr-2" /> 
                    {baseImage ? '更换键盘底图' : '上传实体键盘底图'}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, setBaseImage)} />
                  </label>
                  <button onClick={handleAIParse} disabled={loadingAI || !baseImage} className="w-full py-2 bg-gradient-to-r from-pink-400 to-pink-500 text-white rounded-lg text-sm font-bold hover:from-pink-500 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md transition">
                    {loadingAI ? '🤖 视觉引擎正在解析像素...' : '✨ 唤醒 AI 智能提取刀图'}
                  </button>
                  <button onClick={() => setShowBaseImage(!showBaseImage)} className="w-full mt-2 py-1.5 bg-white border border-pink-200 rounded-lg text-xs text-pink-500 hover:bg-pink-50 transition flex justify-center items-center">
                    {showBaseImage ? <EyeOff size={14} className="mr-1" /> : <Eye size={14} className="mr-1" />}
                    {showBaseImage ? '隐藏底图' : '显示底图'}
                  </button>
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-pink-100 space-y-2 shadow-sm">
                <label className="flex items-center text-xs text-pink-700 cursor-pointer hover:text-pink-900 transition">
                  <input type="checkbox" checked={snapEnabled} onChange={e => setSnapEnabled(e.target.checked)} className="mr-2 accent-pink-500 cursor-pointer" />
                  拖拽背景时智能吸附边缘
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center">
                <Plus size={14} className="mr-1" /> 插入元素
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleAddElement('background')} className="py-2.5 flex flex-col items-center bg-white border border-pink-200 rounded-xl hover:bg-pink-50 hover:border-pink-300 transition text-sm font-medium text-pink-700 shadow-sm">
                  <Square size={20} className="mb-1 text-pink-400" /> 加背景
                </button>
                <button onClick={() => setShowKeyLibraryModal(true)} className="py-2.5 flex flex-col items-center bg-white border border-pink-200 rounded-xl hover:bg-pink-50 hover:border-pink-300 transition text-sm font-medium text-pink-700 shadow-sm">
                  <Type size={20} className="mb-1 text-pink-400" /> 加按键
                </button>
              </div>
            </div>

            {selectedElement ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white bg-pink-400 px-2 py-1.5 rounded-md uppercase tracking-wider flex items-center shadow-sm">
                    <Settings size={14} className="mr-1" /> 属性: {selectedElement.type === 'key' ? '按键' : selectedElement.type === 'filmBox' ? '刀图外框' : '背景'}
                  </h3>
                  {selectedElement.type !== 'filmBox' && (
                    <button onClick={() => { pushHistory(elements.filter(e => e.id !== selectedId)); setSelectedId(null); showToast("已删除元素", "info"); }} className="p-1.5 text-pink-300 hover:text-red-500 hover:bg-red-50 rounded-md transition" title="删除选中元素">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="bg-white border border-pink-200 rounded-xl p-4 space-y-4 shadow-sm">
                  <div>
                    <label className="text-xs font-medium text-pink-600 mb-1.5 block">元素名称</label>
                    <input type="text" value={selectedElement.name || ''} onChange={e => updateElement(selectedId, { name: e.target.value })} className="w-full text-sm p-2 border border-pink-200 rounded-lg outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-400 bg-pink-50/50 transition" placeholder="自定义命名" />
                  </div>

                  {selectedElement.type === 'filmBox' ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-pink-600 mb-1 block">外框内边距 (Padding)</label>
                        <input type="number" value={selectedElement.padding || 0} onChange={e => updateElement(selectedId, { padding: Number(e.target.value) })} className="w-full text-sm p-1.5 border border-pink-200 rounded-lg outline-none focus:border-pink-400 transition" />
                      </div>
                      
                      <div className="space-y-2 bg-pink-50/50 p-3 rounded-lg border border-pink-100">
                        <label className="flex items-center text-xs text-pink-700 cursor-pointer hover:text-pink-900 transition">
                          <input type="checkbox" checked={selectedElement.scaleSync} onChange={e => updateElement(selectedId, { scaleSync: e.target.checked })} className="mr-2 accent-pink-500 cursor-pointer" />
                          拉伸外框时，等比例缩放内部按键大小
                        </label>
                        <div className="h-px w-full bg-pink-100"></div>
                        <label className="flex items-center text-xs text-pink-700 cursor-pointer hover:text-pink-900 transition">
                          <input type="checkbox" checked={selectedElement.lockAspectRatio} onChange={e => updateElement(selectedId, { lockAspectRatio: e.target.checked })} className="mr-2 accent-pink-500 cursor-pointer" />
                          <span className="flex items-center">锁定外框自身长宽比 {selectedElement.lockAspectRatio ? <Lock size={12} className="ml-1 text-pink-400" /> : <Unlock size={12} className="ml-1 text-gray-400" />}</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-3 opacity-60 pointer-events-none pt-2">
                        <div><label className="text-[10px] text-pink-500 mb-1 block">总宽度 (自动计算)</label><input type="number" value={Math.round(filmBounds?.width || 0)} readOnly className="w-full text-sm p-1.5 bg-gray-50 border border-pink-100 rounded-lg" /></div>
                        <div><label className="text-[10px] text-pink-500 mb-1 block">总高度 (自动计算)</label><input type="number" value={Math.round(filmBounds?.height || 0)} readOnly className="w-full text-sm p-1.5 bg-gray-50 border border-pink-100 rounded-lg" /></div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-pink-600 mb-1 block">X 坐标</label>
                        <input type="number" value={Math.round(selectedElement.x)} onChange={e => updateElement(selectedId, { x: Number(e.target.value) })} className="w-full text-sm p-1.5 border border-pink-200 rounded-lg outline-none focus:border-pink-400 transition" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-pink-600 mb-1 block">Y 坐标</label>
                        <input type="number" value={Math.round(selectedElement.y)} onChange={e => updateElement(selectedId, { y: Number(e.target.value) })} className="w-full text-sm p-1.5 border border-pink-200 rounded-lg outline-none focus:border-pink-400 transition" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-pink-600 mb-1 block">宽度</label>
                        <input type="number" value={Math.round(selectedElement.width)} onChange={e => updateElement(selectedId, { width: Number(e.target.value) })} className="w-full text-sm p-1.5 border border-pink-200 rounded-lg outline-none focus:border-pink-400 transition" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-pink-600 mb-1 block">高度</label>
                        <input type="number" value={Math.round(selectedElement.height)} onChange={e => updateElement(selectedId, { height: Number(e.target.value) })} className="w-full text-sm p-1.5 border border-pink-200 rounded-lg outline-none focus:border-pink-400 transition" />
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 pt-3 border-t border-pink-100">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-pink-600">填充颜色</label>
                      <div className="flex items-center space-x-1.5">
                        <input type="color" value={selectedElement.fillColor.startsWith('#') ? selectedElement.fillColor.slice(0, 7) : '#ffffff'} onChange={e => updateElement(selectedId, { fillColor: e.target.value })} className="w-6 h-6 p-0 border-0 rounded cursor-pointer" />
                        <input type="text" value={selectedElement.fillColor} onChange={e => updateElement(selectedId, { fillColor: e.target.value })} className="w-16 text-xs p-1 border border-pink-200 rounded outline-none" title="支持色值或 linear-gradient" />
                        <button onClick={() => updateElement(selectedId, { fillColor: 'linear-gradient(135deg, #fbcfe8, #f472b6)' })} className="px-1.5 py-1 text-[10px] font-medium bg-pink-100 text-pink-600 rounded hover:bg-pink-200 transition" title="应用预设渐变">渐变</button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-pink-600">边框配置</label>
                      <div className="flex items-center space-x-1.5">
                        <input type="color" value={selectedElement.borderColor.startsWith('#') ? selectedElement.borderColor : '#000000'} onChange={e => updateElement(selectedId, { borderColor: e.target.value })} className="w-6 h-6 p-0 border-0 rounded cursor-pointer" title="边框颜色" />
                        <div className="relative">
                          <input type="number" value={selectedElement.borderWidth} onChange={e => updateElement(selectedId, { borderWidth: Number(e.target.value) })} className="w-12 text-xs p-1 pr-4 border border-pink-200 rounded outline-none" title="边框宽度" />
                          <span className="absolute right-1 top-1 text-[10px] text-gray-400 pointer-events-none">px</span>
                        </div>
                        {selectedElement.type === 'filmBox' && (
                          <div className="relative ml-1">
                            <input type="number" value={selectedElement.borderRadius || 0} onChange={e => updateElement(selectedId, { borderRadius: Number(e.target.value) })} className="w-12 text-xs p-1 pr-4 border border-pink-200 rounded outline-none" title="外框圆角" />
                            <span className="absolute right-1 top-1 text-[10px] text-gray-400 pointer-events-none">rx</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3">
                      <label className="text-xs font-medium text-pink-600 mb-2 flex justify-between items-center">
                        <span>背景图片 <span className="text-[10px] text-pink-400 font-normal ml-1">(双击元素亦可传图)</span></span>
                      </label>
                      {selectedElement.backgroundImage ? (
                        <div className="space-y-2.5">
                          <div className="relative group/bg">
                            <img src={selectedElement.backgroundImage} alt="bg" className="h-20 w-full object-cover rounded-lg border border-pink-200 shadow-sm" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/bg:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                              <button onClick={() => updateElement(selectedId, { backgroundImage: null })} className="px-3 py-1.5 text-xs text-white bg-red-500 rounded-md hover:bg-red-600 shadow-sm transition">移除</button>
                            </div>
                          </div>
                          
                          <div className="flex space-x-2">
                            <label className="flex-1 py-1.5 text-xs font-medium text-pink-600 bg-pink-50 border border-pink-100 rounded-md text-center cursor-pointer hover:bg-pink-100 transition">
                              更换图片
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, (url) => updateElement(selectedId, { backgroundImage: url }))} />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="text-[10px] text-pink-400 mb-1 block">缩放模式</label>
                              <select value={selectedElement.backgroundSize} onChange={e => updateElement(selectedId, { backgroundSize: e.target.value })} className="w-full p-1.5 border border-pink-200 rounded-md text-pink-800 outline-none focus:border-pink-400 transition bg-white">
                                <option value="cover">填充 (Cover)</option>
                                <option value="contain">适应 (Contain)</option>
                                <option value="100% 100%">拉伸铺满</option>
                                <option value="auto">原始大小</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-pink-400 mb-1 block">对齐位置</label>
                              <select value={selectedElement.backgroundPosition} onChange={e => updateElement(selectedId, { backgroundPosition: e.target.value })} className="w-full p-1.5 border border-pink-200 rounded-md text-pink-800 outline-none focus:border-pink-400 transition bg-white">
                                <option value="center">居中对齐</option>
                                <option value="top left">左上</option>
                                <option value="top right">右上</option>
                                <option value="bottom left">左下</option>
                                <option value="bottom right">右下</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-full py-4 bg-pink-50 border border-pink-200 border-dashed rounded-lg text-xs text-pink-500 cursor-pointer hover:bg-pink-100 hover:border-pink-400 transition shadow-sm">
                          <Upload size={16} className="mb-1.5 text-pink-400" /> 
                          <span className="font-medium">上传独立贴图</span>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, (url) => updateElement(selectedId, { backgroundImage: url }))} />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-pink-300 border-2 border-dashed border-pink-200 rounded-2xl bg-pink-50/50">
                <MousePointer2 size={36} className="mb-3 opacity-40" />
                <p className="text-sm font-medium">在画布中选中任意元素</p>
                <p className="text-xs mt-1.5 opacity-70">即可激活属性控制台</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {showKeyLibraryModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-pink-100 bg-pink-50/80 flex justify-between items-center backdrop-blur-md">
              <div className="flex items-center space-x-5">
                <div className="flex items-center space-x-2">
                  <Layers className="text-pink-500" size={24} />
                  <h2 className="text-lg font-bold text-pink-800">可编程按键字库</h2>
                </div>
                <div className="h-5 w-px bg-pink-200"></div>
                <button onClick={addLibraryGroup} className="text-sm text-pink-500 hover:text-pink-700 font-medium flex items-center transition bg-white px-3 py-1.5 rounded-lg border border-pink-100 shadow-sm hover:shadow">
                  <Plus size={14} className="mr-1.5" /> 新增分组
                </button>
                <label className="text-sm text-pink-500 hover:text-pink-700 font-medium flex items-center cursor-pointer transition bg-white px-3 py-1.5 rounded-lg border border-pink-100 shadow-sm hover:shadow">
                  <Upload size={14} className="mr-1.5" /> 导入字库
                  <input type="file" accept=".json" className="hidden" onChange={importKeyLibrary} />
                </label>
                <button onClick={exportKeyLibrary} className="text-sm text-pink-500 hover:text-pink-700 font-medium flex items-center transition bg-white px-3 py-1.5 rounded-lg border border-pink-100 shadow-sm hover:shadow">
                  <Download size={14} className="mr-1.5" /> 导出字库
                </button>
              </div>
              <button onClick={() => setShowKeyLibraryModal(false)} className="p-2 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-full transition">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-pink-50/20">
              {keyLibrary.map((group, gIdx) => (
                <div key={gIdx} className="bg-white p-5 rounded-2xl border border-pink-100 shadow-sm">
                  <div className="flex justify-between items-center mb-5 pb-3 border-b border-pink-50">
                    <div className="flex items-center flex-1">
                      <div className="w-1.5 h-5 bg-pink-400 rounded-full mr-2.5"></div>
                      <input 
                        value={group.group} 
                        onChange={e => updateLibraryGroup(gIdx, e.target.value)} 
                        className="font-bold text-lg text-pink-700 bg-transparent border-b-2 border-transparent hover:border-pink-200 focus:border-pink-500 outline-none w-1/2 transition px-1"
                        placeholder="输入分组名称"
                      />
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={() => addLibraryItem(gIdx)} className="text-sm font-medium text-pink-500 hover:text-white hover:bg-pink-400 border border-pink-300 px-3 py-1.5 rounded-lg transition shadow-sm"> + 新增按键 </button>
                      <button onClick={() => setConfirmAction({ isOpen: true, message: '确定要删除整个分组吗？此操作不可恢复。', action: () => removeLibraryGroup(gIdx) })} className="text-sm font-medium text-red-400 hover:text-white hover:bg-red-400 border border-red-200 px-3 py-1.5 rounded-lg transition shadow-sm" title="删除整个分组"> 删除分组 </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                    {group.items.map((preset, iIdx) => (
                      <div 
                        key={iIdx}
                        className="group/item relative flex flex-col items-center justify-center p-4 border border-pink-100 rounded-2xl hover:border-pink-400 hover:shadow-lg transition-all duration-300 bg-white"
                      >
                        <button 
                          onClick={() => setConfirmAction({ isOpen: true, message: `确定要删除预设按键“${preset.name}”吗？`, action: () => removeLibraryItem(gIdx, iIdx) })} 
                          className="absolute -top-2 -right-2 p-1.5 text-gray-400 hover:text-white hover:bg-red-500 opacity-0 group-hover/item:opacity-100 transition-all bg-white border border-gray-100 rounded-full shadow-sm z-10"
                          title="删除此按键"
                        >
                          <Trash2 size={14} />
                        </button>
                        
                        <div 
                          className="border-2 border-pink-200 rounded-lg bg-pink-50/50 mb-4 hover:border-pink-500 hover:bg-pink-100 transition-colors flex items-center justify-center text-[10px] text-pink-500 font-bold overflow-hidden cursor-pointer relative group/preview shadow-inner"
                          style={{ 
                            width: Math.min(preset.width, 100) + 'px', 
                            height: Math.min(preset.height, 45) + 'px',
                            maxWidth: '100%',
                          }}
                          onClick={() => { handleAddElement('key', preset); setShowKeyLibraryModal(false); showToast(`成功插入: ${preset.name}`, 'success'); }}
                          title="点击插入到画布"
                        >
                          <span className="opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center scale-110">
                            <Plus size={14} className="mr-0.5" /> 插入
                          </span>
                        </div>
                        
                        <input 
                          value={preset.name} 
                          onChange={e => updateLibraryItem(gIdx, iIdx, { name: e.target.value })} 
                          className="text-xs font-bold text-pink-800 w-full text-center bg-transparent border-b border-transparent hover:border-pink-200 focus:border-pink-400 outline-none mb-2 transition px-1" 
                          placeholder="按键名称"
                        />
                        
                        <div className="flex items-center justify-center space-x-1.5 text-[10px] font-medium text-pink-400 w-full bg-pink-50/50 p-1 rounded-md">
                          <input 
                            type="number" 
                            value={preset.width} 
                            onChange={e => updateLibraryItem(gIdx, iIdx, { width: e.target.value ? Number(e.target.value) : '' })} 
                            onFocus={e => e.target.select()}
                            className="w-12 text-center bg-white border border-pink-100 focus:border-pink-400 rounded outline-none py-1 transition shadow-sm" 
                            title="宽度 (px)"
                          />
                          <span className="text-pink-300">×</span>
                          <input 
                            type="number" 
                            value={preset.height} 
                            onChange={e => updateLibraryItem(gIdx, iIdx, { height: e.target.value ? Number(e.target.value) : '' })} 
                            onFocus={e => e.target.select()}
                            className="w-12 text-center bg-white border border-pink-100 focus:border-pink-400 rounded outline-none py-1 transition shadow-sm" 
                            title="高度 (px)"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {confirmAction.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95 duration-200 border border-pink-100">
            <h3 className="text-lg font-bold text-pink-800 mb-3 flex items-center">
              <AlertCircle size={22} className="mr-2 text-red-500" />
              高危操作确认
            </h3>
            <p className="text-sm text-gray-600 mb-6 ml-7 leading-relaxed">{confirmAction.message}</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmAction({ isOpen: false, message: '', action: null })}
                className="px-4 py-2 text-sm font-medium text-pink-600 bg-pink-50 hover:bg-pink-100 rounded-xl transition"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (confirmAction.action) confirmAction.action();
                  setConfirmAction({ isOpen: false, message: '', action: null });
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition shadow-md"
              >
                确认执行
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #fbcfe8; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #f472b6; }
      `}} />
    </div>
  );
}