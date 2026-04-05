import { Canvas, useLoader, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useState, useEffect, useRef, useCallback, Suspense } from "react";
import gsap from "gsap";

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const CACHE_TTL_QUOTES = 5 * 60 * 1000;      // 5 min
const CACHE_TTL_HIST   = 60 * 60 * 1000;     // 1 hr
const POLL_INTERVAL    = 60 * 1000;           // 1 min live refresh
const GLOBE_RADIUS     = 1;
const GEOJSON_URL      = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Yahoo Finance symbol map  (countryId → Yahoo symbol)
const YAHOO_SYMBOLS = {
  IND: "%5EBSESN", USA: "%5EGSPC", CHN: "000001.SS", JPN: "%5EN225",
  DEU: "%5EGDAXI", GBR: "%5EFTSE", BRA: "%5EBVSP",  AUS: "%5EAXJO",
  CAN: "%5EGSPTSE",KOR: "%5EKS11", FRA: "%5EFCHI",  RUS: "IMOEX.ME",
};

const ID_TO_NUMERIC = {
  IND:"356", USA:"840", CHN:"156", JPN:"392", DEU:"276",
  GBR:"826", BRA:"076", AUS:"036", CAN:"124", KOR:"410",
  FRA:"250", RUS:"643",
};

// Static seed data (displayed instantly, then overwritten by real API data)
const COUNTRIES_SEED = [
  { id:"IND", name:"India",     lat:20,  lon:78,   change:0,  index:"BSE Sensex",  volume:"—", cap:"$3.4T", flag:"🇮🇳" },
  { id:"USA", name:"USA",       lat:38,  lon:-97,  change:0,  index:"S&P 500",     volume:"—", cap:"$40T",  flag:"🇺🇸" },
  { id:"CHN", name:"China",     lat:35,  lon:103,  change:0,  index:"Shanghai",    volume:"—", cap:"$9.8T", flag:"🇨🇳" },
  { id:"JPN", name:"Japan",     lat:36,  lon:138,  change:0,  index:"Nikkei 225",  volume:"—", cap:"$5.6T", flag:"🇯🇵" },
  { id:"DEU", name:"Germany",   lat:51,  lon:10,   change:0,  index:"DAX 40",      volume:"—", cap:"$2.1T", flag:"🇩🇪" },
  { id:"GBR", name:"UK",        lat:55,  lon:-3,   change:0,  index:"FTSE 100",    volume:"—", cap:"$2.8T", flag:"🇬🇧" },
  { id:"BRA", name:"Brazil",    lat:-14, lon:-51,  change:0,  index:"Bovespa",     volume:"—", cap:"$0.9T", flag:"🇧🇷" },
  { id:"AUS", name:"Australia", lat:-25, lon:133,  change:0,  index:"ASX 200",     volume:"—", cap:"$1.7T", flag:"🇦🇺" },
  { id:"CAN", name:"Canada",    lat:56,  lon:-106, change:0,  index:"TSX",         volume:"—", cap:"$2.6T", flag:"🇨🇦" },
  { id:"KOR", name:"S. Korea",  lat:37,  lon:128,  change:0,  index:"KOSPI",       volume:"—", cap:"$1.5T", flag:"🇰🇷" },
  { id:"FRA", name:"France",    lat:46,  lon:2,    change:0,  index:"CAC 40",      volume:"—", cap:"$2.9T", flag:"🇫🇷" },
  { id:"RUS", name:"Russia",    lat:61,  lon:98,   change:0,  index:"MOEX",        volume:"—", cap:"$0.6T", flag:"🇷🇺" },
];

// Sector bubble data per country (static detail — real index data below)
const COUNTRY_SECTORS = {
  IND:[
    { name:"Nifty 50",   sector:"Broad",      size:28, pe:22.4 },
    { name:"Bank Nifty", sector:"Banking",    size:22, pe:18.2 },
    { name:"IT Index",   sector:"Technology", size:20, pe:28.9 },
    { name:"Pharma",     sector:"Healthcare", size:16, pe:35.2 },
    { name:"Auto",       sector:"Auto",       size:17, pe:19.8 },
    { name:"FMCG",       sector:"Consumer",   size:15, pe:42.1 },
    { name:"Metal",      sector:"Materials",  size:14, pe:11.6 },
    { name:"Energy",     sector:"Energy",     size:16, pe:14.3 },
  ],
  USA:[
    { name:"S&P 500",   sector:"Broad",      size:28, pe:24.2 },
    { name:"Nasdaq",    sector:"Tech",       size:26, pe:32.7 },
    { name:"Dow Jones", sector:"Broad",      size:24, pe:19.4 },
    { name:"Russell",   sector:"SmallCap",   size:18, pe:28.1 },
    { name:"VIX",       sector:"Volatility", size:16, pe:null  },
  ],
  CHN:[
    { name:"CSI 300",  sector:"Broad",      size:26, pe:13.1 },
    { name:"Shanghai", sector:"Broad",      size:22, pe:12.8 },
    { name:"Shenzhen", sector:"Tech",       size:20, pe:22.4 },
    { name:"ChiNext",  sector:"Innovation", size:17, pe:35.6 },
  ],
};

// Trade arc pairs [fromId, toId, strength 0-1]
const TRADE_ARCS = [
  ["USA","CHN",0.9],["USA","GBR",0.8],["USA","CAN",0.95],["USA","JPN",0.7],
  ["DEU","GBR",0.75],["DEU","FRA",0.85],["CHN","JPN",0.7],["CHN","AUS",0.6],
  ["IND","GBR",0.5],["IND","USA",0.65],["BRA","USA",0.55],["KOR","JPN",0.6],
];

// Time range config for Yahoo Finance API
const RANGE_MAP = {
  "1D":{ interval:"5m",  range:"1d"  },
  "5D":{ interval:"15m", range:"5d"  },
  "1M":{ interval:"1d",  range:"1mo" },
  "1Y":{ interval:"1wk", range:"1y"  },
};

// ═══════════════════════════════════════════════════════════════════════
// CACHE LAYER
// ═══════════════════════════════════════════════════════════════════════

const _memCache = new Map();

const cache = {
  set(key, data, ttl) {
    const entry = { data, ts: Date.now(), ttl };
    _memCache.set(key, entry);
    try { localStorage.setItem(`ms2_${key}`, JSON.stringify(entry)); } catch {}
  },
  get(key) {
    // memory first
    const m = _memCache.get(key);
    if (m && Date.now() - m.ts < m.ttl) return m.data;
    // localStorage fallback
    try {
      const raw = localStorage.getItem(`ms2_${key}`);
      if (!raw) return null;
      const e = JSON.parse(raw);
      if (Date.now() - e.ts < e.ttl) { _memCache.set(key, e); return e.data; }
    } catch {}
    return null;
  },
  bust(prefix) {
    for (const k of _memCache.keys()) if (k.startsWith(prefix)) _memCache.delete(k);
  },
};

// ═══════════════════════════════════════════════════════════════════════
// MARKET DATA SERVICE  — Yahoo Finance v8 (free, no key)
// ═══════════════════════════════════════════════════════════════════════

async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  const meta = json.chart?.result?.[0]?.meta;
  if (!meta) throw new Error("No meta");
  const price = meta.regularMarketPrice;
  const prev  = meta.chartPreviousClose || meta.previousClose || price;
  return {
    price,
    change:    parseFloat((price - prev).toFixed(2)),
    changePct: parseFloat(((price - prev) / prev * 100).toFixed(2)),
    volume:    meta.regularMarketVolume ?? 0,
    timestamp: Date.now(),
  };
}

async function fetchAllQuotes() {
  const cached = cache.get("quotes_all");
  if (cached) return cached;

  const results = await Promise.allSettled(
    COUNTRIES_SEED.map(async c => {
      const sym = YAHOO_SYMBOLS[c.id];
      if (!sym) return { ...c };
      try {
        const q = await fetchYahooQuote(sym);
        return { ...c, ...q };
      } catch {
        return { ...c }; // keep seed on error
      }
    })
  );

  const quotes = results.map(r =>
    r.status === "fulfilled" ? r.value : null
  ).filter(Boolean);

  cache.set("quotes_all", quotes, CACHE_TTL_QUOTES);
  return quotes;
}

async function fetchHistorical(countryId, range) {
  const symbol = YAHOO_SYMBOLS[countryId];
  if (!symbol) return [];
  const key = `hist_${countryId}_${range}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { interval, range: r } = RANGE_MAP[range];
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${r}`;
    const res  = await fetch(url);
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return [];
    const ts   = result.timestamp ?? [];
    const { close, volume } = result.indicators.quote[0];
    const pts = ts.map((t, i) => ({
      t: t * 1000,
      c: close[i],
      v: volume[i] ?? 0,
    })).filter(p => p.c != null);
    cache.set(key, pts, CACHE_TTL_HIST);
    return pts;
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════
// INSIGHT SERVICE  — pure computation, no API key needed
// ═══════════════════════════════════════════════════════════════════════

function computeInsights(countries) {
  if (!countries.length) return null;
  const sorted     = [...countries].sort((a, b) => b.changePct - a.changePct);
  const avg        = countries.reduce((s, c) => s + (c.changePct ?? 0), 0) / countries.length;
  const advancing  = countries.filter(c => (c.changePct ?? 0) > 0).length;
  const declining  = countries.length - advancing;
  const topGainers = sorted.slice(0, 3);
  const topLosers  = sorted.slice(-3).reverse();

  let sentiment, sentimentColor;
  if      (avg >  1.5) { sentiment = "STRONGLY BULLISH"; sentimentColor = "#00c853"; }
  else if (avg >  0.3) { sentiment = "BULLISH";          sentimentColor = "#00e676"; }
  else if (avg > -0.3) { sentiment = "NEUTRAL";          sentimentColor = "#ffd740"; }
  else if (avg > -1.5) { sentiment = "BEARISH";          sentimentColor = "#ff5252"; }
  else                 { sentiment = "STRONGLY BEARISH"; sentimentColor = "#b71c1c"; }

  // Rule-based insight text
  const leader = topGainers[0];
  const lagger = topLosers[0];
  const insightText = leader && lagger
    ? `${leader.flag} ${leader.name} leads (+${(leader.changePct ?? 0).toFixed(2)}%) while ${lagger.flag} ${lagger.name} lags (${(lagger.changePct ?? 0).toFixed(2)}%). ${advancing > declining ? "Risk appetite is strong globally." : "Defensive positioning dominates."}`
    : "Loading market data…";

  return { avg, advancing, declining, sentiment, sentimentColor, topGainers, topLosers, insightText };
}

// ═══════════════════════════════════════════════════════════════════════
// FUSE.JS FUZZY SEARCH  (inline minimal implementation — no npm needed)
// ═══════════════════════════════════════════════════════════════════════

function fuzzyScore(pattern, str) {
  pattern = pattern.toLowerCase();
  str     = str.toLowerCase();
  if (str.includes(pattern)) return 1 - pattern.length / str.length * 0.1;
  let score = 0, pIdx = 0;
  for (let i = 0; i < str.length && pIdx < pattern.length; i++) {
    if (str[i] === pattern[pIdx]) { score += 1 / (i + 1); pIdx++; }
  }
  return pIdx === pattern.length ? score / pattern.length : 0;
}

function fuzzySearch(query, items, keys) {
  if (!query.trim()) return [];
  return items
    .map(item => {
      const score = Math.max(...keys.map(k => fuzzyScore(query, String(item[k] ?? ""))));
      return { item, score };
    })
    .filter(r => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .map(r => r.item);
}

// ═══════════════════════════════════════════════════════════════════════
// UTILS  (preserved from v1, extended)
// ═══════════════════════════════════════════════════════════════════════

function latLonToVector3(lat, lon, r) {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

function changeToHex(change) {
  if (change >  1.5) return "#00c853";
  if (change >  0.5) return "#00e676";
  if (change >  0  ) return "#69f0ae";
  if (change > -0.5) return "#ff5252";
  if (change > -1.5) return "#f44336";
  return "#b71c1c";
}

function changeToRGBA(change, alpha = 0.72) {
  if (change >  1.5) return `rgba(0,200,83,${alpha})`;
  if (change >  0.5) return `rgba(0,230,118,${alpha})`;
  if (change >  0  ) return `rgba(105,240,174,${alpha})`;
  if (change > -0.5) return `rgba(255,82,82,${alpha})`;
  if (change > -1.5) return `rgba(244,67,54,${alpha})`;
  return `rgba(183,28,28,${alpha})`;
}

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

// ═══════════════════════════════════════════════════════════════════════
// POLITICAL GLOBE TEXTURE  (preserved + heatmap intensity layer)
// ═══════════════════════════════════════════════════════════════════════

function usePoliticalTexture(countries) {
  const [texture, setTexture] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!countries.some(c => c.changePct !== undefined && c.changePct !== 0)) return;
    let cancelled = false;

    async function build() {
      try {
        const resp = await fetch(GEOJSON_URL);
        const topo = await resp.json();
        if (cancelled) return;

        const geojson = topoToGeo(topo, topo.objects.countries);

        const numericToCountry = {};
        countries.forEach(c => {
          const num = ID_TO_NUMERIC[c.id];
          if (num) numericToCountry[num] = c;
        });

        const W = 4096, H = 2048;
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");

        // Ocean
        ctx.fillStyle = "#060d1f";
        ctx.fillRect(0, 0, W, H);

        // Graticule
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth = 0.5;
        for (let lon = -180; lon <= 180; lon += 15) {
          const x = ((lon + 180) / 360) * W;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let lat = -90; lat <= 90; lat += 15) {
          const y = ((90 - lat) / 180) * H;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Base country fill
        geojson.features.forEach(feature => {
          const c = numericToCountry[String(feature.id)];
          const ch = c?.changePct ?? 0;
          ctx.fillStyle   = c ? changeToRGBA(ch, 0.82) : "rgba(22,38,62,0.9)";
          ctx.strokeStyle = c ? changeToRGBA(ch, 1)    : "rgba(40,70,100,0.5)";
          ctx.lineWidth   = c ? 1.5 : 0.7;
          drawGeoFeature(ctx, feature, W, H);
          ctx.fill();
          ctx.stroke();
        });

        // Heatmap intensity — second pass for market countries
        geojson.features.forEach(feature => {
          const c = numericToCountry[String(feature.id)];
          if (!c) return;
          const ch  = c.changePct ?? 0;
          const abs = Math.min(Math.abs(ch) / 3, 1); // normalize 0-1
          ctx.strokeStyle = changeToRGBA(ch, 0.4 + abs * 0.5);
          ctx.lineWidth   = 2 + abs * 4;
          ctx.shadowColor = changeToRGBA(ch, 0.7);
          ctx.shadowBlur  = 6 + abs * 14;
          drawGeoFeature(ctx, feature, W, H);
          ctx.stroke();
          ctx.shadowBlur = 0;
        });

        if (cancelled) return;
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        setTexture(tex);
        setLoading(false);
      } catch (err) {
        console.error("GeoJSON load failed:", err);
        setLoading(false);
      }
    }

    build();
    return () => { cancelled = true; };
  }, [countries]);

  return { texture, loading };
}

// Inline TopoJSON → GeoJSON decoder (unchanged from v1)
function topoToGeo(topology, object) {
  const arcs = topology.arcs;
  function decodeArc(i) {
    let arc = arcs[i < 0 ? ~i : i];
    let x = 0, y = 0;
    const pts = arc.map(([dx, dy]) => { x += dx; y += dy; return [x, y]; });
    if (i < 0) pts.reverse();
    return pts;
  }
  function transformPt([x, y]) {
    const [sx, sy] = topology.transform.scale;
    const [tx, ty] = topology.transform.translate;
    return [x * sx + tx, y * sy + ty];
  }
  function toRing(arcIndices) {
    const pts = [];
    arcIndices.forEach(i => {
      const decoded = decodeArc(i).map(transformPt);
      if (pts.length) decoded.shift();
      pts.push(...decoded);
    });
    return pts;
  }
  function toCoords(geom) {
    if (geom.type === "Polygon")      return geom.arcs.map(toRing);
    if (geom.type === "MultiPolygon") return geom.arcs.map(p => p.map(toRing));
    return [];
  }
  return {
    type: "FeatureCollection",
    features: object.geometries.map(geom => ({
      type: "Feature",
      id: geom.id,
      properties: geom.properties || {},
      geometry: { type: geom.type, coordinates: toCoords(geom) },
    })),
  };
}

function drawGeoFeature(ctx, feature, W, H) {
  const { type, coordinates } = feature.geometry;
  function lonLatToXY([lon, lat]) {
    return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
  }
  function drawRing(ring) {
    if (!ring.length) return;
    const [x0, y0] = lonLatToXY(ring[0]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < ring.length; i++) {
      const [x, y] = lonLatToXY(ring[i]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  ctx.beginPath();
  if (type === "Polygon")      coordinates.forEach(drawRing);
  if (type === "MultiPolygon") coordinates.forEach(p => p.forEach(drawRing));
}

// ═══════════════════════════════════════════════════════════════════════
// GLOBE MESH  (upgraded: better specular + atmosphere improved)
// ═══════════════════════════════════════════════════════════════════════

function PoliticalGlobe({ texture, loading, autoRotate }) {
  const meshRef = useRef();
  const fallback = useLoader(
    THREE.TextureLoader,
    "https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg"
  );

  useFrame(() => {
    if (meshRef.current && autoRotate) meshRef.current.rotation.y += 0.0005;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[GLOBE_RADIUS, 128, 128]} />
      <meshPhongMaterial
        map={texture || fallback}
        specular={new THREE.Color(0x1a3366)}
        shininess={18}
        emissive={new THREE.Color(0x020810)}
        emissiveIntensity={0.1}
      />
    </mesh>
  );
}

// ─── Atmosphere shader (preserved) ───
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
        float i = pow(0.62 - dot(vNormal, vec3(0,0,1)), 4.0);
        gl_FragColor = vec4(0.08, 0.35, 1.0, 1.0) * i * 1.2;
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
  }), []);
  return (
    <mesh scale={[1.16, 1.16, 1.16]}>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// GLOBE ARCS  — animated trade flow lines
// ═══════════════════════════════════════════════════════════════════════

function buildArcGeometry(fromVec, toVec) {
  const mid = fromVec.clone().add(toVec).normalize().multiplyScalar(GLOBE_RADIUS * 1.45);
  const curve = new THREE.QuadraticBezierCurve3(
    fromVec.clone().multiplyScalar(1.01),
    mid,
    toVec.clone().multiplyScalar(1.01)
  );
  return new THREE.BufferGeometry().setFromPoints(curve.getPoints(60));
}

function GlobeArcs({ countries, visible }) {
  const arcs = useMemo(() => {
    const byId = Object.fromEntries(countries.map(c => [c.id, c]));
    return TRADE_ARCS
      .filter(([a, b]) => byId[a] && byId[b])
      .map(([a, b, strength]) => {
        const cA = byId[a], cB = byId[b];
        const vA = latLonToVector3(cA.lat, cA.lon, GLOBE_RADIUS);
        const vB = latLonToVector3(cB.lat, cB.lon, GLOBE_RADIUS);
        return { geo: buildArcGeometry(vA, vB), strength, key: `${a}-${b}` };
      });
  }, [countries]);

  // Animate dash offset for flow direction illusion
  const matsRef = useRef([]);
  useFrame(({ clock }) => {
    matsRef.current.forEach((mat, i) => {
      if (mat) mat.dashOffset = -(clock.elapsedTime * 0.25 * (0.5 + arcs[i]?.strength * 0.5));
    });
  });

  if (!visible) return null;
  return (
    <>
      {arcs.map((arc, i) => (
        <line key={arc.key} geometry={arc.geo}>
          <lineDashedMaterial
            ref={el => (matsRef.current[i] = el)}
            color={arc.strength > 0.75 ? "#00b0ff" : "#00e5ff"}
            dashSize={0.025}
            gapSize={0.018}
            opacity={0.28 + arc.strength * 0.35}
            transparent
            linewidth={1}
          />
        </line>
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PULSE RING  (preserved)
// ═══════════════════════════════════════════════════════════════════════

function PulseRing({ position, color, delay = 0 }) {
  const ref = useRef();
  const matRef = useRef();
  useFrame(({ clock }) => {
    const t = ((clock.elapsedTime * 0.7 + delay) % 1);
    if (ref.current) {
      const s = 1 + t * 3.2;
      ref.current.scale.set(s, s, s);
      ref.current.lookAt(0, 0, 0);
      ref.current.rotateX(Math.PI / 2);
    }
    if (matRef.current) matRef.current.opacity = (1 - t) * 0.85;
  });
  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[0.033, 0.042, 32]} />
      <meshBasicMaterial ref={matRef} color={color} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COUNTRY MARKERS  (upgraded: live data, search highlight)
// ═══════════════════════════════════════════════════════════════════════

function CountryMarkers({ countries, onDrillDown, setHovered, searchQuery }) {
  const [hov, setHov] = useState(null);

  return countries.map((c, i) => {
    const pos    = latLonToVector3(c.lat, c.lon, GLOBE_RADIUS + 0.02);
    const ch     = c.changePct ?? c.change ?? 0;
    const color  = changeToHex(ch);
    const isMatch = searchQuery && (
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.index?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <group key={c.id}>
        <PulseRing position={pos} color={color} delay={i * 0.22} />
        <PulseRing position={pos} color={color} delay={i * 0.22 + 0.5} />
        <mesh
          position={pos}
          scale={isMatch ? 2.5 : hov === i ? 2.0 : 1.0}
          onPointerOver={() => { setHov(i); setHovered(c); }}
          onPointerOut={() => { setHov(null); setHovered(null); }}
          onClick={() => onDrillDown({ pos, country: c })}
        >
          <sphereGeometry args={[0.03, 32, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isMatch ? 7 : hov === i ? 5 : 2.5}
            roughness={0.1}
            metalness={0.3}
          />
          {hov === i && (
            <Html style={{ pointerEvents: "none" }}>
              <div style={{
                background: "rgba(3,9,20,0.96)",
                border: `1px solid ${color}44`,
                borderLeft: `3px solid ${color}`,
                padding: "10px 14px",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
                whiteSpace: "nowrap",
                transform: "translate(14px,-50%)",
                boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 24px ${color}22`,
                fontFamily: "'SF Mono','Courier New',monospace",
              }}>
                <div style={{ fontWeight: 700, fontSize: "14px" }}>{c.flag} {c.name}</div>
                <div style={{ color: "#444", fontSize: "10px", margin: "2px 0 6px" }}>{c.index}</div>
                {c.price != null && (
                  <div style={{ color: "#666", fontSize: "11px", marginBottom: "4px" }}>
                    {fmt(c.price, 0)} pts
                  </div>
                )}
                <div style={{ color, fontWeight: 700, fontSize: "16px" }}>
                  {ch > 0 ? "▲" : "▼"} {Math.abs(ch)}%
                </div>
                <div style={{ display: "flex", gap: "14px", marginTop: "6px" }}>
                  <span>
                    <div style={{ color: "#333", fontSize: "9px", letterSpacing: "1px" }}>MCAP</div>
                    <div style={{ color: "#aaa", fontSize: "11px" }}>{c.cap}</div>
                  </span>
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

// ═══════════════════════════════════════════════════════════════════════
// CAMERA CONTROLLER  (preserved + fixed)
// ═══════════════════════════════════════════════════════════════════════

function CameraController({ target, layer, orbitRef }) {
  const { camera } = useThree();
  useEffect(() => {
    if (!target) return;
    if (orbitRef.current) orbitRef.current.enabled = false;
    const dest = target.pos.clone().multiplyScalar(2.8);
    gsap.to(camera.position, {
      x: dest.x, y: dest.y, z: dest.z, duration: 1.5, ease: "power3.inOut",
      onUpdate: () => camera.lookAt(0, 0, 0),
    });
  }, [target]);

  useEffect(() => {
    if (layer === "globe") {
      gsap.to(camera.position, {
        x: 0, y: 0, z: 3, duration: 1.2, ease: "power2.inOut",
        onUpdate: () => camera.lookAt(0, 0, 0),
        onComplete: () => { if (orbitRef.current) orbitRef.current.enabled = true; },
      });
    }
    if (layer === "country") {
      gsap.to(camera.position, {
        x: 0, y: 0, z: 5.5, duration: 0.9, ease: "power2.out",
        onUpdate: () => camera.lookAt(0, 0, 0),
      });
    }
  }, [layer]);

  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// ZOOM LISTENER  (preserved)
// ═══════════════════════════════════════════════════════════════════════

function ZoomListener() {
  const { camera } = useThree();
  useEffect(() => {
    const h = e => {
      const { dir } = e.detail;
      if (dir === 0) {
        gsap.to(camera.position, { z: 5.5, duration: 0.6, ease: "power2.out" });
      } else {
        const z = Math.max(2, Math.min(14, camera.position.z - dir * 0.7));
        gsap.to(camera.position, { z, duration: 0.4, ease: "power2.out" });
      }
    };
    window.addEventListener("ms-zoom", h);
    return () => window.removeEventListener("ms-zoom", h);
  }, [camera]);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// AUTO-FIT  (preserved)
// ═══════════════════════════════════════════════════════════════════════

function AutoFit({ bubbles }) {
  const { camera, size } = useThree();
  const fitted = useRef(false);
  useEffect(() => { fitted.current = false; }, [bubbles]);
  useFrame(() => {
    if (fitted.current || !bubbles.length) return;
    fitted.current = true;
    const maxR   = Math.max(...bubbles.map(b => b.size * 0.018));
    const spread = Math.max(...bubbles.map(b => Math.sqrt(b.x * b.x + b.y * b.y))) + maxR * 3;
    const aspect = size.width / size.height;
    const fovRad = (camera.fov * Math.PI) / 180;
    const zForH  = spread / Math.tan(fovRad / 2);
    const zForW  = spread / (Math.tan(fovRad / 2) * aspect);
    gsap.to(camera.position, {
      z: Math.min(Math.max(zForH, zForW) + 1.5, 10),
      duration: 0.9, ease: "power2.out", delay: 0.3,
    });
  });
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// FORCE BUBBLES  — UPGRADED: instanced rendering + time-scrub scale
// ═══════════════════════════════════════════════════════════════════════

// NOTE: We keep your existing physics engine exactly as-is but add:
// 1. timeProgress scaling (bubbles grow in as you scrub forward)
// 2. search highlight via emissive intensity
// 3. proper sector label on click panel

function ForceBubbles({ bubbleData, resetSignal, setSelected, search, timeProgress }) {
  const refs     = useRef([]);
  const ringRefs = useRef([]);
  const [hovered, setHovered] = useState(null);
  const engine   = useRef({ bubbles: [], dragging: null, pointer: { x: 0, y: 0 } });

  const init = useCallback(() => {
    engine.current.bubbles = bubbleData.map((d, i) => {
      const angle = (i / bubbleData.length) * Math.PI * 2;
      const r     = 0.7 + (i % 3) * 0.55;
      return { ...d, x: Math.cos(angle) * r, y: Math.sin(angle) * r,
               tx: Math.cos(angle) * r, ty: Math.sin(angle) * r };
    });
  }, [bubbleData]);

  useEffect(() => { init(); }, [init, resetSignal]);

  useEffect(() => {
    const move = e => {
      engine.current.pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      engine.current.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useFrame(state => {
    const e = engine.current;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(e.pointer, state.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const pt    = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, pt);

    e.bubbles.forEach((b, i) => {
      if (e.dragging === i) { b.tx = pt.x; b.ty = pt.y; }
      b.x += (b.tx - b.x) * 0.1;
      b.y += (b.ty - b.y) * 0.1;
    });

    // Collision (your unchanged engine)
    for (let i = 0; i < e.bubbles.length; i++) {
      for (let j = i + 1; j < e.bubbles.length; j++) {
        const a = e.bubbles[i], b = e.bubbles[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const minD = a.size * 0.019 + b.size * 0.019 + 0.04;
        if (dist < minD) {
          const ov = (minD - dist) / 2;
          a.x -= (dx / dist) * ov; a.y -= (dy / dist) * ov;
          b.x += (dx / dist) * ov; b.y += (dy / dist) * ov;
        }
      }
    }

    e.bubbles.forEach((b, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      const matched = search && b.name.toLowerCase().includes(search.toLowerCase());
      const ts = matched ? 1.5 : hovered === i ? 1.15 : 1;
      // Apply timeProgress: bubbles scale from 0→1 as scrubber moves 0→1
      const timeScale = Math.max(0.05, timeProgress);
      mesh.scale.x += (ts * timeScale - mesh.scale.x) * 0.15;
      mesh.scale.y += (ts * timeScale - mesh.scale.y) * 0.15;
      mesh.scale.z += (ts * timeScale - mesh.scale.z) * 0.15;
      mesh.position.x += (b.x - mesh.position.x) * 0.2;
      mesh.position.y += (b.y - mesh.position.y) * 0.2;
      mesh.position.z  = Math.sin(state.clock.elapsedTime * 0.9 + i * 1.3) * 0.05;

      const ring = ringRefs.current[i];
      if (ring) {
        ring.position.x += (b.x - ring.position.x) * 0.2;
        ring.position.y += (b.y - ring.position.y) * 0.2;
        ring.position.z  = mesh.position.z;
        ring.material.opacity = hovered === i ? 0.55 : 0.18;
      }

      // Update emissive based on match/hover
      if (mesh.material) {
        mesh.material.emissiveIntensity = matched ? 2.0 : hovered === i ? 1.3 : 0.45;
      }
    });
  });

  return (
    <>
      <AutoFit bubbles={engine.current.bubbles} />
      {engine.current.bubbles.map((b, i) => {
        const color  = changeToHex(b.change ?? 0);
        const radius = b.size * 0.018;
        return (
          <group key={b.name + i}>
            <mesh ref={el => (ringRefs.current[i] = el)} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[radius * 1.08, radius * 1.24, 64]} />
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
              <sphereGeometry args={[radius, 32, 32]} />
              <meshPhysicalMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.45}
                roughness={0.05}
                metalness={0.1}
                transmission={0.28}
                thickness={0.5}
                transparent
                opacity={0.9}
              />
              <Html center style={{ pointerEvents: "none" }}>
                <div style={{ textAlign: "center", fontFamily: "'SF Mono','Courier New',monospace", userSelect: "none" }}>
                  <div style={{
                    color: "#fff", fontSize: b.size > 22 ? "10px" : "8px", fontWeight: 700,
                    whiteSpace: "nowrap", textShadow: "0 1px 6px #000",
                  }}>{b.name}</div>
                  <div style={{
                    color, fontSize: b.size > 22 ? "9px" : "7px", fontWeight: 700,
                    textShadow: "0 1px 4px #000",
                  }}>{(b.change ?? 0) > 0 ? "▲" : "▼"}{Math.abs(b.change ?? 0).toFixed(2)}%</div>
                </div>
              </Html>
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BACKGROUND GRID  (preserved)
// ═══════════════════════════════════════════════════════════════════════

function BgGrid() {
  const geo = useMemo(() => {
    const pts = [];
    for (let x = -10; x <= 10; x += 0.7) pts.push(new THREE.Vector3(x, -6, -4), new THREE.Vector3(x, 6, -4));
    for (let y = -6; y <= 6; y += 0.7)   pts.push(new THREE.Vector3(-10, y, -4), new THREE.Vector3(10, y, -4));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#040c1c" opacity={0.8} transparent />
    </lineSegments>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TIMELINE BAR  — NEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════

function TimelineBar({ timeRange, setTimeRange, timeProgress, setTimeProgress }) {
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef();
  const mono   = { fontFamily: "'SF Mono','Courier New',monospace" };

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      setTimeProgress(p => {
        const next = p + 0.002;
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, setTimeProgress]);

  const ranges = ["1D", "5D", "1M", "1Y"];

  return (
    <div style={{
      position: "absolute", bottom: "36px", left: "50%", transform: "translateX(-50%)",
      display: "flex", alignItems: "center", gap: "12px",
      background: "rgba(2,6,16,0.88)",
      border: "1px solid rgba(0,153,255,0.15)",
      borderRadius: "10px",
      padding: "8px 16px",
      zIndex: 25,
      backdropFilter: "blur(20px)",
      minWidth: "420px",
      ...mono,
    }}>
      {/* Range pills */}
      <div style={{ display: "flex", gap: "3px" }}>
        {ranges.map(r => (
          <button key={r} onClick={() => { setTimeRange(r); setTimeProgress(1); setPlaying(false); }}
            style={{
              padding: "4px 10px", borderRadius: "5px",
              border: timeRange === r ? "1px solid rgba(0,153,255,0.5)" : "1px solid transparent",
              background: timeRange === r ? "rgba(0,153,255,0.15)" : "transparent",
              color: timeRange === r ? "#0099ff" : "#333",
              fontSize: "10px", fontWeight: 700, cursor: "pointer", letterSpacing: "1px", ...mono,
            }}>{r}</button>
        ))}
      </div>

      <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.07)" }} />

      {/* Play/pause */}
      <button onClick={() => {
        if (timeProgress >= 1) setTimeProgress(0);
        setPlaying(p => !p);
      }} style={{
        background: "rgba(0,153,255,0.1)", border: "1px solid rgba(0,153,255,0.25)",
        color: "#0099ff", padding: "4px 10px", borderRadius: "6px",
        cursor: "pointer", fontSize: "13px", lineHeight: 1, ...mono,
      }}>
        {playing ? "⏸" : "▶"}
      </button>

      {/* Scrubber */}
      <input
        type="range" min={0} max={100} step={1}
        value={Math.round(timeProgress * 100)}
        onChange={e => {
          setPlaying(false);
          setTimeProgress(Number(e.target.value) / 100);
        }}
        style={{ flex: 1, accentColor: "#0099ff", height: "3px" }}
      />
      <span style={{ color: "#333", fontSize: "10px", minWidth: "30px", textAlign: "right" }}>
        {Math.round(timeProgress * 100)}%
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// INSIGHT PANEL  — NEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════

function InsightPanel({ insights, onExplain, visible }) {
  const [expanded, setExpanded] = useState(true);
  const mono = { fontFamily: "'SF Mono','Courier New',monospace" };

  if (!insights || !visible) return null;
  const { sentiment, sentimentColor, topGainers, topLosers, advancing, declining, insightText, avg } = insights;

  return (
    <div style={{
      position: "absolute", top: "60px", left: "16px",
      width: "210px",
      background: "rgba(2,6,16,0.9)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderTop: `2px solid ${sentimentColor}`,
      borderRadius: "10px",
      overflow: "hidden",
      zIndex: 20,
      backdropFilter: "blur(20px)",
      animation: "fadeIn 0.35s ease",
      ...mono,
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        cursor: "pointer",
      }} onClick={() => setExpanded(e => !e)}>
        <div>
          <div style={{ color: "#333", fontSize: "8px", letterSpacing: "1.5px" }}>GLOBAL SENTIMENT</div>
          <div style={{ color: sentimentColor, fontSize: "13px", fontWeight: 700, letterSpacing: "1px" }}>
            {sentiment}
          </div>
        </div>
        <span style={{ color: "#333", fontSize: "14px" }}>{expanded ? "▾" : "▸"}</span>
      </div>

      {expanded && (
        <>
          {/* Advancing/declining bar */}
          <div style={{ padding: "10px 14px 4px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "9px" }}>
              <span style={{ color: "#00e676" }}>▲ {advancing} UP</span>
              <span style={{ color: "#ff5252" }}>{declining} DOWN ▼</span>
            </div>
            <div style={{ height: "3px", background: "#0d0d0d", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{
                width: `${(advancing / (advancing + declining)) * 100}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${sentimentColor}, ${sentimentColor}88)`,
                borderRadius: "2px",
              }} />
            </div>
            <div style={{ color: "#333", fontSize: "9px", textAlign: "center", marginTop: "4px" }}>
              avg {avg >= 0 ? "+" : ""}{fmt(avg)}%
            </div>
          </div>

          {/* Gainers */}
          <div style={{ padding: "8px 14px 4px" }}>
            <div style={{ color: "#1a2a1a", fontSize: "8px", letterSpacing: "1.5px", marginBottom: "5px" }}>
              TOP GAINERS
            </div>
            {topGainers.map(c => (
              <div key={c.id} style={{
                display: "flex", justifyContent: "space-between",
                padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.025)",
              }}>
                <span style={{ color: "#888", fontSize: "10px" }}>{c.flag} {c.name}</span>
                <span style={{ color: "#00e676", fontSize: "10px", fontWeight: 700 }}>
                  +{fmt(c.changePct)}%
                </span>
              </div>
            ))}
          </div>

          {/* Losers */}
          <div style={{ padding: "4px 14px 8px" }}>
            <div style={{ color: "#2a1a1a", fontSize: "8px", letterSpacing: "1.5px", marginBottom: "5px", marginTop: "4px" }}>
              TOP LOSERS
            </div>
            {topLosers.map(c => (
              <div key={c.id} style={{
                display: "flex", justifyContent: "space-between",
                padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.025)",
              }}>
                <span style={{ color: "#888", fontSize: "10px" }}>{c.flag} {c.name}</span>
                <span style={{ color: "#ff5252", fontSize: "10px", fontWeight: 700 }}>
                  {fmt(c.changePct)}%
                </span>
              </div>
            ))}
          </div>

          {/* Rule-based insight text */}
          <div style={{
            padding: "8px 14px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            color: "#444",
            fontSize: "9px",
            lineHeight: 1.6,
          }}>
            {insightText}
          </div>

          {/* AI explain button */}
          <div style={{ padding: "0 14px 12px" }}>
            <button onClick={onExplain} style={{
              width: "100%", padding: "7px 0",
              background: "rgba(0,153,255,0.08)",
              border: "1px solid rgba(0,153,255,0.2)",
              borderRadius: "6px",
              color: "#0099ff",
              fontSize: "9px",
              letterSpacing: "1px",
              cursor: "pointer",
              ...mono,
            }}>
              ✦ EXPLAIN MOVEMENT
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// AI EXPLAIN MODAL  — NEW COMPONENT (Anthropic API powered)
// ═══════════════════════════════════════════════════════════════════════

function AIExplainModal({ insights, countries, onClose }) {
  const [text, setText]       = useState("");
  const [loading, setLoading] = useState(true);
  const mono = { fontFamily: "'SF Mono','Courier New',monospace" };

  useEffect(() => {
    async function explain() {
      setLoading(true);
      try {
        const snapshot = countries
          .map(c => `${c.name}(${c.index}): ${c.changePct >= 0 ? "+" : ""}${fmt(c.changePct)}%`)
          .join(", ");
        const prompt = `You are a concise market analyst. Given this global market snapshot for today: ${snapshot}. In 3–4 sentences, explain what is driving these moves, which regions are leading/lagging, and what macro themes this might reflect. Be specific and insightful, not generic.`;

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data = await res.json();
        const content = data.content?.find(b => b.type === "text")?.text;
        setText(content || "Unable to generate insight at this time.");
      } catch {
        setText("Market insight unavailable. Check your connection and try again.");
      }
      setLoading(false);
    }
    explain();
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "rgba(4,10,24,0.98)",
        border: "1px solid rgba(0,153,255,0.2)",
        borderTop: "2px solid #0099ff",
        borderRadius: "12px",
        padding: "24px",
        maxWidth: "480px",
        width: "90%",
        animation: "fadeIn 0.25s ease",
        ...mono,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ color: "#333", fontSize: "9px", letterSpacing: "2px" }}>AI MARKET ANALYSIS</div>
            <div style={{ color: "#0099ff", fontSize: "15px", fontWeight: 700, marginTop: "2px" }}>
              ✦ MarketSphere Intelligence
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "20px" }}>×</button>
        </div>

        {loading ? (
          <div style={{ color: "#1a3a5c", fontSize: "11px", textAlign: "center", padding: "30px 0" }}>
            <div style={{
              width: 32, height: 32, border: "2px solid rgba(0,153,255,0.15)",
              borderTop: "2px solid #0099ff", borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }} />
            ANALYZING MARKET CONDITIONS...
          </div>
        ) : (
          <div style={{
            color: "#888",
            fontSize: "12px",
            lineHeight: 1.8,
            whiteSpace: "pre-wrap",
          }}>{text}</div>
        )}

        <div style={{
          marginTop: "16px", paddingTop: "12px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          color: "#1a1a1a", fontSize: "9px", letterSpacing: "1px",
        }}>
          POWERED BY CLAUDE · FOR INFORMATIONAL PURPOSES ONLY
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HISTORICAL SPARKLINE CHART  — used inside IndexPanel
// ═══════════════════════════════════════════════════════════════════════

function HistoricalSparkline({ countryId, range, color, width = 186, height = 48 }) {
  const [pts, setPts] = useState([]);

  useEffect(() => {
    if (!countryId) return;
    fetchHistorical(countryId, range).then(data => {
      if (!data.length) return;
      setPts(data.map(d => d.c));
    });
  }, [countryId, range]);

  if (!pts.length) {
    return (
      <svg width={width} height={height}>
        <text x={width/2} y={height/2} textAnchor="middle" fill="#222" fontSize="9" fontFamily="monospace">
          LOADING...
        </text>
      </svg>
    );
  }

  const minV = Math.min(...pts), maxV = Math.max(...pts);
  const range_ = maxV - minV || 1;
  const svgPts = pts.map((v, i) => ({
    x: (i / (pts.length - 1)) * width,
    y: height - ((v - minV) / range_) * (height - 6) - 3,
  }));
  const d = svgPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = svgPts[svgPts.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="hsg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill="url(#hsg)" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={last.x} cy={last.y} r="3" fill={color} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SIDEBAR  (upgraded: search results highlighted, live data)
// ═══════════════════════════════════════════════════════════════════════

function Sidebar({ countries, onCountryClick, searchQuery, dataLoading }) {
  const up   = countries.filter(c => (c.changePct ?? 0) > 0).length;
  const mono = { fontFamily: "'SF Mono','Fira Code','Courier New',monospace" };

  const displayed = searchQuery
    ? fuzzySearch(searchQuery, countries, ["name", "index", "id"])
    : countries;

  return (
    <div style={{
      position: "absolute", top: "60px", right: "16px",
      width: "196px",
      background: "rgba(2,8,20,0.88)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "10px",
      overflow: "hidden",
      zIndex: 20,
      backdropFilter: "blur(16px)",
      maxHeight: "calc(100vh - 120px)",
      overflowY: "auto",
      ...mono,
    }}>
      <div style={{
        padding: "9px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        position: "sticky", top: 0,
        background: "rgba(2,8,20,0.96)",
        zIndex: 1,
      }}>
        <span style={{ color: "#333", fontSize: "9px", letterSpacing: "1.5px" }}>
          {dataLoading ? "LOADING..." : "GLOBAL MARKETS"}
        </span>
        <span style={{ fontSize: "9px" }}>
          <span style={{ color: "#00e676" }}>▲{up} </span>
          <span style={{ color: "#ff5252" }}>▼{countries.length - up}</span>
        </span>
      </div>
      {displayed.map(c => {
        const ch    = c.changePct ?? c.change ?? 0;
        const color = changeToHex(ch);
        return (
          <div key={c.id} onClick={() => onCountryClick(c)}
            style={{
              padding: "7px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.025)",
              cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: searchQuery && c.name.toLowerCase().includes(searchQuery.toLowerCase())
                ? "rgba(0,153,255,0.06)" : "transparent",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            onMouseLeave={e => e.currentTarget.style.background =
              searchQuery && c.name.toLowerCase().includes(searchQuery.toLowerCase())
                ? "rgba(0,153,255,0.06)" : "transparent"}
          >
            <div>
              <div style={{ color: "#ccc", fontSize: "11px", fontWeight: 600 }}>{c.flag} {c.name}</div>
              <div style={{ color: "#2a2a2a", fontSize: "9px" }}>{c.index}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color, fontSize: "11px", fontWeight: 700 }}>
                {ch >= 0 ? "+" : ""}{fmt(ch)}%
              </div>
              <div style={{ color: "#1a1a1a", fontSize: "8px" }}>{c.cap}</div>
            </div>
          </div>
        );
      })}
      {displayed.length === 0 && (
        <div style={{ padding: "20px 14px", color: "#333", fontSize: "10px", textAlign: "center" }}>
          No results for "{searchQuery}"
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// INDEX PANEL  (upgraded: real sparkline, live data, sector info)
// ═══════════════════════════════════════════════════════════════════════

function IndexPanel({ selected, activeCountry, timeRange, onClose }) {
  if (!selected) return null;
  const ch    = selected.change ?? 0;
  const color = changeToHex(ch);
  const mono  = { fontFamily: "'SF Mono','Fira Code','Courier New',monospace" };

  return (
    <div style={{
      position: "absolute", top: "60px", right: "16px",
      width: "218px",
      background: "rgba(2,8,20,0.96)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderTop: `2px solid ${color}`,
      borderRadius: "10px",
      padding: "16px",
      zIndex: 21,
      backdropFilter: "blur(20px)",
      animation: "fadeIn 0.25s ease",
      ...mono,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
        <div>
          <div style={{ color: "#333", fontSize: "9px", letterSpacing: "1.5px" }}>INDEX DETAIL</div>
          <div style={{ color: "#fff", fontSize: "17px", fontWeight: 700, marginTop: "2px" }}>{selected.name}</div>
          {selected.sector && (
            <div style={{ color: "#0099ff", fontSize: "9px", letterSpacing: "1px", marginTop: "2px" }}>{selected.sector}</div>
          )}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "18px" }}>×</button>
      </div>

      <div style={{ fontSize: "26px", fontWeight: 700, color, marginBottom: "14px" }}>
        {ch > 0 ? "▲ +" : "▼ "}{fmt(ch)}%
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
        {[
          { label: "SECTOR", value: selected.sector ?? "—", vc: "#ccc"    },
          { label: "P/E",    value: selected.pe != null ? fmt(selected.pe, 1) : "—", vc: "#0099ff" },
          { label: "VOLUME", value: selected.volume ?? "—",  vc: "#ffb300" },
          { label: "WEIGHT", value: `${selected.size ?? "—"}`, vc: "#888" },
        ].map(({ label, value, vc }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: "6px", padding: "8px 10px",
          }}>
            <div style={{ color: "#222", fontSize: "8px", letterSpacing: "1px", marginBottom: "3px" }}>{label}</div>
            <div style={{ color: vc, fontSize: "11px", fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Real historical sparkline */}
      <div style={{ color: "#222", fontSize: "9px", letterSpacing: "1px", marginBottom: "4px" }}>
        {timeRange} TREND
      </div>
      {activeCountry?.id ? (
        <HistoricalSparkline countryId={activeCountry.id} range={timeRange} color={color} />
      ) : (
        <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#222", fontSize: "9px" }}>SELECT COUNTRY FIRST</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COMPARE PANEL  — NEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════

function ComparePanel({ countries, compareIds, setCompareIds, onClose, timeRange }) {
  const a = countries.find(c => c.id === compareIds[0]);
  const b = countries.find(c => c.id === compareIds[1]);
  const mono = { fontFamily: "'SF Mono','Courier New',monospace" };

  if (!a || !b) return null;

  const metrics = [
    { label: "CHANGE",  valA: `${fmt(a.changePct ?? 0)}%`, valB: `${fmt(b.changePct ?? 0)}%`,
      colorA: changeToHex(a.changePct ?? 0), colorB: changeToHex(b.changePct ?? 0) },
    { label: "INDEX",   valA: a.index, valB: b.index, colorA: "#888", colorB: "#888" },
    { label: "MCAP",    valA: a.cap, valB: b.cap, colorA: "#0099ff", colorB: "#0099ff" },
  ];

  return (
    <div style={{
      position: "absolute", bottom: "80px", left: "50%", transform: "translateX(-50%)",
      background: "rgba(2,6,16,0.95)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "10px",
      padding: "14px 18px",
      zIndex: 30,
      backdropFilter: "blur(20px)",
      animation: "fadeIn 0.25s ease",
      ...mono,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ color: "#333", fontSize: "9px", letterSpacing: "1.5px" }}>COMPARE MODE</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#333", cursor: "pointer" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr", gap: "8px", alignItems: "center" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{a.flag} {a.name}</div>
        </div>
        <div style={{ textAlign: "center", color: "#1a1a1a", fontSize: "9px" }}>VS</div>
        <div>
          <div style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{b.flag} {b.name}</div>
        </div>
      </div>
      {metrics.map(m => (
        <div key={m.label} style={{
          display: "grid", gridTemplateColumns: "1fr 60px 1fr",
          gap: "8px", alignItems: "center", marginTop: "8px",
          paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.04)",
        }}>
          <div style={{ color: m.colorA, fontSize: "11px", fontWeight: 700, textAlign: "right" }}>{m.valA}</div>
          <div style={{ color: "#2a2a2a", fontSize: "8px", textAlign: "center", letterSpacing: "1px" }}>{m.label}</div>
          <div style={{ color: m.colorB, fontSize: "11px", fontWeight: 700 }}>{m.valB}</div>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "12px" }}>
        {[a, b].map(c => (
          <div key={c.id}>
            <div style={{ color: "#222", fontSize: "8px", letterSpacing: "1px", marginBottom: "4px" }}>
              {c.flag} {timeRange} TREND
            </div>
            <HistoricalSparkline countryId={c.id} range={timeRange} color={changeToHex(c.changePct ?? 0)} width={140} height={38} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// WATCHLIST PANEL  — NEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════

function WatchlistPanel({ countries, watchlist, setWatchlist, onCountryClick }) {
  const [open, setOpen] = useState(false);
  const mono = { fontFamily: "'SF Mono','Courier New',monospace" };
  const watched = countries.filter(c => watchlist.includes(c.id));

  return (
    <div style={{
      position: "absolute", bottom: "36px", left: "16px",
      zIndex: 25, ...mono,
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: "rgba(2,8,20,0.88)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "8px",
        color: open ? "#0099ff" : "#444",
        fontSize: "10px", letterSpacing: "1px",
        padding: "7px 12px", cursor: "pointer", ...mono,
      }}>
        ★ WATCHLIST {watchlist.length > 0 && `(${watchlist.length})`}
      </button>

      {open && (
        <div style={{
          position: "absolute", bottom: "38px", left: 0,
          width: "200px",
          background: "rgba(2,6,16,0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "10px",
          overflow: "hidden",
          animation: "fadeIn 0.2s ease",
        }}>
          <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", color: "#333", fontSize: "8px", letterSpacing: "1.5px" }}>
            WATCHLIST
          </div>
          {watched.length === 0 ? (
            <div style={{ padding: "16px 14px", color: "#222", fontSize: "10px", textAlign: "center" }}>
              Click ★ on a country to add
            </div>
          ) : (
            watched.map(c => {
              const ch = c.changePct ?? c.change ?? 0;
              return (
                <div key={c.id} style={{
                  padding: "7px 14px",
                  borderBottom: "1px solid rgba(255,255,255,0.025)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: "pointer",
                }}
                  onClick={() => onCountryClick(c)}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ color: "#ccc", fontSize: "11px" }}>{c.flag} {c.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: changeToHex(ch), fontSize: "10px", fontWeight: 700 }}>
                      {ch >= 0 ? "+" : ""}{fmt(ch)}%
                    </span>
                    <span onClick={e => { e.stopPropagation(); setWatchlist(w => w.filter(id => id !== c.id)); }}
                      style={{ color: "#333", cursor: "pointer", fontSize: "12px" }}>×</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LEGEND  (preserved)
// ═══════════════════════════════════════════════════════════════════════

function Legend() {
  const tiers = [
    { color: "#00c853", label: "> +1.5%"        },
    { color: "#00e676", label: "+0.5% to +1.5%" },
    { color: "#69f0ae", label: "0% to +0.5%"    },
    { color: "#ff5252", label: "-0.5% to 0%"    },
    { color: "#f44336", label: "-1.5% to -0.5%" },
    { color: "#b71c1c", label: "< -1.5%"        },
  ];
  return (
    <div style={{
      position: "absolute", bottom: "80px", left: "16px",
      background: "rgba(2,8,20,0.88)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px",
      padding: "10px 14px",
      zIndex: 20,
      backdropFilter: "blur(12px)",
      fontFamily: "'SF Mono','Courier New',monospace",
    }}>
      <div style={{ color: "#2a2a2a", fontSize: "9px", letterSpacing: "1.5px", marginBottom: "8px" }}>
        PERFORMANCE KEY
      </div>
      {tiers.map(t => (
        <div key={t.label} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
          <div style={{ width: 12, height: 12, borderRadius: "3px", background: t.color, flexShrink: 0 }} />
          <span style={{ color: "#444", fontSize: "9px" }}>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TICKER  (upgraded: live data, crypto, commodities)
// ═══════════════════════════════════════════════════════════════════════

function Ticker({ countries }) {
  const mono = { fontFamily: "'SF Mono','Fira Code','Courier New',monospace" };
  const extras = [
    { label: "BTC",     change:  0 },
    { label: "GOLD",    change:  0 },
    { label: "CRUDE",   change:  0 },
    { label: "EUR/USD", change:  0 },
    { label: "DXY",     change:  0 },
  ];
  const items = [
    ...countries.map(c => ({ label: `${c.flag} ${c.name}`, change: c.changePct ?? c.change ?? 0 })),
    ...extras,
  ];

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      height: "28px",
      background: "rgba(2,4,10,0.96)",
      borderTop: "1px solid rgba(255,255,255,0.04)",
      overflow: "hidden",
      display: "flex", alignItems: "center",
      zIndex: 30,
    }}>
      <div style={{ display: "flex", animation: "ticker 50s linear infinite", whiteSpace: "nowrap", ...mono }}>
        {[...items, ...items, ...items].map((item, i) => (
          <span key={i} style={{ marginRight: "40px", fontSize: "10px" }}>
            <span style={{ color: "#2a2a2a" }}>{item.label} </span>
            <span style={{ color: item.change >= 0 ? "#00e676" : "#ff5252" }}>
              {item.change >= 0 ? "▲" : "▼"}{Math.abs(item.change).toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ZOOM CONTROLS  (preserved)
// ═══════════════════════════════════════════════════════════════════════

function ZoomControls() {
  const mono = { fontFamily: "'SF Mono','Fira Code','Courier New',monospace" };
  const zoom = dir => window.dispatchEvent(new CustomEvent("ms-zoom", { detail: { dir } }));
  return (
    <div style={{
      position: "absolute", bottom: "80px", right: "16px",
      display: "flex", flexDirection: "column",
      background: "rgba(2,8,20,0.88)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "8px", overflow: "hidden",
      backdropFilter: "blur(12px)",
      zIndex: 20,
    }}>
      {[{l:"+",d:1,t:"Zoom In"},{l:"⊡",d:0,t:"Auto Fit"},{l:"−",d:-1,t:"Zoom Out"}].map(({l,d,t},i,a) => (
        <button key={t} title={t} onClick={() => zoom(d)} style={{
          width: 36, height: 36, background: "none", border: "none",
          borderBottom: i < a.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
          color: "#444", fontSize: d === 0 ? "12px" : "18px",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          ...mono,
        }}
          onMouseEnter={e => { e.currentTarget.style.color = "#0099ff"; e.currentTarget.style.background = "rgba(0,153,255,0.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "#444";    e.currentTarget.style.background = "none"; }}
        >{l}</button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LOADING SPINNER  (preserved)
// ═══════════════════════════════════════════════════════════════════════

function Spinner({ text = "BUILDING GLOBE..." }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      zIndex: 50, pointerEvents: "none",
      fontFamily: "'SF Mono','Courier New',monospace",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        border: "2px solid rgba(0,153,255,0.15)",
        borderTop: "2px solid #0099ff",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ color: "#1a3a5c", fontSize: "11px", marginTop: "14px", letterSpacing: "2px" }}>
        {text}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DATA FRESHNESS INDICATOR  — NEW
// ═══════════════════════════════════════════════════════════════════════

function DataFreshness({ lastUpdate, loading }) {
  const [age, setAge] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAge(Math.floor((Date.now() - lastUpdate) / 1000)), 5000);
    return () => clearInterval(id);
  }, [lastUpdate]);

  const mono = { fontFamily: "'SF Mono','Courier New',monospace" };
  const fresh = age < 120;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", ...mono }}>
      <div style={{
        width: 5, height: 5, borderRadius: "50%",
        background: loading ? "#ffd740" : fresh ? "#00e676" : "#ff5252",
        animation: loading ? "pulse 1s infinite" : "none",
      }} />
      <span style={{ color: "#333", fontSize: "9px", letterSpacing: "1px" }}>
        {loading ? "FETCHING" : `${age < 60 ? "<1" : Math.floor(age / 60)}m ago`}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// APP  — main orchestrator
// ═══════════════════════════════════════════════════════════════════════

export default function App() {
  // ── State ──
  const [layer,          setLayer         ] = useState("globe");
  const [target,         setTarget        ] = useState(null);
  const [activeCountry,  setActiveCountry ] = useState(null);
  const [resetSignal,    setResetSignal   ] = useState(0);
  const [selected,       setSelected      ] = useState(null);
  const [search,         setSearch        ] = useState("");
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [time,           setTime          ] = useState(new Date());
  // New state
  const [countries,      setCountries     ] = useState(COUNTRIES_SEED);
  const [dataLoading,    setDataLoading   ] = useState(true);
  const [dataError,      setDataError     ] = useState(null);
  const [lastUpdate,     setLastUpdate    ] = useState(Date.now());
  const [timeRange,      setTimeRange     ] = useState("1D");
  const [timeProgress,   setTimeProgress  ] = useState(1);
  const [showInsight,    setShowInsight   ] = useState(false);
  const [showAI,         setShowAI        ] = useState(false);
  const [showArcs,       setShowArcs      ] = useState(true);
  const [compareIds,     setCompareIds    ] = useState(null);
  const [watchlist,      setWatchlist     ] = useState([]);

  const orbitRef = useRef();
  const pollRef  = useRef();

  // ── Texture (rebuilds when real data arrives) ──
  const { texture: globeTexture, loading: globeLoading } = usePoliticalTexture(countries);

  // ── Clock ──
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Live data polling ──
  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const quotes = await fetchAllQuotes();
      setCountries(quotes);
      setLastUpdate(Date.now());
    } catch (e) {
      setDataError("Market data temporarily unavailable.");
      // Keep existing data on error
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(loadData, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [loadData]);

  // ── Persist watchlist ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ms2_watchlist");
      if (saved) setWatchlist(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("ms2_watchlist", JSON.stringify(watchlist)); } catch {}
  }, [watchlist]);

  // ── Derived ──
  const insights = useMemo(() => computeInsights(countries), [countries]);
  const bubbleData = useMemo(() => {
    if (!activeCountry) return [];
    const sectors = COUNTRY_SECTORS[activeCountry.id];
    if (sectors) {
      return sectors.map(s => ({
        ...s,
        change:  (activeCountry.changePct ?? 0) * (0.8 + Math.random() * 0.4),
        volume: activeCountry.volume ?? "—",
      }));
    }
    const ch = activeCountry.changePct ?? 0;
    return [
      { name: activeCountry.index, sector: "Broad", size: 26, pe: 20.0, change: ch, volume: activeCountry.volume ?? "—" },
      { name: "Large Cap",  sector: "Large Cap",   size: 20, pe: 18.5, change: ch * 0.9,  volume: "—" },
      { name: "Mid Cap",    sector: "Mid Cap",     size: 17, pe: 25.2, change: ch * 1.1,  volume: "—" },
      { name: "Small Cap",  sector: "Small Cap",   size: 14, pe: 30.1, change: ch * 1.4,  volume: "—" },
      { name: "Bonds",      sector: "Fixed Income",size: 13, pe: null,  change: -ch * 0.3, volume: "—" },
    ];
  }, [activeCountry]);

  // ── Handlers ──
  const handleDrillDown = useCallback(({ pos, country }) => {
    setTarget({ pos, country });
    setActiveCountry(country);
    setSelected(null);
    setTimeout(() => setLayer("country"), 1600);
  }, []);

  const handleSidebarClick = useCallback(c => {
    const pos = latLonToVector3(c.lat, c.lon, GLOBE_RADIUS + 0.02);
    handleDrillDown({ pos, country: c });
  }, [handleDrillDown]);

  const handleBack = () => {
    setLayer("globe");
    setTarget(null);
    setActiveCountry(null);
    setSelected(null);
    setSearch("");
    setCompareIds(null);
    setTimeProgress(1);
  };

  const toggleWatchlist = useCallback(id => {
    setWatchlist(w => w.includes(id) ? w.filter(x => x !== id) : [...w, id]);
  }, []);

  const mono = { fontFamily: "'SF Mono','Fira Code','Courier New',monospace" };

  // ── Render ──
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#020810", overflow: "hidden", position: "relative" }}>
      <style>{`
        @keyframes ticker  { from{transform:translateX(0)} to{transform:translateX(-33.33%)} }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{opacity:0.4} 50%{opacity:1} 100%{opacity:0.4} }
        * { box-sizing: border-box; }
        input::placeholder { color: #222; }
        input:focus { outline: none; border-color: rgba(0,153,255,0.4) !important; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        input[type=range] { -webkit-appearance: none; background: rgba(255,255,255,0.08); border-radius: 2px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #0099ff; cursor: pointer; }
      `}</style>

      {/* ── LOADING ── */}
      {(globeLoading || dataLoading) && !countries.some(c => c.changePct !== 0) && (
        <Spinner text={dataLoading ? "FETCHING MARKET DATA..." : "BUILDING GLOBE..."} />
      )}

      {/* ── ERROR BANNER ── */}
      {dataError && (
        <div style={{
          position: "absolute", top: "60px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(183,28,28,0.12)", border: "1px solid rgba(183,28,28,0.3)",
          borderRadius: "6px", padding: "7px 16px",
          color: "#ff5252", fontSize: "10px", zIndex: 50, ...mono,
          animation: "fadeIn 0.3s ease",
        }}>
          ⚠ {dataError} — Showing cached data.
          <span onClick={loadData} style={{ color: "#0099ff", marginLeft: "8px", cursor: "pointer" }}>RETRY</span>
        </div>
      )}

      {/* ══ TOP NAV ══ */}
      <nav style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "52px",
        background: "rgba(2,5,12,0.92)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        backdropFilter: "blur(20px)",
        display: "flex", alignItems: "center", padding: "0 20px", gap: "12px",
        zIndex: 40, ...mono,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }} onClick={handleBack}>
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

        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.07)" }} />

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px" }}>
          <span onClick={handleBack} style={{ color: layer === "globe" ? "#0099ff" : "#333", cursor: "pointer", letterSpacing: "1px" }}>
            🌐 GLOBAL
          </span>
          {layer === "country" && activeCountry && (
            <>
              <span style={{ color: "#1a1a1a" }}>›</span>
              <span style={{ color: "#0099ff", letterSpacing: "1px" }}>
                {activeCountry.flag} {activeCountry.name.toUpperCase()}
              </span>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Data freshness */}
        <DataFreshness lastUpdate={lastUpdate} loading={dataLoading} />

        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.07)" }} />

        {/* Sentiment */}
        {insights && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "10px" }}>
            <span style={{ color: "#00e676" }}>▲ {insights.advancing} UP</span>
            <div style={{ width: 60, height: 3, borderRadius: 2, background: "#0d1a0d", overflow: "hidden" }}>
              <div style={{
                width: `${(insights.advancing / countries.length) * 100}%`, height: "100%",
                background: "linear-gradient(90deg,#00a84f,#00e676)", borderRadius: 2,
              }} />
            </div>
            <span style={{ color: "#ff5252" }}>{insights.declining} DOWN ▼</span>
          </div>
        )}

        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.07)" }} />

        {/* Clock */}
        <div style={{ color: "#2a2a2a", fontSize: "10px", letterSpacing: "1px" }}>
          {time.toUTCString().match(/\d{2}:\d{2}:\d{2}/)?.[0]} UTC
        </div>

        {/* Globe layer controls */}
        {layer === "globe" && (
          <>
            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.07)" }} />
            <button onClick={() => setShowArcs(a => !a)} style={{
              background: showArcs ? "rgba(0,153,255,0.12)" : "transparent",
              border: "1px solid rgba(0,153,255,0.2)", borderRadius: "6px",
              color: showArcs ? "#0099ff" : "#333",
              fontSize: "9px", letterSpacing: "1px",
              padding: "5px 10px", cursor: "pointer", ...mono,
            }}>⇢ ARCS</button>
          </>
        )}

        {/* Back btn */}
        {layer === "country" && (
          <button onClick={handleBack} style={{
            background: "rgba(0,153,255,0.08)", border: "1px solid rgba(0,153,255,0.22)",
            color: "#0099ff", fontSize: "10px", letterSpacing: "1px",
            padding: "6px 12px", borderRadius: "6px", cursor: "pointer", ...mono,
          }}>← GLOBE</button>
        )}
      </nav>

      {/* ══ SEARCH ══ */}
      <div style={{
        position: "absolute", top: "62px", left: "50%", transform: "translateX(-50%)",
        zIndex: 20, animation: "fadeIn 0.4s ease",
      }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#1a2a3a", fontSize: "14px" }}>⌕</span>
          <input
            placeholder={layer === "globe" ? "Search country, index..." : `Search ${activeCountry?.name ?? ""} sectors...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: "8px 32px 8px 36px", borderRadius: "8px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#fff", fontSize: "12px", width: "260px",
              letterSpacing: "0.5px", backdropFilter: "blur(12px)", ...mono,
            }}
          />
          {search && (
            <span onClick={() => setSearch("")} style={{
              position: "absolute", right: "10px", top: "50%",
              transform: "translateY(-50%)", color: "#333", cursor: "pointer", fontSize: "16px",
            }}>×</span>
          )}
        </div>
      </div>

      {/* ══ GLOBE LAYER UI ══ */}
      {layer === "globe" && (
        <>
          <InsightPanel
            insights={insights}
            visible={true}
            onExplain={() => setShowAI(true)}
          />
          <Sidebar
            countries={countries}
            onCountryClick={c => {
              // If compare mode: pick second country
              if (compareIds?.length === 1) {
                setCompareIds([compareIds[0], c.id]);
              } else {
                handleSidebarClick(c);
              }
            }}
            searchQuery={search}
            dataLoading={dataLoading}
          />
          <Legend />
          <WatchlistPanel
            countries={countries}
            watchlist={watchlist}
            setWatchlist={setWatchlist}
            onCountryClick={handleSidebarClick}
          />
          {!hoveredCountry && !search && (
            <div style={{
              position: "absolute", bottom: "80px", left: "50%", transform: "translateX(-50%)",
              color: "#1a2a1a", fontSize: "10px", letterSpacing: "1.5px",
              zIndex: 10, animation: "pulse 3s infinite", ...mono,
            }}>
              CLICK ANY COUNTRY TO DRILL DOWN · DRAG TO ROTATE
            </div>
          )}
          {/* Compare mode toggle */}
          <div style={{
            position: "absolute", top: "62px", left: "230px",
            zIndex: 20,
          }}>
            <button onClick={() => setCompareIds(compareIds ? null : [])} style={{
              background: compareIds !== null ? "rgba(0,153,255,0.12)" : "transparent",
              border: "1px solid rgba(0,153,255,0.2)",
              borderRadius: "8px", color: compareIds !== null ? "#0099ff" : "#333",
              fontSize: "10px", letterSpacing: "1px",
              padding: "8px 12px", cursor: "pointer", ...mono,
            }}>
              {compareIds !== null ? "✓ COMPARE MODE" : "⚖ COMPARE"}
            </button>
          </div>
          {compareIds !== null && compareIds.length < 2 && (
            <div style={{
              position: "absolute", bottom: "80px", left: "50%", transform: "translateX(-50%)",
              background: "rgba(0,153,255,0.1)", border: "1px solid rgba(0,153,255,0.3)",
              borderRadius: "6px", padding: "8px 16px",
              color: "#0099ff", fontSize: "10px", zIndex: 30, ...mono,
            }}>
              SELECT {compareIds.length === 0 ? "FIRST" : "SECOND"} COUNTRY TO COMPARE
            </div>
          )}
          {compareIds?.length === 2 && (
            <ComparePanel
              countries={countries}
              compareIds={compareIds}
              setCompareIds={setCompareIds}
              onClose={() => setCompareIds(null)}
              timeRange={timeRange}
            />
          )}
        </>
      )}

      {/* ══ COUNTRY LAYER UI ══ */}
      {layer === "country" && (
        <>
          <IndexPanel
            selected={selected}
            activeCountry={activeCountry}
            timeRange={timeRange}
            onClose={() => setSelected(null)}
          />
          <ZoomControls />
          <TimelineBar
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            timeProgress={timeProgress}
            setTimeProgress={setTimeProgress}
          />
          {activeCountry && (
            <div style={{
              position: "absolute", bottom: "90px", left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(2,8,20,0.9)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "8px",
              padding: "8px 20px",
              display: "flex", gap: "20px", alignItems: "center",
              zIndex: 20, backdropFilter: "blur(12px)",
              animation: "fadeIn 0.4s ease", ...mono,
            }}>
              <span style={{ color: "#fff", fontSize: "14px" }}>
                {activeCountry.flag} <b>{activeCountry.name}</b>
              </span>
              <span style={{ color: changeToHex(activeCountry.changePct ?? 0), fontSize: "13px", fontWeight: 700 }}>
                {(activeCountry.changePct ?? 0) >= 0 ? "▲ +" : "▼ "}{fmt(activeCountry.changePct ?? 0)}%
              </span>
              {activeCountry.price != null && (
                <>
                  <span style={{ color: "#1a1a1a" }}>|</span>
                  <span style={{ color: "#666", fontSize: "11px" }}>{fmt(activeCountry.price, 0)} pts</span>
                </>
              )}
              <span style={{ color: "#1a1a1a" }}>|</span>
              {/* Watchlist toggle */}
              <span
                onClick={() => toggleWatchlist(activeCountry.id)}
                style={{
                  color: watchlist.includes(activeCountry.id) ? "#ffd740" : "#333",
                  cursor: "pointer", fontSize: "14px",
                }}
                title={watchlist.includes(activeCountry.id) ? "Remove from watchlist" : "Add to watchlist"}
              >★</span>
              <span style={{ color: "#333", fontSize: "10px" }}>DRAG · CLICK TO INSPECT</span>
            </div>
          )}
        </>
      )}

      {/* ══ 3D CANVAS ══ */}
      <Canvas
        camera={{ position: [0, 0, 3], fov: 45 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.2} />
        <directionalLight position={[5, 3, 5]} intensity={1.1} color="#ffffff" />
        <pointLight position={[-5, -3, -4]} intensity={0.3} color="#0033ff" />

        <Stars radius={100} depth={60} count={6000} factor={4} saturation={0.2} fade speed={0.3} />

        {layer === "globe" && (
          <>
            <PoliticalGlobe texture={globeTexture} autoRotate={!hoveredCountry} />
            <Atmosphere />
            <GlobeArcs countries={countries} visible={showArcs} />
            <CountryMarkers
              countries={countries}
              onDrillDown={handleDrillDown}
              setHovered={setHoveredCountry}
              searchQuery={search}
            />
            <OrbitControls
              ref={orbitRef}
              enablePan={false}
              minDistance={1.6}
              maxDistance={7}
              enableDamping
              dampingFactor={0.06}
            />
          </>
        )}

        {layer === "country" && (
          <>
            <BgGrid />
            <ambientLight intensity={0.6} />
            <pointLight position={[0, 0, 4]} intensity={1.8} />
            <pointLight position={[-3, 3, 2]} intensity={0.7} color="#0044ff" />
            <pointLight position={[3, -3, 2]} intensity={0.7} color="#00ffcc" />
            <ForceBubbles
              bubbleData={bubbleData}
              resetSignal={resetSignal}
              setSelected={setSelected}
              search={search}
              timeProgress={timeProgress}
            />
            <ZoomListener />
          </>
        )}

        <CameraController target={target} layer={layer} orbitRef={orbitRef} />
      </Canvas>

      {/* ══ AI MODAL ══ */}
      {showAI && (
        <AIExplainModal
          insights={insights}
          countries={countries}
          onClose={() => setShowAI(false)}
        />
      )}

      <Ticker countries={countries} />
    </div>
  );
}

