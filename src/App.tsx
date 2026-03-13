import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  Image as ImageIcon,
  Layout,
  Eye,
  EyeOff,
  Save,
  Download,
  Settings,
  MousePointer2,
  Type,
  Square,
  Move,
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  Undo2,
  Redo2,
  ChevronRight,
  ChevronLeft,
  Plus,
  Layers,
  Maximize,
  AlertCircle,
  Info,
  X,
} from "lucide-react";

// --- 常量与默认值 ---
const SAKURA_THEME = {
  primary: "#f472b6",
  secondary: "#fbcfe8",
  bg: "#fdf2f8",
  text: "#831843",
  panel: "#ffffff",
};

const DEFAULT_KEY = {
  id: "",
  type: "key",
  name: "按键",
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  fillColor: "rgba(255, 255, 255, 0.5)",
  borderColor: "#f472b6",
  borderWidth: 1,
  backgroundImage: null,
  backgroundSize: "cover",
  backgroundPosition: "center",
};

const DEFAULT_BG = {
  id: "",
  type: "background",
  name: "键盘膜背景",
  x: 0,
  y: 0,
  width: 800,
  height: 300,
  fillColor: "#fbcfe8",
  borderColor: "transparent",
  borderWidth: 0,
  backgroundImage: null,
  backgroundSize: "cover",
  backgroundPosition: "center",
};

// --- 工具函数 ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const clone = (obj) => JSON.parse(JSON.stringify(obj));

export default function KeyboardDesignerApp() {
  // --- 状态管理 ---
  const [elements, setElements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [baseImage, setBaseImage] = useState(null);
  const [showBaseImage, setShowBaseImage] = useState(true);

  const [keyLibrary, setKeyLibrary] = useState([
    {
      group: "常规与功能区",
      items: [
        { name: "普通按键 (1U)", width: 40, height: 40 },
        { name: "功能键 (半高)", width: 40, height: 25 },
        { name: "方向键 (半高)", width: 40, height: 20 },
      ],
    },
    {
      group: "控制键",
      items: [
        { name: "Tab键 (1.5U)", width: 60, height: 40 },
        { name: "Caps Lock (1.75U)", width: 70, height: 40 },
        { name: "Shift 左 (2.25U)", width: 90, height: 40 },
        { name: "Shift 右 (2.75U)", width: 110, height: 40 },
        { name: "Ctrl/Alt (1.25U)", width: 50, height: 40 },
      ],
    },
    {
      group: "空格与回车",
      items: [
        { name: "标准空格 (6.25U)", width: 250, height: 40 },
        { name: "轻薄本空格", width: 180, height: 40 },
        { name: "一字回车 (2.25U)", width: 90, height: 40 },
        { name: "7字回车 (竖向)", width: 60, height: 80 },
      ],
    },
    {
      group: "数字小键盘",
      items: [
        { name: "数字区常规", width: 40, height: 40 },
        { name: "数字区 0 (2U)", width: 80, height: 40 },
        { name: "竖向回车/加号", width: 40, height: 80 },
      ],
    },
  ]);

  const [panelOpen, setPanelOpen] = useState(true);
  const [showKeyLibraryModal, setShowKeyLibraryModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [scaleSync, setScaleSync] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // 二次确认弹窗状态
  const [confirmAction, setConfirmAction] = useState({
    isOpen: false,
    message: "",
    action: null,
  });

  // 历史记录 (撤销/重做)
  const [history, setHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [clipboard, setClipboard] = useState(null);

  // 引用，用于拖拽计算和快捷键穿透
  const canvasRef = useRef(null);
  const dragInfo = useRef({
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    origW: 0,
    origH: 0,
    childrenMap: {},
  });
  const stateRef = useRef({
    elements,
    selectedId,
    history,
    historyIndex,
    clipboard,
  });

  useEffect(() => {
    stateRef.current = {
      elements,
      selectedId,
      history,
      historyIndex,
      clipboard,
    };
  }, [elements, selectedId, history, historyIndex, clipboard]);

  // --- 历史记录方法 ---
  const pushHistory = useCallback((newElements) => {
    const newHistory = stateRef.current.history.slice(
      0,
      stateRef.current.historyIndex + 1,
    );
    newHistory.push(clone(newElements));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setElements(newElements);
  }, []);

  const updateElement = (id, updates) => {
    const newElements = elements.map((el) =>
      el.id === id ? { ...el, ...updates } : el,
    );
    pushHistory(newElements);
  };

  // --- 快捷键与核心交互 ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
      )
        return;

      const { elements, selectedId, history, historyIndex, clipboard } =
        stateRef.current;
      const selected = elements.find((el) => el.id === selectedId);

      // 方向键微调
      if (
        selected &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0,
          dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;

        const newElements = elements.map((el) =>
          el.id === selectedId ? { ...el, x: el.x + dx, y: el.y + dy } : el,
        );
        pushHistory(newElements);
      }

      // 撤销/重做/复制/粘贴/剪切/删除
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        if (historyIndex > 0) {
          setHistoryIndex(historyIndex - 1);
          setElements(clone(history[historyIndex - 1]));
        }
      }
      if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        if (historyIndex < history.length - 1) {
          setHistoryIndex(historyIndex + 1);
          setElements(clone(history[historyIndex + 1]));
        }
      }
      if (e.ctrlKey && e.key === "c" && selected) {
        setClipboard(clone(selected));
      }
      if (e.ctrlKey && e.key === "x" && selected) {
        setClipboard(clone(selected));
        pushHistory(elements.filter((el) => el.id !== selectedId));
        setSelectedId(null);
      }
      if (e.ctrlKey && e.key === "v" && clipboard) {
        const newEl = {
          ...clone(clipboard),
          id: generateId(),
          x: clipboard.x + 20,
          y: clipboard.y + 20,
        };
        pushHistory([...elements, newEl]);
        setSelectedId(newEl.id);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        pushHistory(elements.filter((el) => el.id !== selectedId));
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pushHistory]);

  // --- 拖拽与缩放逻辑 (含联动与吸附) ---
  const handlePointerDown = (e, id, action = "drag") => {
    e.stopPropagation();
    const el = elements.find((el) => el.id === id);
    if (!el) return;

    setSelectedId(id);
    if (action === "drag") setIsDragging(true);
    if (action === "resize") setIsResizing(true);

    const childrenMap = {};
    if (el.type === "background") {
      elements.forEach((k) => {
        if (k.type === "key") {
          const cx = k.x + k.width / 2;
          const cy = k.y + k.height / 2;
          // 判断按键中心点是否在背景内
          if (
            cx >= el.x &&
            cx <= el.x + el.width &&
            cy >= el.y &&
            cy <= el.y + el.height
          ) {
            childrenMap[k.id] = {
              origX: k.x,
              origY: k.y,
              origW: k.width,
              origH: k.height,
            };
          }
        }
      });
    }

    dragInfo.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.width,
      origH: el.height,
      childrenMap,
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging && !isResizing) return;
    if (!selectedId) return;

    const dx = e.clientX - dragInfo.current.startX;
    const dy = e.clientY - dragInfo.current.startY;

    setElements((prev) => {
      const el = prev.find((item) => item.id === selectedId);
      if (!el) return prev;

      let newW = Math.max(10, dragInfo.current.origW + dx);
      let newH = Math.max(10, dragInfo.current.origH + dy);

      return prev.map((item) => {
        if (item.id === selectedId) {
          if (isDragging) {
            let newX = dragInfo.current.origX + dx;
            let newY = dragInfo.current.origY + dy;

            // 智能吸附 (针对背景，且开关打开时)
            if (item.type === "background" && snapEnabled) {
              const snapThreshold = 10;
              prev.forEach((other) => {
                if (other.id !== item.id && other.type === "background") {
                  if (Math.abs(newX - (other.x + other.width)) < snapThreshold)
                    newX = other.x + other.width;
                  if (Math.abs(newY - (other.y + other.height)) < snapThreshold)
                    newY = other.y + other.height;
                  if (Math.abs(newX + item.width - other.x) < snapThreshold)
                    newX = other.x - item.width;
                  if (Math.abs(newY + item.height - other.y) < snapThreshold)
                    newY = other.y - item.height;
                }
              });
            }
            return { ...item, x: newX, y: newY };
          } else if (isResizing) {
            return { ...item, width: newW, height: newH };
          }
        } else if (
          scaleSync &&
          item.type === "key" &&
          dragInfo.current.childrenMap?.[item.id]
        ) {
          const origChild = dragInfo.current.childrenMap[item.id];
          if (isResizing) {
            const ratioX = newW / dragInfo.current.origW;
            const ratioY = newH / dragInfo.current.origH;
            return {
              ...item,
              x:
                dragInfo.current.origX +
                (origChild.origX - dragInfo.current.origX) * ratioX,
              y:
                dragInfo.current.origY +
                (origChild.origY - dragInfo.current.origY) * ratioY,
              width: Math.max(5, origChild.origW * ratioX),
              height: Math.max(5, origChild.origH * ratioY),
            };
          } else if (isDragging) {
            return {
              ...item,
              x: origChild.origX + dx,
              y: origChild.origY + dy,
            };
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

  // --- 画布全局功能操作 ---
  const handleAddElement = (type, preset = null) => {
    const base = type === "key" ? DEFAULT_KEY : DEFAULT_BG;
    const newEl = clone({ ...base, ...preset, id: generateId() });
    newEl.x = ((elements.length * 10) % 100) + 50;
    newEl.y = ((elements.length * 10) % 100) + 50;
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

  const mockAIParse = () => {
    if (!baseImage) {
      alert("请先上传键盘底图！");
      return;
    }
    setLoadingAI(true);
    setTimeout(() => {
      const newKeys = [];
      for (let i = 0; i < 10; i++) {
        newKeys.push({
          ...DEFAULT_KEY,
          id: generateId(),
          name: `自动按键 ${i + 1}`,
          x: 50 + i * 50,
          y: 100,
        });
      }
      pushHistory([...elements, ...newKeys]);
      setLoadingAI(false);
    }, 1500);
  };

  const validateAndSave = () => {
    const keys = elements.filter((e) => e.type === "key");
    const bgs = elements.filter((e) => e.type === "background");

    let allCovered = true;
    keys.forEach((key) => {
      const kCx = key.x + key.width / 2;
      const kCy = key.y + key.height / 2;
      const isCovered = bgs.some(
        (bg) =>
          kCx >= bg.x &&
          kCx <= bg.x + bg.width &&
          kCy >= bg.y &&
          kCy <= bg.y + bg.height,
      );
      if (!isCovered) allCovered = false;
    });

    if (!allCovered && bgs.length > 0) {
      alert(
        "⚠️ 提示：您的刀图（按键）似乎没有被背景完全覆盖，可能会导致边缘漏白，请检查！",
      );
    }

    const data = JSON.stringify({ elements, baseImage, keyLibrary });
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keyboard-design.json";
    a.click();
  };

  const handleImportConfig = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const config = JSON.parse(ev.target.result);
          if (config.elements) {
            pushHistory(config.elements);
            if (config.baseImage) setBaseImage(config.baseImage);
            if (config.keyLibrary) setKeyLibrary(config.keyLibrary);
          }
        } catch (err) {
          alert("配置文件解析失败");
        }
      };
      reader.readAsText(file);
    }
  };

  // --- 按键库管理方法 ---
  const updateLibraryGroup = (gIdx, newName) => {
    setKeyLibrary((prev) => {
      const newLib = [...prev];
      newLib[gIdx] = { ...newLib[gIdx], group: newName };
      return newLib;
    });
  };

  const updateLibraryItem = (gIdx, iIdx, updates) => {
    setKeyLibrary((prev) => {
      const newLib = [...prev];
      newLib[gIdx] = { ...newLib[gIdx] };
      newLib[gIdx].items = [...newLib[gIdx].items];
      newLib[gIdx].items[iIdx] = { ...newLib[gIdx].items[iIdx], ...updates };
      return newLib;
    });
  };

  const addLibraryItem = (gIdx) => {
    setKeyLibrary((prev) => {
      const newLib = [...prev];
      newLib[gIdx] = { ...newLib[gIdx] };
      newLib[gIdx].items = [
        ...newLib[gIdx].items,
        { name: "新按键", width: 40, height: 40 },
      ];
      return newLib;
    });
  };

  const removeLibraryItem = (gIdx, iIdx) => {
    setKeyLibrary((prev) => {
      const newLib = [...prev];
      newLib[gIdx] = { ...newLib[gIdx] };
      newLib[gIdx].items = [...newLib[gIdx].items];
      newLib[gIdx].items.splice(iIdx, 1);
      return newLib;
    });
  };

  const addLibraryGroup = () => {
    setKeyLibrary((prev) => [...prev, { group: "自定义分组", items: [] }]);
  };

  const removeLibraryGroup = (gIdx) => {
    setKeyLibrary((prev) => {
      const newLib = [...prev];
      newLib.splice(gIdx, 1);
      return newLib;
    });
  };

  const exportKeyLibrary = () => {
    const data = JSON.stringify(keyLibrary, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keyboard-library.json";
    a.click();
  };

  const importKeyLibrary = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const lib = JSON.parse(ev.target.result);
          if (Array.isArray(lib)) setKeyLibrary(lib);
          else alert("无效的按键库格式");
        } catch (err) {
          alert("按键库文件解析失败");
        }
      };
      reader.readAsText(file);
    }
  };

  const selectedElement = elements.find((el) => el.id === selectedId);

  return (
    <div
      className="flex flex-col h-screen bg-pink-50 font-sans text-pink-900 overflow-hidden selection:bg-pink-300 selection:text-white"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* --- 顶部 Header --- */}
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
            <div className="absolute left-0 top-full mt-2 w-80 p-3 bg-white rounded-xl shadow-xl border border-pink-100 text-xs text-pink-800 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              <p className="font-bold mb-1">功能简介：</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>上传底图并一键 AI 生成刀图结构</li>
                <li>拖拽、缩放、自定义所有按键与背景</li>
                <li>支持快捷键 (Ctrl+C/V/Z, Delete, 方向键微调)</li>
                <li>背景智能吸附，导出前自动检测漏白</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() =>
              setConfirmAction({
                isOpen: true,
                message: "确定要清空当前画布的所有内容吗？",
                action: () => pushHistory([]),
              })
            }
            className="p-2 text-pink-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition"
            title="清空画布"
          >
            <Trash2 size={18} />
          </button>
          <div className="w-px h-6 bg-pink-200 mx-1"></div>
          <button
            onClick={() => {
              if (historyIndex > 0) {
                setHistoryIndex(historyIndex - 1);
                setElements(clone(history[historyIndex - 1]));
              }
            }}
            className={`p-2 rounded-lg transition ${historyIndex > 0 ? "text-pink-500 hover:bg-pink-50" : "text-pink-200"}`}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={() => {
              if (historyIndex < history.length - 1) {
                setHistoryIndex(historyIndex + 1);
                setElements(clone(history[historyIndex + 1]));
              }
            }}
            className={`p-2 rounded-lg transition ${historyIndex < history.length - 1 ? "text-pink-500 hover:bg-pink-50" : "text-pink-200"}`}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 size={18} />
          </button>
          <div className="w-px h-6 bg-pink-200 mx-1"></div>

          <label className="flex items-center px-3 py-1.5 bg-white border border-pink-300 text-pink-600 rounded-full hover:bg-pink-50 cursor-pointer text-sm font-medium transition shadow-sm">
            <Upload size={16} className="mr-1.5" /> 导入配置
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportConfig}
            />
          </label>
          <button
            onClick={validateAndSave}
            className="flex items-center px-4 py-1.5 bg-gradient-to-r from-pink-400 to-pink-500 text-white rounded-full hover:from-pink-500 hover:to-pink-600 shadow-md transition text-sm font-bold"
          >
            <Download size={16} className="mr-1.5" /> 保存并检测
          </button>
        </div>
      </header>

      {/* --- 主体工作区 --- */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 左侧/中央 画布区 */}
        <div
          className="flex-1 overflow-auto bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] relative custom-scrollbar"
          onClick={() => setSelectedId(null)}
        >
          <div
            ref={canvasRef}
            className="w-[2000px] h-[2000px] relative origin-top-left shadow-inner"
            style={{ backgroundColor: "rgba(253, 242, 248, 0.4)" }}
          >
            {/* 底图层 */}
            {baseImage && showBaseImage && (
              <img
                src={baseImage}
                alt="键盘底图"
                className="absolute top-10 left-10 opacity-70 pointer-events-none rounded-xl shadow-lg border-2 border-dashed border-pink-300"
                style={{ maxWidth: "800px" }}
              />
            )}

            {/* 元素层 */}
            {["background", "key"].map((renderType) =>
              elements
                .filter((el) => el.type === renderType)
                .map((el) => (
                  <div
                    key={el.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(el.id);
                    }}
                    onPointerDown={(e) => handlePointerDown(e, el.id, "drag")}
                    className={`absolute group cursor-move ${selectedId === el.id ? "ring-2 ring-pink-500 ring-offset-2 z-20 shadow-xl" : "z-10 shadow-sm hover:ring-2 hover:ring-pink-300"} transition-shadow`}
                    style={{
                      left: el.x,
                      top: el.y,
                      width: el.width,
                      height: el.height,
                      backgroundColor: el.fillColor.includes("gradient")
                        ? "transparent"
                        : el.fillColor,
                      backgroundImage:
                        [
                          el.backgroundImage
                            ? `url(${el.backgroundImage})`
                            : null,
                          el.fillColor.includes("gradient")
                            ? el.fillColor
                            : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "none",
                      backgroundSize: el.backgroundSize,
                      backgroundPosition: el.backgroundPosition,
                      backgroundRepeat: "no-repeat",
                      border: `${el.borderWidth}px solid ${el.borderColor}`,
                      borderRadius: el.type === "key" ? "6px" : "12px",
                    }}
                  >
                    {/* 缩放手柄 */}
                    {selectedId === el.id && (
                      <div
                        onPointerDown={(e) =>
                          handlePointerDown(e, el.id, "resize")
                        }
                        className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-pink-500 rounded-full cursor-se-resize z-30"
                      />
                    )}
                    {/* 名称标签 */}
                    <div className="absolute -top-6 left-0 text-xs text-pink-500 bg-white px-1 rounded shadow-sm opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
                      {el.name}
                    </div>
                  </div>
                )),
            )}
          </div>
        </div>

        {/* --- 右侧 控制面板 --- */}
        <div
          className={`w-80 bg-white border-l border-pink-200 shadow-xl flex flex-col transition-all duration-300 z-20 ${panelOpen ? "translate-x-0" : "translate-x-full absolute right-0 h-full"}`}
        >
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className="absolute -left-8 top-1/2 -translate-y-1/2 w-8 h-16 bg-white border border-r-0 border-pink-200 rounded-l-xl flex items-center justify-center text-pink-400 hover:text-pink-600 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]"
          >
            {panelOpen ? <ChevronRight /> : <ChevronLeft />}
          </button>

          <div className="p-4 border-b border-pink-100 bg-pink-50/50 flex items-center space-x-2">
            <Settings className="text-pink-500" size={20} />
            <h2 className="font-bold text-pink-800">属性与控制台</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {/* 1. 全局与AI能力区 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center">
                <Layout size={14} className="mr-1" /> 全局设置
              </h3>

              <div className="bg-pink-50 p-3 rounded-xl border border-pink-100 space-y-3">
                <label className="flex items-center justify-center w-full py-2 bg-white border border-pink-300 border-dashed rounded-lg text-sm text-pink-600 cursor-pointer hover:bg-pink-100 transition">
                  <ImageIcon size={16} className="mr-2" />
                  {baseImage ? "更换键盘底图" : "上传键盘底图"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, setBaseImage)}
                  />
                </label>

                <div className="flex space-x-2">
                  <button
                    onClick={mockAIParse}
                    disabled={loadingAI || !baseImage}
                    className="flex-1 py-2 bg-pink-500 text-white rounded-lg text-sm font-medium hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-sm transition"
                  >
                    {loadingAI ? "AI解析中..." : "✨ AI 生成刀图"}
                  </button>
                  <button
                    onClick={() => setShowBaseImage(!showBaseImage)}
                    className="p-2 bg-white border border-pink-200 rounded-lg text-pink-500 hover:bg-pink-50 transition"
                    title="显隐底图"
                  >
                    {showBaseImage ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
              </div>

              {/* 联动设置项 */}
              <div className="bg-white p-3 rounded-xl border border-pink-100 space-y-2 shadow-sm">
                <label className="flex items-center text-xs text-pink-700 cursor-pointer hover:text-pink-900">
                  <input
                    type="checkbox"
                    checked={snapEnabled}
                    onChange={(e) => setSnapEnabled(e.target.checked)}
                    className="mr-2 accent-pink-500"
                  />
                  拖拽背景时智能吸附边缘
                </label>
                <label className="flex items-center text-xs text-pink-700 cursor-pointer hover:text-pink-900">
                  <input
                    type="checkbox"
                    checked={scaleSync}
                    onChange={(e) => setScaleSync(e.target.checked)}
                    className="mr-2 accent-pink-500"
                  />
                  背景与内部按键联动 (拖拽与缩放)
                </label>
              </div>
            </div>

            {/* 2. 元素添加区 */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center">
                <Plus size={14} className="mr-1" /> 插入元素
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleAddElement("background")}
                  className="py-2 flex flex-col items-center bg-white border border-pink-200 rounded-xl hover:bg-pink-50 hover:border-pink-300 transition text-sm text-pink-700"
                >
                  <Square size={20} className="mb-1 text-pink-400" /> 加背景
                </button>
                <button
                  onClick={() => setShowKeyLibraryModal(true)}
                  className="py-2 flex flex-col items-center bg-white border border-pink-200 rounded-xl hover:bg-pink-50 hover:border-pink-300 transition text-sm text-pink-700"
                >
                  <Type size={20} className="mb-1 text-pink-400" /> 加按键
                </button>
              </div>
            </div>

            {/* 3. 选中元素属性面板 */}
            {selectedElement ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white bg-pink-400 px-2 py-1 rounded-md uppercase tracking-wider flex items-center">
                    <Settings size={14} className="mr-1" /> 属性:{" "}
                    {selectedElement.type === "key" ? "按键" : "背景"}
                  </h3>
                  <button
                    onClick={() => {
                      pushHistory(elements.filter((e) => e.id !== selectedId));
                      setSelectedId(null);
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="bg-white border border-pink-200 rounded-xl p-3 space-y-3 shadow-sm">
                  {/* 名称 */}
                  <div>
                    <label className="text-xs text-pink-500 mb-1 block">
                      名称
                    </label>
                    <input
                      type="text"
                      value={selectedElement.name || ""}
                      onChange={(e) =>
                        updateElement(selectedId, { name: e.target.value })
                      }
                      className="w-full text-sm p-1.5 border border-pink-200 rounded outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-400 bg-pink-50/30"
                    />
                  </div>

                  {/* 几何属性 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-pink-500 mb-1 block">
                        X 坐标
                      </label>
                      <input
                        type="number"
                        value={Math.round(selectedElement.x)}
                        onChange={(e) =>
                          updateElement(selectedId, {
                            x: Number(e.target.value),
                          })
                        }
                        className="w-full text-sm p-1 border border-pink-200 rounded outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-pink-500 mb-1 block">
                        Y 坐标
                      </label>
                      <input
                        type="number"
                        value={Math.round(selectedElement.y)}
                        onChange={(e) =>
                          updateElement(selectedId, {
                            y: Number(e.target.value),
                          })
                        }
                        className="w-full text-sm p-1 border border-pink-200 rounded outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-pink-500 mb-1 block">
                        宽度
                      </label>
                      <input
                        type="number"
                        value={Math.round(selectedElement.width)}
                        onChange={(e) =>
                          updateElement(selectedId, {
                            width: Number(e.target.value),
                          })
                        }
                        className="w-full text-sm p-1 border border-pink-200 rounded outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-pink-500 mb-1 block">
                        高度
                      </label>
                      <input
                        type="number"
                        value={Math.round(selectedElement.height)}
                        onChange={(e) =>
                          updateElement(selectedId, {
                            height: Number(e.target.value),
                          })
                        }
                        className="w-full text-sm p-1 border border-pink-200 rounded outline-none"
                      />
                    </div>
                  </div>

                  {/* 样式属性 */}
                  <div className="space-y-2 pt-2 border-t border-pink-100">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-pink-600">填充颜色</label>
                      <div className="flex items-center space-x-1">
                        <input
                          type="color"
                          value={
                            selectedElement.fillColor.startsWith("#")
                              ? selectedElement.fillColor.slice(0, 7)
                              : "#ffffff"
                          }
                          onChange={(e) =>
                            updateElement(selectedId, {
                              fillColor: e.target.value,
                            })
                          }
                          className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={selectedElement.fillColor}
                          onChange={(e) =>
                            updateElement(selectedId, {
                              fillColor: e.target.value,
                            })
                          }
                          className="w-16 text-xs p-1 border border-pink-200 rounded outline-none"
                          title="支持色值或 linear-gradient"
                        />
                        <button
                          onClick={() =>
                            updateElement(selectedId, {
                              fillColor:
                                "linear-gradient(135deg, #fbcfe8, #f472b6)",
                            })
                          }
                          className="px-1 py-1 text-[10px] bg-pink-100 text-pink-600 rounded hover:bg-pink-200"
                          title="应用预设渐变"
                        >
                          渐变
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-xs text-pink-600">边框颜色</label>
                      <div className="flex items-center space-x-1">
                        <input
                          type="color"
                          value={
                            selectedElement.borderColor.startsWith("#")
                              ? selectedElement.borderColor
                              : "#000000"
                          }
                          onChange={(e) =>
                            updateElement(selectedId, {
                              borderColor: e.target.value,
                            })
                          }
                          className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                        />
                        <input
                          type="number"
                          value={selectedElement.borderWidth}
                          onChange={(e) =>
                            updateElement(selectedId, {
                              borderWidth: Number(e.target.value),
                            })
                          }
                          className="w-12 text-xs p-1 border border-pink-200 rounded outline-none"
                          title="边框宽度"
                        />
                      </div>
                    </div>

                    {/* 图片背景设置 */}
                    <div className="pt-2">
                      <label className="text-xs text-pink-600 mb-1 block">
                        背景图片{" "}
                        <span className="text-[10px] text-pink-400 font-normal ml-1">
                          (可与背景颜色叠加)
                        </span>
                      </label>
                      {selectedElement.backgroundImage ? (
                        <div className="space-y-2">
                          <img
                            src={selectedElement.backgroundImage}
                            alt="bg"
                            className="h-16 w-full object-cover rounded border border-pink-200"
                          />
                          <div className="flex space-x-2">
                            <button
                              onClick={() =>
                                updateElement(selectedId, {
                                  backgroundImage: null,
                                })
                              }
                              className="flex-1 py-1 text-xs text-red-500 bg-red-50 rounded hover:bg-red-100"
                            >
                              移除图片
                            </button>
                            <label className="flex-1 py-1 text-xs text-pink-600 bg-pink-50 rounded text-center cursor-pointer hover:bg-pink-100">
                              更换图片
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) =>
                                  handleImageUpload(e, (url) =>
                                    updateElement(selectedId, {
                                      backgroundImage: url,
                                    }),
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <select
                              value={selectedElement.backgroundSize}
                              onChange={(e) =>
                                updateElement(selectedId, {
                                  backgroundSize: e.target.value,
                                })
                              }
                              className="p-1 border border-pink-200 rounded text-pink-800 outline-none"
                            >
                              <option value="cover">填充 (Cover)</option>
                              <option value="contain">适应 (Contain)</option>
                              <option value="100% 100%">拉伸 (100%)</option>
                              <option value="auto">原始大小</option>
                            </select>
                            <select
                              value={selectedElement.backgroundPosition}
                              onChange={(e) =>
                                updateElement(selectedId, {
                                  backgroundPosition: e.target.value,
                                })
                              }
                              className="p-1 border border-pink-200 rounded text-pink-800 outline-none"
                            >
                              <option value="center">居中对齐</option>
                              <option value="top left">左上对齐</option>
                              <option value="top right">右上对齐</option>
                              <option value="bottom left">左下对齐</option>
                              <option value="bottom right">右下对齐</option>
                            </select>
                          </div>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center w-full py-3 bg-pink-50 border border-pink-200 border-dashed rounded text-xs text-pink-500 cursor-pointer hover:bg-pink-100 transition">
                          <Upload size={14} className="mr-1" /> 上传元素背景图
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              handleImageUpload(e, (url) =>
                                updateElement(selectedId, {
                                  backgroundImage: url,
                                }),
                              )
                            }
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-pink-300 border-2 border-dashed border-pink-200 rounded-xl bg-pink-50/50">
                <MousePointer2 size={32} className="mb-2 opacity-50" />
                <p className="text-sm">在画布中点击选中元素</p>
                <p className="text-xs mt-1 opacity-70">即可在此编辑属性</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- 按键库 Modal 面板 --- */}
      {showKeyLibraryModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-pink-100 bg-pink-50/50 flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Layers className="text-pink-500" size={24} />
                  <h2 className="text-lg font-bold text-pink-800">
                    按键库选板
                  </h2>
                </div>
                <div className="h-4 w-px bg-pink-200"></div>
                <button
                  onClick={addLibraryGroup}
                  className="text-sm text-pink-500 hover:text-pink-700 font-medium flex items-center transition"
                >
                  <Plus size={14} className="mr-1" /> 新增分组
                </button>
                <label className="text-sm text-pink-500 hover:text-pink-700 font-medium flex items-center cursor-pointer transition">
                  <Upload size={14} className="mr-1" /> 导入字库
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={importKeyLibrary}
                  />
                </label>
                <button
                  onClick={exportKeyLibrary}
                  className="text-sm text-pink-500 hover:text-pink-700 font-medium flex items-center transition"
                >
                  <Download size={14} className="mr-1" /> 导出字库
                </button>
              </div>
              <button
                onClick={() => setShowKeyLibraryModal(false)}
                className="p-2 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-full transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-gray-50/30">
              {keyLibrary.map((group, gIdx) => (
                <div
                  key={gIdx}
                  className="bg-white p-4 rounded-xl border border-pink-100 shadow-sm"
                >
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-pink-50">
                    <div className="flex items-center flex-1">
                      <div className="w-1.5 h-4 bg-pink-400 rounded-full mr-2"></div>
                      <input
                        value={group.group}
                        onChange={(e) =>
                          updateLibraryGroup(gIdx, e.target.value)
                        }
                        className="font-bold text-pink-600 bg-transparent border-b border-transparent hover:border-pink-300 focus:border-pink-500 outline-none w-1/2 ml-2 transition"
                        placeholder="输入分组名称"
                      />
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => addLibraryItem(gIdx)}
                        className="text-xs text-pink-500 hover:bg-pink-50 border border-pink-200 px-2 py-1 rounded transition"
                      >
                        {" "}
                        + 新增按键{" "}
                      </button>
                      <button
                        onClick={() =>
                          setConfirmAction({
                            isOpen: true,
                            message: "确定要删除整个分组吗？此操作不可恢复。",
                            action: () => removeLibraryGroup(gIdx),
                          })
                        }
                        className="text-xs text-red-400 hover:bg-red-50 border border-red-100 px-2 py-1 rounded transition"
                        title="删除整个分组"
                      >
                        {" "}
                        删除分组{" "}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {group.items.map((preset, iIdx) => (
                      <div
                        key={iIdx}
                        className="group/item relative flex flex-col items-center justify-center p-3 border border-pink-100 rounded-xl hover:border-pink-300 hover:shadow-md transition-all bg-white"
                      >
                        {/* 删除当前按键 */}
                        <button
                          onClick={() =>
                            setConfirmAction({
                              isOpen: true,
                              message: `确定要删除预设按键“${preset.name}”吗？`,
                              action: () => removeLibraryItem(gIdx, iIdx),
                            })
                          }
                          className="absolute top-1 right-1 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity bg-white rounded-full shadow-sm z-10"
                          title="删除此按键"
                        >
                          <Trash2 size={12} />
                        </button>

                        {/* 预览与插入按钮 */}
                        <div
                          className="border-2 border-pink-300 rounded bg-white mb-3 hover:border-pink-500 hover:bg-pink-50 transition-colors flex items-center justify-center text-[10px] text-pink-400 font-medium overflow-hidden cursor-pointer relative group/preview"
                          style={{
                            width: Math.min(preset.width, 100) + "px",
                            height: Math.min(preset.height, 40) + "px",
                            maxWidth: "100%",
                          }}
                          onClick={() => {
                            handleAddElement("key", preset);
                            setShowKeyLibraryModal(false);
                          }}
                          title="点击插入到画布"
                        >
                          <span className="opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center">
                            <Plus size={12} className="mr-0.5" /> 插入
                          </span>
                        </div>

                        {/* 名称编辑 */}
                        <input
                          value={preset.name}
                          onChange={(e) =>
                            updateLibraryItem(gIdx, iIdx, {
                              name: e.target.value,
                            })
                          }
                          className="text-xs font-medium text-pink-800 w-full text-center bg-transparent border-b border-transparent hover:border-pink-200 focus:border-pink-400 outline-none mb-1.5 transition"
                          placeholder="按键名称"
                        />

                        {/* 尺寸编辑 */}
                        <div className="flex items-center justify-center space-x-1 text-[10px] text-pink-400 w-full">
                          <input
                            type="number"
                            value={preset.width}
                            onChange={(e) =>
                              updateLibraryItem(gIdx, iIdx, {
                                width: e.target.value
                                  ? Number(e.target.value)
                                  : "",
                              })
                            }
                            onFocus={(e) => e.target.select()}
                            className="w-12 text-center bg-pink-50 border border-transparent hover:border-pink-300 rounded outline-none py-0.5 transition"
                            title="宽度 (px)"
                          />
                          <span>x</span>
                          <input
                            type="number"
                            value={preset.height}
                            onChange={(e) =>
                              updateLibraryItem(gIdx, iIdx, {
                                height: e.target.value
                                  ? Number(e.target.value)
                                  : "",
                              })
                            }
                            onFocus={(e) => e.target.select()}
                            className="w-12 text-center bg-pink-50 border border-transparent hover:border-pink-300 rounded outline-none py-0.5 transition"
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

      {/* --- 自定义确认弹窗 --- */}
      {confirmAction.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95 duration-200 border border-pink-100">
            <h3 className="text-lg font-bold text-pink-800 mb-2 flex items-center">
              <AlertCircle size={20} className="mr-2 text-red-500" />
              确认操作
            </h3>
            <p className="text-sm text-gray-600 mb-6 ml-7">
              {confirmAction.message}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() =>
                  setConfirmAction({ isOpen: false, message: "", action: null })
                }
                className="px-4 py-2 text-sm font-medium text-pink-600 bg-pink-50 hover:bg-pink-100 rounded-xl transition"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (confirmAction.action) confirmAction.action();
                  setConfirmAction({
                    isOpen: false,
                    message: "",
                    action: null,
                  });
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition shadow-sm"
              >
                确认执行
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 全局CSS补充 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #fbcfe8; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #f472b6; }
      `,
        }}
      />
    </div>
  );
}
