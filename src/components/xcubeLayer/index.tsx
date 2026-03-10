import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import Map from "ol/Map";
import { transformExtent } from "ol/proj";

interface Props {
  map: Map;
  datasetId: string;
}

type XcubeDatasetInfo = {
  id: string;
  bbox?: [number, number, number, number]; // [minLon,minLat,maxLon,maxLat] (EPSG:4326)
  spatialRef?: string; // "EPSG:4326" 등
  variables?: Array<{
    name: string;
    tileLevelMin?: number;
    tileLevelMax?: number;
    tileUrl?: string; // (주의) tiles2일 수 있어서 믿지 않음
  }>;
  rgbSchema?: {
    tileUrl: string; // (주의) 이것도 tiles2일 수 있음
    tileLevelMin?: number;
    tileLevelMax?: number;
    varNames?: string[];
  };
};

export default async function addDynamicXcubeLayer({
  map,
  datasetId,
}: Props) {
  console.log(`[xcube] loading dataset info: ${datasetId}`);

  const res = await fetch(`/datasets/${datasetId}`);
  if (!res.ok) {
    console.error("[xcube] /datasets fetch failed:", res.status, res.statusText);
    return;
  }

  const datasetInfo: XcubeDatasetInfo = await res.json();
  console.log("[xcube] datasetInfo loaded:", datasetInfo);

  const variablesArray = datasetInfo.variables ?? [];
  if (variablesArray.length === 0) {
    console.error("[xcube] No variables found in dataset:", datasetId);
    return;
  }

  // ✅ 디폴트 = 첫 번째 변수
  let firstVariable = variablesArray[0];
  let varName = firstVariable.name;
  varName = "rgb";
  console.log("[xcube] Selected variable:", varName);

  // ------------------------------------------------------------------
  // ✅ (중요) xcube 1.13.1 정식 타일 엔드포인트 사용
  // OpenAPI에 있는 것은 /tiles/{datasetId}/{varName}/{z}/{y}/{x}
  //
  // View가 EPSG:4326이면 -> crs=CRS84 로 요청해야 좌표계가 맞음
  // (OpenAPI enum: EPSG:3857 또는 CRS84)
  // ------------------------------------------------------------------
  const tileUrlTemplate = `/tiles/${datasetId}/${varName}/{z}/{y}/{x}?crs=EPSG:3857`;

  console.log("[xcube] tileUrlTemplate:", tileUrlTemplate);

  const layer = new TileLayer({
    source: new XYZ({
      url: tileUrlTemplate,
      // 서버가 줌 제한을 강제하지 않는 경우가 많아서 넓게 둠
      // (원하면 firstVariable.tileLevelMin/Max를 참고해서 좁혀도 됨)
      minZoom: 10,
      maxZoom: 23,
      crossOrigin: "anonymous",
    }),
    opacity: 0.8,
  });

  map.addLayer(layer);
  console.log("[xcube] layer added");

  // ------------------------------------------------------------------
  // ✅ bbox로 자동 이동
  // - datasetInfo.bbox는 EPSG:4326 (lon/lat)
  // - map view가 EPSG:4326이면 그대로 fit 가능
  // - 혹시 view가 3857인 경우도 대비해서 변환 로직 포함
  // ------------------------------------------------------------------
  if (datasetInfo.bbox && datasetInfo.bbox.length === 4) {
    const extent4326 = datasetInfo.bbox;
    const viewProj = map.getView().getProjection().getCode();

    const extentToFit =
      viewProj === "EPSG:4326"
        ? extent4326
        : transformExtent(extent4326, "EPSG:4326", viewProj);

    console.log("[xcube] bbox:", extent4326, "viewProj:", viewProj);
    console.log("[xcube] fitting extent:", extentToFit);

    map.getView().fit(extentToFit, {
      padding: [40, 40, 40, 40],
      duration: 400,
    });

    console.log("[xcube] view.fit done");
  } else {
    console.warn("[xcube] bbox not found. skip view.fit");
  }

  return layer;
}