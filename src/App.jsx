import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import proj4 from 'proj4';
import { getVägdataFrånKoordinat } from './services/trafikverketApi';
import './App.css';

// Definiera projektioner för konvertering
const wgs84 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
const sweref99tm = "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +axis=neu";

function App() {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [roadData, setRoadData] = useState(null);
  const [coords, setCoords] = useState(null);

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
    map.on('click', async function(e) {
      try {
        const { lat, lng } = e.latlng;
        
        // Konvertera till SWEREF99TM
        const [eastingSWEREF, northingSWEREF] = proj4(wgs84, sweref99tm, [lng, lat]);
        
        // Spara koordinater för visning
        setCoords({
          wgs84: { lat, lng },
          sweref99tm: { easting: eastingSWEREF, northing: northingSWEREF }
        });
        
        // Visa laddningsindikator
        setLoading(true);
        setError(null);
        
        // Hämta vägdata från API:et
        console.log(`Söker vägdata runt koordinat: ${eastingSWEREF}, ${northingSWEREF}`);
        const vägdata = await getVägdataFrånKoordinat(eastingSWEREF, northingSWEREF);
        setRoadData(vägdata);
        console.log("Satte vägdata:", vägdata);

        // Skapa eller uppdatera markör
        if (markerRef.current) {
          map.removeLayer(markerRef.current);
        }

        // Skapa innehåll till popup
        let popupContent = `
          <div class="popup-content">
            <h3>Koordinater</h3>
            <p><strong>WGS84:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
            <p><strong>SWEREF99TM:</strong><br>E: ${eastingSWEREF.toFixed(2)}<br>N: ${northingSWEREF.toFixed(2)}</p>
            <hr>
            <h3>API-status</h3>
            <p>${vägdata.success ? 'API-anrop lyckades' : 'API-anrop misslyckades'}</p>
            <p>${vägdata.message || (vägdata.error ? `Fel: ${vägdata.error}` : '')}</p>
          </div>
        `;
        
        // Skapa marker med popup
        markerRef.current = window.L.marker([lat, lng])
          .addTo(map)
          .bindPopup(popupContent)
          .openPopup();

      } catch (err) {
        console.error('Fel vid hämtning av vägdata:', err);
        setError('Kunde inte hämta vägdata: ' + err.message);
      } finally {
        setLoading(false);
      }
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
    <div className="app-container">
      <header className="app-header">
        <h1>Vägdata Sverige</h1>
        {loading && <div className="loading-indicator">Hämtar vägdata...</div>}
        {error && <div className="error-message">{error}</div>}
      </header>
      
      <div 
        ref={mapRef} 
        className="map-container"
      ></div>

      {coords && (
        <div className="coordinates-panel">
          <h3>Valda koordinater</h3>
          <p><strong>WGS84:</strong><br />{coords.wgs84.lat.toFixed(6)}, {coords.wgs84.lng.toFixed(6)}</p>
          <p><strong>SWEREF99TM:</strong><br />E: {coords.sweref99tm.easting.toFixed(2)}<br />N: {coords.sweref99tm.northing.toFixed(2)}</p>
        </div>
      )}

      {roadData && roadData.success && (
        <div className="road-info-panel">
          <h2>Vägdata</h2>
          {roadData.data && roadData.data.length > 0 ? (
            <ul>
              {roadData.data.map((väg, index) => (
                <li key={index}>
                  {väg.Huvudnummer && <div><strong>Vägnummer:</strong> {väg.Huvudnummer}</div>}
                  {väg.Europavägsnummer && <div><strong>Europaväg:</strong> {väg.Europavägsnummer}</div>}
                  {väg.Vägkategori && <div><strong>Kategori:</strong> {väg.Vägkategori}</div>}
                  {väg.Name && <div><strong>Namn:</strong> {väg.Name}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p>Inga vägar hittades inom 100 meter från den valda punkten.</p>
          )}
          
          <div className="api-debug">
            <p className="api-message">{roadData.message}</p>
            {roadData.error && <p className="api-error">Fel: {roadData.error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;