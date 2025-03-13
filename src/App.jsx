import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import proj4 from 'proj4';

// Definiera projektioner för konvertering
const wgs84 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
const sweref99tm = "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +axis=neu";

function App() {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    // Kontrollera om kartan redan är initierad
    if (leafletMapRef.current) {
      return;
    }

    if (!window.L) {
      console.error("Leaflet is not loaded!");
      return;
    }

    // Skapa karta direkt med Leaflet (inte react-leaflet)
    const map = window.L.map(mapRef.current).setView([62.0, 15.0], 5);
    
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Spara kartreferensen
    leafletMapRef.current = map;

    // Hantera klick på kartan
    map.on('click', function(e) {
      const { lat, lng } = e.latlng;
      
      // Konvertera till SWEREF99TM
      const [eastingSWEREF, northingSWEREF] = proj4(wgs84, sweref99tm, [lng, lat]);
      
      // Skapa eller uppdatera markör
      if (popupRef.current) {
        map.removeLayer(popupRef.current);
      }
      
      const popupContent = `
        <div>
          <h3>Koordinater</h3>
          <p><strong>WGS84:</strong><br/>
          Lat: ${lat.toFixed(6)}<br/> 
          Lng: ${lng.toFixed(6)}</p>
          
          <p><strong>SWEREF99TM:</strong><br/>
          N: ${northingSWEREF.toFixed(2)} m<br/> 
          E: ${eastingSWEREF.toFixed(2)} m</p>
        </div>
      `;
      
      popupRef.current = window.L.marker([lat, lng])
        .addTo(map)
        .bindPopup(popupContent)
        .openPopup();
    });

    // Städa upp när komponenten avmonteras
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        background: "#333",
        color: "white",
        padding: "10px 0",
        zIndex: 1000,
        textAlign: "center"
      }}>
        <h1 style={{ margin: 0 }}>Vägdata Sverige</h1>
      </div>
      
      <div 
        ref={mapRef} 
        style={{ 
          height: "100%", 
          width: "100%",
          position: "absolute",
          top: 0,
          left: 0
        }}
      ></div>
    </div>
  );
}

export default App;