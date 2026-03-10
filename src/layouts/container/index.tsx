import React from "react";
import { Outlet } from "react-router-dom";
import OlMap from "../../components/map";
import addDynamicXcubeLayer from "../../components/xcubeLayer";
import Map from "ol/Map";
import "./style.css";

export default function Container() {

  const handleMapReady = async (mapInstance: Map) => {
    try {
      await addDynamicXcubeLayer({
        map: mapInstance,
        datasetId: "landsat_rgb",
      });
    } catch (error) {
      console.error("Failed to load Sentinel_test layer:", error);
    }
  };

  return (
    <div className="container-root">
      <div className="map-background">
        <OlMap onMapReady={handleMapReady} />
      </div>

      <div className="overlay-panel">
        <Outlet />
      </div>
    </div>
  );
}
