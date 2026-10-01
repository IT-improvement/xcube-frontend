import React, { useEffect, useRef } from "react";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import "./style.css";
import { fromLonLat } from "ol/proj";

interface Props {
  onMapReady?: (map: Map) => void;
  onPixelSelect?: (coordinate: [number, number]) => void;
  baseVisible?: boolean;
  interactionMode?: "pan" | "pixel";
}

const OlMap: React.FC<Props> = ({ onMapReady, onPixelSelect, baseVisible = true, interactionMode = "pan" }) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const baseLayerRef = useRef<TileLayer<OSM> | null>(null);
  const onMapReadyRef = useRef(onMapReady);
  const onPixelSelectRef = useRef(onPixelSelect);
  const interactionModeRef = useRef(interactionMode);

  useEffect(() => { onMapReadyRef.current = onMapReady; }, [onMapReady]);
  useEffect(() => { onPixelSelectRef.current = onPixelSelect; }, [onPixelSelect]);
  useEffect(() => { interactionModeRef.current = interactionMode; }, [interactionMode]);

  useEffect(() => {
    if (!mapRef.current) return;

    const baseLayer = new TileLayer({ source: new OSM(), visible: baseVisible });
    const map = new Map({
      target: mapRef.current,
      layers: [baseLayer],
      view: new View({
      projection: "EPSG:3857",
      center: fromLonLat([128.92, 35.49]),
      zoom: 11,
    }),
    });

    baseLayerRef.current = baseLayer;
    onMapReadyRef.current?.(map);
    map.on('singleclick', (event) => { if (interactionModeRef.current === 'pixel') onPixelSelectRef.current?.(event.coordinate as [number, number]); });

    return () => map.setTarget(undefined);
    // OpenLayers map is created once; changing controls are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { baseLayerRef.current?.setVisible(baseVisible); }, [baseVisible]);

  return <div ref={mapRef} className={`map-component ${interactionMode === 'pixel' ? 'pixel-mode' : ''}`} />;
};

export default OlMap;
