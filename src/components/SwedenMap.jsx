import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import proj4 from 'proj4';
import L from 'leaflet';

// Fixa ikon-problem i Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Definiera projektioner för konvertering
// WGS84 (vanliga GPS-koordinater) till SWEREF99TM
const wgs84 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
const sweref99tm = "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +axis=neu";

// Funktion för att konvertera WGS84 till SWEREF99TM
function toSWEREF99TM(lon, lat) {
  return proj4(wgs84, sweref99tm, [lon, lat]);
}

// Klick-hanterare för kartan
function MapClickHandler({ setClickedPosition }) {
  useMapEvents({
    click: (e) => {
      const { lat, lng } = e.latlng;
      // Konvertera till SWEREF99TM
      const [eastingSWEREF, northingSWEREF] = toSWEREF99TM(lng, lat);
      
      setClickedPosition({
        wgs84: { lat, lng },
        sweref99tm: { easting: eastingSWEREF, northing: northingSWEREF }
      });
    },
  });
  
  return null;
}

function SwedenMap() {
  const [clickedPosition, setClickedPosition] = useState(null);
  
  // Centrerad över Stockholmsområdet som default
  const defaultPosition = [59.3293, 18.0686];
  
  return (
    <div className="map-container">
      <MapContainer center={defaultPosition} zoom={5} style={{ height: '100vh', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapClickHandler setClickedPosition={setClickedPosition} />
        
        {clickedPosition && (
          <Marker position={clickedPosition.wgs84}>
            <Popup>
              <div>
                <h3>Koordinater</h3>
                <p><strong>WGS84:</strong><br/>
                Lat: {clickedPosition.wgs84.lat.toFixed(6)}<br/> 
                Lng: {clickedPosition.wgs84.lng.toFixed(6)}</p>
                
                <p><strong>SWEREF99TM:</strong><br/>
                N: {clickedPosition.sweref99tm.northing.toFixed(2)} m<br/> 
                E: {clickedPosition.sweref99tm.easting.toFixed(2)} m</p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

export default SwedenMap;