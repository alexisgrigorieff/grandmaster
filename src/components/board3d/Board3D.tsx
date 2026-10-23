"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from "@react-three/drei";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { PieceSymbol, Square } from "chess.js";
import { useShallow } from "zustand/react/shallow";
import { animationMs, useSettings, type PieceStyle, type Quality } from "@/lib/settings";
import { coordsToSquare, squareToCoords, type TrackedPiece } from "@/lib/chess/pieces";
import type { BoardProps, MoveTarget } from "@/components/board/types";
import { useSelection } from "@/components/board/useSelection";
import { pieceGeometry } from "./geometry";
import { boardTexture, coordinatesTexture, frameTexture, grainTexture, radialTexture } from "./textures";

const FRAME = 9.3;
const DRAG_HEIGHT = 0.32;

export function squarePosition(sq: Square, out = new THREE.Vector3()): THREE.Vector3 {
  const { file, rank } = squareToCoords(sq);
  return out.set(file - 3.5, 0, 3.5 - rank);
}

export function pointToSquare(x: number, z: number): Square | null {
  return coordsToSquare(Math.floor(x + 4), Math.floor(4 - z));
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
function usePieceMaterials(style: PieceStyle, quality: Quality) {
  return useMemo(() => {
    const Physical = quality === "low" ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
    const extra = (o: Record<string, unknown>) => (quality === "low" ? {} : o);
    if (style === "wood") {
      return {
        w: new Physical({ color: "#ffffff", map: grainTexture("light"), roughness: 0.42, ...extra({ clearcoat: 0.65, clearcoatRoughness: 0.22 }) }),
        b: new Physical({ color: "#ffffff", map: grainTexture("dark"), roughness: 0.34, ...extra({ clearcoat: 0.85, clearcoatRoughness: 0.16 }) }),
      };
    }
    return {
      w: new Physical({ color: "#EEECE6", roughness: 0.3, ...extra({ clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.2 }) }),
      b: new Physical({ color: "#1B1C20", metalness: 0.45, roughness: 0.3, ...extra({ clearcoat: 0.6, clearcoatRoughness: 0.2 }) }),
    };
  }, [style, quality]);
}

// ---------------------------------------------------------------------------
// Piece
// ---------------------------------------------------------------------------
interface PieceProps {
  piece: TrackedPiece;
  material: THREE.Material;
  style: PieceStyle;
  quality: Quality;
  animMs: number;
  lifted: boolean;
  dragging: boolean;
  dragPos: React.RefObject<THREE.Vector3>;
  exiting?: boolean;
  delayMs?: number;
  movable: boolean;
  onDown?: (piece: TrackedPiece, e: ThreeEvent<PointerEvent>) => void;
  onTap?: (piece: TrackedPiece, e: ThreeEvent<MouseEvent>) => void;
  shadows: boolean;
}

const Piece3D = memo(function Piece3D(p: PieceProps) {
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => squarePosition(p.piece.square), [p.piece.square]);
  const invalidate = useThree((s) => s.invalidate);
  const anim = useRef({ from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, dur: 0, arc: 0, active: false });
  const wasDragging = useRef(false);
  const scale = useRef({ v: 1, born: 0 });
  const geometry = pieceGeometry(p.piece.type, p.style, p.quality);
  const prevType = useRef<PieceSymbol>(p.piece.type);
  const exitStart = useRef<number | null>(null);

  useLayoutEffect(() => {
    ref.current?.position.copy(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prevType.current !== p.piece.type) {
      prevType.current = p.piece.type;
      scale.current = { v: 1.35, born: performance.now() };
    }
    invalidate();
  }, [p.piece.type, invalidate]);

  useEffect(() => {
    if (p.exiting) exitStart.current = performance.now() + (p.delayMs ?? 0);
    invalidate();
  }, [p.exiting, p.delayMs, invalidate]);

  useEffect(() => {
    invalidate();
  }, [p.lifted, p.dragging, target, invalidate]);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const now = performance.now();
    let busy = false;

    if (p.dragging) {
      g.position.lerp(p.dragPos.current!, 0.55);
      wasDragging.current = true;
      anim.current.active = false;
      busy = true;
    } else {
      const a = anim.current;
      const restY = p.lifted ? 0.1 : 0;
      const off = Math.abs(g.position.x - target.x) > 1e-3 || Math.abs(g.position.z - target.z) > 1e-3;
      if (off && (!a.active || !a.to.equals(target))) {
        const from = g.position.clone();
        const dist = Math.hypot(from.x - target.x, from.z - target.z);
        a.from.copy(from);
        a.to.copy(target);
        a.t0 = now;
        a.dur = p.animMs === 0 ? 0 : p.animMs * (0.8 + Math.min(dist, 7) * 0.07) * (wasDragging.current ? 0.45 : 1);
        a.arc = wasDragging.current ? 0 : p.piece.type === "n" ? 0.42 : Math.min(0.14, dist * 0.06);
        a.active = true;
        wasDragging.current = false;
      }
      if (a.active) {
        const t = a.dur === 0 ? 1 : Math.min(1, (now - a.t0) / a.dur);
        const e = easeInOut(t);
        g.position.x = a.from.x + (a.to.x - a.from.x) * e;
        g.position.z = a.from.z + (a.to.z - a.from.z) * e;
        const baseY = a.from.y + (restY - a.from.y) * e;
        g.position.y = baseY + a.arc * Math.sin(Math.PI * t);
        if (t >= 1) a.active = false;
        busy = true;
      } else if (Math.abs(g.position.y - restY) > 1e-3) {
        g.position.y += (restY - g.position.y) * 0.3;
        busy = true;
      } else {
        g.position.y = restY;
      }
    }

    // Promotion pop.
    const s = scale.current;
    if (s.v !== 1) {
      const t = Math.min(1, (now - s.born) / 320);
      const v = 1 + (s.v - 1) * (1 - easeInOut(t));
      g.scale.setScalar(v);
      if (t >= 1) s.v = 1;
      busy = true;
    }

    // Captured: wait for the attacker to arrive, then shrink into the board.
    if (p.exiting && exitStart.current != null) {
      const t = Math.max(0, Math.min(1, (now - exitStart.current) / 260));
      g.scale.setScalar(1 - easeInOut(t));
      g.position.y = -0.15 * t;
      busy = t < 1 || now < exitStart.current;
    }

    if (busy) invalidate();
  });

  return (
    <group
      ref={ref}
      rotation-y={p.piece.color === "b" ? Math.PI : 0}
      onPointerDown={p.exiting ? undefined : (e) => p.onDown?.(p.piece, e)}
      onClick={p.exiting ? undefined : (e) => p.onTap?.(p.piece, e)}
      onPointerOver={(e) => {
        if (!p.movable) return;
        e.stopPropagation();
        document.body.style.cursor = "grab";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <mesh geometry={geometry} material={p.material} castShadow={p.shadows} receiveShadow={p.shadows} />
    </group>
  );
});

// ---------------------------------------------------------------------------
// Board + highlights
// ---------------------------------------------------------------------------
function BoardMesh({
  style,
  quality,
  showCoordinates,
  onSquareClick,
  onSquareHover,
  shadows,
}: {
  style: PieceStyle;
  quality: Quality;
  showCoordinates: boolean;
  onSquareClick: (sq: Square, e: ThreeEvent<MouseEvent>) => void;
  onSquareHover: (sq: Square | null) => void;
  shadows: boolean;
}) {
  const surface = useMemo(() => boardTexture(style, quality), [style, quality]);
  const frame = useMemo(() => frameTexture(style), [style]);
  const coords = useMemo(() => coordinatesTexture(style, 8, FRAME), [style]);
  const Physical = quality === "low" ? "meshStandardMaterial" : "meshPhysicalMaterial";

  return (
    <group>
      <RoundedBox args={[FRAME, 0.42, FRAME]} radius={0.09} smoothness={quality === "low" ? 2 : 4} position={[0, -0.212, 0]} receiveShadow={shadows} castShadow={shadows}>
        {Physical === "meshPhysicalMaterial" ? (
          <meshPhysicalMaterial map={frame} roughness={style === "wood" ? 0.38 : 0.5} clearcoat={style === "wood" ? 0.7 : 0.3} clearcoatRoughness={0.25} />
        ) : (
          <meshStandardMaterial map={frame} roughness={0.45} />
        )}
      </RoundedBox>
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.002}
        receiveShadow={shadows}
        onClick={(e) => {
          const sq = pointToSquare(e.point.x, e.point.z);
          if (sq) onSquareClick(sq, e);
        }}
        onPointerMove={(e) => onSquareHover(pointToSquare(e.point.x, e.point.z))}
        onPointerOut={() => onSquareHover(null)}
      >
        <planeGeometry args={[8, 8]} />
        {Physical === "meshPhysicalMaterial" ? (
          <meshPhysicalMaterial map={surface} roughness={style === "wood" ? 0.46 : 0.28} clearcoat={style === "wood" ? 0.55 : 0.8} clearcoatRoughness={style === "wood" ? 0.3 : 0.12} />
        ) : (
          <meshStandardMaterial map={surface} roughness={0.5} />
        )}
      </mesh>
      {showCoordinates && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.003} renderOrder={1}>
          <planeGeometry args={[FRAME, FRAME]} />
          <meshBasicMaterial map={coords} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

const unitPlane = new THREE.PlaneGeometry(1, 1);
const dotGeo = new THREE.CircleGeometry(0.15, 32);
const ringGeo = new THREE.RingGeometry(0.39, 0.48, 48);

function SquareOverlay({ sq, color, opacity, geometry = unitPlane, y = 0.006 }: { sq: Square; color: string; opacity: number; geometry?: THREE.BufferGeometry; y?: number }) {
  const pos = squarePosition(sq);
  return (
    <mesh geometry={geometry} position={[pos.x, y, pos.z]} rotation-x={-Math.PI / 2} renderOrder={2}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Highlights({
  lastMove,
  selected,
  targets,
  hover,
  check,
  showLegal,
}: {
  lastMove: BoardProps["lastMove"];
  selected: Square | null;
  targets: MoveTarget[];
  hover: Square | null;
  check: Square | null;
  showLegal: boolean;
}) {
  const checkTex = useMemo(() => radialTexture("rgba(235, 70, 55, 0.95)"), []);
  const hoverIsTarget = hover && targets.some((t) => t.to === hover);
  return (
    <group>
      {lastMove && (
        <>
          <SquareOverlay sq={lastMove.from} color="#E8B04A" opacity={0.22} />
          <SquareOverlay sq={lastMove.to} color="#E8B04A" opacity={0.34} />
        </>
      )}
      {selected && <SquareOverlay sq={selected} color="#F3C764" opacity={0.5} y={0.007} />}
      {hoverIsTarget && <SquareOverlay sq={hover!} color="#F3D27F" opacity={0.32} y={0.007} />}
      {showLegal &&
        targets.map((t) =>
          t.capture ? (
            <SquareOverlay key={t.to} sq={t.to} color="#F5D58B" opacity={0.75} geometry={ringGeo} y={0.008} />
          ) : (
            <SquareOverlay key={t.to} sq={t.to} color="#F5D58B" opacity={0.72} geometry={dotGeo} y={0.008} />
          ),
        )}
      {check && (
        <mesh position={[squarePosition(check).x, 0.009, squarePosition(check).z]} rotation-x={-Math.PI / 2} renderOrder={3}>
          <planeGeometry args={[1.5, 1.5]} />
          <meshBasicMaterial map={checkTex} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
function CameraRig({
  orientation,
  resetKey,
  controls,
}: {
  orientation: BoardProps["orientation"];
  resetKey: number;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const anim = useRef<{ from: THREE.Spherical; to: THREE.Spherical; t0: number } | null>(null);
  const first = useRef(true);
  const portrait = size.width < size.height;

  const desired = useCallback(() => {
    const aspect = size.width / Math.max(1, size.height);
    const radius = aspect >= 1.15 ? 14 : 14 * Math.pow(1.15 / aspect, 0.8);
    const phi = aspect >= 1 ? 0.62 : 0.5;
    return new THREE.Spherical(radius, phi, orientation === "white" ? 0 : Math.PI);
  }, [orientation, size.width, size.height]);

  useEffect(() => {
    const to = desired();
    if (first.current) {
      first.current = false;
      camera.position.setFromSpherical(to);
      camera.lookAt(0, 0, 0);
      controls.current?.update();
      invalidate();
      return;
    }
    const from = new THREE.Spherical().setFromVector3(camera.position);
    // Rotate the short way round.
    let dTheta = to.theta - from.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    to.theta = from.theta + dTheta;
    anim.current = { from, to, t0: performance.now() };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation, resetKey, portrait]);

  useFrame(() => {
    const a = anim.current;
    if (!a) return;
    const t = Math.min(1, (performance.now() - a.t0) / 750);
    const e = easeInOut(t);
    const s = new THREE.Spherical(
      a.from.radius + (a.to.radius - a.from.radius) * e,
      a.from.phi + (a.to.phi - a.from.phi) * e,
      a.from.theta + (a.to.theta - a.from.theta) * e,
    );
    camera.position.setFromSpherical(s);
    camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    if (t >= 1) anim.current = null;
    invalidate();
  });
  return null;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
interface Ghost {
  piece: TrackedPiece;
  until: number;
}

function Scene(props: BoardProps & { style: PieceStyle; quality: Quality; animMs: number; showLegal: boolean; showCoordinates: boolean; dragToMove: boolean }) {
  const { pieces, legal, interactive, onMove, style, quality, animMs } = props;
  const controls = useRef<OrbitControlsImpl | null>(null);
  const { selected, setSelected, targets, clickSquare, tryMove } = useSelection(legal, interactive, onMove);
  const [hover, setHover] = useState<Square | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragPos = useRef(new THREE.Vector3());
  const press = useRef<{ piece: TrackedPiece; x: number; y: number; dragging: boolean } | null>(null);
  const materials = usePieceMaterials(style, quality);
  const shadows = quality !== "low";
  const { camera, gl, invalidate, raycaster } = useThree();
  const shownTargets = selected ? targets : [];

  // Track captured pieces so they can animate out.
  const prev = useRef<TrackedPiece[]>(pieces);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  useEffect(() => {
    const ids = new Set(pieces.map((p) => p.id));
    const gone = prev.current.filter((p) => !ids.has(p.id));
    prev.current = pieces;
    if (gone.length && animMs > 0) {
      const until = performance.now() + animMs + 300;
      setGhosts((g) => [...g.filter((x) => x.until > performance.now()), ...gone.map((piece) => ({ piece, until }))]);
      const t = setTimeout(() => setGhosts((g) => g.filter((x) => x.until > performance.now())), animMs + 350);
      return () => clearTimeout(t);
    }
  }, [pieces, animMs]);

  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_HEIGHT), []);
  const floor = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const rayAt = useCallback(
    (clientX: number, clientY: number, p: THREE.Plane) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      return raycaster.ray.intersectPlane(p, hit) ? hit : null;
    },
    [camera, gl, raycaster],
  );

  // Drag-and-drop via window listeners so a drag can end anywhere.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const pr = press.current;
      if (!pr) return;
      if (!pr.dragging && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 6 && props.dragToMove) {
        pr.dragging = true;
        setSelected(pr.piece.square);
        setDraggingId(pr.piece.id);
        document.body.style.cursor = "grabbing";
      }
      if (pr.dragging) {
        const hit = rayAt(e.clientX, e.clientY, plane);
        if (hit) {
          dragPos.current.set(THREE.MathUtils.clamp(hit.x, -4.4, 4.4), DRAG_HEIGHT, THREE.MathUtils.clamp(hit.z, -4.4, 4.4));
          const sq = rayAt(e.clientX, e.clientY, floor);
          setHover(sq ? pointToSquare(sq.x, sq.z) : null);
        }
        invalidate();
      }
    };
    const up = (e: PointerEvent) => {
      const pr = press.current;
      if (!pr) return;
      press.current = null;
      if (controls.current) controls.current.enabled = true;
      document.body.style.cursor = "";
      if (pr.dragging) {
        setDraggingId(null);
        const hit = rayAt(e.clientX, e.clientY, floor);
        const sq = hit ? pointToSquare(hit.x, hit.z) : null;
        if (!sq || sq === pr.piece.square || !tryMove(pr.piece.square, sq)) {
          // Dropped back or on an illegal square: keep it selected.
          setSelected(pr.piece.square);
        }
        setHover(null);
      } else {
        // A tap on one of our pieces.
        if (selected && selected !== pr.piece.square && tryMove(selected, pr.piece.square)) return;
        setSelected(selected === pr.piece.square ? null : pr.piece.square);
      }
      invalidate();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [rayAt, plane, floor, tryMove, selected, setSelected, invalidate, props.dragToMove]);

  const onPieceDown = useCallback(
    (piece: TrackedPiece, e: ThreeEvent<PointerEvent>) => {
      if (!interactive || !legal.has(piece.square)) return;
      e.stopPropagation();
      if (controls.current) controls.current.enabled = false;
      press.current = { piece, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, dragging: false };
      dragPos.current.copy(squarePosition(piece.square)).setY(DRAG_HEIGHT);
    },
    [interactive, legal],
  );

  const onPieceTap = useCallback(
    (piece: TrackedPiece, e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta > 6 || legal.has(piece.square)) return; // own pieces are handled on pointerup
      clickSquare(piece.square);
    },
    [legal, clickSquare],
  );

  const onSquareClick = useCallback(
    (sq: Square, e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 6) return;
      clickSquare(sq);
    },
    [clickSquare],
  );

  const onSquareHover = useCallback(
    (sq: Square | null) => {
      if (press.current?.dragging) return;
      const isTarget = Boolean(sq && targets.some((t) => t.to === sq));
      document.body.style.cursor = isTarget ? "pointer" : "";
      setHover((h) => (h === sq ? h : sq));
    },
    [targets],
  );

  const capturingDelay = animMs * 0.75;

  // Projection helper used by automated tests and accessibility tooling:
  // window.__gm3d.squareToClient("e4") -> {x, y} in viewport pixels.
  useEffect(() => {
    const w = window as unknown as { __gm3d?: { squareToClient: (sq: Square) => { x: number; y: number } } };
    w.__gm3d = {
      squareToClient: (sq: Square) => {
        const v = squarePosition(sq).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
    };
    return () => {
      delete w.__gm3d;
    };
  }, [camera, gl]);

  return (
    <>
      <ambientLight intensity={0.25} />
      <hemisphereLight args={["#fff6e6", "#2a1b10", 0.45]} />
      <directionalLight
        position={[4.5, 10, 6]}
        intensity={1.85}
        castShadow={shadows}
        shadow-mapSize={quality === "high" ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-6.5}
        shadow-camera-right={6.5}
        shadow-camera-top={6.5}
        shadow-camera-bottom={-6.5}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
      />
      <directionalLight position={[-6, 5, -4]} intensity={0.55} color="#c8d4ff" />

      {quality !== "low" && (
        <Environment resolution={quality === "high" ? 256 : 128} frames={1}>
          <Lightformer form="rect" intensity={2.2} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[12, 6, 1]} color="#fff4e0" />
          <Lightformer form="rect" intensity={1.4} position={[-8, 3, 2]} rotation-y={Math.PI / 2} scale={[10, 2, 1]} color="#ffe3b8" />
          <Lightformer form="rect" intensity={0.9} position={[8, 2.5, -3]} rotation-y={-Math.PI / 2} scale={[10, 1.5, 1]} color="#bcd0ff" />
          <Lightformer form="ring" intensity={0.8} position={[0, 4, 9]} scale={3} color="#ffffff" />
        </Environment>
      )}

      <BoardMesh style={style} quality={quality} showCoordinates={props.showCoordinates} onSquareClick={onSquareClick} onSquareHover={onSquareHover} shadows={shadows} />
      <Highlights lastMove={props.lastMove} selected={selected} targets={shownTargets} hover={hover} check={props.check} showLegal={props.showLegal} />

      {pieces.map((piece) => (
        <Piece3D
          key={piece.id}
          piece={piece}
          material={materials[piece.color]}
          style={style}
          quality={quality}
          animMs={animMs}
          lifted={selected === piece.square && draggingId !== piece.id}
          dragging={draggingId === piece.id}
          dragPos={dragPos}
          movable={interactive && legal.has(piece.square)}
          onDown={onPieceDown}
          onTap={onPieceTap}
          shadows={shadows}
        />
      ))}
      {ghosts.map((g) => (
        <Piece3D
          key={`ghost-${g.piece.id}`}
          piece={g.piece}
          material={materials[g.piece.color]}
          style={style}
          quality={quality}
          animMs={animMs}
          lifted={false}
          dragging={false}
          dragPos={dragPos}
          movable={false}
          exiting
          delayMs={capturingDelay}
          shadows={shadows}
        />
      ))}

      {quality !== "low" && (
        <ContactShadows position={[0, -0.43, 0]} scale={16} opacity={0.65} blur={2.6} far={2} frames={1} resolution={quality === "high" ? 512 : 256} color="#000000" />
      )}

      <CameraRig orientation={props.orientation} resetKey={props.cameraResetKey ?? 0} controls={controls} />
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        minDistance={6.5}
        maxDistance={24}
        minPolarAngle={0.05}
        maxPolarAngle={1.32}
        autoRotate={props.showcase}
        autoRotateSpeed={0.45}
        enableZoom={!props.showcase}
        enableRotate={!props.showcase}
      />
    </>
  );
}

export default function Board3D(props: BoardProps) {
  const settings = useSettings(
    useShallow((s) => ({
      quality: s.quality,
      pieceStyle: s.pieceStyle,
      animationSpeed: s.animationSpeed,
      showLegalMoves: s.showLegalMoves,
      showCoordinates: s.showCoordinates,
      dragToMove: s.dragToMove,
    })),
  );
  const { quality } = settings;
  const dpr: [number, number] = quality === "low" ? [1, 1] : quality === "medium" ? [1, 1.5] : [1, 2];

  useEffect(() => () => void (document.body.style.cursor = ""), []);

  return (
    <div className={props.className ?? "relative h-full w-full"} style={{ touchAction: "none" }} data-testid="board-3d">
      <Canvas
        shadows={quality !== "low"}
        dpr={dpr}
        frameloop={props.showcase ? "always" : "demand"}
        camera={{ fov: 36, near: 0.5, far: 80, position: [0, 9, 8] }}
        gl={{ antialias: quality !== "low", alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: false }}
        style={{ background: "transparent" }}
      >
        <Scene
          {...props}
          style={settings.pieceStyle}
          quality={quality}
          animMs={animationMs(settings.animationSpeed)}
          showLegal={settings.showLegalMoves}
          showCoordinates={settings.showCoordinates}
          dragToMove={settings.dragToMove}
        />
      </Canvas>
    </div>
  );
}
