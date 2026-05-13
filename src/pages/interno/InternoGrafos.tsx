import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  useNodesState,
  useEdgesState,
  useViewport,
  useInternalNode,
  ConnectionMode,
  type Node,
  type Edge,
  type EdgeProps,
  type NodeProps,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type Connection,
  type OnConnect,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Plus, Network, Trash2, MessageCircle, Mail, Target, X, AlertTriangle, ChevronLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

type Metric = 'volume' | 'conversion';
type ChannelKey = 'meta_ads' | 'whatsapp' | 'email';
type EdgeChannel = ChannelKey | 'audience';
type NodeKind = 'event' | 'hub';

interface EventBubble {
  id: string;
  name: string;
  totals: Record<ChannelKey, { volume: number; conversion: number }>;
  total: number;
}

interface CampaignHub {
  id: string;
  name: string;
}

interface SubAudience {
  id: string;
  name: string;
  description: string;
}

interface UserConnection {
  id: string;
  source: string;
  sourceKind?: NodeKind; // default 'event' (back-compat)
  target: string;
  targetKind?: NodeKind; // default 'event'
  channel: EdgeChannel;
  configured?: boolean; // whether the campaign is set up and running
  name?: string; // optional campaign name (hub channels)
}

const AUDIENCE_COLOR = '#FACC15'; // yellow for event → hub audience feed

const CHANNELS: { key: ChannelKey; label: string; color: string }[] = [
  { key: 'meta_ads', label: 'Meta Ads', color: '#1877F2' },
  { key: 'whatsapp', label: 'WhatsApp', color: '#25D366' },
  { key: 'email', label: 'E-mail', color: '#FF0080' },
];

const BUBBLE_COLORS = [
  '#FF0080', '#1877F2', '#25D366', '#F59E0B', '#8B5CF6',
  '#EF4444', '#06B6D4', '#22C55E', '#EC4899', '#F97316',
  '#3B82F6', '#A855F7', '#10B981', '#FACC15', '#FB7185',
];

const CACHE_KEY = 'grafos:aggregates:v4';
const MANUAL_KEY = 'grafos:manualEvents';
const HUBS_KEY = 'grafos:hubs';
const POSITIONS_KEY = 'grafos:positions';
const CONNECTIONS_KEY = 'grafos:connections';
const SUB_STORAGE_KEY = (eventId: string) => `grafos:subs:${eventId}`;
const GRAPH_STATE_KEY_BASE = 'interno:grafos:v1';
const GRAPH_INDEX_KEY = 'interno:grafos:index';
const graphStateKey = (id: string | undefined) => id && id !== 'v1' ? `${GRAPH_STATE_KEY_BASE}:${id}` : GRAPH_STATE_KEY_BASE;

const loadJSON = <T,>(key: string, fb: T): T => {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch { return fb; }
};
const saveJSON = (key: string, val: unknown) => localStorage.setItem(key, JSON.stringify(val));

interface PersistedGraphState {
  positions: Record<string, { x: number; y: number }>;
  connections: UserConnection[];
  hubs: CampaignHub[];
  manualEvents: EventBubble[];
  subsByEvent: Record<string, SubAudience[]>;
}

const normalizeGraphEventName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const isBlockedGraphEvent = (name: string) => {
  const normalized = normalizeGraphEventName(name);
  return normalized.includes('do it 4 brazil party 2026') || normalized.includes('doit 4 brazil party 2026');
};

const sanitizeBubbles = (list: EventBubble[]) => {
  const seen = new Set<string>();
  return list.filter((bubble) => {
    if (isBlockedGraphEvent(bubble.name) || isBlockedGraphEvent(bubble.id)) return false;
    const key = normalizeGraphEventName(bubble.name || bubble.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const loadManualEvents = (): EventBubble[] => sanitizeBubbles(loadJSON(MANUAL_KEY, [] as EventBubble[]));
const saveManualEvents = (list: EventBubble[]) => saveJSON(MANUAL_KEY, sanitizeBubbles(list));

function loadSubs(eventId: string): SubAudience[] {
  return loadJSON(SUB_STORAGE_KEY(eventId), [] as SubAudience[]);
}
function saveSubs(eventId: string, subs: SubAudience[]) {
  saveJSON(SUB_STORAGE_KEY(eventId), subs);
}

function saveSubsMap(subsByEvent: Record<string, SubAudience[]>) {
  Object.entries(subsByEvent).forEach(([eventId, subs]) => saveSubs(eventId, subs));
}

function bubbleSize(total: number, max: number) {
  const ratio = max > 0 ? total / max : 0;
  return Math.round(80 + ratio * 140);
}

// ============== Graph Context ==============
interface ConnectingState { id: string; kind: NodeKind }
interface GraphCtxValue {
  connectingFrom: ConnectingState | null;
  startConnect: (id: string, kind: NodeKind) => void;
  finishConnect: (id: string, kind: NodeKind) => void;
  cancelConnect: () => void;
  removeEdge: (edgeId: string) => void;
}
const GraphCtx = createContext<GraphCtxValue | null>(null);

// ============== Custom Bubble Node ==============
interface BubbleNodeData {
  label: string;
  color: string;
  size: number;
  eventId: string;
}

function BubbleNode({ data }: NodeProps) {
  const { label, color, size, eventId } = data as unknown as BubbleNodeData;
  const ctx = useContext(GraphCtx);
  const [hover, setHover] = useState(false);
  const isConnectingFromThis = ctx?.connectingFrom?.id === eventId && ctx?.connectingFrom?.kind === 'event';
  const isConnectingFromOther = !!ctx?.connectingFrom && !isConnectingFromThis;

  const sideStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    width: 18,
    height: 18,
    opacity: 0,
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: size,
        height: size,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${color}ff, ${color}cc 60%, ${color}88 100%)`,
          boxShadow: isConnectingFromThis
            ? `0 0 0 4px #22c55e, 0 8px 28px ${color}66, inset 0 -10px 28px rgba(0,0,0,0.18)`
            : isConnectingFromOther
              ? `0 0 0 3px #22c55e88, 0 8px 28px ${color}66, inset 0 -10px 28px rgba(0,0,0,0.18)`
              : `0 8px 28px ${color}66, inset 0 -10px 28px rgba(0,0,0,0.18), 0 0 0 2px ${color}33`,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 8,
          fontWeight: 700,
          fontSize: Math.max(10, size / 12),
          lineHeight: 1.1,
          cursor: isConnectingFromOther ? 'crosshair' : 'grab',
          userSelect: 'none',
          transition: 'box-shadow 0.2s ease',
        }}
      >
        <Handle id="t" type="target" position={Position.Top} style={sideStyle} />
        <Handle id="r" type="source" position={Position.Right} style={sideStyle} />
        <Handle id="b" type="source" position={Position.Bottom} style={sideStyle} />
        <Handle id="l" type="target" position={Position.Left} style={sideStyle} />
        <span style={{ pointerEvents: 'none' }}>{label}</span>
      </div>

      {/* Green + button on hover */}
      {(hover || isConnectingFromThis) && !isConnectingFromOther && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isConnectingFromThis) ctx?.cancelConnect();
            else ctx?.startConnect(eventId, 'event');
          }}
          title={isConnectingFromThis ? 'Cancelar conexão' : 'Adicionar conexão a partir deste evento'}
          style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: isConnectingFromThis ? '#ef4444' : '#22c55e',
            color: '#fff',
            border: '2px solid #fff',
            boxShadow: `0 4px 12px ${isConnectingFromThis ? '#ef4444' : '#22c55e'}88`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
          }}
          className="animate-scale-in"
        >
          {isConnectingFromThis ? <X size={16} /> : <Plus size={18} />}
        </button>
      )}

      {/* Click overlay when target picking */}
      {isConnectingFromOther && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            ctx?.finishConnect(eventId, 'event');
          }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            cursor: 'crosshair',
            zIndex: 5,
          }}
          title="Conectar aqui"
        />
      )}
    </div>
  );
}

// ============== Hub (Conjunto de Campanhas) Node ==============
interface HubNodeData {
  label: string;
  hubId: string;
}

function HubNode({ data }: NodeProps) {
  const { label, hubId } = data as unknown as HubNodeData;
  const ctx = useContext(GraphCtx);
  const [hover, setHover] = useState(false);
  const isConnectingFromThis = ctx?.connectingFrom?.id === hubId && ctx?.connectingFrom?.kind === 'hub';
  const isConnectingFromOther = !!ctx?.connectingFrom && !isConnectingFromThis;
  const SIZE = 110;

  const sideStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', width: 18, height: 18, opacity: 0,
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', width: SIZE, height: SIZE }}
    >
      <div
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: 14,
          background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
          border: `2px solid ${AUDIENCE_COLOR}`,
          boxShadow: isConnectingFromThis
            ? `0 0 0 4px #22c55e, 0 8px 28px ${AUDIENCE_COLOR}55`
            : isConnectingFromOther
              ? `0 0 0 3px #22c55e88, 0 8px 28px ${AUDIENCE_COLOR}55`
              : `0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px ${AUDIENCE_COLOR}33, inset 0 0 24px ${AUDIENCE_COLOR}15`,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 10,
          fontWeight: 700,
          fontSize: 11,
          lineHeight: 1.15,
          cursor: isConnectingFromOther ? 'crosshair' : 'grab',
          userSelect: 'none',
          transition: 'box-shadow 0.2s ease',
        }}
      >
        <Handle id="t" type="target" position={Position.Top} style={sideStyle} />
        <Handle id="r" type="source" position={Position.Right} style={sideStyle} />
        <Handle id="b" type="source" position={Position.Bottom} style={sideStyle} />
        <Handle id="l" type="target" position={Position.Left} style={sideStyle} />
        <div
          className="text-[9px] uppercase tracking-wider mb-1"
          style={{ color: AUDIENCE_COLOR, opacity: 0.85 }}
        >
          Hub
        </div>
        <div style={{ pointerEvents: 'none' }}>{label}</div>
      </div>

      {(hover || isConnectingFromThis) && !isConnectingFromOther && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isConnectingFromThis) ctx?.cancelConnect();
            else ctx?.startConnect(hubId, 'hub');
          }}
          title={isConnectingFromThis ? 'Cancelar' : 'Conectar a um evento destino'}
          style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: isConnectingFromThis ? '#ef4444' : '#22c55e',
            color: '#fff',
            border: '2px solid #fff',
            boxShadow: `0 4px 12px ${isConnectingFromThis ? '#ef4444' : '#22c55e'}88`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 10,
          }}
          className="animate-scale-in"
        >
          {isConnectingFromThis ? <X size={16} /> : <Plus size={18} />}
        </button>
      )}

      {isConnectingFromOther && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            ctx?.finishConnect(hubId, 'hub');
          }}
          style={{
            position: 'absolute', inset: 0, borderRadius: 14,
            background: 'transparent', border: 'none', cursor: 'crosshair', zIndex: 5,
          }}
          title="Conectar aqui"
        />
      )}
    </div>
  );
}

// ============== Animated "Energy Cable" Edge ==============
interface CableEdgeData {
  channel?: ChannelKey;
  color?: string;
  thickness?: number;
  kind?: 'channel' | 'sub' | 'user';
  parallelIndex?: number;
  parallelCount?: number;
  configured?: boolean;
  sourceName?: string;
  targetName?: string;
  channelLabel?: string;
}

function buildOffsetPath(
  sx: number, sy: number, tx: number, ty: number,
  parallelIndex: number, parallelCount: number,
): { path: string; midX: number; midY: number } {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const spacing = 36;
  const offset = (parallelIndex - (parallelCount - 1) / 2) * spacing;
  const mx = (sx + tx) / 2 + px * offset;
  const my = (sy + ty) / 2 + py * offset;
  const path = `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`;
  const midX = 0.25 * sx + 0.5 * mx + 0.25 * tx;
  const midY = 0.25 * sy + 0.5 * my + 0.25 * ty;
  return { path, midX, midY };
}

function CableEdge(props: EdgeProps) {
  const { id, source, target, markerEnd, data, selected } = props;
  const d = (data || {}) as CableEdgeData;
  const color = d.color || '#FF0080';
  const thickness = d.thickness ?? 3;
  const ctx = useContext(GraphCtx);
  const [hover, setHover] = useState(false);

  // Center-to-center: pull each node's actual center from the internal store
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const sw = sourceNode.measured?.width ?? (sourceNode as any).width ?? 0;
  const sh = sourceNode.measured?.height ?? (sourceNode as any).height ?? 0;
  const tw = targetNode.measured?.width ?? (targetNode as any).width ?? 0;
  const th = targetNode.measured?.height ?? (targetNode as any).height ?? 0;
  const sx = sourceNode.internals.positionAbsolute.x + sw / 2;
  const sy = sourceNode.internals.positionAbsolute.y + sh / 2;
  const tx = targetNode.internals.positionAbsolute.x + tw / 2;
  const ty = targetNode.internals.positionAbsolute.y + th / 2;

  const { path, midX, midY } = buildOffsetPath(
    sx, sy, tx, ty,
    d.parallelIndex ?? 0, d.parallelCount ?? 1,
  );

  const glowId = `glow-${id}`;
  const gradId = `grad-${id}`;
  const notConfigured = d.configured === false;
  void selected;

  return (
    <>
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={gradId}>
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="50%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.35" />
        </linearGradient>
        <marker
          id={`arrow-${id}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>

      {/* Invisible wide hit area */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ pointerEvents: 'stroke', cursor: d.kind === 'user' ? 'pointer' : 'default' }}
      />
      {/* Outer halo */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeOpacity={hover || selected ? 0.4 : 0.18}
        strokeWidth={thickness + 8}
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />
      {/* Main cable - dashed if not configured */}
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#arrow-${id})`}
        style={{
          stroke: notConfigured ? color : `url(#${gradId})`,
          strokeWidth: thickness,
          strokeLinecap: 'round',
          strokeDasharray: notConfigured ? '8 6' : undefined,
          strokeOpacity: notConfigured ? 0.65 : 1,
          filter: notConfigured ? undefined : `url(#${glowId})`,
        }}
      />
      {/* Energy pulse only when configured */}
      {!notConfigured && (
        <>
          <circle r={thickness + 2} fill={color} filter={`url(#${glowId})`}>
            <animateMotion dur="1.8s" repeatCount="indefinite" path={path} rotate="auto" />
          </circle>
          <circle r={thickness * 0.6} fill="#fff" opacity={0.95}>
            <animateMotion dur="1.8s" repeatCount="indefinite" path={path} rotate="auto" />
          </circle>
        </>
      )}

      {/* Midpoint: warning + remove button */}
      {d.kind === 'user' && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`,
              pointerEvents: 'all',
            }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="nodrag nopan"
          >
            <div className="flex items-center gap-1.5 animate-fade-in">
              {notConfigured && (
                <div
                  title="Campanha não configurada — abra o Hub para configurar"
                  className="flex items-center justify-center"
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: '#f59e0b',
                    color: '#fff',
                    border: '2px solid #fff',
                    boxShadow: '0 2px 10px #f59e0b88',
                    animation: 'pulse 1.6s ease-in-out infinite',
                  }}
                >
                  <AlertTriangle size={13} />
                </div>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); ctx?.removeEdge(id); }}
                title="Remover conexão"
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: '#ef4444', color: '#fff',
                  border: '2px solid #fff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  display: hover ? 'flex' : 'none',
                  alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}


const nodeTypes = { bubble: BubbleNode, hub: HubNode };
const edgeTypes = { cable: CableEdge };

const nodeKey = (kind: NodeKind, id: string) => (kind === 'event' ? `ev-${id}` : `hub-${id}`);
const parseNodeId = (nid: string): { kind: NodeKind; id: string } | null => {
  if (nid.startsWith('ev-')) return { kind: 'event', id: nid.slice(3) };
  if (nid.startsWith('hub-')) return { kind: 'hub', id: nid.slice(4) };
  return null;
};

// ============== Graph Builder ==============
function buildGraph(
  bubbles: EventBubble[],
  hubs: CampaignHub[],
  subsByEvent: Record<string, SubAudience[]>,
  metric: Metric,
  showSubs: boolean,
  positions: Record<string, { x: number; y: number }>,
  userConnections: UserConnection[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const maxTotal = Math.max(...bubbles.map((b) => b.total), 1);
  const N = bubbles.length;
  const ringRadius = Math.max(360, 120 * Math.sqrt(N));

  bubbles.forEach((b, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(N, 1);
    const seed = b.id.charCodeAt(0) + b.id.charCodeAt(b.id.length - 1);
    const jitter = ((seed % 100) / 100 - 0.5) * 180;
    const r = ringRadius + jitter;
    const defX = Math.cos(angle) * r;
    const defY = Math.sin(angle) * r;
    const size = bubbleSize(b.total, maxTotal);
    const color = BUBBLE_COLORS[i % BUBBLE_COLORS.length];
    const pos = positions[`ev-${b.id}`] ?? { x: defX, y: defY };

    nodes.push({
      id: `ev-${b.id}`,
      type: 'bubble',
      position: pos,
      data: { label: b.name, color, size, eventId: b.id },
    });

    if (showSubs) {
      const subs = subsByEvent[b.id] ?? [];
      subs.forEach((s, si) => {
        const a = (Math.PI * 2 * si) / Math.max(subs.length, 1);
        const sr = size * 0.9 + 60;
        const subId = `sub-${b.id}-${s.id}`;
        const subPos = positions[subId] ?? { x: pos.x + Math.cos(a) * sr, y: pos.y + Math.sin(a) * sr };
        nodes.push({
          id: subId,
          position: subPos,
          data: { label: s.name },
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: `2px dashed ${color}`,
            borderRadius: 9999,
            padding: '6px 10px',
            fontWeight: 500,
            fontSize: 11,
            maxWidth: 140,
            textAlign: 'center',
          },
        });
        edges.push({
          id: `e-sub-${b.id}-${s.id}`,
          source: `ev-${b.id}`,
          target: subId,
          style: { stroke: color, strokeWidth: 1.2, strokeDasharray: '4 3', opacity: 0.7 },
          data: { kind: 'sub' },
        });
      });
    }
  });

  hubs.forEach((h, i) => {
    const id = `hub-${h.id}`;
    const defX = -200 + i * 180;
    const defY = 0;
    const pos = positions[id] ?? { x: defX, y: defY };
    nodes.push({
      id,
      type: 'hub',
      position: pos,
      data: { label: h.name, hubId: h.id },
    });
  });

  // Helper: find name for any node id
  const nameForNode = (kind: NodeKind, id: string): string => {
    if (kind === 'event') return bubbles.find((x) => x.id === id)?.name || id;
    return hubs.find((x) => x.id === id)?.name || id;
  };

  // Group by unordered pair so that opposite-direction edges also separate
  const pairGroups: Record<string, UserConnection[]> = {};
  userConnections.forEach((uc) => {
    const sk = uc.sourceKind ?? 'event';
    const tk = uc.targetKind ?? 'event';
    const k = [`${sk}:${uc.source}`, `${tk}:${uc.target}`].sort().join('|');
    (pairGroups[k] ??= []).push(uc);
  });

  userConnections.forEach((uc) => {
    const sk = uc.sourceKind ?? 'event';
    const tk = uc.targetKind ?? 'event';
    const sourceId = nodeKey(sk, uc.source);
    const targetId = nodeKey(tk, uc.target);
    // Skip if endpoints don't exist
    if (!nodes.find((n) => n.id === sourceId) || !nodes.find((n) => n.id === targetId)) return;

    const isAudience = uc.channel === 'audience';
    const channelDef = !isAudience ? CHANNELS.find((c) => c.key === uc.channel as ChannelKey)! : null;
    const color = isAudience ? AUDIENCE_COLOR : channelDef!.color;
    const channelLabel = isAudience ? 'Audiência' : channelDef!.label;
    const thickness = isAudience ? 3 : 3.5;

    const k = [`${sk}:${uc.source}`, `${tk}:${uc.target}`].sort().join('|');
    const group = pairGroups[k];
    const parallelIndex = group.indexOf(uc);
    const parallelCount = group.length;

    edges.push({
      id: uc.id,
      type: 'cable',
      source: sourceId,
      target: targetId,
      data: {
        kind: 'user',
        channel: uc.channel,
        color,
        channelLabel,
        thickness,
        parallelIndex,
        parallelCount,
        configured: isAudience ? true : (uc.configured ?? false),
        sourceName: nameForNode(sk, uc.source),
        targetName: nameForNode(tk, uc.target),
      },
    });
  });

  return { nodes, edges };
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const { zoom } = useViewport();
  useEffect(() => { onZoom(zoom); }, [zoom, onZoom]);
  return null;
}

interface PendingConnection {
  source: string;
  sourceKind: NodeKind;
  target: string;
  targetKind: NodeKind;
}

interface CanvasProps {
  bubbles: EventBubble[];
  hubs: CampaignHub[];
  subsByEvent: Record<string, SubAudience[]>;
  metric: Metric;
  positions: Record<string, { x: number; y: number }>;
  userConnections: UserConnection[];
  onPositionsChange: (p: Record<string, { x: number; y: number }>) => void;
  onConnectionsChange: (c: UserConnection[]) => void;
  onPendingConnection: (c: PendingConnection) => void;
  onEventClick: (eventId: string) => void;
  onHubClick: (hubId: string) => void;
}

function GraphCanvas({
  bubbles, hubs, subsByEvent, metric, positions, userConnections,
  onPositionsChange, onConnectionsChange, onPendingConnection,
  onEventClick, onHubClick,
}: CanvasProps) {
  const [zoom, setZoom] = useState(1);
  const showSubs = zoom >= 1.4;
  const [connectingFrom, setConnectingFrom] = useState<ConnectingState | null>(null);
  

  const { nodes: builtNodes, edges: builtEdges } = useMemo(
    () => buildGraph(bubbles, hubs, subsByEvent, metric, showSubs, positions, userConnections),
    [bubbles, hubs, subsByEvent, metric, showSubs, positions, userConnections],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  useEffect(() => { setNodes(builtNodes); }, [builtNodes, setNodes]);
  useEffect(() => { setEdges(builtEdges); }, [builtEdges, setEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      // Persist positions whenever a position change is committed (drag end)
      // or even mid-drag, to avoid losing layout when navigating away quickly.
      const positionChanges = changes.filter(
        (c) => c.type === 'position' && (c as any).position,
      ) as Array<NodeChange & { id: string; position: { x: number; y: number }; dragging?: boolean }>;
      if (positionChanges.length === 0) return;
      const dragEnd = positionChanges.some((c) => c.dragging === false || c.dragging === undefined);
      if (dragEnd) {
        setNodes((prev) => {
          const next: Record<string, { x: number; y: number }> = { ...positions };
          prev.forEach((n) => { next[n.id] = { x: n.position.x, y: n.position.y }; });
          // Also overlay any positions from this change batch (in case prev not yet updated)
          positionChanges.forEach((c) => { if (c.position) next[c.id] = c.position; });
          onPositionsChange(next);
          return prev;
        });
      }
    },
    [onNodesChange, setNodes, positions, onPositionsChange],
  );

  const triggerPending = useCallback(
    (from: ConnectingState, toId: string, toKind: NodeKind) => {
      onPendingConnection({
        source: from.id, sourceKind: from.kind,
        target: toId, targetKind: toKind,
      });
    },
    [onPendingConnection],
  );

  const onConnect: OnConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const s = parseNodeId(conn.source);
      const t = parseNodeId(conn.target);
      if (!s || !t) return;
      triggerPending({ id: s.id, kind: s.kind }, t.id, t.kind);
    },
    [triggerPending],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      if (connectingFrom) return;
      if (node.id.startsWith('ev-')) onEventClick(node.id.replace('ev-', ''));
      else if (node.id.startsWith('hub-')) onHubClick(node.id.replace('hub-', ''));
    },
    [onEventClick, onHubClick, connectingFrom],
  );

  const ctxValue: GraphCtxValue = useMemo(
    () => ({
      connectingFrom,
      startConnect: (id, kind) => setConnectingFrom({ id, kind }),
      cancelConnect: () => setConnectingFrom(null),
      finishConnect: (id, kind) => {
        if (!connectingFrom || (connectingFrom.id === id && connectingFrom.kind === kind)) {
          setConnectingFrom(null);
          return;
        }
        triggerPending(connectingFrom, id, kind);
        setConnectingFrom(null);
      },
      removeEdge: (edgeId) => {
        onConnectionsChange(userConnections.filter((u) => u.id !== edgeId));
        toast.success('Conexão removida');
      },
    }),
    [connectingFrom, triggerPending, onConnectionsChange, userConnections],
  );

  return (
    <GraphCtx.Provider value={ctxValue}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={() => { setConnectingFrom(null); }}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={3}
        selectionOnDrag
        panOnDrag={[1, 2]}
        multiSelectionKeyCode={['Meta', 'Shift', 'Control']}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={28} />
        <Controls />
        <ZoomWatcher onZoom={setZoom} />
        {connectingFrom && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs bg-[#22c55e] text-white px-3 py-1.5 rounded-full shadow-lg pointer-events-none animate-fade-in">
            Selecione o evento que vai receber a conexão · ESC para cancelar
          </div>
        )}
        {!showSubs && !connectingFrom && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-muted-foreground bg-background/80 px-3 py-1 rounded-full border pointer-events-none">
            Arraste com o botão esquerdo para selecionar várias bolas · Shift+clique soma · <span className="text-[#22c55e] font-bold">+</span> conecta · Zoom mostra subpúblicos
          </div>
        )}
      </ReactFlow>
    </GraphCtx.Provider>
  );
}

export default function InternoGrafos() {
  const { id: graphId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const stateKey = graphStateKey(graphId);

  const [bubbles, setBubbles] = useState<EventBubble[]>([]);
  const [subsByEvent, setSubsByEvent] = useState<Record<string, SubAudience[]>>({});
  const [metric, setMetric] = useState<Metric>('volume');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [graphName, setGraphName] = useState<string>('Grafo');

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [userConnections, setUserConnections] = useState<UserConnection[]>([]);
  const [hubs, setHubs] = useState<CampaignHub[]>([]);
  const bubblesRef = useRef<EventBubble[]>([]);
  useEffect(() => { bubblesRef.current = bubbles; }, [bubbles]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    // Source of truth: current bubbles in this graph (manual ones are prefixed "manual-")
    const manualFromBubbles = bubbles.filter((b) => b.id.startsWith('manual-'));
    const state: PersistedGraphState = {
      positions,
      connections: userConnections,
      hubs,
      manualEvents: manualFromBubbles,
      subsByEvent,
    };
    try {
      await (supabase as any)
        .from('internal_page_state')
        .upsert({ page_key: stateKey, state }, { onConflict: 'page_key' });

      // Atualiza updatedAt no índice
      if (graphId && graphId !== 'v1') {
        const { data } = await (supabase as any)
          .from('internal_page_state')
          .select('state')
          .eq('page_key', GRAPH_INDEX_KEY)
          .maybeSingle();
        const items = (data?.state?.items ?? []) as Array<{ id: string; name: string; updatedAt: string }>;
        const next = items.map((it) =>
          it.id === graphId ? { ...it, updatedAt: new Date().toISOString() } : it,
        );
        await (supabase as any)
          .from('internal_page_state')
          .upsert({ page_key: GRAPH_INDEX_KEY, state: { items: next } }, { onConflict: 'page_key' });
      }
      setDirty(false);
      toast.success('Grafo salvo');
    } catch (error) {
      console.error('Erro ao salvar', error);
      toast.error('Não foi possível salvar');
    } finally {
      setSaving(false);
    }
  }, [positions, userConnections, hubs, subsByEvent, stateKey, graphId, bubbles]);

  const updatePositions = useCallback((p: Record<string, { x: number; y: number }>) => {
    setPositions(p);
    setDirty(true);
  }, []);
  const updateConnections = useCallback((c: UserConnection[]) => {
    setUserConnections(c);
    setDirty(true);
  }, []);
  const updateHubs = useCallback((h: CampaignHub[]) => {
    setHubs(h);
    setDirty(true);
  }, []);

  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeHubId, setActiveHubId] = useState<string | null>(null);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [newSub, setNewSub] = useState({ name: '', description: '' });

  const [pending, setPending] = useState<PendingConnection | null>(null);

  const fetchAggregates = useCallback(async (force = false) => {
    setLoading(true);
    // Preserve any unsaved manual events currently on screen
    const unsavedManualRef = bubblesRef.current.filter((b) => b.id.startsWith('manual-'));
    let savedState: Partial<PersistedGraphState> | null = null;
    try {
      const { data } = await (supabase as any)
        .from('internal_page_state')
        .select('state')
        .eq('page_key', stateKey)
        .maybeSingle();
      savedState = data?.state ?? null;
      if (savedState?.positions) setPositions(savedState.positions);
      else setPositions({});
      if (savedState?.connections) setUserConnections(savedState.connections);
      else setUserConnections([]);
      if (savedState?.hubs) setHubs(savedState.hubs);
      else setHubs([]);
      if (savedState?.subsByEvent) saveSubsMap(savedState.subsByEvent);
    } catch (error) {
      console.error('Erro ao carregar estado salvo do Grafos', error);
    }

    // Buscar nome do grafo no índice
    if (graphId && graphId !== 'v1') {
      try {
        const { data: idx } = await (supabase as any)
          .from('internal_page_state')
          .select('state')
          .eq('page_key', GRAPH_INDEX_KEY)
          .maybeSingle();
        const found = (idx?.state?.items ?? []).find((i: any) => i.id === graphId);
        if (found?.name) setGraphName(found.name);
      } catch {}
    } else {
      setGraphName('Grafo principal');
    }

    let list: EventBubble[] = [];
    const cached = !force ? localStorage.getItem(CACHE_KEY) : null;
    if (cached) {
      try { list = JSON.parse(cached); } catch { list = []; }
    }
    list = sanitizeBubbles(list);
    if (!list.length) {
      const { data, error } = await supabase.rpc('grafos_event_aggregates' as any);
      if (!error && data) {
        const byName: Record<string, EventBubble> = {};
        (data as any[]).forEach((row) => {
          const name = row.event_name as string;
          if (isBlockedGraphEvent(name)) return;
          if (!byName[name]) {
            byName[name] = {
              id: name, name,
              totals: {
                meta_ads: { volume: 0, conversion: 0 },
                whatsapp: { volume: 0, conversion: 0 },
                email: { volume: 0, conversion: 0 },
              },
              total: 0,
            };
          }
          const eb = byName[name];
          const ch = row.channel as ChannelKey | 'other';
          const vol = Number(row.volume || 0);
          const conv = Number(row.conversion || 0);
          eb.total += vol;
          if (ch !== 'other') {
            eb.totals[ch].volume += vol;
            eb.totals[ch].conversion += conv;
          }
        });
        list = sanitizeBubbles(Object.values(byName).filter((b) => b.total > 0)).sort((a, b) => b.total - a.total);
        localStorage.setItem(CACHE_KEY, JSON.stringify(list));
      }
    }
    // Merge: saved manual events from this graph + any unsaved manuals on screen (dedup by id)
    const savedManual = savedState?.manualEvents ? sanitizeBubbles(savedState.manualEvents) : [];
    const manualMap = new Map<string, EventBubble>();
    [...savedManual, ...unsavedManualRef].forEach((m) => manualMap.set(m.id, m));
    const manualEvents = Array.from(manualMap.values());
    const merged = sanitizeBubbles([...list, ...manualEvents]);
    const subs: Record<string, SubAudience[]> = {};
    merged.forEach((b) => { subs[b.id] = savedState?.subsByEvent?.[b.id] ?? loadSubs(b.id); });
    setBubbles(merged);
    setSubsByEvent(subs);
    // Keep dirty flag if there were unsaved manual events
    setDirty(unsavedManualRef.length > 0);
    setLoading(false);
  }, [stateKey, graphId]);

  useEffect(() => { fetchAggregates(); }, [fetchAggregates]);

  const [newEventOpen, setNewEventOpen] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const handleCreateEvent = () => {
    const name = newEventName.trim();
    if (!name) return;
    const manual = loadManualEvents();
    if (manual.some((e) => e.name === name) || bubbles.some((b) => b.name === name)) {
      toast.error('Já existe um evento com esse nome');
      return;
    }
    const ev: EventBubble = {
      id: `manual-${crypto.randomUUID()}`,
      name,
      totals: {
        meta_ads: { volume: 0, conversion: 0 },
        whatsapp: { volume: 0, conversion: 0 },
        email: { volume: 0, conversion: 0 },
      },
      total: 1,
    };
    const nextManual = [...manual, ev];
    saveManualEvents(nextManual);
    setBubbles((prev) => sanitizeBubbles([...prev, ev]));
    setDirty(true);
    setNewEventName('');
    setNewEventOpen(false);
    toast.success('Evento criado');
  };

  const activeEvent = useMemo(
    () => bubbles.find((b) => b.id === activeEventId) ?? null,
    [bubbles, activeEventId],
  );

  const handleAddSub = () => {
    if (!activeEventId) return;
    if (!newSub.name.trim()) return;
    const s: SubAudience = {
      id: crypto.randomUUID(),
      name: newSub.name.trim(),
      description: newSub.description.trim(),
    };
    const next = [...(subsByEvent[activeEventId] ?? []), s];
    const nextSubsByEvent = { ...subsByEvent, [activeEventId]: next };
    saveSubs(activeEventId, next);
    setSubsByEvent(nextSubsByEvent);
    setDirty(true);
    setNewSub({ name: '', description: '' });
    setSubDialogOpen(false);
    toast.success('Subpúblico criado');
  };

  const handleDeleteSub = (eventId: string, subId: string) => {
    const next = (subsByEvent[eventId] ?? []).filter((s) => s.id !== subId);
    const nextSubsByEvent = { ...subsByEvent, [eventId]: next };
    saveSubs(eventId, next);
    setSubsByEvent(nextSubsByEvent);
    setDirty(true);
  };

  // Auto-connect: event → hub creates an audience cable, no dialog needed
  const autoConnectAudience = (p: PendingConnection) => {
    const exists = userConnections.some(
      (u) =>
        u.channel === 'audience' &&
        u.source === p.source && (u.sourceKind ?? 'event') === p.sourceKind &&
        u.target === p.target && (u.targetKind ?? 'event') === p.targetKind,
    );
    if (exists) {
      toast.error('Esse evento já alimenta esse Hub');
      setPending(null);
      return;
    }
    const uc: UserConnection = {
      id: `uc-${crypto.randomUUID()}`,
      source: p.source, sourceKind: p.sourceKind,
      target: p.target, targetKind: p.targetKind,
      channel: 'audience',
      configured: true,
    };
    updateConnections([...userConnections, uc]);
    setPending(null);
    toast.success('Audiência conectada ao Hub');
  };

  // Hub → event: auto-create the 3 channel cables (Meta, WhatsApp, Email), all unconfigured
  const autoConnectHubChannels = (p: PendingConnection) => {
    const channels: ChannelKey[] = ['meta_ads', 'whatsapp', 'email'];
    const existing = userConnections.filter(
      (u) =>
        u.source === p.source && (u.sourceKind ?? 'event') === p.sourceKind &&
        u.target === p.target && (u.targetKind ?? 'event') === p.targetKind,
    );
    const toAdd: UserConnection[] = channels
      .filter((ch) => !existing.some((e) => e.channel === ch))
      .map((ch) => ({
        id: `uc-${crypto.randomUUID()}`,
        source: p.source, sourceKind: p.sourceKind,
        target: p.target, targetKind: p.targetKind,
        channel: ch,
        configured: false,
      }));
    if (!toAdd.length) {
      toast.error('Esse Hub já liga a esse evento');
      setPending(null);
      return;
    }
    updateConnections([...userConnections, ...toAdd]);
    setPending(null);
    toast.success('Hub ligado · 3 canais prontos para configurar');
  };

  // Pending router — picks behavior based on node kinds
  useEffect(() => {
    if (!pending) return;
    if (pending.sourceKind === 'event' && pending.targetKind === 'hub') {
      autoConnectAudience(pending);
    } else if (pending.sourceKind === 'hub' && pending.targetKind === 'event') {
      autoConnectHubChannels(pending);
    } else if (pending.sourceKind === 'hub' && pending.targetKind === 'hub') {
      toast.error('Um Hub não pode se ligar a outro Hub');
      setPending(null);
    }
    // event → event: keep the channel-picker dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const confirmConnection = (channel: ChannelKey) => {
    if (!pending) return;
    const exists = userConnections.some(
      (u) =>
        u.channel === channel &&
        u.source === pending.source && (u.sourceKind ?? 'event') === pending.sourceKind &&
        u.target === pending.target && (u.targetKind ?? 'event') === pending.targetKind,
    );
    if (exists) {
      toast.error('Essa conexão já existe nesse canal');
      setPending(null);
      return;
    }
    const uc: UserConnection = {
      id: `uc-${crypto.randomUUID()}`,
      source: pending.source, sourceKind: pending.sourceKind,
      target: pending.target, targetKind: pending.targetKind,
      channel,
    };
    updateConnections([...userConnections, uc]);
    setPending(null);
    toast.success(`Conectado via ${CHANNELS.find((c) => c.key === channel)!.label}`);
  };

  const [newHubOpen, setNewHubOpen] = useState(false);
  const [newHubName, setNewHubName] = useState('');
  const handleCreateHub = () => {
    const name = newHubName.trim();
    if (!name) return;
    const h: CampaignHub = { id: crypto.randomUUID(), name };
    updateHubs([...hubs, h]);
    setNewHubName('');
    setNewHubOpen(false);
    toast.success('Hub de campanhas criado');
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b bg-background">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate('/interno/grafos')}
          className="h-8 px-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-[#FF0080]" />
          <h1 className="text-lg font-bold">{graphName}</h1>
          <span className="text-xs text-muted-foreground hidden md:inline">
            · {bubbles.length} eventos · {userConnections.length} conexões
          </span>
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">· não salvo</span>}
        </div>
        <div className="flex-1" />

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="bg-[#FF0080] hover:bg-[#FF0080]/90 text-white"
        >
          <Save className="h-4 w-4" /> {saving ? 'Salvando…' : 'Salvar'}
        </Button>

        <ToggleGroup
          type="single"
          value={metric}
          onValueChange={(v) => v && setMetric(v as Metric)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="volume">Volume</ToggleGroupItem>
          <ToggleGroupItem value="conversion">Conversão</ToggleGroupItem>
        </ToggleGroup>

        <Button size="sm" onClick={() => setNewEventOpen(true)}>
          <Plus className="h-4 w-4" /> Novo evento
        </Button>
        <Button size="sm" variant="outline" onClick={() => setNewHubOpen(true)}>
          <Plus className="h-4 w-4" /> Novo Hub
        </Button>
        <Button size="sm" variant="outline" onClick={() => fetchAggregates(true)}>
          Atualizar
        </Button>

        <div className="hidden md:flex items-center gap-3 text-xs">
          {CHANNELS.map((c) => (
            <div key={c.key} className="flex items-center gap-1">
              <span className="inline-block w-3 h-1 rounded" style={{ background: c.color }} />
              <span className="text-muted-foreground">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 relative bg-muted/20">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            Carregando grafo de eventos…
          </div>
        ) : bubbles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            Nenhum evento ativo encontrado.
          </div>
        ) : (
          <ReactFlowProvider>
            <GraphCanvas
              bubbles={bubbles}
              hubs={hubs}
              subsByEvent={subsByEvent}
              metric={metric}
              positions={positions}
              userConnections={userConnections}
              onPositionsChange={updatePositions}
              onConnectionsChange={updateConnections}
              onPendingConnection={setPending}
              onEventClick={setActiveEventId}
              onHubClick={setActiveHubId}
            />
          </ReactFlowProvider>
        )}
      </div>

      {/* Channel picker only for direct event→event */}
      <Dialog
        open={!!pending && pending.sourceKind === 'event' && pending.targetKind === 'event'}
        onOpenChange={(o) => !o && setPending(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Qual ferramenta conecta esses eventos?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            {CHANNELS.map((c) => (
              <Button
                key={c.key}
                variant="outline"
                className="justify-start gap-3 h-12"
                onClick={() => confirmConnection(c.key)}
              >
                {c.key === 'meta_ads' && <Target className="h-5 w-5" style={{ color: c.color }} />}
                {c.key === 'whatsapp' && <MessageCircle className="h-5 w-5" style={{ color: c.color }} />}
                {c.key === 'email' && <Mail className="h-5 w-5" style={{ color: c.color }} />}
                <span className="font-semibold">{c.label}</span>
                <span
                  className="ml-auto inline-block w-8 h-1 rounded-full"
                  style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }}
                />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={!!activeEvent} onOpenChange={(o) => !o && setActiveEventId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{activeEvent?.name}</DialogTitle>
          </DialogHeader>
          {activeEvent && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-2">
                {CHANNELS.map((c) => (
                  <div key={c.key} className="p-3 rounded-md border">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: c.color }} />
                      {c.label}
                    </div>
                    <div className="text-base font-bold">
                      {metric === 'volume'
                        ? activeEvent.totals[c.key].volume
                        : `R$ ${activeEvent.totals[c.key].conversion.toFixed(0)}`}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Subpúblicos</Label>
                  <Button size="sm" variant="outline" onClick={() => setSubDialogOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Novo
                  </Button>
                </div>
                <div className="space-y-2">
                  {(subsByEvent[activeEvent.id] ?? []).length === 0 && (
                    <div className="text-xs text-muted-foreground italic">
                      Nenhum subpúblico ainda. Aproxime o zoom no canvas para vê-los ao redor da bola do evento.
                    </div>
                  )}
                  {(subsByEvent[activeEvent.id] ?? []).map((s) => (
                    <div key={s.id} className="flex items-start justify-between gap-2 p-2 rounded border">
                      <div>
                        <div className="font-medium">{s.name}</div>
                        {s.description && (
                          <div className="text-xs text-muted-foreground">{s.description}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDeleteSub(activeEvent.id, s.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo subpúblico {activeEvent ? `· ${activeEvent.name}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={newSub.name}
                onChange={(e) => setNewSub((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Mulheres 25-34, fãs de funk"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={newSub.description}
                onChange={(e) => setNewSub((p) => ({ ...p, description: e.target.value }))}
                placeholder="Notas sobre comportamento, origem, criativos que respondem…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddSub} className="bg-[#FF0080] hover:bg-[#FF0080]/90">
              Criar subpúblico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newEventOpen} onOpenChange={setNewEventOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Nome do evento</Label>
            <Input
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="Ex: BoomRAP Festival 2026"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateEvent()}
            />
            <p className="text-xs text-muted-foreground">
              Ele aparecerá como uma bolinha pequena no grafo. Depois conectaremos à API da ticketeira.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewEventOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateEvent}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newHubOpen} onOpenChange={setNewHubOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Hub de campanhas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Nome do Hub</Label>
            <Input
              value={newHubName}
              onChange={(e) => setNewHubName(e.target.value)}
              placeholder="Ex: Audiência BoomRAP 2026"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateHub()}
            />
            <p className="text-xs text-muted-foreground">
              Hub = quadrado no grafo. Eventos-fonte alimentam ele com público (linha amarela).
              Depois ele liga em <strong>1 evento destino</strong> e gera 3 cabos automáticos
              (Meta Ads, WhatsApp e E-mail) prontos pra você configurar.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewHubOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateHub}>Criar Hub</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HubManagerDialog
        hub={hubs.find((h) => h.id === activeHubId) ?? null}
        bubbles={bubbles}
        connections={userConnections}
        onClose={() => setActiveHubId(null)}
        onUpdateConnections={updateConnections}
        onDeleteHub={(hubId) => {
          updateConnections(userConnections.filter(
            (u) => !((u.sourceKind ?? 'event') === 'hub' && u.source === hubId)
              && !((u.targetKind ?? 'event') === 'hub' && u.target === hubId),
          ));
          updateHubs(hubs.filter((h) => h.id !== hubId));
          setActiveHubId(null);
          toast.success('Hub excluído');
        }}
        onRenameHub={(hubId, name) => {
          updateHubs(hubs.map((h) => h.id === hubId ? { ...h, name } : h));
        }}
      />
    </div>
  );
}

// ============== Hub Management Dialog ==============
function HubManagerDialog({
  hub, bubbles, connections, onClose, onUpdateConnections, onDeleteHub, onRenameHub,
}: {
  hub: CampaignHub | null;
  bubbles: EventBubble[];
  connections: UserConnection[];
  onClose: () => void;
  onUpdateConnections: (c: UserConnection[]) => void;
  onDeleteHub: (hubId: string) => void;
  onRenameHub: (hubId: string, name: string) => void;
}) {
  const [editingName, setEditingName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setEditingName(hub?.name ?? '');
    setConfirmDelete(false);
  }, [hub?.id]);

  if (!hub) return null;

  const eventName = (id: string) => bubbles.find((b) => b.id === id)?.name ?? id;

  const audienceFeeds = connections.filter(
    (u) => u.channel === 'audience' &&
      (u.targetKind ?? 'event') === 'hub' && u.target === hub.id,
  );
  const outgoing = connections.filter(
    (u) => (u.sourceKind ?? 'event') === 'hub' && u.source === hub.id &&
      u.channel !== 'audience',
  );
  const targetEventId = outgoing[0]?.target;
  const targetName = targetEventId ? eventName(targetEventId) : null;

  const removeAudience = (id: string) => {
    onUpdateConnections(connections.filter((u) => u.id !== id));
    toast.success('Fonte de audiência removida');
  };
  const removeCampaign = (id: string) => {
    onUpdateConnections(connections.filter((u) => u.id !== id));
    toast.success('Campanha removida');
  };
  const toggleConfigured = (id: string) => {
    onUpdateConnections(
      connections.map((u) => u.id === id ? { ...u, configured: !u.configured } : u),
    );
  };
  const renameCampaign = (id: string, name: string) => {
    onUpdateConnections(
      connections.map((u) => u.id === id ? { ...u, name } : u),
    );
  };

  const addCampaign = (channel: ChannelKey) => {
    if (!targetEventId) {
      toast.error('Conecte o Hub a um evento destino primeiro');
      return;
    }
    const uc: UserConnection = {
      id: `uc-${crypto.randomUUID()}`,
      source: hub.id, sourceKind: 'hub',
      target: targetEventId, targetKind: 'event',
      channel,
      configured: false,
    };
    onUpdateConnections([...connections, uc]);
    toast.success(`Campanha ${CHANNELS.find((c) => c.key === channel)!.label} criada`);
  };

  return (
    <Dialog open={!!hub} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded"
              style={{ background: AUDIENCE_COLOR }}
            />
            Hub · {hub.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <Label className="text-xs">Nome do Hub</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder="Nome do Hub"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const n = editingName.trim();
                  if (!n) return;
                  onRenameHub(hub.id, n);
                  toast.success('Hub renomeado');
                }}
                disabled={!editingName.trim() || editingName.trim() === hub.name}
              >
                Salvar
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: AUDIENCE_COLOR }} />
              Fontes de audiência ({audienceFeeds.length})
            </Label>
            <div className="mt-1 space-y-1.5">
              {audienceFeeds.length === 0 && (
                <div className="text-xs text-muted-foreground italic">
                  Nenhum evento alimentando este Hub. Conecte um evento ao quadrado no grafo.
                </div>
              )}
              {audienceFeeds.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 p-2 rounded border">
                  <div className="text-sm font-medium truncate">{eventName(u.source)}</div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeAudience(u.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs flex items-center justify-between">
              <span>Evento destino</span>
              {targetName && <span className="text-muted-foreground font-normal">→ {targetName}</span>}
            </Label>
            {!targetName && (
              <div className="text-xs text-muted-foreground italic mt-1">
                Conecte o Hub a um evento destino para criar campanhas.
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Campanhas ({outgoing.length})</Label>
              <div className="flex gap-1">
                {CHANNELS.map((c) => (
                  <Button
                    key={c.key}
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => addCampaign(c.key)}
                    disabled={!targetEventId}
                    title={`Nova campanha ${c.label}`}
                  >
                    <Plus className="h-3 w-3 mr-1" style={{ color: c.color }} />
                    {c.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {outgoing.length === 0 && (
                <div className="text-xs text-muted-foreground italic">
                  Nenhuma campanha ainda.
                </div>
              )}
              {outgoing.map((u) => {
                const ch = CHANNELS.find((c) => c.key === u.channel)!;
                return (
                  <div key={u.id} className="flex items-center gap-2 p-2 rounded border">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: ch.color }}
                    />
                    <span className="text-[11px] uppercase tracking-wide font-semibold w-20" style={{ color: ch.color }}>
                      {ch.label}
                    </span>
                    <Input
                      value={u.name ?? ''}
                      onChange={(e) => renameCampaign(u.id, e.target.value)}
                      placeholder="Nome da campanha"
                      className="h-7 text-xs flex-1"
                    />
                    <Button
                      size="sm"
                      variant={u.configured ? 'default' : 'outline'}
                      className="h-7 text-[11px]"
                      onClick={() => toggleConfigured(u.id)}
                    >
                      {u.configured ? 'Ativa' : 'Pendente'}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeCampaign(u.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {!confirmDelete ? (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Excluir Hub
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => onDeleteHub(hub.id)}>
                Confirmar exclusão
              </Button>
            </>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
