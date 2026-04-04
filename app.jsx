import {
  Canvas,
  useLoader,
  useThree,
  useFrame,
} from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";

// ═══════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════

const COUNTRIES = [
  { id: "IND", name: "India",     lat: 20,  lon: 78,   change: 1.2,  index: "NIFTY 50",    volume: "₹94,200Cr", cap: "$3.4T",  flag: "🇮🇳" },
  { id: "USA", name: "USA",       lat: 38,  lon: -97,  change: -0.6, index: "S&P 500",      volume: "$420B",     cap: "$40.2T", flag: "🇺🇸" },
  { id: "CHN", name: "China",     lat: 35,  lon: 103,  change: 0.8,  index: "CSI 300",      volume: "¥1.2T",     cap: "$9.8T",  flag: "🇨🇳" },
  { id: "JPN", name: "Japan",     lat: 36,  lon: 138,  change: 0.4,  index: "Nikkei 225",   volume: "¥4.1T",     cap: "$5.6T",  flag: "🇯🇵" },
  { id: "DEU", name: "Germany",   lat: 51,  lon: 10,   change: -0.3, index: "DAX 40",       volume: "€8.2B",     cap: "$2.1T",  flag: "🇩🇪" },
  { id: "GBR", name: "UK",        lat: 55,  lon: -3,   change: 0.6,  index: "FTSE 100",     volume: "£6.1B",     cap: "$2.8T",  flag: "🇬🇧" },
  { id: "BRA", name: "Brazil",    lat: -14, lon: -51,  change: -1.1, index: "Bovespa",      volume: "R$38B",     cap: "$0.9T",  flag: "🇧🇷" },
  { id: "AUS", name: "Australia", lat: -25, lon: 133,  change: 0.9,  index: "ASX 200",      volume: "A$12B",     cap: "$1.7T",  flag: "🇦🇺" },
  { id: "CAN", name: "Canada",    lat: 56,  lon: -106, change: 0.4,  index: "TSX",          volume: "C$18B",     cap: "$2.6T",  flag: "🇨🇦" },
  { id: "KOR", name: "S. Korea",  lat: 37,  lon: 128,  change: -0.7, index: "KOSPI",        volume: "₩28T",      cap: "$1.5T",  flag: "🇰🇷" },
];

// Per-country drill-down indices
const COUNTRY_INDICES = {
  IND: [
    { name: "Nifty 50",    change: 1.2,  size: 28, sector: "Broad Market", pe: 22.4, volume: "₹41,200Cr" },
    { name: "Sensex",      change: 0.8,  size: 24, sector: "Broad Market", pe: 24.1, volume: "₹18,600Cr" },
    { name: "Bank Nifty",  change: -0.5, size: 22, sector: "Banking",      pe: 18.2, volume: "₹19,800Cr" },
    { name: "Midcap 150",  change: 0.3,  size: 18, sector: "Midcap",       pe: 31.7, volume: "₹8,200Cr"  },
    { name: "IT Index",    change: 2.1,  size: 20, sector: "Technology",   pe: 28.9, volume: "₹6,400Cr"  },
    { name: "Pharma",      change: -0.9, size: 16, sector: "Healthcare",   pe: 35.2, volume: "₹3,100Cr"  },
    { name: "Auto Index",  change: 1.5,  size: 17, sector: "Automotive",   pe: 19.8, volume: "₹4,700Cr"  },
    { name: "FMCG",        change: 0.2,  size: 15, sector: "Consumer",     pe: 42.1, volume: "₹2,800Cr"  },
    { name: "Metal",       change: -1.3, size: 14, sector: "Materials",    pe: 11.6, volume: "₹3,600Cr"  },
    { name: "Energy",      change: 1.8,  size: 16, sector: "Energy",       pe: 14.3, volume: "₹5,200Cr"  },
  ],
  USA: [
    { name: "S&P 500",   change: -0.6, size: 28, sector: "Broad Market", pe: 24.2, volume: "$420B"  },
    { name: "Nasdaq",    change: -1.1, size: 26, sector: "Technology",   pe: 32.7, volume: "$210B"  },
    { name: "Dow Jones", change: -0.3, size: 24, sector: "Broad Market", pe: 19.4, volume: "$180B"  },
    { name: "Russell",   change: -0.8, size: 18, sector: "Small Cap",    pe: 28.1, volume: "$90B"   },
    { name: "VIX",       change: 4.2,  size: 16, sector: "Volatility",   pe: null, volume: "—"      },
  ],
  CHN: [
    { name: "CSI 300",   change: 0.8,  size: 26, sector: "Broad Market", pe: 13.1, volume: "¥1.2T" },
    { name: "Shanghai",  change: 0.6,  size: 22, sector: "Broad Market", pe: 12.8, volume: "¥900B" },
    { name: "Shenzhen",  change: 1.1,  size: 20, sector: "Tech/Growth",  pe: 22.4, volume: "¥780B" },
    { name: "ChiNext",   change: 1.4,  size: 17, sector: "Innovation",   pe: 35.6, volume: "¥320B" },
  ],
};

// Fallback indices for countries without drill-down data
function getIndices(countryId, country) {
  if (COUNTRY_INDICES[countryId]) return COUNTRY_INDICES[countryId];
  return [
    { name: country.index,    change: country.change, size: 26, sector: "Broad Market", pe: 20.0, volume: country.volume },
    { name: "Large Cap",      change: country.change * 0.9,  size: 20, sector: "Large Cap",    pe: 18.5, volume: "—" },
    { name: "Mid Cap",        change: country.change * 1.1,  size: 17, sector: "Mid Cap",      pe: 25.2, volume: "—" },
    { name: "Small Cap",      change: country.change * 1.4,  size: 14, sector: "Small Cap",    pe: 30.1, volume: "—" },
    { name: "Bonds",          change: -country.change * 0.3, size: 13, sector: "Fixed Income", pe: null,  volume: "—" },
  ];
}

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════

function latLonToVector3(lat, lon, r) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

function changeToColor(change, alpha = 1) {
  if (change > 1.5)  return `rgba(0, 230, 100, ${alpha})`;
  if (change > 0.5)  return `rgba(0, 200, 80, ${alpha})`;
  if (change > 0)    return `rgba(0, 160, 60, ${alpha})`;
  if (change > -0.5) return `rgba(220, 60, 60, ${alpha})`;
  if (change > -1.5) return `rgba(255, 60, 60, ${alpha})`;
  return `rgba(255, 20, 20, ${alpha})`;
}

function changeToHex(change) {
  if (change > 1.5)  return "#00e664";
  if (change > 0.5)  return "#00c850";
  if (change > 0)    return "#00a03c";
  if (change > -0.5) return "#dc3c3c";
  if (change > -1.5) return "#ff3c3c";
  return "#ff1414";
}

// ═══════════════════════════════════════════════════════
// POLITICAL GLOBE (SVG texture choropleth)
// ═══════════════════════════════════════════════════════

// We draw a canvas texture: base political map + country color overlays
function usePoliticalGlobeTexture(countries) {
  const texture = useRef(null);
  const canvasRef = useRef(null);

  const baseTexture = useLoader(
    THREE.TextureLoader,
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/World_map_-_low_resolution.svg/2560px-World_map_-_low_resolution.svg.png"
  );

  // Fallback: use ocean/land map with colored overlays
  const fallbackTexture = useLoader(
    THREE.TextureLoader,
    "https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg"
  );

  return { baseTexture: fallbackTexture };
}

// Since fetching political SVG is complex at runtime, we use the ocean/land texture
// but paint country regions using lat/lon bounding boxes stamped onto a canvas overlay.
function PoliticalGlobe({ countries }) {
  const meshRef = useRef();
  const [canvasTexture, setCanvasTexture] = useState(null);

  const baseTexture = useLoader(
    THREE.TextureLoader,
    "https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg"
  );

  useEffect(() => {
    const W = 2048, H = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Draw base texture onto canvas
    const img = baseTexture.image;
    ctx.drawImage(img, 0, 0, W, H);

    // Approximate country bounding boxes [minLat, maxLat, minLon, maxLon]
    const countryBoxes = {
      IND: [8,  37,  68,  97],
      USA: [25, 49, -125, -66],
      CHN: [18, 53,  73, 135],
      JPN: [30, 46, 129, 146],
      DEU: [47, 55,   6,  15],
      GBR: [50, 61,  -8,   2],
      BRA: [-33, 5, -74, -34],
      AUS: [-44,-10, 113, 154],
      CAN: [42, 83, -141, -52],
      KOR: [34, 38, 126, 130],
    };

    countries.forEach(c => {
      const box = countryBoxes[c.id];
      if (!box) return;
      const [minLat, maxLat, minLon, maxLon] = box;

      // Convert lat/lon to canvas pixel
      const x1 = ((minLon + 180) / 360) * W;
      const x2 = ((maxLon + 180) / 360) * W;
      const y1 = ((90 - maxLat) / 180) * H;
      const y2 = ((90 - minLat) / 180) * H;

      const alpha = Math.min(0.55, 0.25 + Math.abs(c.change) * 0.12);
      ctx.fillStyle = changeToColor(c.change, alpha);
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

      // Border
      ctx.strokeStyle = changeToColor(c.change, 0.9);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    });

    const tex = new THREE.CanvasTexture(canvas);
    setCanvasTexture(tex);
  }, [baseTexture, countries]);

  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.y += 0.0005;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 128, 128]} />
      <meshPhongMaterial
        map={canvasTexture || baseTexture}
        specular={new THREE.Color(0x222244)}
        shininess={12}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════
// ATMOSPHERE
// ═══════════════════════════════════════════════════════

function Atmosphere() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      void main() {
        float i = pow(0.6 - dot(vNormal, vec3(0.0,0.0,1.0)), 3.5);
        gl_FragColor = vec4(0.08, 0.35, 0.9, 1.0) * i;
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
  }), []);

  return (
    <mesh scale={[1.16, 1.16, 1.16]}>
      <sphereGeometry args={[1, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════
// PULSE RING
// ═══════════════════════════════════════════════════════

function PulseRing({ position, color, delay = 0, speed = 2 }) {
  const ref = useRef();
  const matRef = useRef();

  useFrame(({ clock }) => {
    const t = ((clock.elapsedTime * speed * 0.5 + delay) % 1);
    if (ref.current) {
      const s = 1 + t * 3;
      ref.current.scale.set(s, s, s);
      ref.current.lookAt(0, 0, 0);
      ref.current.rotateX(Math.PI / 2);
    }
    if (matRef.current) matRef.current.opacity = (1 - t) * 0.8;
  });

  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[0.035, 0.045, 32]} />
      <meshBasicMaterial ref={matRef} color={color} transparent opacity={0.8} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════
// COUNTRY MARKERS
// ═══════════════════════════════════════════════════════

function CountryMarkers({ setTarget, setHoveredCountry }) {
  const [hovered, setHovered] = useState(null);
  const globeRef = useRef(); // track globe rotation

  return COUNTRIES.map((c, i) => {
    const pos = latLonToVector3(c.lat, c.lon, 1.02);
    const color = changeToHex(c.change);
    const isHov = hovered === i;

    return (
      <group key={c.id}>
        <PulseRing position={pos} color={color} delay={i * 0.18} speed={1.5} />
        <PulseRing position={pos} color={color} delay={i * 0.18 + 0.5} speed={1.5} />

        <mesh
          position={pos}
          scale={isHov ? 1.9 : 1}
          onPointerOver={() => { setHovered(i); setHoveredCountry(c); }}
          onPointerOut={() => { setHovered(null); setHoveredCountry(null); }}
          onClick={() => setTarget({ pos, country: c })}
        >
          <sphereGeometry args={[0.032, 32, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isHov ? 5 : 2.5}
            roughness={0.1}
            metalness={0.4}
          />
          {isHov && (
            <Html style={{ pointerEvents: "none" }}>
              <div style={{
                background: "rgba(4,10,22,0.95)",
                border: `1px solid ${color}50`,
                borderLeft: `3px solid ${color}`,
                padding: "10px 14px",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
                whiteSpace: "nowrap",
                transform: "translate(14px,-50%)",
                boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${color}20`,
                fontFamily: "'SF Mono','Courier New',monospace",
              }}>
                <div style={{ fontWeight: 700, fontSize: "14px", letterSpacing: "0.5px" }}>
                  {c.flag} {c.name}
                </div>
                <div style={{ color: "#555", fontSize: "10px", margin: "2px 0 6px" }}>{c.index}</div>
                <div style={{ color, fontWeight: 700, fontSize: "15px" }}>
                  {c.change > 0 ? "▲" : "▼"} {Math.abs(c.change)}%
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
                  <div>
                    <div style={{ color: "#444", fontSize: "9px", letterSpacing: "1px" }}>MCAP</div>
                    <div style={{ color: "#aaa", fontSize: "11px" }}>{c.cap}</div>
                  </div>
                  <div>
                    <div style={{ color: "#444", fontSize: "9px", letterSpacing: "1px" }}>VOL</div>
                    <div style={{ color: "#aaa", fontSize: "11px" }}>{c.volume}</div>
                  </div>
                </div>
                <div style={{ marginTop: "8px", color: "#0099ff", fontSize: "9px", letterSpacing: "1px" }}>
                  CLICK TO EXPLORE →
                </div>
              </div>
            </Html>
          )}
        </mesh>
      </group>
    );
  });
}

// ═══════════════════════════════════════════════════════
// CAMERA CONTROLLER
// ═══════════════════════════════════════════════════════

function CameraController({ target, layer, orbitRef }) {
  const { camera } = useThree();

  // Drill into country
  useEffect(() => {
    if (!target || layer !== "globe") return;
    const newPos = target.pos.clone().multiplyScalar(2.8);
    if (orbitRef.current) orbitRef.current.enabled = false;
    gsap.to(camera.position, {
      x: newPos.x, y: newPos.y, z: newPos.z,
      duration: 1.5,
      ease: "power3.inOut",
      onUpdate: () => camera.lookAt(0, 0, 0),
      onComplete: () => {
        // layer switch handled by parent after animation
      },
    });
  }, [target]);

  // Return to globe
  useEffect(() => {
    if (layer === "globe") {
      gsap.to(camera.position, {
        x: 0, y: 0, z: 3,
        duration: 1.2,
        ease: "power2.inOut",
        onUpdate: () => camera.lookAt(0, 0, 0),
        onComplete: () => { if (orbitRef.current) orbitRef.current.enabled = true; },
      });
    }
    if (layer === "country") {
      gsap.to(camera.position, {
        x: 0, y: 0, z: 5.5,
        duration: 0.8,
        ease: "power2.out",
        onUpdate: () => camera.lookAt(0, 0, 0),
      });
    }
  }, [layer]);

  return null;
}

// ═══════════════════════════════════════════════════════
// AUTO-FITTING BUBBLE SYSTEM
// ═══════════════════════════════════════════════════════

function ForceBubbles({ bubbleData, resetSignal, setSelected, search, onZoomChange }) {
  const refs      = useRef([]);
  const ringRefs  = useRef([]);
  const labelRefs = useRef([]);
  const [hovered, setHovered] = useState(null);
  const { camera, size } = useThree();

  // Zoom state (controlled from outside via onZoomChange, set internally)
  const zoomRef = useRef(1);

  const engine = useRef({ bubbles: [], dragging: null, pointer: { x: 0, y: 0 } });

  const init = useCallback(() => {
    const n = bubbleData.length;
    engine.current.bubbles = bubbleData.map((d, i) => {
      // Pack in a spiral layout
      const angle  = (i / n) * Math.PI * 2;
      const radius = 0.6 + (i % 3) * 0.5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return { ...d, x, y, tx: x, ty: y };
    });
  }, [bubbleData]);

  useEffect(() => { init(); }, [init, resetSignal]);

  // Auto-fit: compute bounding box and set camera z so all bubbles fit
  const autoFit = useCallback(() => {
    const bs = engine.current.bubbles;
    if (!bs.length) return;
    const maxR  = Math.max(...bs.map(b => b.size * 0.018));
    const xs    = bs.map(b => b.x);
    const ys    = bs.map(b => b.y);
    const minX  = Math.min(...xs) - maxR * 2;
    const maxX  = Math.max(...xs) + maxR * 2;
    const minY  = Math.min(...ys) - maxR * 2;
    const maxY  = Math.max(...ys) + maxR * 2;
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const aspect = size.width / size.height;
    const fovRad = (camera.fov * Math.PI) / 180;
    const zForY  = spanY / (2 * Math.tan(fovRad / 2)) + 1.2;
    const zForX  = spanX / (2 * Math.tan(fovRad / 2) * aspect) + 1.2;
    const zTarget = Math.max(zForY, zForX, 3.5);
    gsap.to(camera.position, { z: zTarget, duration: 0.8, ease: "power2.out" });
  }, [camera, size]);

  useEffect(() => {
    const timer = setTimeout(autoFit, 400);
    return () => clearTimeout(timer);
  }, [bubbleData, autoFit]);

  useEffect(() => {
    const move = (e) => {
      engine.current.pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      engine.current.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useFrame((state) => {
    const e = engine.current;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(e.pointer, state.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const point = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, point);

    e.bubbles.forEach((b, i) => {
      if (e.dragging === i) { b.tx = point.x; b.ty = point.y; }
      b.x += (b.tx - b.x) * 0.12;
      b.y += (b.ty - b.y) * 0.12;
    });

    // Collision resolution
    for (let i = 0; i < e.bubbles.length; i++) {
      for (let j = i + 1; j < e.bubbles.length; j++) {
        const a = e.bubbles[i], b = e.bubbles[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
        const minD = a.size * 0.019 + b.size * 0.019 + 0.04;
        if (dist < minD) {
          const ov = (minD - dist) / 2;
          const nx = dx/dist, ny = dy/dist;
          a.x -= nx*ov; a.y -= ny*ov;
          b.x += nx*ov; b.y += ny*ov;
        }
      }
    }

    e.bubbles.forEach((b, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;

      const matched = search && b.name.toLowerCase().includes(search.toLowerCase());
      const tScale  = matched ? 1.5 : hovered === i ? 1.15 : 1;

      mesh.scale.x += (tScale - mesh.scale.x) * 0.15;
      mesh.scale.y += (tScale - mesh.scale.y) * 0.15;
      mesh.scale.z += (tScale - mesh.scale.z) * 0.15;

      mesh.position.x += (b.x - mesh.position.x) * 0.2;
      mesh.position.y += (b.y - mesh.position.y) * 0.2;
      mesh.position.z  = Math.sin(state.clock.elapsedTime * 0.9 + i * 1.2) * 0.04;

      const ring = ringRefs.current[i];
      if (ring) {
        ring.position.x += (b.x - ring.position.x) * 0.2;
        ring.position.y += (b.y - ring.position.y) * 0.2;
        ring.position.z  = mesh.position.z;
        ring.material.opacity = hovered === i ? 0.55 : 0.18;
      }
    });
  });

  return (
    <>
      {engine.current.bubbles.map((b, i) => {
        const color  = changeToHex(b.change);
        const radius = b.size * 0.018;

        return (
          <group key={b.name + i}>
            <mesh
              ref={el => (ringRefs.current[i] = el)}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[radius * 1.08, radius * 1.22, 64]} />
              <meshBasicMaterial color={color} transparent opacity={0.18} side={THREE.DoubleSide} />
            </mesh>

            <mesh
              ref={el => (refs.current[i] = el)}
              onPointerDown={e => { e.stopPropagation(); engine.current.dragging = i; }}
              onPointerUp={() => (engine.current.dragging = null)}
              onClick={() => setSelected(b)}
              onPointerOver={() => setHovered(i)}
              onPointerOut={() => setHovered(null)}
            >
              <sphereGeometry args={[radius, 64, 64]} />
              <meshPhysicalMaterial
                color={color}
                emissive={color}
                emissiveIntensity={hovered === i ? 1.2 : 0.4}
                roughness={0.05}
                metalness={0.1}
                transmission={0.25}
                thickness={0.4}
                transparent
                opacity={0.9}
              />
              <Html center style={{ pointerEvents: "none" }}>
                <div style={{ textAlign: "center", userSelect: "none", fontFamily: "'SF Mono','Courier New',monospace" }}>
                  <div style={{
                    color: "#fff",
                    fontSize: b.size > 22 ? "10px" : "8px",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    textShadow: "0 1px 6px rgba(0,0,0,0.9)",
                    letterSpacing: "0.3px",
                  }}>{b.name}</div>
                  <div style={{
                    color,
                    fontSize: b.size > 22 ? "9px" : "7px",
                    fontWeight: 700,
                    textShadow: "0 1px 4px rgba(0,0,0,0.9)",
                  }}>{b.change > 0 ? "▲" : "▼"}{Math.abs(b.change)}%</div>
                </div>
              </Html>
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════
// BACKGROUND GRID
// ═══════════════════════════════════════════════════════

function BackgroundGrid() {
  const geo = useMemo(() => {
    const pts = [];
    for (let x = -8; x <= 8; x += 0.6) pts.push(new THREE.Vector3(x,-5,-3), new THREE.Vector3(x,5,-3));
    for (let y = -5; y <= 5; y += 0.6) pts.push(new THREE.Vector3(-8,y,-3), new THREE.Vector3(8,y,-3));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#061428" opacity={0.6} transparent />
    </lineSegments>
  );
}

// ═══════════════════════════════════════════════════════
// TICKER
// ═══════════════════════════════════════════════════════

function Ticker({ countries }) {
  const items = [
    ...countries.map(c => ({ label: `${c.flag} ${c.name}`, change: c.change })),
    { label: "BTC/USD", change: 2.4 },
    { label: "GOLD", change: -0.2 },
    { label: "CRUDE OIL", change: 1.1 },
    { label: "DXY", change: -0.3 },
    { label: "EUR/USD", change: 0.4 },
  ];

  const mono = { fontFamily: "'SF Mono','Fira Code','Courier New',monospace" };

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      height: "30px",
      background: "rgba(2,6,14,0.92)",
      borderTop: "1px solid rgba(255,255,255,0.05)",
      overflow: "hidden",
      display: "flex", alignItems: "center",
      zIndex: 30,
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        display: "flex",
        animation: "ticker 40s linear infinite",
        whiteSpace: "nowrap",
        ...mono,
      }}>
        {[items, items].flat().map((item, i) => {
          const color = item.change > 0 ? "#00e676" : "#ff5252";
          return (
            <span key={i} style={{ marginRight: "40px", fontSize: "10px", color: "#666" }}>
              <span style={{ color: "#444" }}>{item.label}</span>
              <span style={{ color, marginLeft: "6px" }}>
                {item.change > 0 ? "▲" : "▼"}{Math.abs(item.change)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// LEGEND
// ═══════════════════════════════════════════════════════

function Legend() {
  const entries = [
    { color: "#00e664", label: "> +1.5%" },
    { color: "#00c850", label: "+0.5 to +1.5%" },
    { color: "#00a03c", label: "0 to +0.5%" },
    { color: "#dc3c3c", label: "-0.5 to 0%" },
    { color: "#ff3c3c", label: "-1.5 to -0.5%" },
    { color: "#ff1414", label: "< -1.5%" },
  ];
  return (
    <div style={{
      position: "absolute", bottom: "38px", left: "16px",
      background: "rgba(2,8,18,0.85)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px",
      padding: "10px 14px",
      zIndex: 20,
      backdropFilter: "blur(12px)",
      fontFamily: "'SF Mono','Courier New',monospace",
    }}>
      <div style={{ color: "#444", fontSize: "9px", letterSpacing: "1.5px", marginBottom: "8px" }}>PERFORMANCE</div>
      {entries.map(e => (
        <div key={e.label} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <div style={{ width: 10, height: 10, borderRadius: "2px", background: e.color, flexShrink: 0 }} />
          <span style={{ color: "#555", fontSize: "9px" }}>{e.label}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MARKET OVERVIEW SIDEBAR (globe layer)
// ═══════════════════════════════════════════════════════

function MarketSidebar({ countries, onCountryClick }) {
  const up   = countries.filter(c => c.change > 0).length;
  const down = countries.length - up;
  const mono = { fontFamily: "'SF Mono','Fira Code','Courier New',monospace" };

  return (
    <div style={{
      position: "absolute", top: "60px", right: "16px",
      width: "200px",
      background: "rgba(2,8,18,0.85)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "10px",
      overflow: "hidden",
      zIndex: 20,
      backdropFilter: "blur(16px)",
      ...mono,
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#444", fontSize: "9px", letterSpacing: "1.5px" }}>GLOBAL MARKETS</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <span style={{ color: "#00e676", fontSize: "9px" }}>▲{up}</span>
          <span style={{ color: "#ff5252", fontSize: "9px" }}>▼{down}</span>
        </div>
      </div>
      {/* List */}
      {countries.map((c, i) => {
        const color = changeToHex(c.change);
        return (
          <div
            key={c.id}
            onClick={() => onCountryClick(c)}
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div>
              <div style={{ color: "#ccc", fontSize: "11px", fontWeight: 600 }}>
                {c.flag} {c.name}
              </div>
              <div style={{ color: "#444", fontSize: "9px" }}>{c.index}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color, fontSize: "11px", fontWeight: 700 }}>
                {c.change > 0 ? "+" : ""}{c.change}%
              </div>
              <div style={{ color: "#333", fontSize: "8px" }}>{c.cap}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// INDEX DETAIL PANEL (country layer)
// ═══════════════════════════════════════════════════════

function IndexPanel({ selected, onClose }) {
  if (!selected) return null;
  const color = changeToHex(selected.change);
  const mono  = { fontFamily: "'SF Mono','Fira Code','Courier New',monospace" };

  return (
    <div style={{
      position: "absolute", top: "60px", right: "16px",
      width: "220px",
      background: "rgba(2,8,18,0.92)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderTop: `2px solid ${color}`,
      borderRadius: "10px",
      padding: "16px",
      zIndex: 20,
      backdropFilter: "blur(20px)",
      animation: "fadeIn 0.25s ease",
      ...mono,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
        <div>
          <div style={{ color: "#444", fontSize: "9px", letterSpacing: "1.5px" }}>INDEX DETAIL</div>
          <div style={{ color: "#fff", fontSize: "16px", fontWeight: 700, marginTop: "2px" }}>{selected.name}</div>
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "#333",
          cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: 0,
        }}>×</button>
      </div>

      <div style={{
        fontSize: "24px", fontWeight: 700, color,
        marginBottom: "14px", letterSpacing: "0.5px",
      }}>
        {selected.change > 0 ? "▲ +" : "▼ "}{selected.change}%
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {[
          { label: "SECTOR",  value: selected.sector,   color: "#ccc"    },
          { label: "P/E",     value: selected.pe ?? "—", color: "#0099ff" },
          { label: "VOLUME",  value: selected.volume,   color: "#ffb300" },
          { label: "SIZE",    value: selected.size,      color: "#aaa"    },
        ].map(({ label, value, color: vc }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: "6px", padding: "8px 10px",
          }}>
            <div style={{ color: "#333", fontSize: "8px", letterSpacing: "1px", marginBottom: "3px" }}>{label}</div>
            <div style={{ color: vc, fontSize: "12px", fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Mini sparkline mock */}
      <div style={{ marginTop: "12px" }}>
        <div style={{ color: "#333", fontSize: "9px", letterSpacing: "1px", marginBottom: "4px" }}>5D TREND</div>
        <svg width="100%" height="36" viewBox="0 0 180 36">
          {(() => {
            const pts = Array.from({ length: 10 }, (_, i) => ({
              x: (i / 9) * 180,
              y: 18 - (Math.random() - 0.5 + selected.change * 0.3) * 12,
            }));
            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
            return (
              <>
                <path d={d} fill="none" stroke={color} strokeWidth="1.5" opacity="0.8" />
                {pts.map((p, i) => i === pts.length - 1 && (
                  <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
                ))}
              </>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════

export default function App() {
  const [target,         setTarget        ] = useState(null);
  const [layer,          setLayer         ] = useState("globe");       // "globe" | "country"
  const [activeCountry,  setActiveCountry ] = useState(null);
  const [resetSignal,    setResetSignal   ] = useState(0);
  const [selected,       setSelected      ] = useState(null);
  const [search,         setSearch        ] = useState("");
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [time,           setTime          ] = useState(new Date());
  const [layerReady,     setLayerReady    ] = useState(false);

  const orbitRef = useRef();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // When target is set, after GSAP animation completes, switch layer
  const handleSetTarget = useCallback(({ pos, country }) => {
    setTarget({ pos, country });
    setActiveCountry(country);
    setLayerReady(false);
    // Delay layer switch to allow GSAP camera animation
    setTimeout(() => {
      setLayer("country");
      setLayerReady(true);
    }, 1600);
  }, []);

  // Sidebar click = same as clicking marker
  const handleSidebarCountryClick = useCallback((country) => {
    const pos = latLonToVector3(country.lat, country.lon, 1.02);
    handleSetTarget({ pos, country });
  }, [handleSetTarget]);

  const handleBackToGlobe = () => {
    setLayer("globe");
    setTarget(null);
    setActiveCountry(null);
    setSelected(null);
    setSearch("");
    setTimeout(() => { if (orbitRef.current) orbitRef.current.enabled = true; }, 1300);
  };

  const bubbleData = useMemo(() => {
    if (!activeCountry) return [];
    return getIndices(activeCountry.id, activeCountry);
  }, [activeCountry]);

  const sentiment = useMemo(() => {
    const up = COUNTRIES.filter(c => c.change > 0).length;
    return { up, down: COUNTRIES.length - up, pct: Math.round((up / COUNTRIES.length) * 100) };
  }, []);

  const mono = { fontFamily: "'SF Mono','Fira Code','Courier New',monospace" };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#020810", overflow: "hidden", position: "relative" }}>
      <style>{`
        @keyframes ticker  { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse   { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: #333; }
        input:focus { outline: none; border-color: rgba(0,153,255,0.4) !important; }
        button:hover { opacity: 0.8; }
      `}</style>

      {/* ── TOP NAV BAR ── */}
      <nav style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "52px",
        background: "rgba(2,6,14,0.9)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        backdropFilter: "blur(20px)",
        display: "flex", alignItems: "center", padding: "0 20px", gap: "12px",
        zIndex: 40, ...mono,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }} onClick={handleBackToGlobe}>
          <div style={{
            width: 30, height: 30, borderRadius: "7px",
            background: "linear-gradient(135deg,#0055ff,#00ccff)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px", fontWeight: 900, color: "#fff",
          }}>M</div>
          <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700, letterSpacing: "2px" }}>
            MARKET<span style={{ color: "#0099ff" }}>SPHERE</span>
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)" }} />

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px" }}>
          <span
            style={{ color: layer === "globe" ? "#0099ff" : "#555", cursor: "pointer", letterSpacing: "1px" }}
            onClick={handleBackToGlobe}
          >
            🌐 GLOBAL
          </span>
          {layer === "country" && activeCountry && (
            <>
              <span style={{ color: "#2a2a2a" }}>›</span>
              <span style={{ color: "#0099ff", letterSpacing: "1px" }}>
                {activeCountry.flag} {activeCountry.name.toUpperCase()}
              </span>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Market sentiment bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "10px" }}>
          <span style={{ color: "#00e676", letterSpacing: "0.5px" }}>▲ {sentiment.up} UP</span>
          <div style={{
            width: "80px", height: "4px", borderRadius: "2px",
            background: "#1a0000", overflow: "hidden",
          }}>
            <div style={{
              width: `${sentiment.pct}%`, height: "100%",
              background: "linear-gradient(90deg,#00c850,#00e676)",
              borderRadius: "2px",
            }} />
          </div>
          <span style={{ color: "#ff5252", letterSpacing: "0.5px" }}>{sentiment.down} DOWN ▼</span>
        </div>

        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)" }} />

        {/* Time */}
        <div style={{ color: "#333", fontSize: "10px", letterSpacing: "1px" }}>
          {time.toUTCString().match(/\d{2}:\d{2}:\d{2}/)?.[0]} UTC
        </div>

        {/* Back button */}
        {layer === "country" && (
          <button
            onClick={handleBackToGlobe}
            style={{
              background: "rgba(0,153,255,0.1)",
              border: "1px solid rgba(0,153,255,0.25)",
              color: "#0099ff", fontSize: "10px", letterSpacing: "1px",
              padding: "6px 12px", borderRadius: "6px",
              cursor: "pointer", ...mono,
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            ← GLOBE
          </button>
        )}
      </nav>

      {/* ── SEARCH BAR ── */}
      <div style={{
        position: "absolute", top: "62px", left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20, animation: "fadeIn 0.4s ease",
      }}>
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", left: "12px", top: "50%",
            transform: "translateY(-50%)", color: "#2a3a4a", fontSize: "14px",
          }}>⌕</span>
          <input
            placeholder={layer === "globe" ? "Search country..." : `Search ${activeCountry?.name ?? ""} indices...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: "8px 16px 8px 36px",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#fff", fontSize: "12px", width: "240px",
              letterSpacing: "0.5px", backdropFilter: "blur(12px)",
              ...mono,
            }}
          />
          {search && (
            <span
              onClick={() => setSearch("")}
              style={{
                position: "absolute", right: "10px", top: "50%",
                transform: "translateY(-50%)", color: "#333",
                cursor: "pointer", fontSize: "16px",
              }}
            >×</span>
          )}
        </div>
      </div>

      {/* ── GLOBE LAYER: SIDEBAR + LEGEND + HINT ── */}
      {layer === "globe" && (
        <>
          <MarketSidebar countries={COUNTRIES} onCountryClick={handleSidebarCountryClick} />
          <Legend />
          {!hoveredCountry && (
            <div style={{
              position: "absolute", bottom: "40px", left: "50%",
              transform: "translateX(-50%)",
              color: "#222", fontSize: "10px", letterSpacing: "1.5px",
              zIndex: 10, animation: "pulse 3s infinite", ...mono,
            }}>
              CLICK ANY COUNTRY TO DRILL DOWN  ·  DRAG TO ROTATE
            </div>
          )}
        </>
      )}

      {/* ── COUNTRY LAYER: INDEX PANEL + ZOOM CONTROLS ── */}
      {layer === "country" && (
        <>
          <IndexPanel selected={selected} onClose={() => setSelected(null)} />

          {/* Zoom controls */}
          <div style={{
            position: "absolute", bottom: "40px", right: "16px",
            display: "flex", flexDirection: "column", gap: "6px",
            zIndex: 20,
          }}>
            {[
              { label: "⊕", tip: "Zoom In",  action: () => gsap.to(document.querySelector("canvas").__r3f?.camera ?? {}, {}) },
            ].map(() => null)}
            <ZoomControls />
          </div>

          {/* Country context bar */}
          {activeCountry && (
            <div style={{
              position: "absolute", bottom: "40px", left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(2,8,18,0.88)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "8px",
              padding: "8px 20px",
              display: "flex", gap: "24px", alignItems: "center",
              zIndex: 20, backdropFilter: "blur(12px)",
              animation: "fadeIn 0.4s ease",
              ...mono,
            }}>
              <span style={{ color: "#fff", fontSize: "14px" }}>
                {activeCountry.flag} <b>{activeCountry.name}</b>
              </span>
              <span style={{ color: "#333" }}>|</span>
              <span style={{ color: "#444", fontSize: "10px" }}>{activeCountry.index}</span>
              <span style={{ color: "#333" }}>|</span>
              <span style={{
                color: changeToHex(activeCountry.change), fontSize: "13px", fontWeight: 700,
              }}>
                {activeCountry.change > 0 ? "▲ +" : "▼ "}{activeCountry.change}%
              </span>
              <span style={{ color: "#333" }}>|</span>
              <span style={{ color: "#444", fontSize: "10px" }}>
                DRAG BUBBLES  ·  CLICK TO INSPECT
              </span>
            </div>
          )}
        </>
      )}

      {/* ── THREE.JS CANVAS ── */}
      <Canvas
        camera={{ position: [0, 0, 3], fov: 45 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        {/* Shared lighting */}
        <ambientLight intensity={0.25} />
        <directionalLight position={[5, 3, 5]} intensity={1.1} />
        <pointLight position={[-4, -2, -4]} intensity={0.3} color="#1133ff" />

        <Stars radius={100} depth={60} count={8000} factor={5} saturation={0.2} fade speed={0.4} />

        {layer === "globe" && (
          <>
            <PoliticalGlobe countries={COUNTRIES} />
            <Atmosphere />
            <CountryMarkers setTarget={handleSetTarget} setHoveredCountry={setHoveredCountry} />
            <OrbitControls
              ref={orbitRef}
              enablePan={false}
              minDistance={1.8}
              maxDistance={7}
              enableDamping
              dampingFactor={0.06}
            />
          </>
        )}

        {layer === "country" && (
          <>
            <BackgroundGrid />
            <ambientLight intensity={0.6} />
            <pointLight position={[0, 0, 4]} intensity={1.8} />
            <pointLight position={[-3, 3, 2]} intensity={0.7} color="#0044ff" />
            <pointLight position={[3, -3, 2]} intensity={0.7} color="#00ffcc" />
            <ForceBubbles
              bubbleData={bubbleData}
              resetSignal={resetSignal}
              setSelected={setSelected}
              search={search}
            />
            <ZoomListener />
          </>
        )}

        <CameraController target={target} layer={layer} orbitRef={orbitRef} />
      </Canvas>

      {/* ── TICKER ── */}
      <Ticker countries={COUNTRIES} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ZOOM CONTROLS (dispatches custom event, caught inside Canvas)
// ═══════════════════════════════════════════════════════

// This component INSIDE the Canvas listens to zoom events
function ZoomListener() {
  const { camera } = useThree();

  useEffect(() => {
    const handler = (e) => {
      const dir = e.detail.dir;
      const step = 0.6;
      if (dir === 0) {
        // auto-fit: reset to default country view distance
        gsap.to(camera.position, { z: 5.5, duration: 0.6, ease: "power2.out" });
      } else {
        const newZ = Math.max(2, Math.min(12, camera.position.z - dir * step));
        gsap.to(camera.position, { z: newZ, duration: 0.4, ease: "power2.out" });
      }
    };
    window.addEventListener("marketsphere-zoom", handler);
    return () => window.removeEventListener("marketsphere-zoom", handler);
  }, [camera]);

  return null;
}

function ZoomControls() {
  const mono = { fontFamily: "'SF Mono','Fira Code','Courier New',monospace" };

  const zoom = (dir) => {
    window.dispatchEvent(new CustomEvent("marketsphere-zoom", { detail: { dir } }));
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      background: "rgba(2,8,18,0.85)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px",
      overflow: "hidden",
      backdropFilter: "blur(12px)",
    }}>
      {[
        { label: "+", title: "Zoom In",  dir:  1 },
        { label: "⊡", title: "Auto Fit", dir:  0 },
        { label: "−", title: "Zoom Out", dir: -1 },
      ].map(({ label, title, dir }, i, arr) => (
        <button
          key={title}
          title={title}
          onClick={() => zoom(dir)}
          style={{
            width: "36px", height: "36px",
            background: "none",
            border: "none",
            borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            color: "#555",
            fontSize: dir === 0 ? "13px" : "18px",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "color 0.15s, background 0.15s",
            ...mono,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "#0099ff"; e.currentTarget.style.background = "rgba(0,153,255,0.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "#555";    e.currentTarget.style.background = "none"; }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
