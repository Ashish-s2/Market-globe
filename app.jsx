import {
  Canvas,
  useLoader,
  useThree,
  useFrame,
} from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useState, useEffect, useRef } from "react";
import gsap from "gsap";

// ===== GLOBAL MARKETS =====
const countries = [
  { name: "India", lat: 20, lon: 78, change: 1.2 },
  { name: "USA", lat: 38, lon: -97, change: -0.6 },
  { name: "China", lat: 35, lon: 103, change: 0.8 },
  { name: "Japan", lat: 36, lon: 138, change: 0.4 },
  { name: "Germany", lat: 51, lon: 10, change: -0.3 },
];

// ===== INDICES =====
const indices = [
  { name: "Nifty 50", change: 1.2, size: 25 },
  { name: "Sensex", change: 0.8, size: 22 },
  { name: "Bank Nifty", change: -0.5, size: 20 },
  { name: "Midcap", change: 0.3, size: 18 },
];

// ===== UTILS =====
function latLonToVector3(lat, lon, r) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// ===== GLOBE =====
function Globe() {
  const texture = useLoader(
    THREE.TextureLoader,
    "https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg"
  );

  return (
    <mesh>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
}

// ===== 🔥 PREMIUM COUNTRY MARKERS =====
function CountryMarkers({ setTarget }) {
  const [hovered, setHovered] = useState(null);

  return countries.map((c, i) => {
    const pos = latLonToVector3(c.lat, c.lon, 1.02);
    const color = c.change > 0 ? "#00e676" : "#ff5252";

    const scale = hovered === i ? 1.6 : 1;

    return (
      <mesh
        key={i}
        position={pos}
        scale={[scale, scale, scale]}
        onPointerOver={() => setHovered(i)}
        onPointerOut={() => setHovered(null)}
        onClick={() => {
          if (c.name === "India") setTarget(pos);
        }}
      >
        <sphereGeometry args={[0.05, 32, 32]} />

        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered === i ? 3 : 1.5}
        />

        {hovered === i && (
          <Html>
            <div style={{
              color: "white",
              fontSize: "12px",
              background: "#111",
              padding: "4px 8px",
              borderRadius: "6px"
            }}>
              {c.name} ({c.change}%)
            </div>
          </Html>
        )}
      </mesh>
    );
  });
}

// ===== CAMERA =====
function CameraController({ target, setLayer }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!target) return;

    const newPos = target.clone().multiplyScalar(2);

    gsap.to(camera.position, {
      x: newPos.x,
      y: newPos.y,
      z: newPos.z,
      duration: 1.2,
      ease: "power3.inOut",
      onUpdate: () => camera.lookAt(0, 0, 0),
      onComplete: () => setLayer("country"),
    });
  }, [target]);

  return null;
}

// ===== BUBBLES (UNCHANGED CORE) =====
function ForceBubbles({ resetSignal, setSelected, search }) {
  const refs = useRef([]);
  const [hovered, setHovered] = useState(null);

  const engine = useRef({
    bubbles: [],
    dragging: null,
    pointer: { x: 0, y: 0 },
  });

  const init = () => {
    engine.current.bubbles = indices.map((d, i) => {
      const x = Math.cos((i / indices.length) * Math.PI * 2) * 1.5;
      const y = Math.sin((i / indices.length) * Math.PI * 2) * 1.5;
      return { ...d, x, y, tx: x, ty: y };
    });
  };

  if (engine.current.bubbles.length === 0) init();

  useEffect(() => {
    if (resetSignal !== 0) init();
  }, [resetSignal]);

  useEffect(() => {
    const move = (e) => {
      engine.current.pointer.x =
        (e.clientX / window.innerWidth) * 2 - 1;
      engine.current.pointer.y =
        -(e.clientY / window.innerHeight) * 2 + 1;
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
      if (e.dragging === i) {
        b.tx = point.x;
        b.ty = point.y;
      }

      b.x += (b.tx - b.x) * 0.2;
      b.y += (b.ty - b.y) * 0.2;
    });

    // collision
    for (let i = 0; i < e.bubbles.length; i++) {
      for (let j = i + 1; j < e.bubbles.length; j++) {
        const a = e.bubbles[i];
        const b = e.bubbles[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;

        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const minDist =
          a.size * 0.015 + b.size * 0.015 + 0.02;

        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;

          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }

    e.bubbles.forEach((b, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;

      const match =
        search &&
        b.name.toLowerCase().includes(search.toLowerCase());

      const scale = match ? 1.4 : hovered === i ? 1.1 : 1;

      mesh.scale.x += (scale - mesh.scale.x) * 0.2;
      mesh.scale.y += (scale - mesh.scale.y) * 0.2;
      mesh.scale.z += (scale - mesh.scale.z) * 0.2;

      mesh.position.x += (b.x - mesh.position.x) * 0.25;
      mesh.position.y += (b.y - mesh.position.y) * 0.25;
    });
  });

  return (
    <>
      {engine.current.bubbles.map((b, i) => {
        const color = b.change > 0 ? "#00e676" : "#ff5252";

        return (
          <mesh
            key={i}
            ref={(el) => (refs.current[i] = el)}
            onPointerDown={(e) => {
              e.stopPropagation();
              engine.current.dragging = i;
            }}
            onPointerUp={() => (engine.current.dragging = null)}
            onClick={() => setSelected(b)}
            onPointerOver={() => setHovered(i)}
            onPointerOut={() => setHovered(null)}
          >
            <sphereGeometry args={[b.size * 0.015, 32, 32]} />

            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={hovered === i ? 1.5 : 0.6}
            />

            <Html>
              <div style={{ color: "white", fontSize: 12 }}>
                {b.name}
              </div>
            </Html>
          </mesh>
        );
      })}
    </>
  );
}

// ===== APP =====
export default function App() {
  const [target, setTarget] = useState(null);
  const [layer, setLayer] = useState("globe");
  const [resetSignal, setResetSignal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#050a12" }}>

      <input
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          position: "absolute",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          padding: 8,
          borderRadius: 8,
          background: "#111",
          color: "white",
        }}
      />

      {selected && (
        <div style={{
          position: "absolute",
          top: 60,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#111",
          padding: "10px 20px",
          borderRadius: 10,
          color: "white",
          display: "flex",
          gap: 20,
          zIndex: 10,
        }}>
          <b>{selected.name}</b>
          <span>{selected.change}%</span>
        </div>
      )}

      <Canvas camera={{ position: [0, 0, 3] }}>
        <ambientLight intensity={0.4} />
        <Stars />

        {layer === "globe" && (
          <>
            <Globe />
            <CountryMarkers setTarget={setTarget} />
            <OrbitControls />
          </>
        )}

        {layer === "country" && (
          <ForceBubbles
            resetSignal={resetSignal}
            setSelected={setSelected}
            search={search}
          />
        )}

        <CameraController target={target} setLayer={setLayer} />
      </Canvas>
    </div>
  );
}
