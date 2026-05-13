import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Type, Square, MousePointer, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CanvasNode {
  id: string;
  type: 'text' | 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
}

interface CanvasArrow {
  id: string;
  fromId: string;
  toId: string;
}

type Tool = 'select' | 'text' | 'rect' | 'arrow';

export default function InternoCampanhas() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [arrows, setArrows] = useState<CanvasArrow[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [arrowStart, setArrowStart] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);

  const getCanvasPos = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const addNode = useCallback((type: 'text' | 'rect', x: number, y: number) => {
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      type,
      x: x - (type === 'rect' ? 80 : 50),
      y: y - (type === 'rect' ? 30 : 15),
      width: type === 'rect' ? 160 : 100,
      height: type === 'rect' ? 60 : 30,
      text: type === 'text' ? 'Texto' : '',
      color: type === 'rect' ? '#f3f4f6' : 'transparent',
    };
    setNodes(prev => [...prev, node]);
    setSelectedId(node.id);
    setTool('select');
    if (type === 'text') setEditingId(node.id);
  }, []);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== canvasRef.current && !(e.target as HTMLElement).classList.contains('canvas-bg')) return;
    const pos = getCanvasPos(e.clientX, e.clientY);

    if (tool === 'text' || tool === 'rect') {
      addNode(tool, pos.x, pos.y);
      return;
    }

    if (tool === 'select') {
      setSelectedId(null);
      setEditingId(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (dragging) {
      const pos = getCanvasPos(e.clientX, e.clientY);
      setNodes(prev => prev.map(n => n.id === dragging.id
        ? { ...n, x: pos.x - dragging.offsetX, y: pos.y - dragging.offsetY }
        : n
      ));
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
    setIsPanning(false);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation();
    const pos = getCanvasPos(e.clientX, e.clientY);

    if (tool === 'arrow') {
      if (!arrowStart) {
        setArrowStart(node.id);
      } else if (arrowStart !== node.id) {
        setArrows(prev => [...prev, { id: crypto.randomUUID(), fromId: arrowStart, toId: node.id }]);
        setArrowStart(null);
        setTool('select');
      }
      return;
    }

    setSelectedId(node.id);
    setDragging({ id: node.id, offsetX: pos.x - node.x, offsetY: pos.y - node.y });
  };

  const handleNodeDoubleClick = (e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation();
    setEditingId(node.id);
    setSelectedId(node.id);
  };

  const handleTextChange = (id: string, text: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setNodes(prev => prev.filter(n => n.id !== selectedId));
    setArrows(prev => prev.filter(a => a.fromId !== selectedId && a.toId !== selectedId));
    setSelectedId(null);
    setEditingId(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editingId) return;
        deleteSelected();
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setEditingId(null);
        setArrowStart(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, editingId]);

  const getNodeCenter = (node: CanvasNode) => ({
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  });

  const tools = [
    { id: 'select' as Tool, icon: MousePointer, label: 'Selecionar' },
    { id: 'text' as Tool, icon: Type, label: 'Texto' },
    { id: 'rect' as Tool, icon: Square, label: 'Retângulo' },
    { id: 'arrow' as Tool, icon: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
      </svg>
    ), label: 'Seta' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100 mb-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/interno/marketing')}>
          <ArrowLeft size={16} className="mr-1" /> Marketing
        </Button>
        <div className="h-5 w-px bg-gray-200 mx-1" />
        <h2 className="text-sm font-semibold text-gray-900 mr-4">Campanhas</h2>

        <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1">
          {tools.map(t => (
            <button
              key={t.id}
              onClick={() => { setTool(t.id); setArrowStart(null); }}
              title={t.label}
              className={`p-2 rounded-md transition-colors ${tool === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <t.icon size={16} />
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-gray-200 mx-1" />

        <button onClick={() => setZoom(z => Math.min(z + 0.1, 3))} className="p-2 text-gray-400 hover:text-gray-600" title="Zoom in">
          <ZoomIn size={16} />
        </button>
        <span className="text-xs text-gray-400 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.3))} className="p-2 text-gray-400 hover:text-gray-600" title="Zoom out">
          <ZoomOut size={16} />
        </button>

        {selectedId && (
          <>
            <div className="h-5 w-px bg-gray-200 mx-1" />
            <button onClick={deleteSelected} className="p-2 text-red-400 hover:text-red-600" title="Deletar">
              <Trash2 size={16} />
            </button>
          </>
        )}

        {arrowStart && (
          <span className="text-xs text-blue-500 ml-2">Clique no destino da seta...</span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 bg-white rounded-xl border border-gray-100 overflow-hidden relative"
        style={{ cursor: tool === 'select' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair' }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid pattern */}
        <svg className="absolute inset-0 w-full h-full canvas-bg pointer-events-none" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f1f5f9" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="10000" height="10000" x="-5000" y="-5000" fill="url(#grid)" />
        </svg>

        {/* Transformed layer */}
        <div
          className="absolute inset-0 canvas-bg"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          {/* Arrows */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
              </marker>
            </defs>
            {arrows.map(arrow => {
              const from = nodes.find(n => n.id === arrow.fromId);
              const to = nodes.find(n => n.id === arrow.toId);
              if (!from || !to) return null;
              const f = getNodeCenter(from);
              const t = getNodeCenter(to);
              return (
                <line
                  key={arrow.id}
                  x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                  stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrowhead)"
                  className="cursor-pointer"
                  onClick={() => {
                    setArrows(prev => prev.filter(a => a.id !== arrow.id));
                  }}
                  style={{ pointerEvents: 'stroke' }}
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map(node => (
            <div
              key={node.id}
              onMouseDown={e => handleNodeMouseDown(e, node)}
              onDoubleClick={e => handleNodeDoubleClick(e, node)}
              className={`absolute select-none ${selectedId === node.id ? 'ring-2 ring-blue-400' : ''}`}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                minHeight: node.height,
                backgroundColor: node.type === 'rect' ? node.color : 'transparent',
                borderRadius: node.type === 'rect' ? 8 : 0,
                border: node.type === 'rect' ? '1px solid #e5e7eb' : 'none',
                cursor: tool === 'arrow' ? 'crosshair' : 'move',
              }}
            >
              {editingId === node.id ? (
                <textarea
                  autoFocus
                  value={node.text}
                  onChange={e => handleTextChange(node.id, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditingId(null); }}
                  className="w-full h-full bg-transparent border-none outline-none resize-none text-sm text-gray-800 p-2"
                  style={{ minHeight: node.height }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2 text-sm text-gray-800 whitespace-pre-wrap">
                  {node.text || (node.type === 'rect' ? '' : 'Texto')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
