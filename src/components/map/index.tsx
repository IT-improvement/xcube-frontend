import React, { useEffect, useRef } from "react";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { defaults as defaultInteractions } from "ol/interaction/defaults";
import "./style.css";
import { fromLonLat } from "ol/proj";
import { handleMapKey, MapKeyActions } from "./keyboard";

/** Makes the map a focusable keyboard target (UX13): arrows pan, +/- zoom, Home fits, Enter/Space picks the centre. */
export type MapKeyboard = MapKeyActions & {
  /** Accessible name: which data the map shows and that it takes keys. */
  label: string;
  /** Id of a (visually hidden) text that lists the keys. */
  helpId?: string;
};

interface Props {
  onMapReady?: (map: Map) => void;
  onPixelSelect?: (coordinate: [number, number]) => void;
  baseVisible?: boolean;
  interactionMode?: "pan" | "pixel";
  /** Without it the map is not focusable (the second map of a side-by-side comparison follows the first). */
  keyboard?: MapKeyboard;
}

const OlMap: React.FC<Props> = ({ onMapReady, onPixelSelect, baseVisible = true, interactionMode = "pan", keyboard }) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const olMapRef = useRef<Map | null>(null);
  const baseLayerRef = useRef<TileLayer<OSM> | null>(null);
  const onMapReadyRef = useRef(onMapReady);
  const onPixelSelectRef = useRef(onPixelSelect);
  const interactionModeRef = useRef(interactionMode);
  const keyboardRef = useRef(keyboard);

  useEffect(() => { onMapReadyRef.current = onMapReady; }, [onMapReady]);
  useEffect(() => { onPixelSelectRef.current = onPixelSelect; }, [onPixelSelect]);
  useEffect(() => { interactionModeRef.current = interactionMode; }, [interactionMode]);
  keyboardRef.current = keyboard;

  useEffect(() => {
    if (!mapRef.current) return;

    // Own className = own canvas, so the Viewer can dim only the basemap in dark mode.
    const baseLayer = new TileLayer({ source: new OSM(), visible: baseVisible, className: "ol-layer xc-basemap" });
    const map = new Map({
      target: mapRef.current,
      layers: [baseLayer],
      // Keys are handled below (no animation under reduced motion); OpenLayers' keyboard pan/zoom would run twice.
      interactions: defaultInteractions({ keyboard: false }),
      view: new View({
      projection: "EPSG:3857",
      center: fromLonLat([128.92, 35.49]),
      zoom: 11,
    }),
    });

    olMapRef.current = map;
    baseLayerRef.current = baseLayer;
    onMapReadyRef.current?.(map);
    map.on('singleclick', (event) => { if (interactionModeRef.current === 'pixel') onPixelSelectRef.current?.(event.coordinate as [number, number]); });

    return () => {
      olMapRef.current = null;
      map.setTarget(undefined);
    };
    // OpenLayers map is created once; changing controls are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { baseLayerRef.current?.setVisible(baseVisible); }, [baseVisible]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Only keys aimed at the map itself; controls drawn inside it keep theirs.
    if (event.target !== event.currentTarget) return;
    if (handleMapKey(olMapRef.current, event, keyboardRef.current)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div
      ref={mapRef}
      className={`map-component ${interactionMode === 'pixel' ? 'pixel-mode' : ''} ${keyboard ? 'has-keys' : ''}`}
      {...(keyboard
        ? {
            tabIndex: 0,
            role: "application",
            "aria-label": keyboard.label,
            "aria-describedby": keyboard.helpId,
            onKeyDown,
          }
        : {})}
    />
  );
};

export default OlMap;
