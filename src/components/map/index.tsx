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
}

const OlMap: React.FC<Props> = ({ onMapReady }) => {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
      ],
      view: new View({
      projection: "EPSG:3857",
      center: fromLonLat([128.92, 35.49]),
      zoom: 11,
    }),
    });

    console.log("[OlMap] map created. projection=EPSG:4326");

    onMapReady?.(map);

    return () => map.setTarget(undefined);
  }, [onMapReady]);

  return <div ref={mapRef} className="map-component" />;
};

export default OlMap;